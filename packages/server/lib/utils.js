import os from "os";
import fse from "fs-extra";
import path from "path";
import crypto from "crypto";
import { pipeline } from "stream/promises";
import * as yauzl from "yauzl-promise";
import archiver from "archiver";

const extractNestedZipToTemp = async (zipFilePath, pathInZip) => {
  const tempDir = await fse.mkdtemp(path.join(os.tmpdir(), "nested-zip-"));
  const tempNestedZipPath = path.join(tempDir, path.basename(pathInZip));

  const parentZip = await yauzl.open(zipFilePath);
  try {
    let entryFound = null;
    for await (const entry of parentZip) {
      if (entry.filename === pathInZip) {
        entryFound = entry;
        break;
      }
    }

    if (!entryFound) {
      throw new Error(`Nested zip not found: ${pathInZip}`);
    }

    const readStream = await parentZip.openReadStream(entryFound);
    const writeStream = fse.createWriteStream(tempNestedZipPath);
    await pipeline(readStream, writeStream);

    return { tempNestedZipPath, tempDir };
  } finally {
    await parentZip.close();
  }
};

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
  let tempDirs = [];
  const cleanup = async () => {
    for (const dir of tempDirs) {
      await fse.remove(dir);
    }
  };

  try {
    let currentZipPath = zipFilePath;
    let pathInsideZip = audioFilePathInZip.replace(/\\/g, "/");

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
    const audioDirectory = path.posix.dirname(pathInsideZip);
    const coverNames = [
      "cover.jpg",
      "cover.jpeg",
      "cover.png",
      "cover.gif",
      "cover.webp",
    ];

    for await (const entry of zipfile) {
      const entryDir = path.posix.dirname(entry.filename).toLowerCase();
      const entryName = path.basename(entry.filename);
      if (
        entryDir === audioDirectory.toLowerCase() &&
        coverNames.includes(entryName.toLowerCase())
      ) {
        await zipfile.close();
        await cleanup();

        if (
          entryDir.toLowerCase() === audioDirectory.toLowerCase() &&
          coverNames.includes(entryName.toLowerCase())
        ) {
          await zipfile.close();
          await cleanup();
          const audioDirInOuterZip = path.posix.dirname(audioFilePathInZip);
          return path.posix.join(audioDirInOuterZip, entryName);
        }
      }
    }

    await zipfile.close();
    await cleanup();
    return null;
  } catch (error) {
    await cleanup();
    throw error;
  }
};

const matchZipPath = (path) => {
  if (!path) {
    return null;
  }
  return path.match(/^(.*?\.zip)(.*)$/);
};

const updateFileInZip = async (
  zipFilePath,
  filePathInZip,
  content, // content can be a Buffer, string, or stream
  signal = null
) => {
  // Check if the path is inside a nested zip.
  const zipEndIndex = filePathInZip.toLowerCase().lastIndexOf(".zip/");
  if (zipEndIndex === -1) {
    // --- BASE CASE ---
    // Not a nested zip, so we can update the file directly.
    const tempZipPath = zipFilePath + ".tmp." + crypto.randomUUID();
    const output = fse.createWriteStream(tempZipPath);
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    const archiveFinishedPromise = new Promise((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", reject);
      if (signal) {
        signal.addEventListener("abort", () => {
          archive.destroy();
          reject(new Error("Zip update cancelled."));
        });
      }
    });

    archive.pipe(output);

    const zipfile = await yauzl.open(zipFilePath);
    try {
      for await (const entry of zipfile) {
        if (entry.filename !== filePathInZip) {
          const stream = await entry.openReadStream();
          archive.append(stream, { name: entry.filename });
        }
      }

      archive.append(content, { name: filePathInZip });

      await archive.finalize();
      await archiveFinishedPromise;
      await fse.move(tempZipPath, zipFilePath, { overwrite: true });
    } catch (error) {
      await fse.remove(tempZipPath).catch(() => {});
      throw error;
    } finally {
      await zipfile.close();
    }
    return;
  }

  // --- RECURSIVE STEP ---
  // The path is inside a nested zip.
  const nestedZipPathInParent = filePathInZip.substring(0, zipEndIndex + 4);
  const remainingPath = filePathInZip.substring(zipEndIndex + 5);

  // 1. Extract the nested zip to a temporary location.
  const { tempNestedZipPath, tempDir } = await extractNestedZipToTemp(
    zipFilePath,
    nestedZipPathInParent
  );

  try {
    // 2. Recursively call this function on the extracted (now outer) zip.
    await updateFileInZip(tempNestedZipPath, remainingPath, content, signal);

    // 3. Stream the now-modified nested zip back into the original parent zip.
    const modifiedZipStream = fse.createReadStream(tempNestedZipPath);
    await updateFileInZip(
      zipFilePath,
      nestedZipPathInParent,
      modifiedZipStream,
      signal
    );
  } finally {
    // 4. Clean up the temporary directory.
    await fse.remove(tempDir);
  }
};

