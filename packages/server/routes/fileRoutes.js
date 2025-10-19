import express from "express";
import fse from "fs-extra";
import path from "path";
import open from "open";
import os from "os";
import crypto from "crypto";
import checkDiskSpace from "check-disk-space";
import archiver from "archiver";
import { performCopyCancellation, getDirTotalSize, getZipContents, getFileType, getFilesInZip, getFileContentFromZip, getZipFileStream, getMimeType, findCoverInZip, matchZipPath, updateFileInZip, createFileInZip, createFolderInZip, } from "../lib/utils.js";

export default function createFileRoutes(
  activeCopyJobs,
  activeSizeJobs,
  activeCompressJobs,
  activeDecompressJobs,
  activeArchiveTestJobs,
  activeDuplicateJobs,
  activeCopyPathsJobs
) {
  const router = express.Router();

  // Endpoint to get contents of a zip file
  router.get("/zip/contents", async (req, res) => {
    const { filePath, directoryPath = "/" } = req.query;
    if (!filePath) {
      return res.status(400).json({ message: "Zip file path is required." });
    }

    try {
      const contents = await getFilesInZip(filePath, directoryPath);
      res.json({ path: directoryPath, items: contents });
    } catch (error) {
      console.error("Error reading zip file contents:", error);
      res.status(500).json({ message: "Error reading zip file contents." });
    }
  });

  // Endpoint to get content of a specific file within a zip
  router.get("/zip/file-content", async (req, res) => {
    const { zipFilePath, filePathInZip } = req.query;
    if (!zipFilePath || !filePathInZip) {
      return res
        .status(400)
        .json({ message: "Zip file path and file path in zip are required." });
    }

    try {
      const content = await getFileContentFromZip(zipFilePath, filePathInZip);
      res.set("Content-Type", "text/plain");
      res.send(content);
    } catch (error) {
      console.error("Error reading file from zip:", error);
      if (error.message.includes("File not found")) {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: "Error reading file from zip." });
    }
  });

  // Endpoint to stream media content from a zip file
  router.get("/zip/media-stream", async (req, res) => {
    const { zipFilePath, filePathInZip } = req.query;
    if (!zipFilePath || !filePathInZip) {
      return res
        .status(400)
        .json({ message: "Zip file path and file path in zip are required." });
    }

    try {
      const stream = await getZipFileStream(zipFilePath, filePathInZip);
      const mimeType = getMimeType(filePathInZip);
      res.set("Content-Type", mimeType);
      stream.pipe(res);
    } catch (error) {
      console.error("Error streaming media from zip:", error);
      if (error.message.includes("File not found")) {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: "Error streaming media from zip." });
    }
  });

  router.get("/zip/audio-cover", async (req, res) => {
    const { zipFilePath, audioFilePathInZip } = req.query;
    if (!zipFilePath || !audioFilePathInZip) {
      return res
        .status(400)
        .json({ message: "Zip file path and audio file path are required." });
    }

    try {
      const coverPathInZip = await findCoverInZip(
        zipFilePath,
        audioFilePathInZip
      );
      if (coverPathInZip) {
        res.json({ coverPathInZip });
      } else {
        res.status(404).json({ message: "Cover art not found in zip." });
      }
    } catch (error) {
      console.error("Error finding cover art in zip:", error);
      res.status(500).json({ message: "Error finding cover art in zip." });
    }
  });

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
      let currentPath;

      const zipPathInBasePath = matchZipPath(basePath);

      if (zipPathInBasePath) {
        const zipFile = zipPathInBasePath[1];
        const internal = zipPathInBasePath[2] || "/";

        if (target === ".." && (internal === "/" || internal === "")) {
          // We are at the root of the zip and want to go up
          currentPath = path.dirname(zipFile);
        } else {
          const newInternal = path.posix.normalize(
            path.posix.join(internal, target)
          );
          currentPath = zipFile + newInternal;
        }
      } else {
        currentPath = path.resolve(basePath, target);
      }

      const finalZipMatch = matchZipPath(currentPath);

      if (finalZipMatch) {
        const zipFilePath = finalZipMatch[1];
        const pathInZip = finalZipMatch[2] || "/";

        if (!(await fse.pathExists(zipFilePath))) {
          return res
            .status(404)
            .json({ message: `Archive not found: ${zipFilePath}` });
        }

        const contents = await getFilesInZip(zipFilePath, pathInZip);
        return res.json({ path: currentPath, items: contents });
      }

      // Fallback for regular filesystem paths
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
            const type = getFileType(file.name, fileStats.isDirectory());
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

      validItems.sort((a, b) => {
        if (a.type === "folder" && b.type !== "folder") return -1;
        if (a.type !== "folder" && b.type === "folder") return 1;
        if (a.type !== "folder" && b.type !== "folder") {
          const a_ = a.name.startsWith("_");
          const b_ = b.name.startsWith("_");
          if (a_ && !b_) return -1;
          if (!a_ && b_) return 1;
        }
        return a.name.localeCompare(b.name);
      });

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

    const zipPathMatch = matchZipPath(filePath);

    if (zipPathMatch) {
      const zipFilePath = zipPathMatch[1];

      const filePathInZip = zipPathMatch[2].startsWith("/")
        ? zipPathMatch[2].substring(1)
        : zipPathMatch[2];

      if (!filePathInZip) {
        return res

          .status(400)

          .json({ error: "Cannot open a directory in a zip" });
      }

      try {
        const stream = await getZipFileStream(zipFilePath, filePathInZip);

        const tempDir = os.tmpdir();

        const tempFilePath = path.join(tempDir, path.basename(filePathInZip));

        const writer = fse.createWriteStream(tempFilePath);

        stream.pipe(writer);

        writer.on("finish", async () => {
          try {
            await open(tempFilePath, appName ? { app: { name: appName } } : {});

            res.status(200).json({ message: "File opened successfully" });

            // Add a delay before deleting the temporary file to give the

            // application enough time to open it.

            setTimeout(() => {
              fse.unlink(tempFilePath, (err) => {
                if (err) console.error(`Error deleting temp file: ${err}`);
              });
            }, 2000);
          } catch (error) {
            res.status(500).json({ error: error.message });
          }
        });

        writer.on("error", (error) => {
          res

            .status(500)

            .json({ error: `Error writing temp file: ${error.message}` });
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    } else {
      try {
        await open(filePath, appName ? { app: { name: appName } } : {});

        res.status(200).json({ message: "File opened successfully" });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
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

  // Endpoint to duplicate files/folders
  router.post("/duplicate", async (req, res) => {
    const { items } = req.body; // Expects an array of { sourcePath, newName }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Invalid items array." });
    }

    try {
      const jobId = crypto.randomUUID();
      const job = {
        id: jobId,
        status: "pending",
        ws: null,
        controller: new AbortController(),
        items,
        // These properties are similar to a copy job and will be used by copyWithProgress
        total: 0,
        copied: 0,
        overwriteDecision: "prompt",
        resolveOverwrite: null,
      };
      activeDuplicateJobs.set(jobId, job);
      res.status(202).json({ jobId });
    } catch (error) {
      console.error("Duplicate error:", error);
      res
        .status(500)
        .json({ message: `Failed to start duplication: ${error.message}` });
    }
  });

  router.post("/duplicate/cancel", async (req, res) => {
    const { jobId } = req.body;
    if (!jobId || !activeDuplicateJobs.has(jobId)) {
      return res.status(404).json({ message: "Job not found." });
    }
    const job = activeDuplicateJobs.get(jobId);
    if (job.status === "scanning" || job.status === "copying") {
      job.status = "cancelled";
      job.controller.abort();
    }
    res.status(200).json({ message: "Cancellation request received." });
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

  // Endpoint to create a new folder
  router.post("/new-folder", async (req, res) => {
    const { newFolderPath } = req.body;
    if (!newFolderPath) {
      return res
        .status(400)
        .json({ message: "A path for the new folder is required." });
    }

    try {
      const zipPathMatch = matchZipPath(newFolderPath);
      if (zipPathMatch) {
        const zipFilePath = zipPathMatch[1];
        const filePathInZip = zipPathMatch[2].startsWith("/")
          ? zipPathMatch[2].substring(1)
          : zipPathMatch[2];
        await createFolderInZip(zipFilePath, filePathInZip);
      } else {
        if (await fse.pathExists(newFolderPath)) {
          return res
            .status(409)
            .json({ message: "A file or folder with that name already exists." });
        }
        await fse.mkdir(newFolderPath);
      }
      res.status(201).json({ message: "Folder created successfully." });
    } catch (error) {
      console.error("New folder error:", error);
      res
        .status(500)
        .json({ message: `Failed to create folder: ${error.message}` });
    }
  });

  // Endpoint to create a new file
  router.post("/new-file", async (req, res) => {
    const { newFilePath } = req.body;
    if (!newFilePath) {
      return res
        .status(400)
        .json({ message: "A path for the new file is required." });
    }

    try {
      const zipPathMatch = matchZipPath(newFilePath);
      if (zipPathMatch) {
        const zipFilePath = zipPathMatch[1];
        const filePathInZip = zipPathMatch[2].startsWith("/")
          ? zipPathMatch[2].substring(1)
          : zipPathMatch[2];
        await createFileInZip(zipFilePath, filePathInZip);
      } else {
        if (await fse.pathExists(newFilePath)) {
          return res
            .status(409)
            .json({ message: "A file with that name already exists." });
        }
        await fse.createFile(newFilePath);
      }
      res.status(201).json({ message: "File created successfully." });
    } catch (error) {
      console.error("New file error:", error);
      res
        .status(500)
        .json({ message: `Failed to create file: ${error.message}` });
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

  // Endpoint to decompress an archive
  router.post("/decompress", (req, res) => {
    const { source, destination } = req.body;
    if (!source || !destination) {
      return res
        .status(400)
        .json({ message: "Source archive and destination path are required." });
    }

    let sourcePath;
    let zipFilePath = null;
    let filePathInZip = null;
    let isNestedZip = false;

    let fullSourcePath;

    if (typeof source === "string") {
      fullSourcePath = source;
    } else if (typeof source === "object" && source.path && source.name) {
      fullSourcePath = path.join(source.path, source.name);
    } else {
      return res
        .status(400)
        .json({ message: "Invalid source archive path provided." });
    }

    const zipPathMatch = matchZipPath(fullSourcePath);

    if (zipPathMatch) {
      zipFilePath = zipPathMatch[1];
      filePathInZip = zipPathMatch[2].startsWith("/")
        ? zipPathMatch[2].substring(1)
        : zipPathMatch[2];
      // Only consider it a nested zip if there's an actual path within the zip
      isNestedZip = filePathInZip !== "";
      sourcePath = fullSourcePath; // Keep the full path for display purposes if needed
    } else {
      sourcePath = fullSourcePath;
    }

    const jobId = crypto.randomUUID();
    const job = {
      id: jobId,
      status: "pending",
      source: sourcePath,
      destination,
      ws: null,
      zipfile: null, // Will hold the yauzl instance
      controller: new AbortController(), // Initialize AbortController
      isNestedZip,
      zipFilePath,
      filePathInZip,
    };
    activeDecompressJobs.set(jobId, job);
    res.status(202).json({ jobId });
  });

  // Endpoint to cancel a decompression
  router.post("/decompress/cancel", (req, res) => {
    const { jobId } = req.body;
    if (!jobId || !activeDecompressJobs.has(jobId)) {
      return res.status(404).json({ message: "Decompression job not found." });
    }
    const job = activeDecompressJobs.get(jobId);
    if (job.status === "pending" || job.status === "running") {
      job.status = "cancelled";
      job.controller.abort(); // Abort the controller
      // The zipfile.close() is handled in the finally block of the job itself.
      // If a readStream is active, the pipeline will be aborted.
    }
    res.status(200).json({ message: "Cancellation request received." });
  });

  // Endpoint to test an archive
  router.post("/archive-test", (req, res) => {
    const { source } = req.body;
    if (!source) {
      return res.status(400).json({ message: "Source archive is required." });
    }

    let sourcePath;
    if (typeof source === "string") {
      sourcePath = source;
    } else if (typeof source === "object" && source.path && source.name) {
      sourcePath = path.join(source.path, source.name);
    } else {
      return res
        .status(400)
        .json({ message: "Invalid source archive path provided." });
    }

    const jobId = crypto.randomUUID();
    const job = {
      id: jobId,
      status: "pending",
      source: sourcePath,
      ws: null,
      zipfile: null,
      controller: new AbortController(), // Initialize AbortController
    };
    activeArchiveTestJobs.set(jobId, job);
    res.status(202).json({ jobId });
  });

  // Endpoint to cancel an archive test
  router.post("/archive-test/cancel", (req, res) => {
    const { jobId } = req.body;
    if (!jobId || !activeArchiveTestJobs.has(jobId)) {
      return res.status(404).json({ message: "Archive test job not found." });
    }
    const job = activeArchiveTestJobs.get(jobId);
    if (job.status === "pending" || job.status === "running") {
      job.status = "cancelled";
      if (job.zipfile) {
        job.zipfile.close();
      }
    }
    res.status(200).json({ message: "Cancellation request received." });
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

  // Endpoint to save file content
  router.post("/save-file", async (req, res) => {
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) {
      return res
        .status(400)
        .json({ message: "File path and content are required." });
    }

    try {
      const zipPathMatch = matchZipPath(filePath);
      if (zipPathMatch) {
        const zipFilePath = zipPathMatch[1];
        const filePathInZip = zipPathMatch[2].startsWith("/")
          ? zipPathMatch[2].substring(1)
          : zipPathMatch[2];
        await updateFileInZip(zipFilePath, filePathInZip, content);
      } else {
        await fse.writeFile(filePath, content);
      }
      res.status(200).json({ message: "File saved successfully." });
    } catch (error) {
      console.error("Error saving file:", error);
      res
        .status(500)
        .json({ message: `Failed to save file: ${error.message}` });
    }
  });

  // Endpoint to get a list of paths
  router.post("/get-paths", async (req, res) => {
    const { items, basePath, isAbsolute, includeSubfolders } = req.body;

    if (!items || !Array.isArray(items) || !basePath) {
      return res.status(400).json({ message: "Invalid request body." });
    }

    const jobId = crypto.randomUUID();
    const job = {
      id: jobId,
      status: "pending",
      ws: null,
      items,
      basePath,
      isAbsolute,
      includeSubfolders,
    };
    activeCopyPathsJobs.set(jobId, job);

    res.status(202).json({ jobId });
  });

  return router;
}
