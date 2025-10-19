import os from "os";
import fse from "fs-extra";
import path from "path";
import crypto from "crypto";
import { pipeline } from "stream/promises";
import * as yauzl from "yauzl-promise";
import archiver from "archiver";

const getFileType = (filename, isDirectory) => {
  if (isDirectory) return "folder";

  if (/\.zip$/i.test(filename)) return "archive";
  if (/\.(jpg|jpeg|png|gif|bmp|tiff|svg|webp|psd|cr2|nef|arw)$/i.test(filename))
    return "image";
  if (/\.(mp4|mkv|avi|mov|wmv|flv)$/i.test(filename)) return "video";
  if (/\.(mp3|m4a|aac|flac|wav|ogg|wma)$/i.test(filename)) return "audio";
  if (/\.pdf$/i.test(filename)) return "pdf";
  if (/\.(doc|docx)$/i.test(filename)) return "doc";
  if (/\.(ppt|pptx)$/i.test(filename)) return "powerpoint";
  if (/\.(xls|xlsx)$/i.test(filename)) return "excel";
  if (/\.html$/i.test(filename)) return "html";
  if (/\.css$/i.test(filename)) return "css";
  if (/\.(js|jsx)$/i.test(filename)) return "javascript";
  if (/\.(ts|tsx)$/i.test(filename)) return "typescript";
  if (/\.json$/i.test(filename)) return "json";
  if (/\.py$/i.test(filename)) return "python";
  if (/\.sh$/i.test(filename)) return "shell";
  if (/\.sql$/i.test(filename)) return "sql";
  if (/\.md$/i.test(filename)) return "markdown";
  if (/\.(yml|yaml)$/i.test(filename)) return "yaml";
  if (/\.xml$/i.test(filename)) return "xml";
  if (/\.log$/i.test(filename)) return "log";
  if (/\.(cfg|ini)$/i.test(filename)) return "config";
  if (/dockerfile/i.test(filename) || /docker-compose\.yml/i.test(filename))
    return "docker";
  if (/\.gitignore/i.test(filename)) return "git";
  if (
    /\.(c|h|cpp|hpp|cs|go|php|rb|rs|swift|kt|dart|pl|lua|scala|hs|erl|exs|clj|r|java|rb)$/i.test(
      filename
    )
  )
    return "code";
  if (
    /\.(txt|nfo|cue|properties|gitignore|editorconfig|nvmrc|prettierignore|prettierrc|license)$/i.test(
      filename
    )
  )
    return "text";

  return "file";
};

