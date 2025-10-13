import fse from "fs-extra";
import path from "path";
import crypto from "crypto";
import { pipeline } from "stream/promises";
import * as yauzl from "yauzl-promise";

const getZipContents = async (zipFilePath) => {
  const entries = [];
  let zipfile;
  try {
    zipfile = await yauzl.open(zipFilePath);
    for await (const entry of zipfile) {
      const isDirectory = entry.filename.endsWith('/');
      let type = "file"; // Default to generic file type

      if (isDirectory) {
        type = "folder";
      } else {
        // Apply detailed type detection based on file extension
        if (/\.zip$/i.test(entry.filename)) type = "archive";
        else if (
          /\.(jpg|jpeg|png|gif|bmp|tiff|svg|webp|psd)$/i.test(entry.filename)
        )
          type = "image";
        else if (/\.(mp4|mkv|avi|mov|wmv|flv)$/i.test(entry.filename))
          type = "video";
        else if (/\.(mp3|m4a|aac|flac|wav|ogg|wma)$/i.test(entry.filename))
          type = "audio";
        else if (/\.pdf$/i.test(entry.filename)) type = "pdf";
        else if (/\.(doc|docx)$/i.test(entry.filename)) type = "doc";
        else if (/\.html$/i.test(entry.filename)) type = "html";
        else if (/\.css$/i.test(entry.filename)) type = "css";
        else if (/\.(js|jsx)$/i.test(entry.filename)) type = "javascript";
        else if (/\.(ts|tsx)$/i.test(entry.filename)) type = "typescript";
        else if (/\.json$/i.test(entry.filename)) type = "json";
        else if (/\.py$/i.test(entry.filename)) type = "python";
        else if (/\.sh$/i.test(entry.filename)) type = "shell";
        else if (/\.sql$/i.test(entry.filename)) type = "sql";
        else if (/\.md$/i.test(entry.filename)) type = "markdown";
        else if (/\.(yml|yaml)$/i.test(entry.filename)) type = "yaml";
        else if (/\.xml$/i.test(entry.filename)) type = "xml";
        else if (/\.log$/i.test(entry.filename)) type = "log";
        else if (/\.(cfg|ini)$/i.test(entry.filename)) type = "config";
        else if (/dockerfile/i.test(entry.filename) || /docker-compose\.yml/i.test(entry.filename)) type = "docker";
        else if (/\.gitignore/i.test(entry.filename)) type = "git";
        else if (/\.(c|h|cpp|hpp|cs|go|php|rb|rs|swift|kt|dart|pl|lua|scala|hs|erl|exs|clj|r|java|rb)$/i.test(entry.filename)) type = "code";
      }

      entries.push({
        name: entry.filename,
        type: type,
        uncompressedSize: entry.uncompressedSize,
      });
    }
  } catch (error) {
    console.error(`Error processing zip file ${zipFilePath}:`, error);
    throw error; // Re-throw the error to be caught by the caller
  } finally {
    if (zipfile) {
      await zipfile.close();
    }
  }
  return entries;
};

// Recursive function to calculate directory size with progress and cancellation
const getDirSizeWithProgress = async (dirPath, job) => {
  if (job.controller.signal.aborted) throw new Error("Calculation cancelled");

  const items = await fse.readdir(dirPath, { withFileTypes: true });

  for (const item of items) {
    if (job.controller.signal.aborted) throw new Error("Calculation cancelled");
    const itemPath = path.join(dirPath, item.name);

    if (item.isDirectory()) {
      // Send progress update for the folder before recursing
      if (job.ws && job.ws.readyState === 1) {
        job.ws.send(
          JSON.stringify({
            type: "progress",
            file: itemPath,
            sizeSoFar: job.sizeSoFar,
          })
        );
      }
      await getDirSizeWithProgress(itemPath, job);
    } else {
      try {
        const stats = await fse.stat(itemPath);
        job.sizeSoFar += stats.size; // Add file size to the running total
        // Send progress update for the file
        if (job.ws && job.ws.readyState === 1) {
          job.ws.send(
            JSON.stringify({
              type: "progress",
              file: itemPath,
              sizeSoFar: job.sizeSoFar,
            })
          );
        }
      } catch (e) {
        console.error(`Could not stat ${itemPath}, skipping.`);
      }
    }
  }
};

