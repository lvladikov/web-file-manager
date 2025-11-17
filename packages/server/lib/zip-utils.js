import os from "os";
import fse from "fs-extra";
import path from "path";
import crypto from "crypto";
import { pipeline } from "stream/promises";
import { PassThrough } from "stream";
import * as yauzl from "yauzl-promise";
import archiver from "archiver";
import { getFileType } from "./file-utils.js";
import { getAllFilesAndDirsRecursive } from "./fs-utils.js";
import {
  registerPromptResolver,
  unregisterPromptResolver,
  registerPromptMeta,
  ensureInstrumentedResolversMap,
} from "./prompt-registry.js";

// Extracts a nested zip entry into a temporary file and returns its path + temp dir
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

    // Read all entries into an array to detect exact filenames existence
    const entriesArr = [];
    for await (const entry of currentZipFile) {
      entriesArr.push(entry);
    }
    // Create a set of entry names for quick lookup
    const entryNames = new Set(entriesArr.map((e) => e.filename));

    const children = new Map();
    let normalizedDir = pathInsideZip;
    if (normalizedDir.startsWith("/"))
      normalizedDir = normalizedDir.substring(1);
    if (normalizedDir.length > 0 && !normalizedDir.endsWith("/"))
      normalizedDir += "/";
    if (pathInsideZip === "/") normalizedDir = "";

    // Validate that the directory path exists in the zip
    if (normalizedDir.length > 0) {
      const dirExistsAsEntry =
        entryNames.has(normalizedDir) ||
        entryNames.has(normalizedDir.slice(0, -1));
      const hasChildrenInDir = entriesArr.some((e) =>
        e.filename.startsWith(normalizedDir)
      );
      if (!dirExistsAsEntry && !hasChildrenInDir) {
        throw new Error(`Path does not exist: ${pathInsideZip}`);
      }
    }

    for (const entry of entriesArr) {
      if (!entry.filename.startsWith(normalizedDir)) continue;

      const relativePath = entry.filename.substring(normalizedDir.length);
      if (relativePath === "" || relativePath === "/") continue;

      const firstSlashIndex = relativePath.indexOf("/");
      const childName =
        firstSlashIndex === -1
          ? relativePath
          : relativePath.substring(0, firstSlashIndex);

      if (childName && !children.has(childName)) {
        const fullChildEntry = normalizedDir + childName;
        const fullChildFolderEntry = `${fullChildEntry}/`;
        const isExactFileEntry = entryNames.has(fullChildEntry);
        const isFolder =
          !isExactFileEntry &&
          (firstSlashIndex !== -1 || entry.filename.endsWith("/"));
        const fullPath =
          zipFilePath +
          "/" +
          path.posix.join(directoryPath.replace(/^\//, ""), childName);
        // If there's an exact filename for the child and it ends with .zip, treat as archive
        const childType =
          !isFolder && childName.toLowerCase().endsWith(".zip")
            ? "archive"
            : isFolder
            ? "folder"
            : getFileType(childName, false);
        children.set(childName, {
          name: childName,
          type: childType,
          size: isFolder ? null : entry.uncompressedSize,
          // Use ISO timestamp so clients can reliably parse across locales
          modified: entry.getLastMod().toISOString(),
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

const matchZipPath = (p) => {
  if (!p) {
    return null;
  }
  return p.match(/^(.*?\.zip)(.*)$/);
};

// The following functions are large and ZIP-specific and must keep the original logic.
// To keep this module maintainable, we export all ZIP-related functions from here.

// updateFileInZip, insertFileIntoZip, createFileInZip, createFolderInZip, getSummaryFromZip,
// deleteFromZip, renameInZip, addFilesToZip, getDirTotalSizeInZip, extractFilesFromZip,
// getAllZipEntriesRecursive, duplicateInZip

const updateFileInZip = async (
  zipFilePath,
  filePathInZip,
  content,
  job = null,
  signal = null
) => {
  // Use signal from job if provided and no direct signal
  if (job && job.controller && !signal) {
    signal = job.controller.signal;
  }

  // Check for cancellation signal early
  if (signal && signal.aborted) {
    throw new Error("Zip update cancelled.");
  }

  const zipEndIndex = filePathInZip.toLowerCase().lastIndexOf(".zip/");
  if (zipEndIndex === -1) {
    // --- BASE CASE ---
    const tempZipPath = zipFilePath + ".tmp." + crypto.randomUUID();
    if (job) job.tempZipPath = tempZipPath; // Set temp path on job object
    const output = fse.createWriteStream(tempZipPath);
    const archive = archiver("zip", {
      zlib: { level: 9 },
      forceZip64: true,
    });

    const originalZipSize = (await fse.pathExists(zipFilePath))
      ? (await fse.stat(zipFilePath)).size
      : 0;
    if (job) {
      job.originalZipSize = originalZipSize;
      job.totalBytes = originalZipSize;
      job.processedBytes = 0;
    }

    const archiveFinishedPromise = new Promise((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", (err) => {
        console.error(`[Job ${job?.id}] Archiver error:`, err);
        reject(err);
      });
      output.on("error", (err) => {
        console.error(`[Job ${job?.id}] Output stream error:`, err);
        reject(err);
      });
      if (signal) {
        signal.addEventListener("abort", () => {
          console.log(
            `[Job ${job?.id}] Abort signal received, destroying archive.`
          );
          archive.destroy();
          // reject(new Error("Zip update cancelled.")); //TODO investigate
        });
      }
    });

    archive.pipe(output);

    let zipfile = null;
    try {
      if (await fse.pathExists(zipFilePath)) {
        zipfile = await yauzl.open(zipFilePath);
        for await (const entry of zipfile) {
          if (signal && signal.aborted)
            throw new Error("Zip update cancelled.");
          if (entry.filename !== filePathInZip) {
            const stream = await entry.openReadStream();
            archive.append(stream, { name: entry.filename });
          }
        }
      } else {
        console.warn(
          `[Job ${job?.id}] Original zip file not found: ${zipFilePath}. Creating new archive.`
        );
      }

      if (signal && signal.aborted) throw new Error("Zip update cancelled.");
      archive.append(content, { name: filePathInZip });

      await archive.finalize();
      if (signal && signal.aborted) throw new Error("Zip update cancelled.");
      await archiveFinishedPromise;
      if (signal && signal.aborted) throw new Error("Zip update cancelled.");
      await fse.move(tempZipPath, zipFilePath, { overwrite: true });
      console.log(
        `[updateFileInZip] Replaced entry ${filePathInZip} in ${zipFilePath}`
      );
      console.log(
        `[Job ${job?.id}] Zip file updated successfully: ${zipFilePath}`
      );
    } catch (error) {
      console.error(
        `[Job ${job?.id}] Error during zip update process:`,
        error.message
      );
      if (await fse.pathExists(tempZipPath)) {
        await fse.remove(tempZipPath).catch((removeError) => {
          console.error(
            `[Job ${job?.id}] Error removing temp zip ${tempZipPath}:`,
            removeError
          );
        });
      }
      // Re-throw the error to be caught by the caller (WebSocket handler)
      throw error;
    } finally {
      if (zipfile) await zipfile.close();
    }
    return; // Successful completion
  }

  // --- RECURSIVE CASE for nested zips ---
  const nestedZipPathInParent = filePathInZip.substring(0, zipEndIndex + 4);
  const remainingPath = filePathInZip.substring(zipEndIndex + 5);

  // 1. Extract the nested zip to a temporary location.
  const { tempNestedZipPath, tempDir } = await extractNestedZipToTemp(
    zipFilePath,
    nestedZipPathInParent
  );

  try {
    if (signal && signal.aborted) throw new Error("Zip update cancelled.");
    // 2. Recursively call this function on the extracted (now outer) zip.
    await updateFileInZip(
      tempNestedZipPath,
      remainingPath,
      content,
      job,
      signal
    );

    if (signal && signal.aborted) throw new Error("Zip update cancelled.");
    // 3. Stream the now-modified nested zip back into the original parent zip.
    const modifiedZipStream = fse.createReadStream(tempNestedZipPath);
    // Call updateFileInZip again for the parent, passing the stream
    // Note: We create a *new* job object specific to this parent update step
    // to avoid conflicts with progress reporting if needed at this level.
    // However, for simplicity, we'll just pass the signal for cancellation.
    await updateFileInZip(
      zipFilePath,
      nestedZipPathInParent,
      modifiedZipStream,
      job, // Use outer job context so id/signals propagate
      signal
    );
    console.log(
      `[updateFileInZip] Nested entry ${nestedZipPathInParent} updated in ${zipFilePath} via recursive update.`
    );
  } finally {
    // 4. Clean up the temporary directory.
    await fse.remove(tempDir);
  }
};

const insertFileIntoZip = async (
  zipFilePath,
  entryName,
  sourceFilePath,
  job = null
) => {
  const tempZipPath = zipFilePath + ".tmp." + crypto.randomUUID();
  const output = fse.createWriteStream(tempZipPath);
  const archive = archiver("zip", { zlib: { level: 9 }, forceZip64: true });

  const signal = job?.controller?.signal;
  if (job) job.tempZipPath = tempZipPath;

  const archiveFinishedPromise = new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);
    output.on("error", reject);
    if (signal) {
      signal.addEventListener("abort", () => {
        archive.destroy();
      });
    }
  });

  archive.pipe(output);

  // Copy original zip entries if zip exists
  if (await fse.pathExists(zipFilePath)) {
    const zipfile = await yauzl.open(zipFilePath);
    try {
      for await (const entry of zipfile) {
        const readStream = await entry.openReadStream();
        archive.append(readStream, { name: entry.filename });
      }
    } finally {
      await zipfile.close();
    }
  }

  // Append the new file into the archive at entryName
  const readStreamNew = fse.createReadStream(sourceFilePath);
  archive.append(readStreamNew, { name: entryName });

  await archive.finalize();
  await archiveFinishedPromise;
  await fse.move(tempZipPath, zipFilePath, { overwrite: true });
};

const createFileInZip = async (zipFilePath, newFilePathInZip, job = null) => {
  const signal = job?.controller?.signal;
  const zipEndIndex = newFilePathInZip.toLowerCase().lastIndexOf(".zip/");
  if (zipEndIndex === -1) {
    const tempZipPath = zipFilePath + ".tmp." + crypto.randomUUID();
    if (job) job.tempZipPath = tempZipPath;
    const output = fse.createWriteStream(tempZipPath);
    const archive = archiver("zip", { zlib: { level: 9 }, forceZip64: true });
    archive.pipe(output);

    const archiveFinishedPromise = new Promise((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", reject);
      if (signal) {
        signal.addEventListener("abort", () => {
          archive.destroy();
          // reject(new Error("Zip update cancelled.")); //TODO investigate
        });
      }
    });

    const originalZipSize = (await fse.pathExists(zipFilePath))
      ? (await fse.stat(zipFilePath)).size
      : 0;

    if (job) {
      job.totalBytes = originalZipSize;
      job.processedBytes = 0;
      job.currentFile = newFilePathInZip;
      job.currentFileTotalSize = 0; // New file is empty
      job.currentFileBytesProcessed = 0;
      job.originalZipSize = originalZipSize;
    }

    const zipfile = await yauzl.open(zipFilePath);
    try {
      if (signal && signal.aborted) throw new Error("Zip update cancelled.");
      for await (const entry of zipfile) {
        if (signal && signal.aborted) throw new Error("Zip update cancelled.");
        if (entry.filename !== newFilePathInZip) {
          const stream = await entry.openReadStream();
          archive.append(stream, { name: entry.filename });
        }
      }
      if (signal && signal.aborted) throw new Error("Zip update cancelled.");
      archive.append("", { name: newFilePathInZip });
      await archive.finalize();
      if (signal && signal.aborted) throw new Error("Zip update cancelled.");
      await archiveFinishedPromise;
      if (signal && signal.aborted) throw new Error("Zip update cancelled.");
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
    await createFileInZip(tempNestedZipPath, remainingPath, job);

    // Update the parent zip with the modified nested zip
    const modifiedZipStream = fse.createReadStream(tempNestedZipPath);
    await updateFileInZip(
      zipFilePath,
      nestedZipPathInParent,
      modifiedZipStream,
      job,
      job?.controller?.signal
    );
  } finally {
    await fse.remove(tempDir);
  }
};

const createFolderInZip = async (
  zipFilePath,
  newFolderPathInZip,
  job = null
) => {
  const signal = job?.controller?.signal;
  const zipEndIndex = newFolderPathInZip.toLowerCase().lastIndexOf(".zip/");
  if (zipEndIndex === -1) {
    const tempZipPath = zipFilePath + ".tmp." + crypto.randomUUID();
    if (job) job.tempZipPath = tempZipPath;
    const output = fse.createWriteStream(tempZipPath);
    const archive = archiver("zip", { zlib: { level: 9 }, forceZip64: true });
    archive.pipe(output);

    const archiveFinishedPromise = new Promise((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", reject);
      if (signal) {
        signal.addEventListener("abort", () => {
          archive.destroy();
          // reject(new Error("Zip update cancelled.")); //TODO investigate
        });
      }
    });

    const originalZipSize = (await fse.pathExists(zipFilePath))
      ? (await fse.stat(zipFilePath)).size
      : 0;

    if (job) {
      job.totalBytes = originalZipSize;
      job.processedBytes = 0;
      job.currentFile = newFolderPathInZip;
      job.currentFileTotalSize = 0; // Folders don't have a size in this context
      job.currentFileBytesProcessed = 0;
      job.originalZipSize = originalZipSize;
    }

    const zipfile = await yauzl.open(zipFilePath);
    try {
      if (signal && signal.aborted) throw new Error("Zip update cancelled."); // Check before loop
      for await (const entry of zipfile) {
        if (signal && signal.aborted) throw new Error("Zip update cancelled.");
        if (entry.filename !== newFolderPathInZip + "/") {
          const stream = await entry.openReadStream();
          archive.append(stream, { name: entry.filename });
        }
      }
      if (signal && signal.aborted) throw new Error("Zip update cancelled."); // Check before appending new folder
      archive.append(null, { name: newFolderPathInZip + "/" });
      await archive.finalize();
      if (signal && signal.aborted) throw new Error("Zip update cancelled."); // Check signal after finalize
      await archiveFinishedPromise;
      if (signal && signal.aborted) throw new Error("Zip update cancelled."); // Check signal after promise
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
    await createFolderInZip(tempNestedZipPath, remainingPath, job);
    const modifiedZipStream = fse.createReadStream(tempNestedZipPath);
    await updateFileInZip(
      zipFilePath,
      nestedZipPathInParent,
      modifiedZipStream,
      job,
      job?.controller?.signal
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

  let zipfile = await yauzl.open(zipFilePath);
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

const deleteFromZip = async (zipFilePath, pathsInZip, job = null) => {
  const signal = job?.controller?.signal;
  const pathsToDelete = Array.isArray(pathsInZip) ? pathsInZip : [pathsInZip];

  const tempZipPath = zipFilePath + ".tmp." + crypto.randomUUID(); // More unique temp name
  if (job) job.tempZipPath = tempZipPath;
  const output = fse.createWriteStream(tempZipPath);
  const archive = archiver("zip", {
    zlib: { level: 9 },
    forceZip64: true,
  });
  archive.pipe(output);

  const archiveFinishedPromise = new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);
    if (signal) {
      signal.addEventListener("abort", () => {
        archive.destroy();
        // reject(new Error("Zip update cancelled.")); //TODO investigate
      });
    }
  });

  if (job) {
    job.totalBytes = job.originalZipSize;
    job.processedBytes = 0;
    job.currentFile = "Deleting items...";
    job.currentFileTotalSize = 0;
    job.currentFileBytesProcessed = 0;
  }
  // Track folder-level decisions for delete operations so inner jobs don't re-prompt
  const folderDecisions = new Map();
  if (job) job._folderDecisions = folderDecisions;

  let zipfile = await yauzl.open(zipFilePath);
  try {
    // --- Handle nested zip delete operations first ---
    for (const pathToDelete of pathsToDelete.slice()) {
      const zipEndIndex = pathToDelete.toLowerCase().indexOf(".zip/");
      if (zipEndIndex !== -1) {
        const nestedZipPathInParent = pathToDelete.substring(
          0,
          zipEndIndex + 4
        );
        const innerPath = pathToDelete.substring(zipEndIndex + 5);

        // Does the parent zip contain an actual nested zip file entry?
        let entryFound = null;
        for await (const entry of zipfile) {
          if (entry.filename === nestedZipPathInParent) {
            entryFound = entry;
            break;
          }
        }
        // If the nested zip is a file entry, extract it and perform delete inside it
        console.log(
          `[deleteFromZip] Nested zip path requested: ${nestedZipPathInParent} innerPath=${innerPath} entryFound=${!!entryFound}`
        );
        if (entryFound) {
          // Extract nested zip to tmp and call deleteFromZip recursively
          const tmpDir = fse.mkdtempSync(path.join(os.tmpdir(), "nested-zip-"));
          const tmpInnerZipPath = path.join(
            tmpDir,
            path.basename(nestedZipPathInParent)
          );
          const readStream = await zipfile.openReadStream(entryFound);
          const writeStream = fse.createWriteStream(tmpInnerZipPath);
          await new Promise((resolve, reject) => {
            readStream.pipe(writeStream);
            readStream.on("end", resolve);
            readStream.on("error", reject);
            writeStream.on("error", reject);
          });

          // Recursively delete inside inner zip
          const innerJob = job
            ? { ...job, ws: job.ws, controller: job.controller }
            : null;
          if (innerJob && job) {
            innerJob._parentJob = job;
          }
          if (innerJob && job && typeof folderDecisions !== "undefined") {
            innerJob._inheritedFolderDecisions = new Map();
            for (const [pfx, v] of folderDecisions.entries()) {
              const lookupPrefix = `${nestedZipPathInParent}/`;
              if (pfx === nestedZipPathInParent) continue;
              if (pfx.startsWith(lookupPrefix)) {
                const remainder = pfx.slice(lookupPrefix.length);
                innerJob._inheritedFolderDecisions.set(remainder, v);
                console.log(
                  `[deleteFromZip] Propagated parent folderDecision for ${pfx} into inner job as ${remainder} -> ${v}`
                );
              }
            }
          }
          // If the parent had made folder-level decisions (skip/overwrite) for paths
          // that fall inside this nested zip, propagate them into the inner job
          // under adjusted prefixes so the inner job won't re-prompt for child items.
          if (innerJob && job && typeof folderDecisions !== "undefined") {
            innerJob._inheritedFolderDecisions = new Map();
            for (const [pfx, v] of folderDecisions.entries()) {
              // Match only entries that target this nested zip's inner path
              // Keys in parent folderDecisions are entry names in parent zip, e.g. 'a.zip/inner/path/'.
              const lookupPrefix = `${nestedZipPathInParent}/`;
              if (pfx === nestedZipPathInParent) {
                // Decision for the nested zip itself — not applicable for inner entries
                continue;
              }
              if (pfx.startsWith(lookupPrefix)) {
                const remainder = pfx.slice(lookupPrefix.length);
                innerJob._inheritedFolderDecisions.set(remainder, v);
                console.log(
                  `[addFilesToZip] Propagated parent folderDecision for ${pfx} into inner job as ${remainder} -> ${v}`
                );
              }
            }
          }
          if (innerJob && job) {
            Object.defineProperty(innerJob, "overwriteDecision", {
              get() {
                return job.overwriteDecision;
              },
              set(v) {
                job.overwriteDecision = v;
              },
              configurable: true,
              enumerable: true,
            });
            Object.defineProperty(innerJob, "resolveOverwrite", {
              get() {
                return job.overwriteResolversMap &&
                  job.overwriteResolversMap.size > 0
                  ? job.overwriteResolversMap.values().next().value
                  : undefined;
              },
              set(v) {
                if (!Array.isArray(job.overwriteResolvers))
                  job.overwriteResolvers = [];
                if (typeof v === "function") {
                  job.overwriteResolvers.push(v);
                }
              },
              configurable: true,
              enumerable: true,
            });
          }
          await deleteFromZip(tmpInnerZipPath, innerPath, innerJob);

          // Diagnostics: verify inner path removed from the temp inner zip
          try {
            const verifyZip = await yauzl.open(tmpInnerZipPath);
            let entryStillExists = false;
            for await (const e of verifyZip) {
              if (
                e.filename === innerPath ||
                e.filename.startsWith(`${innerPath.replace(/\\\\/g, "/")}/`)
              ) {
                entryStillExists = true;
                break;
              }
            }
            await verifyZip.close();
            if (entryStillExists) {
              console.warn(
                `[deleteFromZip] After deleting inner path, entry still exists inside inner zip: ${innerPath}`
              );
            } else {
              console.log(
                `[deleteFromZip] Verified inner path removed from tmp inner zip: ${innerPath}`
              );
            }
          } catch (err) {
            console.warn(
              `[deleteFromZip] Diagnostics check failed reading tmp inner zip ${tmpInnerZipPath}:`,
              err.message
            );
          }

          // Replace inner zip in parent with updated inner zip
          const innerZipStream = fse.createReadStream(tmpInnerZipPath);
          // Use updateFileInZip to replace the nested zip file entry content
          // Pass null job so we don't accidentally mutate the parent job state during the nested replace
          try {
            await updateFileInZip(
              zipFilePath,
              nestedZipPathInParent,
              innerZipStream,
              job,
              job?.controller?.signal
            );
            console.log(
              `[deleteFromZip] Nested zip ${nestedZipPathInParent} replaced in parent successfully.`
            );
          } catch (err) {
            console.error(
              `[deleteFromZip] Failed to replace nested zip ${nestedZipPathInParent}:`,
              err
            );
            throw err;
          }

          // Cleanup tmp dir
          try {
            await fse.remove(tmpDir);
          } catch (err) {
            console.warn(
              `[deleteFromZip] Failed to remove tmpDir: ${tmpDir}`,
              err.message
            );
          }

          // Remove this path from pathsToDelete so outer deletion loop does not attempt to remove entries like 'inner.zip/..'
          const index = pathsToDelete.indexOf(pathToDelete);
          if (index !== -1) pathsToDelete.splice(index, 1);
        }
        // If nested zip isn't a file entry, then we expect outer zip contains entries with prefix 'nested.zip/'; those will be handled by standard removal below
        // Reset the zipfile iterator by closing and reopening for the next search
        await zipfile.close();
        zipfile = await yauzl.open(zipFilePath);
      }
    }
    if (signal && signal.aborted) throw new Error("Zip update cancelled.");
    console.log(
      `[deleteFromZip] Performing parent-level deletion in ${zipFilePath}. Remaining paths: ${pathsToDelete.join(
        ","
      )}`
    );
    for await (const entry of zipfile) {
      if (signal && signal.aborted) throw new Error("Zip update cancelled.");
      const shouldDelete = pathsToDelete.some((pathToDelete) => {
        const pathToDeleteAsFolder = pathToDelete.endsWith("/")
          ? pathToDelete
          : `${pathToDelete}/`;

        return (
          entry.filename === pathToDelete ||
          entry.filename.startsWith(pathToDeleteAsFolder)
        );
      });

      if (!shouldDelete) {
        const stream = await entry.openReadStream();
        archive.append(stream, { name: entry.filename });
      } else {
        console.log(`[deleteFromZip] Excluding entry ${entry.filename}`);
      }
    }
    if (signal && signal.aborted) throw new Error("Zip update cancelled.");
    await archive.finalize();
    if (signal && signal.aborted) throw new Error("Zip update cancelled.");
    await archiveFinishedPromise;
    if (signal && signal.aborted) throw new Error("Zip update cancelled.");
    await fse.move(tempZipPath, zipFilePath, { overwrite: true });
  } catch (error) {
    await fse.remove(tempZipPath).catch(() => {});
    throw error;
  } finally {
    await zipfile.close();
  }
};

const renameInZip = async (
  zipFilePath,
  oldPathInZip,
  newPathInZip,
  job = null
) => {
  const zipEndIndexOld = oldPathInZip.toLowerCase().lastIndexOf(".zip/");
  const zipEndIndexNew = newPathInZip.toLowerCase().lastIndexOf(".zip/");
  // If the path refers to a nested zip entry, recurse into the inner zip.
  if (zipEndIndexOld !== -1 && zipEndIndexOld === zipEndIndexNew) {
    // Both old and new are inside the same nested zip; extract and operate inside it.
    const nestedZipPathInParent = oldPathInZip.substring(0, zipEndIndexOld + 4);
    const remainingOldPath = oldPathInZip.substring(zipEndIndexOld + 5);
    const remainingNewPath = newPathInZip.substring(zipEndIndexNew + 5);

    const { tempNestedZipPath, tempDir } = await extractNestedZipToTemp(
      zipFilePath,
      nestedZipPathInParent
    );

    try {
      // Perform rename inside the extracted nested zip
      await renameInZip(
        tempNestedZipPath,
        remainingOldPath,
        remainingNewPath,
        job
      );

      // Now stream the updated nested zip back into the parent zip by replacing the nested zip entry
      const modifiedZipStream = fse.createReadStream(tempNestedZipPath);
      await updateFileInZip(
        zipFilePath,
        nestedZipPathInParent,
        modifiedZipStream,
        job,
        job?.controller?.signal
      );
      return; // Done
    } finally {
      await fse.remove(tempDir).catch(() => {});
    }
  }

  const signal = job?.controller?.signal;
  const tempZipPath = zipFilePath + ".tmp." + crypto.randomUUID();
  if (job) job.tempZipPath = tempZipPath;
  const output = fse.createWriteStream(tempZipPath);
  const archive = archiver("zip", {
    zlib: { level: 9 },
    forceZip64: true,
  });
  archive.pipe(output);

  const archiveFinishedPromise = new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);
    if (signal) {
      signal.addEventListener("abort", () => {
        archive.destroy();
        // reject(new Error("Zip update cancelled.")); //TODO investigate
      });
    }
  });

  if (job) {
    job.totalBytes = job.originalZipSize;
    job.processedBytes = 0;
    job.currentFile = newPathInZip;
    job.currentFileTotalSize = 0;
    job.currentFileBytesProcessed = 0;
    // job.originalZipSize should already be set by the route handler (zip or other update endpoint)
  }

  const zipfile = await yauzl.open(zipFilePath);

  // A path for a folder inside a zip might be 'folder' but its entry is 'folder/'
  const oldPathAsFolderPrefix = `${oldPathInZip}/`;
  const newPathAsFolderPrefix = `${newPathInZip}/`;

  // Collect all entries first to avoid issues with the async iterator
  const entries = [];
  for await (const entry of zipfile) {
    entries.push(entry);
  }

  try {
    if (signal && signal.aborted) throw new Error("Zip update cancelled.");
    for (const entry of entries) {
      if (signal && signal.aborted) throw new Error("Zip update cancelled.");

      const isBeingRenamed =
        entry.filename === oldPathInZip ||
        entry.filename.startsWith(oldPathAsFolderPrefix);
      let entryNameToWrite = entry.filename;

      if (isBeingRenamed) {
        if (entry.filename.startsWith(oldPathAsFolderPrefix)) {
          // This is a folder rename, affecting all contents
          entryNameToWrite = entry.filename.replace(
            oldPathAsFolderPrefix,
            newPathAsFolderPrefix
          );
        } else {
          // This is a file rename
          entryNameToWrite = newPathInZip;
        }
      } else {
        // This entry is not being renamed. Check if it conflicts with the new path.
        const isFileConflict = entry.filename === newPathInZip;
        const isFolderConflict = entry.filename.startsWith(
          newPathAsFolderPrefix
        );

        if (isFileConflict || isFolderConflict) {
          if (job && job.overwriteDecision === "overwrite") {
            console.log(
              `[renameInZip] Overwrite enabled: skipping existing target entry ${entry.filename}`
            );
            continue; // Skip this entry, it's being overwritten.
          } else {
            // If overwrite is not enabled, it's a conflict.
            throw new Error("Rename conflict: destination already exists.");
          }
        }
      }

      const readStream = await entry.openReadStream();
      const pass = new PassThrough();
      // Pipe the zip entry through a PassThrough into archiver so we can
      // await the read completion and avoid closing the zip while reading.
      readStream.pipe(pass);
      archive.append(pass, { name: entryNameToWrite });
      // Ensure the entry's read stream is fully consumed before continuing,
      // so that yauzl's internal FileReader readCount reaches zero and
      // closing the zipfile later won't throw "Cannot close while reading in progress".
      await new Promise((resolve, reject) => {
        readStream.on("end", resolve);
        readStream.on("close", resolve);
        readStream.on("error", reject);
      });
    }

    if (signal && signal.aborted) throw new Error("Zip update cancelled.");
    await archive.finalize();
    if (signal && signal.aborted) throw new Error("Zip update cancelled.");
    await archiveFinishedPromise;
    if (signal && signal.aborted) throw new Error("Zip update cancelled.");
    await fse.move(tempZipPath, zipFilePath, { overwrite: true });
  } catch (error) {
    await fse.remove(tempZipPath).catch(() => {});
    throw error;
  } finally {
    await zipfile.close();
  }
};