const createFileInZip = async (
  zipFilePath,
  newFilePathInZip,
  signal = null
) => {
  const zipEndIndex = newFilePathInZip.toLowerCase().lastIndexOf(".zip/");
  if (zipEndIndex === -1) {
    const tempZipPath = zipFilePath + ".tmp." + crypto.randomUUID();
    const output = fse.createWriteStream(tempZipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(output);

    const archiveFinishedPromise = new Promise((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", reject);
    });

    const zipfile = await yauzl.open(zipFilePath);
    try {
      for await (const entry of zipfile) {
        if (entry.filename !== newFilePathInZip) {
          const stream = await entry.openReadStream();
          archive.append(stream, { name: entry.filename });
        }
      }
      archive.append("", { name: newFilePathInZip });
      await archive.finalize();
      await archiveFinishedPromise;
      await fse.move(tempZipPath, zipFilePath, { overwrite: true });
    } catch (error) {
      await fse.remove(tempZipPath).catch(() => {});
      throw error;
    } finally {
      await zipfile.close();
    }
    return;
  }

  const nestedZipPathInParent = newFilePathInZip.substring(0, zipEndIndex + 4);
  const remainingPath = newFilePathInZip.substring(zipEndIndex + 5);

  const { tempNestedZipPath, tempDir } = await extractNestedZipToTemp(
    zipFilePath,
    nestedZipPathInParent
  );

  try {
    // Recursively call this function on the extracted nested zip
    await createFileInZip(tempNestedZipPath, remainingPath, signal);

    // Update the parent zip with the modified nested zip
    const modifiedZipStream = fse.createReadStream(tempNestedZipPath);
    await updateFileInZip(
      zipFilePath,
      nestedZipPathInParent,
      modifiedZipStream,
      signal
    );
  } finally {
    await fse.remove(tempDir);
  }
};

const createFolderInZip = async (
  zipFilePath,
  newFolderPathInZip,
  signal = null
) => {
  const zipEndIndex = newFolderPathInZip.toLowerCase().lastIndexOf(".zip/");
  if (zipEndIndex === -1) {
    const tempZipPath = zipFilePath + ".tmp." + crypto.randomUUID();
    const output = fse.createWriteStream(tempZipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(output);

    const archiveFinishedPromise = new Promise((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", reject);
    });

    const zipfile = await yauzl.open(zipFilePath);
    try {
      for await (const entry of zipfile) {
        if (entry.filename !== newFolderPathInZip + "/") {
          const stream = await entry.openReadStream();
          archive.append(stream, { name: entry.filename });
        }
      }
      archive.append(null, { name: newFolderPathInZip + "/" });
      await archive.finalize();
      await archiveFinishedPromise;
      await fse.move(tempZipPath, zipFilePath, { overwrite: true });
    } catch (error) {
      await fse.remove(tempZipPath).catch(() => {});
      throw error;
    } finally {
      await zipfile.close();
    }
    return;
  }

  // Recursive step for nested zips
  const nestedZipPathInParent = newFolderPathInZip.substring(
    0,
    zipEndIndex + 4
  );
  const remainingPath = newFolderPathInZip.substring(zipEndIndex + 5);

  const { tempNestedZipPath, tempDir } = await extractNestedZipToTemp(
    zipFilePath,
    nestedZipPathInParent
  );

  try {
    await createFolderInZip(tempNestedZipPath, remainingPath, signal);
    const modifiedZipStream = fse.createReadStream(tempNestedZipPath);
    await updateFileInZip(
      zipFilePath,
      nestedZipPathInParent,
      modifiedZipStream,
      signal
    );
  } finally {
    await fse.remove(tempDir);
  }
};

const getSummaryFromZip = async (zipFilePath, pathInZip) => {
  let fileCount = 0;
  let folderCount = 0;
  // The path for a folder inside a zip may or may not have a trailing slash.
  // To count its contents, we need to match everything that starts with `folderName/`.
  const dirPrefix = pathInZip.endsWith("/") ? pathInZip : `${pathInZip}/`;

  const zipfile = await yauzl.open(zipFilePath);
  try {
    for await (const entry of zipfile) {
      // We only want to count items *inside* the folder, not the folder itself.
      if (
        entry.filename.startsWith(dirPrefix) &&
        entry.filename !== dirPrefix
      ) {
        if (entry.filename.endsWith("/")) {
          folderCount++;
        } else {
          fileCount++;
        }
      }
    }
  } finally {
    await zipfile.close();
  }
  return { files: fileCount, folders: folderCount };
};

const deleteFromZip = async (zipFilePath, pathsInZip) => {
  const pathsToDelete = Array.isArray(pathsInZip) ? pathsInZip : [pathsInZip];

  const tempZipPath = zipFilePath + ".tmp";
  const output = fse.createWriteStream(tempZipPath);
  const archive = archiver("zip", {
    zlib: { level: 9 },
  });
  archive.pipe(output);

  const zipfile = await yauzl.open(zipFilePath);
  try {
    for await (const entry of zipfile) {
      const shouldDelete = pathsToDelete.some((pathToDelete) => {
        // A folder path from client won't have a trailing slash, but its entry in the zip does.
        const pathToDeleteAsFolder = pathToDelete.endsWith("/")
          ? pathToDelete
          : `${pathToDelete}/`;

        // Delete if it's an exact match (for a file) or starts with the folder path
        return (
          entry.filename === pathToDelete ||
          entry.filename.startsWith(pathToDeleteAsFolder)
        );
      });

      if (!shouldDelete) {
        const stream = await entry.openReadStream();
        archive.append(stream, { name: entry.filename });
      }
    }
    await archive.finalize();
    await fse.move(tempZipPath, zipFilePath, { overwrite: true });
  } catch (error) {
    // Ensure temp file is removed on error
    await fse
      .remove(tempZipPath)
      .catch((err) =>
        console.error(`Failed to remove temp zip: ${err.message}`)
      );
    throw error;
  } finally {
    await zipfile.close();
  }
};

const renameInZip = async (zipFilePath, oldPathInZip, newPathInZip) => {
  const tempZipPath = zipFilePath + ".tmp." + crypto.randomUUID();
  const output = fse.createWriteStream(tempZipPath);
  const archive = archiver("zip", {
    zlib: { level: 9 },
  });
  archive.pipe(output);

  const zipfile = await yauzl.open(zipFilePath);

  // A path for a folder inside a zip might be 'folder' but its entry is 'folder/'
  const oldPathAsFolderPrefix = `${oldPathInZip}/`;
  const newPathAsFolderPrefix = `${newPathInZip}/`;

  try {
    for await (const entry of zipfile) {
      let entryNameToWrite = entry.filename;

      if (entry.filename.startsWith(oldPathAsFolderPrefix)) {
        // This is a folder rename, affecting all contents
        entryNameToWrite = entry.filename.replace(
          oldPathAsFolderPrefix,
          newPathAsFolderPrefix
        );
      } else if (entry.filename === oldPathInZip) {
        // This is a file rename
        entryNameToWrite = newPathInZip;
      }

      const stream = await entry.openReadStream();
      archive.append(stream, { name: entryNameToWrite });
    }

    await archive.finalize();
    await fse.move(tempZipPath, zipFilePath, { overwrite: true });
  } catch (error) {
    await fse.remove(tempZipPath).catch(() => {});
    throw error;
  } finally {
    await zipfile.close();
  }
};

const addFilesToZip = async (zipFilePath, pathInZip, job) => {
  const tempZipPath = zipFilePath + ".tmp." + crypto.randomUUID();
  const output = fse.createWriteStream(tempZipPath);
  const archive = archiver("zip", {
    zlib: { level: 9 },
  });

  const { signal } = job.controller;
  archive.pipe(output);

  const archiveFinishedPromise = new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);
    output.on("error", reject);
  });

  const newFileEntryNames = new Set(
    job.filesToProcess.map((file) =>
      path.posix.join(pathInZip, file.relativePath)
    )
  );
  const newDirEntryNames = new Set(
    (job.emptyDirsToAdd || []).map((dir) => path.posix.join(pathInZip, dir))
  );
  const allNewEntryNames = new Set([...newFileEntryNames, ...newDirEntryNames]);

  let zipfile;
  try {
    if (await fse.pathExists(zipFilePath)) {
      zipfile = await yauzl.open(zipFilePath);
      for await (const entry of zipfile) {
        if (signal.aborted) throw new Error("Zip add cancelled.");
        if (!allNewEntryNames.has(entry.filename)) {
          const stream = await entry.openReadStream();
          archive.append(stream, { name: entry.filename });
        }
      }
    }

    for (const dir of job.emptyDirsToAdd || []) {
      const entryName = path.posix.join(pathInZip, dir);
      archive.append(null, { name: entryName });
    }

    for (const file of job.filesToProcess) {
      if (signal.aborted) throw new Error("Zip add cancelled.");

      const { fullPath, relativePath, stats } = file;
      const entryName = path.posix.join(pathInZip, relativePath);

      job.currentFile = fullPath;
      job.currentFileTotalSize = stats.size;
      job.currentFileBytesProcessed = 0;

      const sourceStream = fse.createReadStream(fullPath);
      sourceStream.on("data", (chunk) => {
        job.copied += chunk.length;
        job.currentFileBytesProcessed += chunk.length;
      });

      archive.append(sourceStream, { name: entryName, stats });

      await new Promise((resolve, reject) => {
        sourceStream.on("end", resolve);
        sourceStream.on("error", reject);
      });
    }

    await archive.finalize();
    await archiveFinishedPromise;

    if (signal.aborted) throw new Error("Zip add cancelled.");
    await fse.move(tempZipPath, zipFilePath, { overwrite: true });
  } catch (error) {
    await fse.remove(tempZipPath).catch(() => {});
    throw error;
  } finally {
    if (zipfile) await zipfile.close();
  }
};