const performCopyCancellation = async (job) => {
  // This function now only signals the cancellation.
  // The running job's 'catch' block in websocket.js will handle sending the final message and closing the connection.
  if (job.status === "scanning" || job.status === "copying") {
    job.status = "cancelled"; // Set the final status here.
    job.controller.abort();

    // Unblock the overwrite prompt if it's waiting for a response.
    if (job.resolveOverwrite) {
      job.resolveOverwrite();
    }
  }
};

// Helper to get MIME type from file extension
const getMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    // Document
    ".pdf": "application/pdf",
    // Video
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".ogg": "video/ogg",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
    // Audio
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".wma": "audio/x-ms-wma",
  };
  return mimeTypes[ext] || "application/octet-stream";
};

const getDirTotalSize = async (dirPath, signal) => {
  if (signal && signal.aborted) throw new Error("Calculation cancelled");

  let totalSize = 0;
  let stats;
  try {
    stats = await fse.stat(dirPath);
  } catch (e) {
    console.error(`Could not stat ${dirPath}, skipping.`, e.message);
    return 0;
  }

  if (stats.isFile()) {
    return stats.size;
  }

  // If it's a directory, proceed with reading its contents
  const items = await fse.readdir(dirPath, { withFileTypes: true });
  for (const item of items) {
    if (signal && signal.aborted) throw new Error("Calculation cancelled");
    const itemPath = path.join(dirPath, item.name);
    if (item.isDirectory()) {
      totalSize += await getDirTotalSize(itemPath, signal);
    } else {
      try {
        const itemStats = await fse.stat(itemPath);
        totalSize += itemStats.size;
      } catch (e) {
        console.error(`Could not stat ${itemPath}, skipping.`, e.message);
      }
    }
  }
  return totalSize;
};

const getDirSize = async (dirPath) => {
  let totalSize = 0;
  const items = await fse.readdir(dirPath, { withFileTypes: true });
  for (const item of items) {
    const itemPath = path.join(dirPath, item.name);
    if (item.isDirectory()) {
      totalSize += await getDirSize(itemPath);
    } else {
      try {
        const stats = await fse.stat(itemPath);
        totalSize += stats.size;
      } catch (e) {
        console.error(`Could not stat ${itemPath}, skipping.`, e.message);
      }
    }
  }
  return totalSize;
};

const getDirSizeWithScanProgress = async (dirPath, job) => {
  if (job.controller.signal.aborted) throw new Error("Scan cancelled");

  let size = 0;
  const items = await fse.readdir(dirPath, { withFileTypes: true });

  for (const item of items) {
    if (job.controller.signal.aborted) throw new Error("Scan cancelled");
    const itemPath = path.join(dirPath, item.name);

    if (job.ws && job.ws.readyState === 1) {
      job.ws.send(JSON.stringify({ type: "scan_progress", file: itemPath }));
    }

    if (item.isDirectory()) {
      size += await getDirSizeWithScanProgress(itemPath, job);
    } else {
      try {
        const stats = await fse.stat(itemPath);
        size += stats.size;
      } catch (e) {
        console.error(`Could not stat ${itemPath} during scan, skipping.`);
      }
    }
  }
  return size;
};