const addFilesToZip = async (zipFilePath, pathInZip, job) => {
  const { signal } = job.controller;
  // Normalize pathInZip
  pathInZip = (pathInZip || "").replace(/\\\\/g, "/");
  // Handle nested zip scenarios: if pathInZip contains another zip (e.g. inner.zip/some/path),
  // extract the inner zip, modify it recursively, then replace it back into the parent zip.
  const nestedIndex = pathInZip.toLowerCase().indexOf(".zip/");
  if (nestedIndex !== -1) {
    const nestedZipPathInParent = pathInZip.substring(0, nestedIndex + 4); // e.g. inner.zip
    const innerPath = pathInZip.substring(nestedIndex + 5); // remaining path inside inner zip

    // Extract the nested zip to a temporary file
    const tmpDir = fse.mkdtempSync(path.join(os.tmpdir(), "nested-zip-"));
    const tmpInnerZipPath = path.join(
      tmpDir,
      path.basename(nestedZipPathInParent)
    );

    const parentZip = await yauzl.open(zipFilePath);
    let entryFound = null;
    for await (const entry of parentZip) {
      if (entry.filename === nestedZipPathInParent) {
        entryFound = entry;
        break;
      }
    }

    if (!entryFound) {
      // Nested zip does not exist; we should create it with the new files and insert it into the parent.
      await parentZip.close();

      // Create an initially empty inner zip file at tmpInnerZipPath by calling addFilesToZip with no 'original' zip present
      const innerJob = {
        ...job,
        ws: job.ws,
        controller: job.controller,
        zipFilePath: tmpInnerZipPath,
        originalZipSize: 0,
        total: 0,
        processedBytes: 0,
        currentFile: "",
        currentFileTotalSize: 0,
        currentFileBytesProcessed: 0,
        tempZipPath: null,
      };
      // Keep overwriteDecision and resolveOverwrite in sync with outer job
      Object.defineProperty(innerJob, "overwriteDecision", {
        get() {
          return job.overwriteDecision;
        },
        set(v) {
          job.overwriteDecision = v;
        },
        configurable: true,
        enumerable: true,
      });
      Object.defineProperty(innerJob, "resolveOverwrite", {
        get() {
          return job.overwriteResolversMap && job.overwriteResolversMap.size > 0
            ? job.overwriteResolversMap.values().next().value
            : undefined;
        },
        set(v) {
          // Back-compat: register old-style resolver in map with generated id
          if (!job.overwriteResolversMap) ensureInstrumentedResolversMap(job);
          const pid = crypto.randomUUID();
          if (typeof v === "function") {
            job.overwriteResolversMap.set(pid, v);
            console.warn(
              `(zip-utils) innerJob.resolveOverwrite used: registered back-compat resolver pid=${pid} for job ${job?.id}`
            );
          }
        },
        configurable: true,
        enumerable: true,
      });
      // Build files to process for the inner zip based on outer job's filesToProcess
      innerJob.filesToProcess = job.filesToProcess || [];
      innerJob.emptyDirsToAdd = job.emptyDirsToAdd || [];

      await addFilesToZip(tmpInnerZipPath, innerPath, innerJob);

      // Insert the newly created inner zip into the parent zip
      await insertFileIntoZip(
        zipFilePath,
        nestedZipPathInParent,
        tmpInnerZipPath,
        job
      );

      try {
        await fse.remove(tmpDir);
      } catch (err) {
        console.warn(
          `[addFilesToZip] Failed to remove tmpDir ${tmpDir}:`,
          err.message
        );
      }
      return; // Completed insertion for missing inner zip
    }

    // Otherwise, the nested zip exists - extract it to a temp file and continue
    const readStream = await parentZip.openReadStream(entryFound);
    const writeStream = fse.createWriteStream(tmpInnerZipPath);
    await new Promise((resolve, reject) => {
      readStream.pipe(writeStream);
      readStream.on("end", resolve);
      readStream.on("error", reject);
      writeStream.on("error", reject);
    });
    await parentZip.close();

    // Recursively add files into the extracted inner zip using a cloned job to avoid mutating outer job state
    const innerZipStat = (await fse.pathExists(tmpInnerZipPath))
      ? (await fse.stat(tmpInnerZipPath)).size
      : 0;
    const innerJob = {
      ...job,
      ws: job.ws,
      controller: job.controller,
      zipFilePath: tmpInnerZipPath,
      originalZipSize: innerZipStat,
      total: innerZipStat,
      processedBytes: 0,
      currentFile: "",
      currentFileTotalSize: 0,
      currentFileBytesProcessed: 0,
      tempZipPath: null,
    };
    // Keep overwriteDecision and resolveOverwrite in sync with outer job
    Object.defineProperty(innerJob, "overwriteDecision", {
      get() {
        return job.overwriteDecision;
      },
      set(v) {
        job.overwriteDecision = v;
      },
      configurable: true,
      enumerable: true,
    });
    Object.defineProperty(innerJob, "resolveOverwrite", {
      get() {
        return job.overwriteResolversMap && job.overwriteResolversMap.size > 0
          ? job.overwriteResolversMap.values().next().value
          : undefined;
      },
      set(v) {
        // Back-compat: if old code sets resolveOverwrite, register it into the map with a generated id
        if (!job.overwriteResolversMap) {
          ensureInstrumentedResolversMap(job);
        }
        const pid = crypto.randomUUID();
        if (typeof v === "function") {
          job.overwriteResolversMap.set(pid, v);
          console.warn(
            `(zip-utils) innerJob.resolveOverwrite used: registered back-compat resolver pid=${pid} for job ${job?.id}`
          );
        }
      },
      configurable: true,
      enumerable: true,
    });
    await addFilesToZip(tmpInnerZipPath, innerPath, innerJob);

    // Once inner zip is updated, replace it inside the parent zip
    // Use updateFileInZip to replace the nested entry with modified inner zip
    const innerZipReadStream = fse.createReadStream(tmpInnerZipPath);
    try {
      await updateFileInZip(
        zipFilePath,
        nestedZipPathInParent,
        innerZipReadStream,
        job,
        job?.controller?.signal
      );
      // Avoid referencing `promptId`/`decision` here since this path may not have a local promptId in scope
      const promptInfo =
        job && job._lastResolvedPromptId
          ? `prompt ${job._lastResolvedPromptId}`
          : typeof promptId !== "undefined"
          ? `prompt ${promptId}`
          : "no-prompt";
      const decisionInfo =
        typeof decision !== "undefined"
          ? `decision=${decision}`
          : `job.overwriteDecision=${job?.overwriteDecision}`;
      console.log(
        `[addFilesToZip] After nested update (${promptInfo}) for nested entry ${nestedZipPathInParent} innerPath=${innerPath}, ${decisionInfo}; remaining resolvers=${
          job.overwriteResolversMap ? job.overwriteResolversMap.size : 0
        }`
      );
      try {
        console.log(
          `[addFilesToZip] [debug] job ${job?.id} trace=${
            job?._traceId ?? "n/a"
          } nestedEntry=${nestedZipPathInParent} innerPath=${innerPath} ${decisionInfo} job.overwriteDecision=${
            job.overwriteDecision
          }`
        );
      } catch (e) {}
    } catch (err) {
      console.error(
        `[addFilesToZip] Failed to replace nested zip entry ${nestedZipPathInParent} in parent zip:`,
        err
      );
      throw err;
    }

    // Clean up tmp dir
    try {
      await fse.remove(tmpDir);
    } catch (err) {
      console.warn(
        `[addFilesToZip] Failed to remove tmpDir ${tmpDir}:`,
        err.message
      );
    }
    return; // Completed the nested update path
  }
  let zipfile = null; // Will hold the yauzl instance for the original zip
  const finalEntries = new Map(); // Map<entryName, { type: 'original' | 'new', data: EntryObject | FileInfo }>
  const originalZipEntries = [];

  let tempZipPath = null;
  let output = null;
  let archive = null;

  try {
    // --- Pass 1: Determine the final state of the archive and resolve conflicts ---

    // 1. Collect all original entries from the existing zip (if any)
    if (await fse.pathExists(zipFilePath)) {
      zipfile = await yauzl.open(zipFilePath);
      for await (const entry of zipfile) {
        finalEntries.set(entry.filename, { type: "original", data: entry });
        originalZipEntries.push(entry); // Populate originalZipEntries here
      }
      // Do NOT close zipfile here, as we might need to open read streams from it later.
    }
    // 2. Process new files/folders and resolve conflicts
    const newItemsToProcess = [
      ...(job.filesToProcess || []).map((file) => ({
        entryName: path.posix.join(pathInZip, file.relativePath),
        type: "file",
        data: file,
      })),
      ...(job.emptyDirsToAdd || []).map((dir) => ({
        entryName: path.posix.join(pathInZip, dir),
        type: "folder",
        data: null, // No specific file data for empty folders
      })),
    ];

    // Sort newItemsToProcess to ensure folders are processed before their contents
    newItemsToProcess.sort((a, b) => {
      // Folders (ending with '/') should come before files or subfolders within them
      const aIsFolder = a.entryName.endsWith("/");
      const bIsFolder = b.entryName.endsWith("/");

      if (aIsFolder && !bIsFolder && b.entryName.startsWith(a.entryName)) {
        return -1; // a is a parent folder of b, so a comes first
      }
      if (bIsFolder && !aIsFolder && a.entryName.startsWith(b.entryName)) {
        return 1; // b is a parent folder of a, so b comes first
      }
      // Otherwise, maintain original order or sort alphabetically for consistency
      return a.entryName.localeCompare(b.entryName);
    });

    // Keep track of folders that have been decided to be overwritten or skipped entirely
    const folderDecisions = new Map(); // Map<folderEntryName, 'skip' | 'overwrite'>
    // Attach to job so nested inner jobs can consult parent decisions dynamically
    if (job) job._folderDecisions = folderDecisions;

    for (const newItem of newItemsToProcess) {
      if (signal.aborted) throw new Error("Zip add cancelled.");

      const { entryName, type } = newItem;

      // Check if this item is inside a folder that has already been skipped (local or inherited)
      let isInsideSkippedFolder = false;
      for (const [folderPrefixOrig, decision] of folderDecisions.entries()) {
        const folderPrefix = folderPrefixOrig.endsWith("/")
          ? folderPrefixOrig
          : `${folderPrefixOrig}/`;
        if (
          decision === "skip" &&
          (entryName === folderPrefix || entryName.startsWith(folderPrefix))
        ) {
          isInsideSkippedFolder = true;
          break;
        }
      }
      // Also consult inherited folder decisions (from outer zip) if present
      if (!isInsideSkippedFolder && job && job._inheritedFolderDecisions) {
        for (const [
          folderPrefixOrig,
          decision,
        ] of job._inheritedFolderDecisions.entries()) {
          const folderPrefix = folderPrefixOrig.endsWith("/")
            ? folderPrefixOrig
            : `${folderPrefixOrig}/`;
          if (
            decision === "skip" &&
            (entryName === folderPrefix || entryName.startsWith(folderPrefix))
          ) {
            isInsideSkippedFolder = true;
            console.log(
              `[addFilesToZip] Inner item ${entryName} matched inherited skip folder ${folderPrefix}`
            );
            break;
          }
        }
      }
      // Also consult parent job's live folder decisions to handle cases where
      // an inner job was created before the parent received a folder-level decision.
      if (
        !isInsideSkippedFolder &&
        job &&
        job._parentJob &&
        job._parentJob._folderDecisions
      ) {
        for (const [
          folderPrefixOrig,
          decision,
        ] of job._parentJob._folderDecisions.entries()) {
          const folderPrefix = folderPrefixOrig.endsWith("/")
            ? folderPrefixOrig
            : `${folderPrefixOrig}/`;
          // Parent folder keys reflect the full path inside parent zips; strip nested prefix if necessary
          const lookupPrefix = `${nestedZipPathInParent}/`;
          if (folderPrefix.startsWith(lookupPrefix)) {
            const remainder = folderPrefix.slice(lookupPrefix.length);
            if (
              decision === "skip" &&
              (entryName === remainder || entryName.startsWith(remainder))
            ) {
              isInsideSkippedFolder = true;
              console.log(
                `[addFilesToZip] Inner item ${entryName} matched parent job dynamic skip folder ${folderPrefix} -> ${remainder}`
              );
              break;
            }
          }
        }
      }
      if (isInsideSkippedFolder) {
        continue; // Skip this item as its parent folder was skipped
      }

      // If this item is inside an overwritten folder, it will be implicitly overwritten.
      // We don't need to prompt for it, just ensure it's added to finalEntries.
      let isInsideOverwrittenFolder = false;
      for (const [folderPrefixOrig, decision] of folderDecisions.entries()) {
        const folderPrefix = folderPrefixOrig.endsWith("/")
          ? folderPrefixOrig
          : `${folderPrefixOrig}/`;
        if (
          decision === "overwrite" &&
          (entryName === folderPrefix || entryName.startsWith(folderPrefix))
        ) {
          isInsideOverwrittenFolder = true;
          break;
        }
      }
      if (!isInsideOverwrittenFolder && job && job._inheritedFolderDecisions) {
        for (const [
          folderPrefixOrig,
          decision,
        ] of job._inheritedFolderDecisions.entries()) {
          const folderPrefix = folderPrefixOrig.endsWith("/")
            ? folderPrefixOrig
            : `${folderPrefixOrig}/`;
          if (
            decision === "overwrite" &&
            (entryName === folderPrefix || entryName.startsWith(folderPrefix))
          ) {
            isInsideOverwrittenFolder = true;
            console.log(
              `[addFilesToZip] Inner item ${entryName} matched inherited overwrite folder ${folderPrefix}`
            );
            break;
          }
        }
      }
      if (
        !isInsideOverwrittenFolder &&
        job &&
        job._parentJob &&
        job._parentJob._folderDecisions
      ) {
        for (const [
          folderPrefixOrig,
          decision,
        ] of job._parentJob._folderDecisions.entries()) {
          const folderPrefix = folderPrefixOrig.endsWith("/")
            ? folderPrefixOrig
            : `${folderPrefixOrig}/`;
          const lookupPrefix = `${nestedZipPathInParent}/`;
          if (folderPrefix.startsWith(lookupPrefix)) {
            const remainder = folderPrefix.slice(lookupPrefix.length);
            if (
              decision === "overwrite" &&
              (entryName === remainder || entryName.startsWith(remainder))
            ) {
              isInsideOverwrittenFolder = true;
              console.log(
                `[addFilesToZip] Inner item ${entryName} matched parent job dynamic overwrite folder ${folderPrefix} -> ${remainder}`
              );
              break;
            }
          }
        }
      }
      if (isInsideOverwrittenFolder) {
        finalEntries.set(entryName, { type: "new", data: newItem });
        continue;
      }

      if (finalEntries.has(entryName)) {
        // Conflict detected: an existing entry has the same name as a new entry
        let decision = job.overwriteDecision;
        const needsPrompt = decision === "prompt";

        if (needsPrompt) {
          if (job.ws && job.ws.readyState === 1) {
            const promptId = crypto.randomUUID();
            if (!job.overwriteResolversMap) ensureInstrumentedResolversMap(job);
            job.ws.send(
              JSON.stringify({
                type: "overwrite_prompt",
                promptId,
                file: path.basename(entryName),
                itemType: type,
                isFolderPrompt: type === "folder", // Explicitly set for folders
              })
            );
            console.log(`
              [addFilesToZip] job ${job?.id} trace=${
              job?._traceId ?? "n/a"
            } sent overwrite_prompt for ${entryName} promptId=${promptId} resolvers=${
              job.overwriteResolversMap.size
            }`);
            decision = await new Promise((resolve) => {
              job.overwriteResolversMap.set(promptId, (d) => {
                // Remember the last resolved promptId on this job for later diagnostics
                try {
                  if (!job._lastResolvedPromptId)
                    job._lastResolvedPromptId = promptId;
                  else job._lastResolvedPromptId = promptId;
                } catch (e) {}
                // Defensive check: ensure promptId is defined in closure (helps catch ReferenceError)
                if (typeof promptId === "undefined") {
                  console.error(
                    `[addFilesToZip] RESOLVER INVOKED: promptId is undefined in closure for job ${job?.id}`
                  );
                }
                try {
                  console.log(`
                  [addFilesToZip] job ${job?.id} trace=${
                    job?._traceId ?? "n/a"
                  } overwrite response received for prompt ${promptId}: ${d} for entry ${entryName}`);
                  job.overwriteDecision = d;
                  job.overwriteResolversMap.delete(promptId);
                  unregisterPromptResolver(promptId);
                  clearTimeout(job._promptTimers?.get(promptId));
                  if (job._promptTimers) job._promptTimers.delete(promptId);
                  try {
                    if (job._lastResolvedPromptId === promptId)
                      delete job._lastResolvedPromptId;
                  } catch (e) {}
                  resolve(d);
                } catch (err) {
                  console.error(
                    `[addFilesToZip] Error in overwrite resolver for prompt ${promptId} for job ${job?.id}:`,
                    err,
                    err.stack
                  );
                  try {
                    job.overwriteResolversMap.delete(promptId);
                  } catch (e) {}
                  try {
                    unregisterPromptResolver(promptId);
                  } catch (e) {}
                  try {
                    if (job._promptTimers) job._promptTimers.delete(promptId);
                  } catch (e) {}
                  if (job && job.ws && job.ws.readyState === 1) {
                    try {
                      job.ws.send(
                        JSON.stringify({
                          type: "error",
                          message: `Internal error while resolving overwrite_prompt: ${
                            err.message || err
                          }`,
                        })
                      );
                    } catch (e) {}
                  }
                  throw err;
                }
              });
              // per-prompt timeout to auto-skip to prevent stuck prompts
              if (!job._promptTimers) job._promptTimers = new Map();
              const timer = setTimeout(() => {
                try {
                  if (
                    job.overwriteResolversMap &&
                    job.overwriteResolversMap.has(promptId)
                  ) {
                    const r = job.overwriteResolversMap.get(promptId);
                    job.overwriteDecision = "skip";
                    try {
                      if (typeof r === "function") r("skip");
                    } catch (e) {
                      console.warn(
                        `[addFilesToZip] Timer triggered resolver threw: ${e.message}`
                      );
                    }
                    job.overwriteResolversMap.delete(promptId);
                    unregisterPromptResolver(promptId);
                    console.warn(
                      `[addFilesToZip] Prompt ${promptId} for job ${job?.id} timed out and was auto-skipped`
                    );
                  }
                } finally {
                  if (job._promptTimers) job._promptTimers.delete(promptId);
                }
              }, 30000);
              job._promptTimers.set(promptId, timer);
              console.log(`
                [addFilesToZip] job ${job?.id} trace=${
                job?._traceId ?? "n/a"
              } registered overwrite resolver for prompt ${promptId}. resolvers=${
                job.overwriteResolversMap.size
              }`);
              // proxy has already registered resolver on set
            });
            // Register metadata for this prompt in the prompt registry (helps debugging)
            try {
              registerPromptMeta(promptId, {
                entryName,
                itemType: type,
                isFolderPrompt: type === "folder",
              });
            } catch (e) {}
            console.log(
              `[addFilesToZip] After resolving prompt ${promptId} for entry ${entryName}, decision=${decision}; remaining resolvers=${
                job.overwriteResolversMap ? job.overwriteResolversMap.size : 0
              }`
            );
            try {
              console.log(
                `[addFilesToZip] [debug-eval] job ${job?.id} trace=${
                  job?._traceId ?? "n/a"
                } decision=${decision} job.overwriteDecision=${
                  job?.overwriteDecision
                }`
              );
            } catch (e) {}
          }
        }

        switch (decision) {
          case "skip":
          case "skip_all":
            // Keep the original entry, skip the new one. No change to finalEntries.
            if (type === "folder") {
              const normalized = entryName.endsWith("/")
                ? entryName
                : `${entryName}/`;
              folderDecisions.set(normalized, "skip");
            }
            console.log(
              `[addFilesToZip] job ${
                job?.id
              } decision=${decision} skip for entry ${entryName}. overwriteResolversMap.size=${
                job.overwriteResolversMap ? job.overwriteResolversMap.size : 0
              } overwriteResolvers.length=${
                Array.isArray(job.overwriteResolvers)
                  ? job.overwriteResolvers.length
                  : 0
              }`
            );
            break;
          case "overwrite":
          case "overwrite_all":
            // Overwrite the original entry with the new one.
            finalEntries.set(entryName, { type: "new", data: newItem });
            if (type === "folder") {
              const normalized = entryName.endsWith("/")
                ? entryName
                : `${entryName}/`;
              folderDecisions.set(normalized, "overwrite");
              // If a folder is overwritten, remove all its original contents from finalEntries
              // that are children of this folder.
              for (const [key] of finalEntries.entries()) {
                if (key.startsWith(entryName) && key !== entryName) {
                  finalEntries.delete(key);
                }
              }
            }
            break;
          case "cancel":
            throw new Error("Zip add cancelled by user.");
          default:
            break;
        }
        if (decision === "skip" || decision === "overwrite") {
          job.overwriteDecision = "prompt"; // Reset to prompt for next conflict
        }
      } else {
        // No conflict, simply add the new item
        finalEntries.set(entryName, { type: "new", data: newItem });
      }
    }

    // 3. Determine if actual modifications are needed
    let actualModificationOccurred = false;
    if (originalZipEntries.length !== finalEntries.size) {
      // Number of entries changed (added or removed)
      actualModificationOccurred = true;
    } else {
      // Same number of entries, check if any content was overwritten
      for (const [entryName, finalEntry] of finalEntries.entries()) {
        const originalEntry = originalZipEntries.find(
          (e) => e.filename === entryName
        );
        if (!originalEntry || finalEntry.type === "new") {
          // An original entry was replaced, or a new entry was added
          actualModificationOccurred = true;
          break;
        }
      }
    }

    if (!actualModificationOccurred) {
      // No actual modification to the archive's content, so no rebuild needed.
      if (job.ws && job.ws.readyState === 1) {
        job.ws.send(
          JSON.stringify({ type: "complete", status: "skipped_all" })
        );
      }
      return { status: "skipped_all" }; // Exit early
    }

    // --- Pass 2: Build the new archive ---
    try {
      console.log(
        `[addFilesToZip] [debug-action] job ${job?.id} trace=${
          job?._traceId ?? "n/a"
        } doing archive modifications. job.overwriteDecision=${
          job?.overwriteDecision
        }`
      );
    } catch (e) {}
    tempZipPath = zipFilePath + ".tmp." + crypto.randomUUID();
    job.tempZipPath = tempZipPath;
    output = fse.createWriteStream(tempZipPath);
    archive = archiver("zip", {
      zlib: { level: 9 },
      forceZip64: true,
    });

    archive.pipe(output);

    const archiveFinishedPromise = new Promise((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", reject);
      output.on("error", reject);
    });

    for (const [entryName, entryInfo] of finalEntries.entries()) {
      if (signal.aborted) throw new Error("Zip add cancelled.");

      if (entryInfo.type === "original") {
        // This is an original entry that was kept
        const originalYauzlEntry = entryInfo.data;
        const stream = await originalYauzlEntry.openReadStream();
        // By piping the stream directly, we avoid buffering the entire file in memory,
        // which is critical for large files and makes the process consistent with how new files are added.
        archive.append(stream, { name: entryName });
      } else {
        // This is a new entry (either truly new or overwriting an original)
        const newItemData = entryInfo.data;
        if (newItemData.type === "folder") {
          archive.append(null, { name: entryName });
        } else {
          const { fullPath, stats } = newItemData.data; // newItemData.data is the FileInfo object
          job.currentFile = entryName;
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
      }
    }

    await archive.finalize();
    await archiveFinishedPromise;

    if (signal.aborted) throw new Error("Zip add cancelled.");
    await fse.move(tempZipPath, zipFilePath, { overwrite: true });
    return { status: "completed" }; // Return status for successful completion
  } catch (error) {
    // Ensure temp file is removed on error
    if (tempZipPath && (await fse.pathExists(tempZipPath))) {
      await fse.remove(tempZipPath).catch(() => {});
    }
    throw error; // Re-throw the error
  } finally {
    if (zipfile) await zipfile.close(); // Close once here
  }
};

const getDirTotalSizeInZip = async (zipFilePath, dirPathInZip, job) => {
  const zipEndIndex = dirPathInZip.toLowerCase().indexOf(".zip/");
  if (zipEndIndex !== -1) {
    // This is a nested zip path
    const nestedZipPathInParent = dirPathInZip.substring(0, zipEndIndex + 4);
    const remainingPath = dirPathInZip.substring(zipEndIndex + 5);

    const { tempNestedZipPath, tempDir } = await extractNestedZipToTemp(
      zipFilePath,
      nestedZipPathInParent
    );

    try {
      const result = await getDirTotalSizeInZip(
        tempNestedZipPath,
        remainingPath,
        job
      );
      return result;
    } finally {
      await fse.remove(tempDir);
    }
  }

  // Base case: not a nested zip, or we've extracted the nested zip
  const zipfile = await yauzl.open(zipFilePath);
  let totalSize = 0;
  const dirPrefix = dirPathInZip.endsWith("/")
    ? dirPathInZip
    : `${dirPathInZip}/`;

  try {
    for await (const entry of zipfile) {
      if (job?.controller?.signal?.aborted) {
        throw new Error("Calculation cancelled");
      }
      if (entry.filename.startsWith(dirPrefix)) {
        totalSize += entry.uncompressedSize;
        if (job?.ws?.readyState === 1) {
          job.ws.send(
            JSON.stringify({
              type: "progress",
              file: entry.filename,
              sizeSoFar: totalSize,
            })
          );
        }
      }
    }
  } finally {
    await zipfile.close();
  }
  return { totalSize };
};

const extractFilesFromZip = async (job) => {
  const getCommonBasePath = (filenames) => {
    if (filenames.length === 0) {
      return "";
    }

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

  let commonBasePathToStrip = "";
  if (!job.preserveBasePath) {
    commonBasePathToStrip = getCommonBasePath(job.filenamesToExtract || []);
  }

  const { signal } = job.controller;
  const zipfile = await yauzl.open(job.zipFilePath);
  job.zipfile = zipfile;

  const filenamesToExtractSet = new Set(job.filenamesToExtract || []);

  // Build nested entries map: outerZipEntry -> set of inner paths to extract
  const nestedMap = new Map();
  for (const f of filenamesToExtractSet) {
    const zi = f.toLowerCase().indexOf(".zip/");
    if (zi !== -1) {
      const parent = f.substring(0, zi + 4); // e.g. inner.zip
      const inner = f.substring(zi + 5);
      if (!nestedMap.has(parent)) nestedMap.set(parent, new Set());
      nestedMap.get(parent).add(inner);
    }
  }

  for await (const entry of zipfile) {
    if (signal.aborted) throw new Error("Zip extract cancelled.");

    // If the entry is a nested zip that we need to extract from
    if (nestedMap.has(entry.filename)) {
      if (signal.aborted) throw new Error("Zip extract cancelled.");
      const tmpDir = fse.mkdtempSync(path.join(os.tmpdir(), "nested-zip-"));
      const tmpInnerZipPath = path.join(tmpDir, path.basename(entry.filename));
      const rs = await entry.openReadStream();
      const ws = fse.createWriteStream(tmpInnerZipPath);
      await new Promise((resolve, reject) => {
        rs.pipe(ws);
        rs.on("end", resolve);
        rs.on("error", reject);
        ws.on("error", reject);
      });

      // Prepare inner job to extract the requested inner paths
      const innerJob = {
        controller: job.controller,
        ws: job.ws,
        zipFilePath: tmpInnerZipPath,
        filenamesToExtract: Array.from(nestedMap.get(entry.filename)),
        destination: job.destination,
        preserveBasePath: job.preserveBasePath,
        copied: job.copied,
      };
      try {
        await extractFilesFromZip(innerJob);
        // propagate 'copied' bytes
        job.copied = innerJob.copied;
      } finally {
        try {
          await fse.remove(tmpDir);
        } catch (err) {
          console.warn(
            `[extractFilesFromZip] Failed to remove tmp dir ${tmpDir}:`,
            err.message
          );
        }
      }
      continue;
    }

    if (!filenamesToExtractSet.has(entry.filename)) {
      continue;
    }

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

const getAllZipEntriesRecursive = async (
  zipFilePath,
  folderPathInZip,
  job,
  allPaths,
  updateCount
) => {
  let zipfile;
  try {
    zipfile = await yauzl.open(zipFilePath);
    // Ensure the folder path always ends with '/' for correct prefix matching
    const prefix = folderPathInZip.endsWith("/")
      ? folderPathInZip
      : `${folderPathInZip}/`;

    for await (const entry of zipfile) {
      // Check for cancellation signal
      if (job.controller.signal.aborted)
        throw new Error("Copy paths cancelled");

      // Check if the entry is *inside* the target folder, but not the folder entry itself
      if (entry.filename.startsWith(prefix) && entry.filename !== prefix) {
        // Construct the full path including the zip file path (using POSIX separator)
        const fullZipEntryPath = `${zipFilePath}/${entry.filename}`;
        allPaths.push(fullZipEntryPath);
        updateCount(allPaths.length); // Update count via callback

        // Send progress update via WebSocket
        if (job.ws && job.ws.readyState === 1) {
          job.ws.send(
            JSON.stringify({
              type: "progress",
              path: fullZipEntryPath,
              count: allPaths.length,
            })
          );
        }
      }
    }
  } catch (error) {
    console.error(
      `Error recursively reading zip directory ${folderPathInZip} in ${zipFilePath}:`,
      error
    );

    if (job.ws && job.ws.readyState === 1) {
      job.ws.send(
        JSON.stringify({
          type: "error",
          message: `Error reading zip folder: ${error.message}`,
        })
      );
    }
    throw error;
  } finally {
    // Ensure the zip file is closed even if errors occur
    if (zipfile) await zipfile.close();
  }
};

const duplicateInZip = async (job) => {
  const { zipFilePath, items, controller, ws } = job;
  const { signal } = controller;

  // Create a unique temporary directory for the duplication process
  const tempDir = await fse.mkdtemp(
    path.join(os.tmpdir(), `duplicate-zip-${job.id}-`)
  );

  try {
    // STAGE 1: Extract items from the zip to the temporary directory
    if (ws && ws.readyState === 1) {
      ws.send(
        JSON.stringify({
          type: "progress",
          stage: "extracting",
          message: "Extracting items to a temporary location...",
        })
      );
    }

    const zipfile = await yauzl.open(zipFilePath);
    const filenamesToExtract = new Set();
    const sourcePathsInZip = items
      .map((item) => {
        const match = matchZipPath(item.sourcePath);
        return match ? match[2].substring(1) : null;
      })
      .filter((p) => p !== null);

    for await (const entry of zipfile) {
      if (
        sourcePathsInZip.some(
          (p) => entry.filename === p || entry.filename.startsWith(`${p}/`)
        )
      ) {
        filenamesToExtract.add(entry.filename);
      }
    }
    await zipfile.close();

    job.destination = tempDir;
    job.filenamesToExtract = Array.from(filenamesToExtract); // Pass filenames instead of entry objects
    job.preserveBasePath = true; // Preserve directory structure for duplication
    await extractFilesFromZip(job);

    if (signal.aborted) throw new Error("Zip duplication cancelled.");

    // STAGE 2: Rename the extracted items in the temporary directory
    if (ws && ws.readyState === 1) {
      ws.send(
        JSON.stringify({
          type: "progress",
          stage: "renaming",
          message: "Renaming extracted items...",
        })
      );
    }

    for (const item of items) {
      const zipPathParts = matchZipPath(item.sourcePath);
      if (!zipPathParts) {
        throw new Error(
          `Invalid source path for in-zip duplication: ${item.sourcePath}`
        );
      }
      const sourcePathInZip = zipPathParts[2].substring(1);
      const originalExtractedPath = path.join(tempDir, sourcePathInZip);
      const newPathInTemp = path.join(
        path.dirname(originalExtractedPath),
        item.newName
      );
      await fse.rename(originalExtractedPath, newPathInTemp);
    }

    if (signal.aborted) throw new Error("Zip duplication cancelled.");

    // STAGE 3: Add the renamed items from the temp directory back to the zip
    if (ws && ws.readyState === 1) {
      ws.send(
        JSON.stringify({
          type: "progress",
          stage: "adding",
          message: "Adding duplicated items back to the archive...",
        })
      );
    }

    const { files: filesToProcess, dirs: emptyDirsToAdd } =
      await getAllFilesAndDirsRecursive(tempDir);

    // Modify the original job object for the add operation
    job.filesToProcess = filesToProcess.map((f) => ({
      ...f,
      // The relativePath is already calculated, just ensure posix separators
      relativePath: f.relativePath.replace(/\\\\/g, "/"),
    }));
    // The emptyDirsToAdd from the recursive function is already what we need:
    // an array of relative paths with trailing slashes.
    job.emptyDirsToAdd = emptyDirsToAdd;

    // Add to the root of the zip, as the paths are relative to the temp dir root
    // Pass the original, now-augmented, job object
    await addFilesToZip(zipFilePath, "", job);

    if (signal.aborted) throw new Error("Zip duplication cancelled.");
  } finally {
    // STAGE 4: Clean up the temporary directory
    await fse.remove(tempDir);
  }
};

export {
  extractNestedZipToTemp,
  getFilesInZip,
  getFileContentFromZip,
  getZipFileStream,
  findCoverInZip,
  matchZipPath,
  updateFileInZip,
  insertFileIntoZip,
  createFileInZip,
  createFolderInZip,
  getSummaryFromZip,
  deleteFromZip,
  renameInZip,
  addFilesToZip,
  getDirTotalSizeInZip,
  extractFilesFromZip,
  getAllZipEntriesRecursive,
  duplicateInZip,
};