const getZipContents = async (zipFilePath) => {
  const entries = [];
  let zipfile;
  try {
    zipfile = await yauzl.open(zipFilePath);
    for await (const entry of zipfile) {
      const isDirectory = entry.filename.endsWith("/");
      const type = getFileType(entry.filename, isDirectory);

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

const getFilesInZip = async (zipFilePath, directoryPath) => {
  let tempDirs = [];
  let currentZipFile = null;

  try {
    let currentZipPath = zipFilePath;
    let pathInsideZip = directoryPath.replace(/\\/g, "/").replace(/^\//, "");

    while (true) {
      const zipEndIndex = pathInsideZip.toLowerCase().indexOf(".zip/");
      if (zipEndIndex === -1) {
        break;
      }

      const nestedZipPathInParent = pathInsideZip.substring(0, zipEndIndex + 4);
      pathInsideZip = pathInsideZip.substring(zipEndIndex + 5);

      const tempDir = fse.mkdtempSync(path.join(os.tmpdir(), "nested-zip-"));
      tempDirs.push(tempDir);
      const tempInnerZipPath = path.join(
        tempDir,
        path.basename(nestedZipPathInParent)
      );

      const parentZip = await yauzl.open(currentZipPath);
      let entryFound = null;
      for await (const entry of parentZip) {
        if (entry.filename === nestedZipPathInParent) {
          entryFound = entry;
          break;
        }
      }

      if (!entryFound) {
        await parentZip.close();
        throw new Error(`Nested zip not found: ${nestedZipPathInParent}`);
      }

      const readStream = await parentZip.openReadStream(entryFound);
      const writeStream = fse.createWriteStream(tempInnerZipPath);
      await new Promise((resolve, reject) => {
        readStream.pipe(writeStream);
        readStream.on("end", resolve);
        readStream.on("error", reject);
        writeStream.on("error", reject);
      });
      await parentZip.close();

      currentZipPath = tempInnerZipPath;
    }

    currentZipFile = await yauzl.open(currentZipPath);

    const children = new Map();
    let normalizedDir = pathInsideZip;
    if (normalizedDir.startsWith("/"))
      normalizedDir = normalizedDir.substring(1);
    if (normalizedDir.length > 0 && !normalizedDir.endsWith("/"))
      normalizedDir += "/";
    if (pathInsideZip === "/") normalizedDir = "";

    for await (const entry of currentZipFile) {
      if (!entry.filename.startsWith(normalizedDir)) continue;

      const relativePath = entry.filename.substring(normalizedDir.length);
      if (relativePath === "" || relativePath === "/") continue;

      const firstSlashIndex = relativePath.indexOf("/");
      const childName =
        firstSlashIndex === -1
          ? relativePath
          : relativePath.substring(0, firstSlashIndex);

      if (childName && !children.has(childName)) {
        const isFolder = firstSlashIndex !== -1 || entry.filename.endsWith("/");
        const fullPath =
          zipFilePath +
          "/" +
          path.posix.join(directoryPath.replace(/^\//, ""), childName);
        children.set(childName, {
          name: childName,
          type: isFolder ? "folder" : getFileType(childName, false),
          size: isFolder ? null : entry.uncompressedSize,
          modified: entry.getLastMod().toLocaleString(),
          fullPath: fullPath,
        });
      }
    }

    const entries = Array.from(children.values());
    entries.unshift({
      name: "..",
      type: "parent",
      size: null,
      modified: "",
    });

    return entries;
  } finally {
    if (currentZipFile) {
      await currentZipFile.close();
    }
    for (const dir of tempDirs) {
      await fse.remove(dir);
    }
  }
};

const getDirSizeWithProgress = async (dirPath, job) => {
  if (job.controller.signal.aborted) throw new Error("Calculation cancelled");

  const items = await fse.readdir(dirPath, { withFileTypes: true });

  for (const item of items) {
    if (job.controller.signal.aborted) throw new Error("Calculation cancelled");
    const itemPath = path.join(dirPath, item.name);

    if (item.isDirectory()) {
      if (job.ws && job.ws.readyState === 1) {
        job.ws.send(
          JSON.stringify({
            type: "progress",
            file: itemPath,
            sizeSoFar: job.sizeSoFar,
            totalSize: job.totalSize,
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
              totalSize: job.totalSize,
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
    // Set the final status here.
    job.status = "cancelled";
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

const getFileContentFromZip = async (zipFilePath, filePathInZip) => {
  let tempDirs = [];
  try {
    let currentZipPath = zipFilePath;
    let pathInsideZip = filePathInZip.replace(/\\/g, "/");

    while (true) {
      const zipEndIndex = pathInsideZip.toLowerCase().indexOf(".zip/");
      if (zipEndIndex === -1) {
        break;
      }

      const nestedZipPathInParent = pathInsideZip.substring(0, zipEndIndex + 4);
      pathInsideZip = pathInsideZip.substring(zipEndIndex + 5);

      const tempDir = fse.mkdtempSync(path.join(os.tmpdir(), "nested-zip-"));
      tempDirs.push(tempDir);
      const tempInnerZipPath = path.join(
        tempDir,
        path.basename(nestedZipPathInParent)
      );

      const parentZip = await yauzl.open(currentZipPath);
      let entryFound = null;
      for await (const entry of parentZip) {
        if (entry.filename === nestedZipPathInParent) {
          entryFound = entry;
          break;
        }
      }

      if (!entryFound) {
        await parentZip.close();
        throw new Error(`Nested zip not found: ${nestedZipPathInParent}`);
      }

      const readStream = await parentZip.openReadStream(entryFound);
      const writeStream = fse.createWriteStream(tempInnerZipPath);
      await new Promise((resolve, reject) => {
        readStream.pipe(writeStream);
        readStream.on("end", resolve);
        readStream.on("error", reject);
        writeStream.on("error", reject);
      });
      await parentZip.close();

      currentZipPath = tempInnerZipPath;
    }

    const zipfile = await yauzl.open(currentZipPath);
    for await (const entry of zipfile) {
      if (entry.filename === pathInsideZip) {
        const readStream = await entry.openReadStream();
        const chunks = [];
        for await (const chunk of readStream) {
          chunks.push(chunk);
        }
        await zipfile.close();
        return Buffer.concat(chunks).toString("utf8");
      }
    }
    await zipfile.close();
    throw new Error(`File not found in zip: ${pathInsideZip}`);
  } finally {
    for (const dir of tempDirs) {
      await fse.remove(dir);
    }
  }
};

const getZipFileStream = async (zipFilePath, filePathInZip) => {
  let tempDirs = [];

  const cleanup = async () => {
    for (const dir of tempDirs) {
      await fse.remove(dir);
    }
  };

  try {
    let currentZipPath = zipFilePath;
    let pathInsideZip = filePathInZip.replace(/\\/g, "/");

    while (true) {
      const zipEndIndex = pathInsideZip.toLowerCase().indexOf(".zip/");
      if (zipEndIndex === -1) {
        break;
      }

      const nestedZipPathInParent = pathInsideZip.substring(0, zipEndIndex + 4);
      pathInsideZip = pathInsideZip.substring(zipEndIndex + 5);

      const tempDir = fse.mkdtempSync(path.join(os.tmpdir(), "nested-zip-"));
      tempDirs.push(tempDir);
      const tempInnerZipPath = path.join(
        tempDir,
        path.basename(nestedZipPathInParent)
      );

      const parentZip = await yauzl.open(currentZipPath);
      let entryFound = null;
      for await (const entry of parentZip) {
        if (entry.filename === nestedZipPathInParent) {
          entryFound = entry;
          break;
        }
      }

      if (!entryFound) {
        await parentZip.close();
        throw new Error(`Nested zip not found: ${nestedZipPathInParent}`);
      }

      const readStream = await parentZip.openReadStream(entryFound);
      const writeStream = fse.createWriteStream(tempInnerZipPath);
      await new Promise((resolve, reject) => {
        readStream.pipe(writeStream);
        readStream.on("end", resolve);
        readStream.on("error", reject);
        writeStream.on("error", reject);
      });
      await parentZip.close();

      currentZipPath = tempInnerZipPath;
    }

    const zipfile = await yauzl.open(currentZipPath);
    for await (const entry of zipfile) {
      if (entry.filename === pathInsideZip) {
        const stream = await entry.openReadStream();
        stream.on("close", () => {
          zipfile.close();
          cleanup();
        });
        stream.on("error", () => {
          zipfile.close();
          cleanup();
        });
        return stream;
      }
    }

    await zipfile.close();
    await cleanup();
    throw new Error(`File not found in zip: ${pathInsideZip}`);
  } catch (error) {
    await cleanup();
    throw error;
  }
};

const findCoverInZip = async (zipFilePath, audioFilePathInZip) => {
  const zipfile = await yauzl.open(zipFilePath);
  const audioDirectory = path.posix.dirname(audioFilePathInZip);
  const coverNames = [
    "cover.jpg",
    "cover.jpeg",
    "cover.png",
    "cover.gif",
    "cover.webp",
  ];

  for await (const entry of zipfile) {
    const entryDir = path.posix.dirname(entry.filename);
    const entryName = path.basename(entry.filename);
    if (
      entryDir === audioDirectory &&
      coverNames.includes(entryName.toLowerCase())
    ) {
      await zipfile.close();
      return entry.filename;
    }
  }

  await zipfile.close();
  return null;
};

const matchZipPath = (path) => {
  if (!path) {
    return null;
  }
  return path.match(/^(.*?\.zip)(.*)$/);
};

const updateFileInZip = async (zipFilePath, filePathInZip, content) => {
  const tempZipPath = zipFilePath + ".tmp";
  const output = fse.createWriteStream(tempZipPath);
  const archive = archiver("zip", {
    zlib: { level: 9 },
  });

  archive.pipe(output);

  const zipfile = await yauzl.open(zipFilePath);
  for await (const entry of zipfile) {
    if (entry.filename !== filePathInZip) {
      const stream = await entry.openReadStream();
      archive.append(stream, { name: entry.filename });
    }
  }

  archive.append(content, { name: filePathInZip });

  await archive.finalize();
  await zipfile.close();

  await fse.move(tempZipPath, zipFilePath, { overwrite: true });
};

const createFileInZip = async (zipFilePath, newFilePathInZip) => {
  const tempZipPath = zipFilePath + ".tmp";
  const output = fse.createWriteStream(tempZipPath);
  const archive = archiver("zip", {
    zlib: { level: 9 },
  });

  archive.pipe(output);

  const zipfile = await yauzl.open(zipFilePath);
  for await (const entry of zipfile) {
    const stream = await entry.openReadStream();
    archive.append(stream, { name: entry.filename });
  }

  archive.append("", { name: newFilePathInZip });

  await archive.finalize();
  await zipfile.close();

  await fse.move(tempZipPath, zipFilePath, { overwrite: true });
};

const createFolderInZip = async (zipFilePath, newFolderPathInZip) => {
  const tempZipPath = zipFilePath + ".tmp";
  const output = fse.createWriteStream(tempZipPath);
  const archive = archiver("zip", {
    zlib: { level: 9 },
  });

  archive.pipe(output);

  const zipfile = await yauzl.open(zipFilePath);
  for await (const entry of zipfile) {
    const stream = await entry.openReadStream();
    archive.append(stream, { name: entry.filename });
  }

  archive.append(null, { name: newFolderPathInZip + "/" });

  await archive.finalize();
  await zipfile.close();

  await fse.move(tempZipPath, zipFilePath, { overwrite: true });
};

export {
  getFileType,
  getZipContents,
  getFilesInZip,
  getFileContentFromZip,
  getZipFileStream,
  getDirSizeWithProgress,
  performCopyCancellation,
  getMimeType,
  getDirTotalSize,
  getDirSize,
  getDirSizeWithScanProgress,
  copyWithProgress,
  getAllFiles,
  findCoverInZip,
  matchZipPath,
  updateFileInZip,
  createFileInZip,
  createFolderInZip,
};