const copyWithProgress = async (source, destination, job) => {
  if (job.controller.signal.aborted) {
    throw new Error("Copy cancelled");
  }

  const sourceStats = await fse.stat(source);
  const destinationExists = await fse.pathExists(destination);

  // --- Start of Decision Logic ---

  if (
    job.overwriteDecision === "if_newer" &&
    destinationExists &&
    !sourceStats.isDirectory()
  ) {
    job.copied += sourceStats.size;
    if (job.ws && job.ws.readyState === 1) {
      job.ws.send(JSON.stringify({ type: "progress", copied: job.copied }));
    }
    return;
  }

  if (destinationExists && job.overwriteDecision !== "if_newer") {
    let decision = job.overwriteDecision;
    const needsPrompt = ["prompt", "overwrite", "skip"].includes(decision);

    if (needsPrompt) {
      if (job.ws && job.ws.readyState === 1) {
        job.ws.send(
          JSON.stringify({
            type: "overwrite_prompt",
            file: path.basename(destination),
            itemType: sourceStats.isDirectory() ? "folder" : "file",
          })
        );
        await new Promise((resolve) => (job.resolveOverwrite = resolve));
        decision = job.overwriteDecision;
      }
    }

    const evaluateDecision = () => {
      switch (decision) {
        case "skip":
        case "skip_all":
          return true;
        case "size_differs": {
          if (sourceStats.isDirectory()) {
            return false;
          }
          const destStats = fse.statSync(destination);
          return sourceStats.size === destStats.size;
        }
        case "smaller_only": {
          if (sourceStats.isDirectory()) {
            return false;
          }
          const destStats = fse.statSync(destination);
          return destStats.size >= sourceStats.size;
        }
        case "no_zero_length": {
          if (sourceStats.isDirectory()) {
            return fse.readdirSync(source).length === 0;
          } else {
            return sourceStats.size === 0;
          }
        }
        default:
          return false;
      }
    };

    if (evaluateDecision()) {
      const sizeToSkip = sourceStats.isDirectory()
        ? await getDirSize(source)
        : sourceStats.size;
      job.copied += sizeToSkip;
      if (job.ws && job.ws.readyState === 1) {
        job.ws.send(JSON.stringify({ type: "progress", copied: job.copied }));
      }
      return;
    }

    if (decision === "overwrite" || decision === "skip") {
      job.overwriteDecision = "prompt";
    } else {
      job.overwriteDecision = decision;
    }
  }

  // --- End of Decision Logic. If we are here, we need to copy. ---

  if (sourceStats.isDirectory()) {
    await fse.mkdir(destination, { recursive: true });
    const items = await fse.readdir(source);
    for (const item of items) {
      await copyWithProgress(
        path.join(source, item),
        path.join(destination, item),
        job
      );
    }
    // ✨ Preserve the original timestamps for folders
    await fse.utimes(destination, sourceStats.atime, sourceStats.mtime);
  } else {
    if (job.ws && job.ws.readyState === 1) {
      job.ws.send(JSON.stringify({ type: "copy_progress", file: destination }));
    }

    const tempDestination = destination + ".tmp" + crypto.randomUUID();
    try {
      const sourceStream = fse.createReadStream(source);
      const destStream = fse.createWriteStream(tempDestination);

      // Initialize current file progress tracking
      job.currentFile = path.basename(source);
      job.currentFileSize = sourceStats.size;
      job.currentFileBytesProcessed = 0;

      sourceStream.on("data", (chunk) => {
        if (job.controller.signal.aborted) {
          sourceStream.destroy();
          destStream.destroy();
          return;
        }
        job.copied += chunk.length;
        job.currentFileBytesProcessed += chunk.length;
        if (job.ws && job.ws.readyState === 1) {
          job.ws.send(
            JSON.stringify({
              type: "progress",
              copied: job.copied,
              currentFileBytesProcessed: job.currentFileBytesProcessed,
              currentFileSize: job.currentFileSize,
            })
          );
        }
      });

      await pipeline(sourceStream, destStream, {
        signal: job.controller.signal,
      });
      await fse.move(tempDestination, destination, { overwrite: true });
      // ✨ Preserve the original timestamps for files
      await fse.utimes(destination, sourceStats.atime, sourceStats.mtime);
    } catch (error) {
      if (await fse.pathExists(tempDestination)) {
        await fse.remove(tempDestination);
      }
      throw error;
    }
  }
};

const getAllFiles = async (dirPath, basePath = dirPath) => {
  const entries = await fse.readdir(dirPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);
      if (entry.isDirectory()) {
        return getAllFiles(fullPath, basePath);
      } else {
        try {
          const stats = await fse.stat(fullPath);
          return [{ fullPath, relativePath, stats }];
        } catch (e) {
          console.error(`Could not stat ${fullPath}, skipping.`);
          return [];
        }
      }
    })
  );
  return files.flat();
};

export {
  getDirSizeWithProgress,
  performCopyCancellation,
  getMimeType,
  getDirSize,
  getDirSizeWithScanProgress,
  copyWithProgress,
  getDirTotalSize,
  getAllFiles,
  getZipContents,
};