const extractFilesFromZip = async (job) => {
  const getCommonBasePath = (entriesToExtract) => {
    if (entriesToExtract.length === 0) {
      return "";
    }

    // Extract just the filenames for common path calculation
    const filenames = entriesToExtract.map((e) => e.filename);

    // If there's only one item, the base path to strip is its parent directory
    if (filenames.length === 1) {
      const singleFilename = filenames[0];
      return singleFilename.endsWith("/")
        ? path.dirname(singleFilename.slice(0, -1))
        : path.dirname(singleFilename);
    }

    let commonPrefix = filenames[0];

    for (let i = 1; i < filenames.length; i++) {
      const currentFilename = filenames[i];
      while (!currentFilename.startsWith(commonPrefix)) {
        const lastSlash = commonPrefix.lastIndexOf("/");
        if (lastSlash === -1) {
          commonPrefix = ""; // No common prefix
          break;
        }
        commonPrefix = commonPrefix.substring(0, lastSlash);
      }
      if (commonPrefix === "") {
        break;
      }
    }

    // Ensure commonPrefix ends with a slash if it's not empty
    if (commonPrefix !== "" && !commonPrefix.endsWith("/")) {
      commonPrefix += "/";
    }

    return commonPrefix;
  };

  // Calculate the common base path to strip from all selected entries
  const commonBasePathToStrip = getCommonBasePath(job.entriesToExtract);

  const { signal } = job.controller;
  const zipfile = await yauzl.open(job.zipFilePath);
  job.zipfile = zipfile;

  for await (const entry of zipfile) {
    if (signal.aborted) throw new Error("Zip extract cancelled.");

    const isEntrySelected = job.entriesToExtract.some(
      (e) =>
        e.filename === entry.filename ||
        entry.filename.startsWith(e.filename + "/")
    );
    if (!isEntrySelected) continue;

    job.currentFile = entry.filename;
    job.currentFileTotalSize = entry.uncompressedSize;
    job.currentFileBytesProcessed = 0;

    let relativeEntryPath = entry.filename;

    if (
      commonBasePathToStrip !== "" &&
      entry.filename.startsWith(commonBasePathToStrip)
    ) {
      relativeEntryPath = path.relative(commonBasePathToStrip, entry.filename);
    }

    const destPath = path.join(job.destination, relativeEntryPath);

    if (entry.filename.endsWith("/")) {
      await fse.mkdir(destPath, { recursive: true });
      const modDate = entry.getLastMod();
      await fse.utimes(destPath, modDate, modDate);
      job.copied += entry.uncompressedSize;
    } else {
      await fse.mkdirp(path.dirname(destPath));
      const readStream = await entry.openReadStream();
      const writeStream = fse.createWriteStream(destPath);

      readStream.on("data", (chunk) => {
        job.copied += chunk.length;
        job.currentFileBytesProcessed += chunk.length;
      });

      await pipeline(readStream, writeStream);
      const modDate = entry.getLastMod();
      await fse.utimes(destPath, modDate, modDate);
    }
  }
};

export {
  getFileType,
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
  getSummaryFromZip,
  deleteFromZip,
  renameInZip,
  addFilesToZip,
  extractFilesFromZip,
};
