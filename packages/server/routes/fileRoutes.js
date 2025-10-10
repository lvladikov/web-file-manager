import express from "express";
import fse from "fs-extra";
import path from "path";
import open from "open";
import os from "os";
import crypto from "crypto";
import checkDiskSpace from "check-disk-space";
import archiver from "archiver";
import { performCopyCancellation, getDirTotalSize } from "../lib/utils.js";

export default function createFileRoutes(
  activeCopyJobs,
  activeSizeJobs,
  activeCompressJobs
) {
  const router = express.Router();

  // Endpoint to get disk space information
  router.get("/disk-space", async (req, res) => {
    const targetPath = req.query.path || os.homedir();
    try {
      const diskSpace = await checkDiskSpace(targetPath);
      res.json(diskSpace);
    } catch (error) {
      console.error("Error getting disk space:", error);
      res.status(500).json({ message: "Error getting disk space." });
    }
  });

  // Endpoint to initiate a folder size calculation
  router.post("/folder-size", async (req, res) => {
    const { folderPath } = req.body;
    if (!folderPath) {
      return res.status(400).json({ message: "Folder path is required." });
    }

    const jobId = crypto.randomUUID();
    const job = {
      id: jobId,
      status: "running",
      ws: null,
      controller: new AbortController(),
      folderPath,
    };
    activeSizeJobs.set(jobId, job);

    res.status(202).json({ jobId });
  });

  // Endpoint to cancel a size calculation
  router.post("/folder-size/cancel", (req, res) => {
    const { jobId } = req.body;
    if (!jobId || !activeSizeJobs.has(jobId)) {
      return res.status(404).json({ message: "Job not found." });
    }
    const job = activeSizeJobs.get(jobId);
    if (job.status === "running") {
      job.status = "cancelled";
      job.controller.abort();
    }
    res.status(200).json({ message: "Cancellation request received." });
  });

  // Endpoint to list files
  router.get("/files", async (req, res) => {
    try {
      const basePath = req.query.path || os.homedir();
      const target = req.query.target || "";
      const currentPath = path.resolve(basePath, target);

      const stats = await fse.stat(currentPath);
      if (!stats.isDirectory()) {
        return res.status(400).json({ message: "Path is not a directory." });
      }

      const files = await fse.readdir(currentPath, { withFileTypes: true });
      const items = await Promise.all(
        files.map(async (file) => {
          try {
            const fullFilePath = path.join(currentPath, file.name);
            let actualFullPath = fullFilePath;

            const fileStats = await fse.stat(actualFullPath);
            let type = "file";
            if (fileStats.isDirectory()) type = "folder";
            else if (/\.(zip|rar|7z|tar)$/i.test(file.name)) type = "archive";
            else if (
              /\.(jpg|jpeg|png|gif|bmp|tiff|svg|webp|psd)$/i.test(file.name)
            )
              type = "image";
            else if (/\.(mp4|mkv|avi|mov|wmv|flv)$/i.test(file.name))
              type = "video";
            else if (/\.(mp3|m4a|aac|flac|wav|ogg|wma)$/i.test(file.name))
              type = "audio";
            else if (/\.pdf$/i.test(file.name)) type = "pdf";
            return {
              name: file.name,
              type,
              size: fileStats.isFile() ? fileStats.size : null,
              modified: fileStats.mtime.toLocaleString(),
              fullPath: actualFullPath,
            };
          } catch (statError) {
            return {
              name: file.name,
              type: "file",
              size: null,
              modified: "N/A",
              error: true,
            };
          }
        })
      );

      let validItems = items.filter((item) => !item.error);

      // On macOS, prevent listing 'Macintosh HD' when in /Volumes to avoid recursion
      if (os.platform() === "darwin" && currentPath === "/Volumes") {
        validItems = validItems.filter((item) => item.name !== "Macintosh HD");
      }

      if (path.dirname(currentPath) !== currentPath) {
        validItems.unshift({
          name: "..",
          type: "parent",
          size: null,
          modified: "",
        });
      }

      res.json({ path: currentPath, items: validItems });
    } catch (error) {
      if (error.code === "EPERM" || error.code === "EACCES")
        res
          .status(403)
          .json({ message: `Operation not permitted for: ${error.path}` });
      else if (error.code === "ENOENT")
        res.status(404).json({
          message: `Path does not exist: ${error.path || req.query.path}`,
        });
      else {
        console.error("Error reading directory:", error);
        res.status(500).json({ message: "Error reading directory contents." });
      }
    }
  });

  // Endpoint to open a file
  router.post("/open-file", async (req, res) => {
    const { filePath, appName } = req.body;
    if (!filePath)
      return res.status(400).json({ error: "File path is required" });
    try {
      await open(filePath, appName ? { app: { name: appName } } : {});
      res.status(200).json({ message: "File opened successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Endpoint to get standard applications path
  router.get("/applications-path", (req, res) => {
    const platform = os.platform();
    let appsPath = os.homedir();
    if (platform === "darwin") appsPath = "/Applications";
    else if (platform === "win32")
      appsPath = process.env["ProgramFiles"] || "C:\\Program Files";
    else if (platform === "linux") appsPath = "/usr/share/applications";
    res.json({ path: appsPath });
  });

  // Endpoint for delete summary
  router.post("/delete-summary", async (req, res) => {
    const { path: targetPath } = req.body;
    if (!targetPath) {
      return res.status(400).json({ message: "Path is required." });
    }

    try {
      if (!(await fse.pathExists(targetPath))) {
        return res.status(404).json({ message: "Path does not exist." });
      }

      let fileCount = 0;
      let folderCount = 0;

      const countItems = async (dir) => {
        const items = await fse.readdir(dir, { withFileTypes: true });
        for (const item of items) {
          const itemPath = path.join(dir, item.name);
          if (item.isDirectory()) {
            folderCount++;
            await countItems(itemPath);
          } else {
            fileCount++;
          }
        }
      };

      const stats = await fse.stat(targetPath);
      if (stats.isDirectory()) {
        await countItems(targetPath);
      } else {
        fileCount = 1;
      }

      res.json({ files: fileCount, folders: folderCount });
    } catch (error) {
      console.error("Error building delete summary:", error);
      res.status(500).json({ message: "Failed to build delete summary." });
    }
  });

  // Endpoint for actual deletion
  router.post("/delete", async (req, res) => {
    const { path: targetPath } = req.body;
    if (!targetPath) {
      return res.status(400).json({ message: "Path is required." });
    }

    try {
      if (!(await fse.pathExists(targetPath))) {
        return res.status(200).json({ message: "Item already deleted." });
      }

      await fse.remove(targetPath);
      res.status(200).json({ message: "Item deleted successfully." });
    } catch (error) {
      console.error("Error deleting item:", error);
      res
        .status(500)
        .json({ message: `Failed to delete item: ${error.message}` });
    }
  });

  // Endpoint to initiate copy
  router.post("/copy", async (req, res) => {
    const { sources, destination } = req.body;
    if (!sources || sources.length === 0 || !destination) {
      return res
        .status(400)
        .json({ message: "Invalid source or destination." });
    }

    try {
      const jobId = crypto.randomUUID();
      const job = {
        id: jobId,
        status: "pending",
        ws: null,
        controller: new AbortController(),
        destination,
        sources,
        overwriteDecision: "prompt",
        resolveOverwrite: null,
      };
      activeCopyJobs.set(jobId, job);

      // Immediately respond with the jobId. The work will be triggered by the WebSocket connection.
      res.status(202).json({ jobId });
    } catch (error) {
      console.error("Error initiating copy:", error);
      res
        .status(500)
        .json({ message: `Failed to start copy: ${error.message}` });
    }
  });

  // Endpoint to create a new folder
  router.post("/new-folder", async (req, res) => {
    const { newFolderPath } = req.body;
    if (!newFolderPath) {
      return res
        .status(400)
        .json({ message: "A path for the new folder is required." });
    }

    try {
      if (await fse.pathExists(newFolderPath)) {
        return res
          .status(409)
          .json({ message: "A file or folder with that name already exists." });
      }
      await fse.mkdir(newFolderPath);
      res.status(201).json({ message: "Folder created successfully." });
    } catch (error) {
      console.error("New folder error:", error);
      res
        .status(500)
        .json({ message: `Failed to create folder: ${error.message}` });
    }
  });

  // Endpoint to compress files/folders
  router.post("/compress", async (req, res) => {
    const { sources, destination, sourceDirectory } = req.body;

    if (!sources || sources.length === 0 || !destination) {
      return res
        .status(400)
        .json({ message: "Sources and destination are required." });
    }

    const jobId = crypto.randomUUID();

    // Get folder name from destination path
    const folderName = path.basename(destination);

    // Format current date and time as YYYYMMDD-HHMMSS
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const dateTimeStamp = `${year}${month}${day}-${hours}${minutes}${seconds}`;

    const archiveName = `${folderName}_${dateTimeStamp}.zip`;
    const outputPath = path.join(destination, archiveName);
    const output = fse.createWriteStream(outputPath);
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Sets the compression level.
    });

    let totalSize = 0;
    for (const source of sources) {
      totalSize += await getDirTotalSize(source);
    }

    const job = {
      id: jobId,
      status: "pending",
      ws: null, // WebSocket will be attached when client connects
      controller: new AbortController(), // For potential cancellation
      sources,
      destination,
      sourceDirectory, // Store the source directory
      outputPath, // Store the path to the archive file
      output, // Store the output stream
      archive, // Store the archiver instance
      totalBytes: totalSize, // Will be updated by archiver
      compressedBytes: 0, // Will be updated by archiver
      currentFile: "", // Will be updated by archiver
    };
    activeCompressJobs.set(jobId, job);

    // Send jobId immediately so client can connect WebSocket
    res.status(202).json({ jobId });
  });

  // Endpoint to cancel a compress job
  router.post("/compress/cancel", async (req, res) => {
    const { jobId } = req.body;
    if (!jobId || !activeCompressJobs.has(jobId)) {
      return res.status(404).json({ message: "Compression job not found." });
    }
    const job = activeCompressJobs.get(jobId);
    if (job.status === "pending" || job.status === "running") {
      job.status = "cancelled";
      if (job.archive) {
        job.archive.destroy(); // Destroy the archiver stream, which also destroys its piped destination
      }
      // Delete the partial archive immediately upon cancellation
      if (await fse.pathExists(job.outputPath)) {
        console.log(
          `Compression job ${jobId} was cancelled. Deleting partial archive: ${job.outputPath}`
        );
        await fse.remove(job.outputPath);
      }
    }
    res
      .status(200)
      .json({ message: "Compression cancellation request received." });
  });

  // Endpoint to rename a file/folder
  router.post("/rename", async (req, res) => {
    const { oldPath, newName } = req.body;
    if (!oldPath || !newName) {
      return res
        .status(400)
        .json({ message: "Old path and new name are required." });
    }

    if (/[\\/:"*?<>|]/.test(newName)) {
      return res
        .status(400)
        .json({ message: "The new name contains invalid characters." });
    }

    const newPath = path.join(path.dirname(oldPath), newName);

    try {
      if (await fse.pathExists(newPath)) {
        return res
          .status(409)
          .json({ message: "A file with that name already exists." });
      }
      await fse.rename(oldPath, newPath);
      res.status(200).json({ message: "Item renamed successfully." });
    } catch (error) {
      console.error("Rename error:", error);
      if (error.code === "ENOENT") {
        return res.status(404).json({ message: "Original item not found." });
      }
      res.status(500).json({ message: `Failed to rename: ${error.message}` });
    }
  });

  // Endpoint to cancel a copy job
  router.post("/copy/cancel", async (req, res) => {
    const { jobId } = req.body;
    if (!jobId || !activeCopyJobs.has(jobId)) {
      return res.status(404).json({ message: "Job not found." });
    }
    const job = activeCopyJobs.get(jobId);
    await performCopyCancellation(job);
    res.status(200).json({ message: "Cancellation request received." });
  });

  return router;
}
