import express from "express";
import fse from "fs-extra";
import path from "path";
import open from "open";
import os from "os";
import crypto from "crypto";
import checkDiskSpace from "check-disk-space";
import archiver from "archiver";
import {
  performCopyCancellation,
  getDirTotalSize,
  getFileType,
  getFilesInZip,
  getFileContentFromZip,
  getZipFileStream,
  getMimeType,
  findCoverInZip,
  matchZipPath,
  updateFileInZip,
  createFileInZip,
  createFolderInZip,
  deleteFromZip,
  getSummaryFromZip,
  renameInZip,
  duplicateInZip,
} from "../lib/utils.js";

export default function createFileRoutes(
  activeCopyJobs,
  activeSizeJobs,
  activeCompressJobs,
  activeDecompressJobs,
  activeArchiveTestJobs,
  activeDuplicateJobs,
  activeCopyPathsJobs,
  activeZipOperations
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
            let actualFullPath = fullFilePath;

            const fileStats = await fse.stat(actualFullPath);
            const type = getFileType(file.name, fileStats.isDirectory());
            return {
              name: file.name,
              type,
              size: fileStats.isFile() ? fileStats.size : null,
              // Use ISO timestamps to avoid locale-dependent string parsing on clients
              modified: fileStats.mtime.toISOString(),
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

  router.post("/search", async (req, res) => {
    const { basePath, query, options = {} } = req.body || {};
    if (!basePath || !query) {
      return res
        .status(400)
        .json({ message: "Base path and query are required." });
    }

    const resolvedBasePath = path.resolve(basePath);
    if (matchZipPath(resolvedBasePath)) {
      return res
        .status(400)
        .json({ message: "Search inside archives is not supported." });
    }

    let stats;
    try {
      stats = await fse.stat(resolvedBasePath);
      if (!stats.isDirectory()) {
        return res
          .status(400)
          .json({ message: "Base path must be a directory." });
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        return res
          .status(404)
          .json({ message: `Path does not exist: ${resolvedBasePath}` });
      }
      console.error("Error inspecting base path for search:", error);
      return res.status(500).json({ message: "Error preparing search." });
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return res.status(400).json({ message: "Search query cannot be empty." });
    }

    const includeHidden = !!options.includeHidden;
    const includeSubfolders =
      options.includeSubfolders === undefined
        ? true
        : !!options.includeSubfolders;
    const useRegex = !!options.useRegex;
    const caseSensitive = !!options.caseSensitive;

    const escapeSegment = (segment) =>
      segment.replace(/[-[\]{}()+?.\\^$|]/g, "\\$&");

    const buildPattern = (value) =>
      value.split("*").map(escapeSegment).join(".*");

    let matcher;
    try {
      const flags = caseSensitive ? "" : "i";
      matcher = useRegex
        ? new RegExp(trimmedQuery, flags)
        : new RegExp(buildPattern(trimmedQuery), flags);
    } catch (error) {
      return res.status(400).json({ message: "Invalid regular expression." });
    }

    const visitedDirs = new Set();
    const groups = new Map();

    const addMatch = (folderPath, entry) => {
      const normalizedFolder = path.resolve(folderPath);
      if (!groups.has(normalizedFolder)) {
        groups.set(normalizedFolder, []);
      }
      groups.get(normalizedFolder).push(entry);
    };

    const traverseDirectory = async (directory) => {
      let realDir;
      try {
        realDir = await fse.realpath(directory);
      } catch (error) {
        return;
      }
      if (visitedDirs.has(realDir)) return;
      visitedDirs.add(realDir);

      let entries;
      try {
        entries = await fse.readdir(directory, { withFileTypes: true });
      } catch (error) {
        console.error(
          `Failed to read directory during search: ${directory}`,
          error.message
        );
        return;
      }

      for (const entry of entries) {
        if (entry.name === "." || entry.name === "..") continue;
        const entryPath = path.join(directory, entry.name);
        let entryStats;
        try {
          entryStats = await fse.stat(entryPath);
        } catch (error) {
          continue;
        }

        const isHidden = entry.name.startsWith(".");
        if (!includeHidden && isHidden) continue;

        const entryType = entryStats.isDirectory()
          ? "folder"
          : getFileType(entry.name, false);

        if (matcher.test(entry.name)) {
          addMatch(directory, {
            name: entry.name,
            type: entryType,
            size: entryStats.isFile() ? entryStats.size : null,
            modified: entryStats.mtime.toISOString(),
            fullPath: entryPath,
          });
        }

        if (includeSubfolders && entryStats.isDirectory()) {
          await traverseDirectory(entryPath);
        }
      }
    };

    try {
      await traverseDirectory(resolvedBasePath);
    } catch (error) {
      console.error("Error during search traversal:", error);
      return res.status(500).json({ message: "Error executing search." });
    }

    const sortedGroups = Array.from(groups.entries())
      .map(([folder, items]) => ({
        folder,
        items: items.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.folder.localeCompare(b.folder));

    res.json({
      basePath: resolvedBasePath,
      groups: sortedGroups,
    });
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

  // Endpoint to initiate copy
  router.post("/copy", async (req, res) => {
    const { sources, destination, isMove } = req.body;
    if (!sources || sources.length === 0 || !destination) {
      return res
        .status(400)
        .json({ message: "Invalid source or destination." });
    }

    try {
      const jobId = crypto.randomUUID();
      const zipDestMatch = matchZipPath(destination);
      const zipSourceMatch = matchZipPath(sources[0]);

      if (
        zipSourceMatch &&
        zipDestMatch &&
        zipSourceMatch[1] === zipDestMatch[1]
      ) {
        // This is an in-zip copy/duplication. The standard 'zip-add' flow can't handle this
        // because the source is virtual. Reroute to the duplication logic.
        const destPathInZip = zipDestMatch[2];
        let items;

        if (!destPathInZip || destPathInZip === "/") {
          // Buggy client state detected: destination is the zip root.
          // Ignore destination and create the new name from the source.
          items = sources.map((sourcePath) => {
            const sourcePathInZip = matchZipPath(sourcePath)[2];
            const sourceName = path.posix.basename(sourcePathInZip);
            const sourceExt = path.posix.extname(sourceName);
            const sourceBase = path.posix.basename(sourceName, sourceExt);
            const newName =
              sourceExt !== ""
                ? `${sourceBase} copy${sourceExt}`
                : `${sourceBase} copy`;
            return { sourcePath, newName };
          });
        } else {
          // This seems to be a valid in-zip copy or duplicate request.
          items = sources.map((sourcePath) => ({
            sourcePath,
            newName: path.basename(destination),
          }));
        }

        const jobId = crypto.randomUUID();
        const job = {
          id: jobId,
          status: "pending",
          ws: null,
          controller: new AbortController(),
          items,
          isZipDuplicate: true,
          jobType: "duplicate",
          originalZipSize: 0,
          total: 0,
        };
        activeCopyJobs.set(jobId, job);

        let resolveCompletion, rejectCompletion;
        job.completionPromise = new Promise((res, rej) => {
          resolveCompletion = res;
          rejectCompletion = rej;
        });
        job.resolveCompletion = resolveCompletion;
        job.rejectCompletion = rejectCompletion;

        (async () => {
          try {
            const zipFilePath = zipSourceMatch[1];
            job.zipFilePath = zipFilePath;
            job.originalZipSize = (await fse.pathExists(zipFilePath))
              ? (await fse.stat(zipFilePath)).size
              : 0;
            job.total = job.originalZipSize;
            job.status = "copying";

            await duplicateInZip(job);

            job.status = "completed";
            job.resolveCompletion();
          } catch (error) {
            console.error("Error during in-zip copy/duplicate process:", error);
            job.status = job.controller.signal.aborted ? "cancelled" : "failed";
            job.rejectCompletion(error);
          }
        })();

        return res.status(202).json({ jobId });
      }

      let jobType = "copy";
      const sourceZipPathMatch = matchZipPath(sources[0]);
      const sourceZipFilePath = sourceZipPathMatch
        ? sourceZipPathMatch[1]
        : null;
      const sourcePathInZip = sourceZipPathMatch
        ? sourceZipPathMatch[2].startsWith("/")
          ? sourceZipPathMatch[2].substring(1)
          : sourceZipPathMatch[2]
        : null;

      if (zipDestMatch) {
        jobType = "zip-add";
      } else if (sourceZipPathMatch && sourcePathInZip === "") {
        // If the source is a zip file itself (not content within it) and destination is not a zip, treat as regular copy
        jobType = "copy";
      } else if (sourceZipPathMatch) {
        jobType = "zip-extract";
      }

      const job = {
        id: jobId,
        status: "pending",
        ws: null,
        controller: new AbortController(),
        destination,
        sources,
        isMove: isMove || false,
        overwriteDecision: "prompt",
        resolveOverwrite: null,
        jobType,
      };

      activeCopyJobs.set(jobId, job);

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
    const { items, isZipDuplicate } = req.body;

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
        isZipDuplicate: isZipDuplicate || false,
        jobType: "duplicate", // Explicitly set job type for websocket
        // Properties needed for zip operations, similar to saveFile
        originalZipSize: 0,
        processedBytes: 0,
        currentFile: "",
        currentFileTotalSize: 0,
        currentFileBytesProcessed: 0,
        tempZipPath: null,
      };
      activeDuplicateJobs.set(jobId, job);

      if (isZipDuplicate) {
        // Prepare a promise that the WebSocket handler can await
        let resolveCompletion;
        let rejectCompletion;
        const completionPromise = new Promise((resolve, reject) => {
          resolveCompletion = resolve;
          rejectCompletion = reject;
        });
        job.completionPromise = completionPromise;
        job.resolveCompletion = resolveCompletion;
        job.rejectCompletion = rejectCompletion;

        // Perform the zip duplication asynchronously
        (async () => {
          try {
            // Assume all items are within the same zip for a single duplicate operation
            const firstSourcePath = items[0]?.sourcePath;
            if (!firstSourcePath)
              throw new Error("No source path provided for zip duplicate.");

            const zipPathMatch = matchZipPath(firstSourcePath);
            if (!zipPathMatch)
              throw new Error(
                "Source path is not a valid zip path for duplication."
              );

            const zipFilePath = zipPathMatch[1];
            job.zipFilePath = zipFilePath; // Store for potential use

            // Calculate original size for progress reporting context
            job.originalZipSize = (await fse.pathExists(zipFilePath))
              ? (await fse.stat(zipFilePath)).size
              : 0;
            // Set total based on source file sizes (approximation for progress)
            job.total = 0;
            job.status = "scanning";

            // Send initial start message if WS connects quickly (or handle in WS handler)
            if (job.ws && job.ws.readyState === 1) {
              job.ws.send(JSON.stringify({ type: "scan_start" }));
            }

            // Estimate total size (uncompressed) for progress bar - coarse estimate
            // A more accurate way would be to get uncompressed sizes, but requires opening the zip first.
            // For duplication, maybe total isn't as crucial as just seeing activity.
            // Let's keep total simple for now, relying more on the temp zip size changes.
            job.total = job.originalZipSize; // Use original size as a rough total indicator

            if (job.ws && job.ws.readyState === 1) {
              job.ws.send(
                JSON.stringify({ type: "scan_complete", total: job.total })
              );
            }
            job.status = "copying"; // Move to copying state

            // The entire multi-step duplication process is now handled by the duplicateInZip function.
            await duplicateInZip(job);

            job.status = "completed";
            job.resolveCompletion(); // Signal success
          } catch (error) {
            console.error("Error during zip duplication process:", error);
            job.status = job.controller.signal.aborted ? "cancelled" : "failed";
            job.rejectCompletion(error); // Signal failure
          }
        })();
      }

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

    const jobId = crypto.randomUUID();
    const abortController = new AbortController();
    const job = {
      id: jobId,
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
        const filePathInZip = zipPathMatch[2].startsWith("/")
          ? zipPathMatch[2].substring(1)
          : zipPathMatch[2];

        job.zipFilePath = zipFilePath;
        job.filePathInZip = filePathInZip;
        job.originalZipSize = (await fse.pathExists(zipFilePath))
          ? (await fse.stat(zipFilePath)).size
          : 0;
        console.log(
          "[/api/new-folder] Calculated originalZipSize:",
          job.originalZipSize
        );

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
          "[fileRoutes] Rejecting completion promise for job:",
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
      // For non-zip operations, delete the job immediately.
      // For zip operations, the WebSocket handler will delete it after a timeout.
      if (!zipPathMatch) {
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
        const filePathInZip = zipPathMatch[2].startsWith("/")
          ? zipPathMatch[2].substring(1)
          : zipPathMatch[2];

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
        activeZipOperations.delete(jobId);
      }
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
      forceZip64: true,
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
      controller: new AbortController(),
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
      controller: new AbortController(),
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

    try {
      const zipPathMatch = matchZipPath(oldPath);
      if (zipPathMatch) {
        const jobId = crypto.randomUUID();
        const abortController = new AbortController();
        const job = {
          id: jobId,
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
        const oldPathInZip = zipPathMatch[2].startsWith("/")
          ? zipPathMatch[2].substring(1)
          : zipPathMatch[2];
        const newPathInZip = path.posix.join(
          path.posix.dirname(oldPathInZip),
          newName
        );

        job.zipFilePath = zipFilePath;
        job.originalZipSize = (await fse.pathExists(zipFilePath))
          ? (await fse.stat(zipFilePath)).size
          : 0;

        renameInZip(zipFilePath, oldPathInZip, newPathInZip, job)
          .then(() => job.resolveCompletion())
          .catch((err) => job.rejectCompletion(err));

        return res.status(202).json({ message: "Rename job started.", jobId });
      } else {
        const newPath = path.join(path.dirname(oldPath), newName);
        if (await fse.pathExists(newPath)) {
          return res
            .status(409)
            .json({ message: "A file with that name already exists." });
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
      controller: new AbortController(),
    };
    activeCopyPathsJobs.set(jobId, job);

    res.status(202).json({ jobId });
  });

  // Endpoint to get file information (e.g., size)
  router.get("/file-info", async (req, res) => {
    const { filePath } = req.query;
    if (!filePath) {
      return res.status(400).json({ message: "File path is required." });
    }
    try {
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

  // Endpoint to cancel a zip operation
  router.post("/zip/operation/cancel", (req, res) => {
    const { jobId } = req.body;
    if (!jobId || !activeZipOperations.has(jobId)) {
      return res.status(404).json({ message: "Zip operation job not found." });
    }
    const job = activeZipOperations.get(jobId);
    if (job && job.controller) {
      console.log("[fileRoutes] Aborting job:", jobId);
      job.controller.abort();
    }
    activeZipOperations.delete(jobId); // Clean up the job
    res
      .status(200)
      .json({ message: "Zip operation cancellation request received." });
  });

  return router;
}
