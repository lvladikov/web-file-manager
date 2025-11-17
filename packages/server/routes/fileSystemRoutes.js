import express from "express";
import fse from "fs-extra";
import path from "path";
import open from "open";
import os from "os";
import crypto from "crypto";
import checkDiskSpace from "check-disk-space";
import * as yauzl from "yauzl-promise";

import {
  getFileType,
  getFilesInZip,
  getZipFileStream,
  getMimeType,
  matchZipPath,
  getSummaryFromZip,
  extractNestedZipToTemp,
  deleteFromZip,
  createFolderInZip,
  createFileInZip,
  renameInZip,
  updateFileInZip,
} from "../lib/utils.js";
import { unregisterAllForJob } from "../lib/prompt-registry.js";

export default function createFileSystemRoutes(
  activeCopyJobs,
  activeZipOperations,
  activeDuplicateJobs
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

  // Endpoint to list files
  router.get("/files", async (req, res) => {
    let isZipOperation = false;
    try {
      const basePath = req.query.path || os.homedir();
      const target = req.query.target || "";
      let currentPath;
      const zipPathInBasePath = matchZipPath(basePath);

      if (zipPathInBasePath) {
        isZipOperation = true;
        const zipFile = zipPathInBasePath[1];
        const internal = zipPathInBasePath[2] || "/";

        if (target === ".." && (internal === "/" || internal === "")) {
          // We are at the root of the zip and want to go up
          currentPath = path.dirname(zipFile);
        } else {
          let newInternal = path.posix.normalize(
            path.posix.join(internal, target)
          );
          // If the new path ends with .zip, it means we navigated up to a nested zip file.
          // It should be treated as a directory, so it needs a trailing slash.
          if (newInternal.toLowerCase().endsWith(".zip")) {
            newInternal += "/";
          }
          currentPath = zipFile + newInternal;
        }
      } else {
        currentPath = path.resolve(basePath, target);
      }

      const finalZipMatch = matchZipPath(currentPath);

      if (finalZipMatch) {
        isZipOperation = true;
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
            const stats = await fse.stat(fullFilePath);
            const type = getFileType(file.name, stats.isDirectory());
            return {
              name: file.name,
              type,
              size: stats.isDirectory() ? null : stats.size,
              modified: stats.mtime.toISOString(),
              fullPath: fullFilePath,
            };
          } catch (err) {
            console.warn(`Could not stat ${fullFilePath}, skipping.`);
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
        if (isZipOperation) {
          res.status(500).json({ message: "Error reading archive contents." });
        } else {
          res
            .status(500)
            .json({ message: "Error reading directory contents." });
        }
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
      const zipPathMatch = matchZipPath(targetPath);
      if (zipPathMatch) {
        const zipFilePath = zipPathMatch[1];
        const pathInZip = zipPathMatch[2].startsWith("/")
          ? zipPathMatch[2].substring(1)
          : zipPathMatch[2];
        const summary = await getSummaryFromZip(zipFilePath, pathInZip);
        return res.json(summary);
      }

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
    const { paths: targetPaths } = req.body;
    if (
      !targetPaths ||
      !Array.isArray(targetPaths) ||
      targetPaths.length === 0
    ) {
      return res.status(400).json({ message: "Path(s) are required." });
    }

    try {
      const groupedPaths = targetPaths.reduce((acc, targetPath) => {
        const zipPathMatch = matchZipPath(targetPath);
        if (zipPathMatch) {
          const zipFilePath = zipPathMatch[1];
          const pathInZip = zipPathMatch[2].startsWith("/")
            ? zipPathMatch[2].substring(1)
            : zipPathMatch[2];
          // If pathInZip is empty, it means the user wants to delete the zip file itself.
          // In this case, treat it as a regular filesystem path for deletion.
          if (pathInZip === "") {
            const fsKey = "filesystem";
            if (!acc[fsKey]) {
              acc[fsKey] = { isZip: false, paths: [] };
            }
            acc[fsKey].paths.push(zipFilePath);
          } else {
            if (!acc[zipFilePath]) {
              acc[zipFilePath] = { isZip: true, paths: [] };
            }
            acc[zipFilePath].paths.push(pathInZip);
          }
        } else {
          const fsKey = "filesystem";
          if (!acc[fsKey]) {
            acc[fsKey] = { isZip: false, paths: [] };
          }
          acc[fsKey].paths.push(targetPath);
        }
        return acc;
      }, {});

      // This logic assumes one operation at a time, which is what the client does.
      const containerPath = Object.keys(groupedPaths)[0];
      const group = groupedPaths[containerPath];

      if (group.isZip) {
        const jobId = crypto.randomUUID();
        const abortController = new AbortController();
        const job = {
          id: jobId,
          _traceId: crypto.randomUUID(),
          status: "pending",
          ws: null,
          controller: abortController,
          type: "delete-in-zip",
          zipFilePath: containerPath,
          pathsInZip: group.paths,
          originalZipSize: 0,
          totalBytes: 0,
          processedBytes: 0,
          currentFile: "",
          currentFileTotalSize: 0,
          currentFileBytesProcessed: 0,
          overwriteResolvers: [],
        };
        activeZipOperations.set(jobId, job);

        let resolveCompletion;
        let rejectCompletion;
        const completionPromise = new Promise((resolve, reject) => {
          resolveCompletion = resolve;
          rejectCompletion = reject;
        });
        job.completionPromise = completionPromise;
        job.resolveCompletion = resolveCompletion;
        job.rejectCompletion = rejectCompletion;

        job.originalZipSize = (await fse.pathExists(containerPath))
          ? (await fse.stat(containerPath)).size
          : 0;

        deleteFromZip(containerPath, group.paths, job)
          .then(() => job.resolveCompletion())
          .catch((err) => job.rejectCompletion(err));

        return res.status(202).json({ message: "Delete job started.", jobId });
      } else {
        for (const fsPath of group.paths) {
          if (await fse.pathExists(fsPath)) {
            await fse.remove(fsPath);
          }
        }
        return res.status(200).json({ message: "Items deleted successfully." });
      }
    } catch (error) {
      console.error("Error deleting items:", error);
      res
        .status(500)
        .json({ message: `Failed to delete items: ${error.message}` });
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

    const jobId = crypto.randomUUID();
    const abortController = new AbortController();
    const job = {
      id: jobId,
      _traceId: crypto.randomUUID(),
      status: "pending",
      ws: null, // WebSocket will be attached when client connects
      controller: abortController,
      type: "create-folder-in-zip",
      zipFilePath: null,
      filePathInZip: null,
      originalZipSize: 0,
      totalBytes: 0,
      processedBytes: 0,
      currentFile: "",
      currentFileTotalSize: 0,
      currentFileBytesProcessed: 0,
      overwriteResolvers: [],
    };
    activeZipOperations.set(jobId, job);

    let zipPathMatch = null;
    try {
      zipPathMatch = matchZipPath(newFolderPath);
      if (zipPathMatch) {
        let resolveCompletion;
        let rejectCompletion;
        const completionPromise = new Promise((resolve, reject) => {
          resolveCompletion = resolve;
          rejectCompletion = reject;
        });
        job.completionPromise = completionPromise;
        job.resolveCompletion = resolveCompletion;
        job.rejectCompletion = rejectCompletion;

        const zipFilePath = zipPathMatch[1];
        let filePathInZip = zipPathMatch[2].startsWith("/")
          ? zipPathMatch[2].substring(1)
          : zipPathMatch[2];
        filePathInZip = filePathInZip.replace(/\\/g, "/").replace(/^\.\//, "");

        job.zipFilePath = zipFilePath;
        job.filePathInZip = filePathInZip;
        job.originalZipSize = (await fse.pathExists(zipFilePath))
          ? (await fse.stat(zipFilePath)).size
          : 0;

        createFolderInZip(zipFilePath, filePathInZip, job)
          .then(() => job.resolveCompletion()) // Resolve the promise on success
          .catch((err) => job.rejectCompletion(err)); // Reject the promise on error
      } else {
        if (await fse.pathExists(newFolderPath)) {
          return res.status(409).json({
            message: "A file or folder with that name already exists.",
          });
        }
        await fse.mkdir(newFolderPath);
      }
      res.status(201).json({ message: "Folder created successfully.", jobId });
    } catch (error) {
      console.error("New folder error:", error);
      if (zipPathMatch) {
        console.log(
          "[/fileSystemRoutes] Rejecting completion promise for job:",
          job.id,
          "with error:",
          error.message
        );
        job.rejectCompletion(error); // Reject the promise on error only if it's a zip operation
      }
      res
        .status(500)
        .json({ message: `Failed to create folder: ${error.message}` });
    } finally {
      if (!zipPathMatch) {
        try {
          unregisterAllForJob(jobId, job);
        } catch (e) {
          /* ignore */
        }
        activeZipOperations.delete(jobId);
      }
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

    const jobId = crypto.randomUUID();
    const abortController = new AbortController();
    const job = {
      id: jobId,
      _traceId: crypto.randomUUID(),
      status: "pending",
      ws: null,
      controller: abortController,
      type: "create-file-in-zip",
      zipFilePath: null,
      filePathInZip: null,
      originalZipSize: 0,
      totalBytes: 0,
      processedBytes: 0,
      currentFile: "",
      currentFileTotalSize: 0,
      currentFileBytesProcessed: 0,
      overwriteResolvers: [],
    };
    activeZipOperations.set(jobId, job);

    let zipPathMatch = null;
    try {
      zipPathMatch = matchZipPath(newFilePath);
      if (zipPathMatch) {
        let resolveCompletion;
        let rejectCompletion;
        const completionPromise = new Promise((resolve, reject) => {
          resolveCompletion = resolve;
          rejectCompletion = reject;
        });
        job.completionPromise = completionPromise;
        job.resolveCompletion = resolveCompletion;
        job.rejectCompletion = rejectCompletion;

        const zipFilePath = zipPathMatch[1];
        let filePathInZip = zipPathMatch[2] || "";
        if (filePathInZip.startsWith("/"))
          filePathInZip = filePathInZip.substring(1);

        if (!(await fse.pathExists(zipFilePath))) {
          return res.status(404).json({ message: "Zip file not found." });
        }
        if (!filePathInZip) {
          return res
            .status(400)
            .json({ message: "Invalid path in zip for save operation." });
        }

        job.zipFilePath = zipFilePath;
        job.filePathInZip = filePathInZip;
        job.originalZipSize = (await fse.pathExists(zipFilePath))
          ? (await fse.stat(zipFilePath)).size
          : 0;

        createFileInZip(zipFilePath, filePathInZip, job)
          .then(() => job.resolveCompletion())
          .catch((err) => job.rejectCompletion(err));
      } else {
        if (await fse.pathExists(newFilePath)) {
          return res
            .status(409)
            .json({ message: "A file with that name already exists." });
        }
        await fse.createFile(newFilePath);
      }
      res.status(201).json({ message: "File created successfully.", jobId });
    } catch (error) {
      console.error("New file error:", error);
      if (zipPathMatch) {
        job.rejectCompletion(error);
      }
      res
        .status(500)
        .json({ message: `Failed to create file: ${error.message}` });
    } finally {
      if (!zipPathMatch) {
        try {
          unregisterAllForJob(jobId, job);
        } catch (e) {
          /* ignore */
        }
        activeZipOperations.delete(jobId);
      }
    }
  });

  // Endpoint to rename a file/folder
  router.post("/rename", async (req, res) => {
    const { oldPath, newName, overwrite } = req.body;
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

    try {
      const zipPathMatch = matchZipPath(oldPath);
      const pathInZip = zipPathMatch
        ? zipPathMatch[2].startsWith("/")
          ? zipPathMatch[2].substring(1)
          : zipPathMatch[2]
        : null;
      if (zipPathMatch && pathInZip !== "") {
        const jobId = crypto.randomUUID();
        const abortController = new AbortController();
        const job = {
          id: jobId,
          _traceId: crypto.randomUUID(),
          status: "pending",
          ws: null,
          controller: abortController,
          type: "rename-in-zip",
          zipFilePath: null,
          originalZipSize: 0,
          totalBytes: 0,
          processedBytes: 0,
          currentFile: "",
          currentFileTotalSize: 0,
          currentFileBytesProcessed: 0,
          overwriteResolvers: [],
        };
        activeZipOperations.set(jobId, job);

        let resolveCompletion;
        let rejectCompletion;
        const completionPromise = new Promise((resolve, reject) => {
          resolveCompletion = resolve;
          rejectCompletion = reject;
        });
        job.completionPromise = completionPromise;
        job.resolveCompletion = resolveCompletion;
        job.rejectCompletion = rejectCompletion;

        const zipFilePath = zipPathMatch[1];
        const oldPathInZip = pathInZip;
        const newPathInZip = path.posix.join(
          path.posix.dirname(oldPathInZip),
          newName
        );

        job.zipFilePath = zipFilePath;
        job.originalZipSize = (await fse.pathExists(zipFilePath))
          ? (await fse.stat(zipFilePath)).size
          : 0;

        // Check if destination name already exists in the archive.
        const zipfileForCheck = await yauzl.open(zipFilePath);
        try {
          let conflict = false;
          for await (const entry of zipfileForCheck) {
            if (
              entry.filename === newPathInZip ||
              entry.filename.startsWith(`${newPathInZip}/`)
            ) {
              conflict = true;
              break;
            }
          }
          // If no conflict was found at parent zip level, check inside nested zip if appropriate
          if (!conflict) {
            const nestedZipIndex = oldPathInZip
              .toLowerCase()
              .lastIndexOf(".zip/");
            if (nestedZipIndex !== -1) {
              const nestedZipPathInParent = oldPathInZip.substring(
                0,
                nestedZipIndex + 4
              );
              const newPathRemaining = newPathInZip.substring(
                nestedZipIndex + 5
              );
              // Extract the nested zip to scan for conflicts
              const { tempNestedZipPath, tempDir } =
                await extractNestedZipToTemp(
                  zipFilePath,
                  nestedZipPathInParent
                );
              try {
                const nestedZipFile = await yauzl.open(tempNestedZipPath);
                try {
                  for await (const nestedEntry of nestedZipFile) {
                    if (
                      nestedEntry.filename === newPathRemaining ||
                      nestedEntry.filename.startsWith(`${newPathRemaining}/`)
                    ) {
                      conflict = true;
                      break;
                    }
                  }
                } finally {
                  await nestedZipFile.close();
                }
              } finally {
                await fse.remove(tempDir).catch(() => {});
              }
            }
          }

          if (conflict && !overwrite) {
            return res
              .status(409)
              .json({ message: "A file with that name already exists." });
          }
          if (conflict && overwrite) {
            job.overwriteDecision = "overwrite";
          }
        } finally {
          await zipfileForCheck.close();
        }

        renameInZip(zipFilePath, oldPathInZip, newPathInZip, job)
          .then(() => job.resolveCompletion())
          .catch((err) => job.rejectCompletion(err));

        return res.status(202).json({ message: "Rename job started.", jobId });
      } else {
        const newPath = path.join(path.dirname(oldPath), newName);
        if ((await fse.pathExists(newPath)) && !overwrite) {
          return res
            .status(409)
            .json({ message: "A file with that name already exists." });
        }
        if ((await fse.pathExists(newPath)) && overwrite) {
          // Remove existing entry before rename
          await fse.remove(newPath);
        }
        await fse.rename(oldPath, newPath);
        res.status(200).json({ message: "Item renamed successfully." });
      }
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
    const { path: filePath, content, jobId: clientJobId } = req.body;
    if (!filePath || content === undefined) {
      console.log(`[Server] /save-file: Invalid request for ${filePath}`);
      return res
        .status(400)
        .json({ message: "File path and content are required." });
    }

    try {
      const zipPathMatch = matchZipPath(filePath);
      if (zipPathMatch) {
        const jobId = clientJobId || crypto.randomUUID();
        const abortController = new AbortController();
        const job = {
          id: jobId,
          status: "pending",
          ws: null,
          controller: abortController,
          type: "update-file-in-zip",
          zipFilePath: null,
          filePathInZip: null,
          originalZipSize: 0,
          totalBytes: 0,
          processedBytes: 0,
          currentFile: "",
          currentFileTotalSize: 0,
          currentFileBytesProcessed: 0,
          tempZipPath: null,
          overwriteResolvers: [],
          contentToSave: content,
        };
        activeZipOperations.set(jobId, job);

        let resolveCompletion;
        let rejectCompletion;
        const completionPromise = new Promise((resolve, reject) => {
          resolveCompletion = resolve;
          rejectCompletion = reject;
        });
        job.completionPromise = completionPromise;
        job.resolveCompletion = resolveCompletion;
        job.rejectCompletion = rejectCompletion;

        const zipFilePath = zipPathMatch[1];
        const filePathInZip = zipPathMatch[2].startsWith("/")
          ? zipPathMatch[2].substring(1)
          : zipPathMatch[2];

        job.zipFilePath = zipFilePath;
        job.filePathInZip = filePathInZip;
        job.currentFile = filePathInZip;
        job.originalZipSize = (await fse.pathExists(zipFilePath))
          ? (await fse.stat(zipFilePath)).size
          : 0;

        // Immediately return 202 Accepted with the jobId
        res.status(202).json({ message: "Zip update job started.", jobId });

        // Start the updateFileInZip operation asynchronously
        updateFileInZip(
          zipFilePath,
          filePathInZip,
          job.contentToSave,
          job,
          job.controller.signal
        )
          .then(() => {
            console.log(
              `[Job ${jobId}] updateFileInZip completed successfully.`
            );
            job.resolveCompletion(); // Resolve the promise on success
          })
          .catch((err) => {
            console.error(
              `[Job ${jobId}] updateFileInZip failed:`,
              err.message
            );
            job.rejectCompletion(err); // Reject the promise on error
          });
      } else {
        await fse.writeFile(filePath, content);
        console.log(
          `[Server] /save-file: Non-zip file saved successfully: ${filePath}`
        );
        res.status(200).json({ message: "File saved successfully." });
      }
    } catch (error) {
      console.error("[Server] Error initiating file save:", error);
      // Ensure job is removed if initial setup fails before async operation starts
      if (
        zipPathMatch &&
        activeZipOperations.has(clientJobId || crypto.randomUUID())
      ) {
        activeZipOperations.delete(clientJobId || crypto.randomUUID());
      }
      res
        .status(500)
        .json({ message: `Failed to initiate file save: ${error.message}` });
    }
  });

  // Endpoint to get file information (e.g., size)
  router.get("/file-info", async (req, res) => {
    const { filePath } = req.query;
    if (!filePath) {
      return res.status(400).json({ message: "File path is required." });
    }
    try {
      console.debug(`[file-info] Request for filePath: ${filePath}`);
      const zipMatch = matchZipPath(filePath);
      if (zipMatch) {
        let zipFilePath = zipMatch[1];
        let pathInZip = zipMatch[2] || "";
        if (pathInZip.startsWith("/")) pathInZip = pathInZip.substring(1);
        // Normalize to POSIX separators and strip leading './' and '/' from inner path
        pathInZip = pathInZip
          .replace(/\\/g, "/")
          .replace(/^\.\//, "")
          .replace(/^\/+/, "");

        // If the request was for the zip root itself (no inner path), return
        // the file stats of the zip container instead of trying to search
        // for an empty inner path inside the archive.
        if (!pathInZip) {
          if (!(await fse.pathExists(zipFilePath))) {
            console.warn(`[file-info] Zip file not found: ${zipFilePath}`);
            return res.status(404).json({ message: "Zip file not found." });
          }
          const statsZip = await fse.stat(zipFilePath);
          res.json({
            size: statsZip.size,
            isFile: true,
            isDirectory: false,
          });
          return;
        }

        // Handle nested zips by extracting to temp until we reach a real zip
        const tempDirs = [];
        try {
          while (true) {
            const zi = pathInZip.toLowerCase().indexOf(".zip/");
            if (zi === -1) break;
            const nested = pathInZip.substring(0, zi + 4);
            pathInZip = pathInZip.substring(zi + 5);
            const { tempNestedZipPath, tempDir } = await extractNestedZipToTemp(
              zipFilePath,
              nested
            );
            tempDirs.push(tempDir);
            zipFilePath = tempNestedZipPath;
          }

          const zf = await yauzl.open(zipFilePath);
          try {
            let foundEntry = null;
            const normalizedTarget = pathInZip
              .replace(/\\/g, "/")
              .replace(/^\.\//, "")
              .replace(/^\/+/, "");
            for await (const entry of zf) {
              const entryName = entry.filename.replace(/^\/+|^\.\//g, "");
              const normalizedEntry = entryName.replace(/\\/g, "/");
              if (
                normalizedEntry === normalizedTarget ||
                normalizedEntry === `${normalizedTarget}/` ||
                normalizedEntry.toLowerCase() ===
                  normalizedTarget.toLowerCase() ||
                normalizedEntry.toLowerCase() ===
                  `${normalizedTarget.toLowerCase()}/`
              ) {
                foundEntry = entry;
                break;
              }
              // Directory entries may be absent from the zip, detect via prefix
              if (normalizedEntry.startsWith(`${normalizedTarget}/`)) {
                foundEntry = entry;
                break;
              }
            }
            if (foundEntry) {
              res.json({
                size: foundEntry.uncompressedSize,
                isFile: !foundEntry.filename.endsWith("/"),
                isDirectory: foundEntry.filename.endsWith("/"),
              });
              return;
            }
            // If we reach here, the entry wasn't found
            res.status(404).json({ message: "File not found in zip." });
            return;
          } finally {
            await zf.close();
          }
        } finally {
          for (const d of tempDirs) {
            try {
              await fse.remove(d);
            } catch (err) {
              console.warn(`Failed to remove temp dir ${d}: ${err.message}`);
            }
          }
        }
      }
      const stats = await fse.stat(filePath);
      res.json({
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
      });
    } catch (error) {
      console.error("Error fetching file info:", error);
      res
        .status(500)
        .json({ message: `Failed to get file info: ${error.message}` });
    }
  });

  return router;
}
