import { WebSocketServer } from "ws";
import path from "path";
import fse from "fs-extra";
import { open } from "yauzl-promise";
import { pipeline } from "stream/promises";
import { Writable, Readable } from "stream";
import watcher from "./watcher.js";
import os from "os";
import * as yauzl from "yauzl-promise";

// A Writable stream that does nothing, used to consume read streams for integrity testing
class NullWritable extends Writable {
  _write(chunk, encoding, callback) {
    callback();
  }
}

import {
  getDirSizeWithProgress,
  performCopyCancellation,
  getDirSizeWithScanProgress,
  copyWithProgress,
  getDirTotalSize,
  getAllFiles,
  getZipFileStream,
  addFilesToZip,
  matchZipPath,
  extractFilesFromZip,
} from "./utils.js";

// Keep track of clients that are watching for file changes
const watchingClients = new Map();

// When a file changes, notify the relevant clients
watcher.on("change", ({ path: changedPath }) => {
  for (const [ws, watchedPaths] of watchingClients.entries()) {
    if (watchedPaths.has(changedPath)) {
      if (ws.readyState === 1) {
        ws.send(
          JSON.stringify({
            type: "path_changed",
            path: changedPath,
          })
        );
      }
    }
  }
});

export function initializeWebSocketServer(
  server,
  activeCopyJobs,
  activeSizeJobs,
  activeCompressJobs,
  activeDecompressJobs,
  activeArchiveTestJobs,
  activeDuplicateJobs,
  activeCopyPathsJobs
) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const jobId = url.searchParams.get("jobId");
    const jobType = url.searchParams.get("type");

    if (jobId) {
      let jobMap;
      if (jobType === "size") {
        jobMap = activeSizeJobs;
      } else if (jobType === "compress") {
        jobMap = activeCompressJobs;
      } else if (jobType === "decompress") {
        jobMap = activeDecompressJobs;
      } else if (jobType === "archive-test") {
        jobMap = activeArchiveTestJobs;
      } else if (jobType === "duplicate") {
        jobMap = activeDuplicateJobs;
      } else if (jobType === "copy-paths") {
        jobMap = activeCopyPathsJobs;
      } else {
        // Default to copy if not specified or unknown
        jobMap = activeCopyJobs;
      }

      if (jobMap.has(jobId)) {
        const job = jobMap.get(jobId);
        job.ws = ws;
        console.log(`[ws] Client connected for ${jobType} job: ${jobId}`);

        ws.on("message", (message) => {
          const data = JSON.parse(message);
          if (data.type === "overwrite_response") {
            if (data.decision === "cancel") {
              if (jobType === "copy" || jobType === "duplicate") {
                performCopyCancellation(job);
              } else if (jobType === "decompress") {
                job.status = "cancelled";
                job.controller.abort();
                if (job.resolveOverwrite) {
                  job.overwriteDecision = "cancel";
                  job.resolveOverwrite();
                }
              }
            } else if (job.resolveOverwrite) {
              job.overwriteDecision = data.decision;
              job.resolveOverwrite();
            }
          }
        });

        if (jobType === "copy" || jobType === "duplicate") {
          if (job.jobType === "zip-add") {
            (async () => {
              let progressInterval;
              try {
                job.status = "scanning";
                ws.send(JSON.stringify({ type: "scan_start" }));

                const { destination, sources } = job;
                const zipDestMatch = matchZipPath(destination);
                if (!zipDestMatch)
                  throw new Error("Invalid ZIP destination path.");

                const zipFilePath = zipDestMatch[1];
                const pathInZip = zipDestMatch[2].startsWith("/")
                  ? zipDestMatch[2].substring(1)
                  : zipDestMatch[2];

                let totalNewBytes = 0;
                const filesToProcess = [];
                for (const sourcePath of sources) {
                  if (job.controller.signal.aborted)
                    throw new Error("Scan cancelled");
                  const stats = await fse.stat(sourcePath);
                  if (stats.isDirectory()) {
                    const basePath = path.dirname(sourcePath);
                    const nestedFiles = await getAllFiles(sourcePath, basePath);
                    for (const file of nestedFiles) {
                      filesToProcess.push(file);
                      totalNewBytes += file.stats.size;
                    }
                  } else {
                    const relativePath = path.basename(sourcePath);
                    filesToProcess.push({
                      fullPath: sourcePath,
                      relativePath,
                      stats,
                    });
                    totalNewBytes += stats.size;
                  }
                }
                job.filesToProcess = filesToProcess;

                job.total = totalNewBytes;
                job.copied = 0;
                job.status = "copying";
                job.lastProcessedBytes = 0;
                job.lastUpdateTime = Date.now();

                ws.send(
                  JSON.stringify({ type: "scan_complete", total: job.total })
                );

                job.currentFile = `Rebuilding archive: ${path.basename(
                  zipFilePath
                )}`;

                progressInterval = setInterval(() => {
                  if (ws.readyState === 1) {
                    const currentTime = Date.now();
                    const timeElapsed =
                      (currentTime - job.lastUpdateTime) / 1000;
                    const bytesSinceLastUpdate =
                      job.copied - job.lastProcessedBytes;
                    const instantaneousSpeed =
                      timeElapsed > 0 ? bytesSinceLastUpdate / timeElapsed : 0;

                    ws.send(
                      JSON.stringify({
                        type: "progress",
                        copied: job.copied,
                        total: job.total,
                        currentFile: job.currentFile,
                        currentFileBytesProcessed:
                          job.currentFileBytesProcessed,
                        currentFileSize: job.currentFileTotalSize,
                        instantaneousSpeed,
                      })
                    );

                    job.lastProcessedBytes = job.copied;
                    job.lastUpdateTime = currentTime;
                  }
                }, 250);

                await addFilesToZip(zipFilePath, pathInZip, job);

                if (job.isMove) {
                  for (const source of job.sources) {
                    await fse.remove(source);
                  }
                }

                job.status = "completed";
                ws.send(JSON.stringify({ type: "complete" }));
                ws.close(1000, "Job Completed");
              } catch (error) {
                if (job.status !== "cancelled") job.status = "failed";
                console.error(`Zip add job ${jobId} failed:`, error.message);
                if (ws.readyState === 1) {
                  const type =
                    job.status === "cancelled" ? "cancelled" : "error";
                  ws.send(JSON.stringify({ type, message: error.message }));
                  ws.close(1000, `Job finished with status: ${type}`);
                }
              } finally {
                clearInterval(progressInterval);
                setTimeout(() => activeCopyJobs.delete(jobId), 5000);
              }
            })();
          } else if (job.jobType === "zip-extract") {
            (async () => {
              let progressInterval;
              try {
                job.status = "scanning";
                ws.send(JSON.stringify({ type: "scan_start" }));

                const { sources, destination } = job;
                const zipSourceMatch = matchZipPath(sources[0]);
                if (!zipSourceMatch)
                  throw new Error("Invalid ZIP source path.");

                const zipFilePath = zipSourceMatch[1];
                job.zipFilePath = zipFilePath;

                let zipfile = await yauzl.open(zipFilePath);

                const entriesToExtract = [];
                let totalUncompressedSize = 0;

                for await (const entry of zipfile) {
                  for (const source of sources) {
                    const inZipPath = matchZipPath(source)[2].substring(1);
                    if (
                      entry.filename === inZipPath ||
                      entry.filename.startsWith(inZipPath + "/")
                    ) {
                      entriesToExtract.push(entry);
                      totalUncompressedSize += entry.uncompressedSize;
                      break;
                    }
                  }
                }
                await zipfile.close();

                job.entriesToExtract = entriesToExtract;
                job.total = totalUncompressedSize;
                job.copied = 0;
                job.status = "copying";
                job.lastProcessedBytes = 0;
                job.lastUpdateTime = Date.now();

                ws.send(
                  JSON.stringify({ type: "scan_complete", total: job.total })
                );

                progressInterval = setInterval(() => {
                  if (ws.readyState === 1) {
                    const currentTime = Date.now();
                    const timeElapsed =
                      (currentTime - job.lastUpdateTime) / 1000;
                    const bytesSinceLastUpdate =
                      job.copied - job.lastProcessedBytes;
                    const instantaneousSpeed =
                      timeElapsed > 0 ? bytesSinceLastUpdate / timeElapsed : 0;

                    ws.send(
                      JSON.stringify({
                        type: "progress",
                        copied: job.copied,
                        total: job.total,
                        currentFile: job.currentFile,
                        currentFileBytesProcessed:
                          job.currentFileBytesProcessed,
                        currentFileSize: job.currentFileTotalSize,
                        instantaneousSpeed,
                      })
                    );

                    job.lastProcessedBytes = job.copied;
                    job.lastUpdateTime = currentTime;
                  }
                }, 250);

                await extractFilesFromZip(job);

                job.status = "completed";
                ws.send(JSON.stringify({ type: "complete" }));
                ws.close(1000, "Job Completed");
              } catch (error) {
                if (job.status !== "cancelled") job.status = "failed";
                console.error(
                  `Zip extract job ${jobId} failed:`,
                  error.message
                );
                if (ws.readyState === 1) {
                  const type =
                    job.status === "cancelled" ? "cancelled" : "error";
                  ws.send(JSON.stringify({ type, message: error.message }));
                  ws.close(1000, `Job finished with status: ${type}`);
                }
              } finally {
                clearInterval(progressInterval);
                if (job.zipfile) await job.zipfile.close();
                setTimeout(() => activeCopyJobs.delete(jobId), 5000);
              }
            })();
          } else {
            // HANDLE FS-to-FS COPY
            (async () => {
              const currentJobType = jobType;
              try {
                job.status = "scanning";
                ws.send(JSON.stringify({ type: "scan_start" }));

                let totalSize = 0;
                const sources =
                  currentJobType === "duplicate"
                    ? job.items.map((i) => i.sourcePath)
                    : job.sources;

                for (const sourcePath of sources) {
                  if (job.controller.signal.aborted)
                    throw new Error("Scan cancelled");
                  const stats = await fse.stat(sourcePath);
                  totalSize += stats.isDirectory()
                    ? await getDirSizeWithScanProgress(sourcePath, job)
                    : stats.size;
                }
                job.total = totalSize;
                job.copied = 0;

                job.status = "copying";
                ws.send(
                  JSON.stringify({ type: "scan_complete", total: job.total })
                );

                const itemsToProcess =
                  currentJobType === "duplicate"
                    ? job.items.map((item) => ({
                        sourcePath: item.sourcePath,
                        destPath: path.join(
                          path.dirname(item.sourcePath),
                          item.newName
                        ),
                      }))
                    : job.sources.map((sourcePath) => ({
                        sourcePath,
                        destPath: path.join(
                          job.destination,
                          path.basename(sourcePath)
                        ),
                      }));

                for (const item of itemsToProcess) {
                  await copyWithProgress(item.sourcePath, item.destPath, job);
                }

                job.status = "completed";
                ws.send(JSON.stringify({ type: "complete" }));
                ws.close(1000, "Job Completed");
              } catch (error) {
                if (job.status !== "cancelled") {
                  job.status = "failed";
                }

                console.error(
                  `Copy job ${jobId} failed or was cancelled:`,
                  error.message
                );

                if (ws.readyState === 1) {
                  const type =
                    job.status === "cancelled" ? "cancelled" : "error";
                  ws.send(JSON.stringify({ type, message: error.message }));
                  ws.close(1000, `Job finished with status: ${type}`);
                }
              } finally {
                const jobMapToClear =
                  currentJobType === "duplicate"
                    ? activeDuplicateJobs
                    : activeCopyJobs;
                setTimeout(() => jobMapToClear.delete(jobId), 5000);
              }
            })();
          }
        }

        if (jobType === "size") {
          (async () => {
            try {
              const totalSize = await getDirTotalSize(
                job.folderPath,
                job.controller.signal
              );
              job.totalSize = totalSize;

              if (ws.readyState === 1) {
                ws.send(
                  JSON.stringify({ type: "start", totalSize: totalSize })
                );
              }

              job.sizeSoFar = 0;
              await getDirSizeWithProgress(job.folderPath, job);
              if (ws.readyState === 1) {
                ws.send(JSON.stringify({ type: "complete", size: totalSize }));
                ws.close(1000, "Job Completed");
              }
            } catch (error) {
              if (job.status !== "cancelled") job.status = "failed";
              console.error(`Size job ${jobId} failed:`, error.message);
              if (ws.readyState === 1) {
                const type = job.status === "cancelled" ? "cancelled" : "error";
                ws.send(JSON.stringify({ type, message: error.message }));
                ws.close(1000, `Job finished with status: ${type}`);
              }
            } finally {
              setTimeout(() => activeSizeJobs.delete(jobId), 5000);
            }
          })();
        }

        if (jobType === "compress") {
          (async () => {
            let progressInterval;
            try {
              if (job.ws && job.ws.readyState === 1) {
                job.ws.send(
                  JSON.stringify({ type: "start", totalSize: job.totalBytes })
                );
              }

              job.lastProcessedBytes = 0;
              job.lastUpdateTime = Date.now();

              job.output.on("close", function () {
                clearInterval(progressInterval);
                job.status = "completed";
                if (job.ws && job.ws.readyState === 1) {
                  job.ws.send(
                    JSON.stringify({
                      type: "complete",
                      outputPath: job.outputPath,
                    })
                  );
                  job.ws.close(1000, "Job Completed");
                }
                setTimeout(() => activeCompressJobs.delete(jobId), 5000);
              });

              job.archive.on("warning", (err) => {
                if (job.ws && job.ws.readyState === 1) {
                  job.ws.send(
                    JSON.stringify({ type: "warning", message: err.message })
                  );
                }
              });

              progressInterval = setInterval(() => {
                if (job.ws && job.ws.readyState === 1) {
                  const currentTime = Date.now();
                  const timeElapsed = (currentTime - job.lastUpdateTime) / 1000;
                  const bytesSinceLastUpdate =
                    job.compressedBytes - job.lastProcessedBytes;
                  const instantaneousSpeed =
                    timeElapsed > 0 ? bytesSinceLastUpdate / timeElapsed : 0;

                  job.ws.send(
                    JSON.stringify({
                      type: "progress",
                      total: job.totalBytes,
                      processed: job.compressedBytes,
                      currentFile: job.currentFile,
                      currentFileTotalSize: job.currentFileTotalSize,
                      currentFileBytesProcessed: job.currentFileBytesProcessed,
                      instantaneousSpeed: instantaneousSpeed,
                    })
                  );

                  job.lastProcessedBytes = job.compressedBytes;
                  job.lastUpdateTime = currentTime;
                }
              }, 250);

              job.archive.pipe(job.output);

              const allFiles = [];
              for (const source of job.sources) {
                const stats = await fse.stat(source);
                if (stats.isDirectory()) {
                  const files = await getAllFiles(source, job.sourceDirectory);
                  allFiles.push(...files);
                } else {
                  allFiles.push({
                    fullPath: source,
                    relativePath: path.relative(job.sourceDirectory, source),
                    stats: stats,
                  });
                }
              }

              for (const file of allFiles) {
                await new Promise((resolve, reject) => {
                  job.currentFile = file.relativePath;
                  job.currentFileTotalSize = file.stats.size;
                  job.currentFileBytesProcessed = 0;

                  const stream = fse.createReadStream(file.fullPath);
                  stream.on("data", (chunk) => {
                    job.currentFileBytesProcessed += chunk.length;
                    job.compressedBytes += chunk.length;
                  });
                  stream.on("error", reject);

                  job.archive.append(stream, {
                    name: file.relativePath,
                    stats: file.stats,
                  });

                  const onEntry = (entry) => {
                    if (entry.name === file.relativePath) {
                      job.archive.removeListener("entry", onEntry);
                      resolve();
                    }
                  };
                  job.archive.on("entry", onEntry);
                });
              }

              job.archive.finalize();
            } catch (error) {
              clearInterval(progressInterval);
              if (job.status !== "cancelled") job.status = "failed";
              if (job.ws && job.ws.readyState === 1) {
                const type = job.status === "cancelled" ? "cancelled" : "error";
                job.ws.send(JSON.stringify({ type, message: error.message }));
                job.ws.close(1000, `Job finished with status: ${type}`);
              }
            } finally {
              if (job.status !== "completed" && job.status !== "failed") {
                setTimeout(() => activeCompressJobs.delete(jobId), 5000);
              }
            }
          })();
        }

        if (jobType === "decompress") {
          (async () => {
            let zipfile;
            let progressInterval;
            let tempNestedZipPath = null;

            try {
              job.overwriteDecision = "prompt";

              // Show overwrite prompt for the destination FOLDER only on FULL extraction.
              if (
                (await fse.pathExists(job.destination)) &&
                !(job.itemsToExtract && job.itemsToExtract.length > 0)
              ) {
                if (ws.readyState === 1) {
                  ws.send(
                    JSON.stringify({
                      type: "overwrite_prompt",
                      file: path.basename(job.destination),
                      itemType: "folder",
                    })
                  );
                  await new Promise(
                    (resolve) => (job.resolveOverwrite = resolve)
                  );
                }

                if (
                  job.overwriteDecision === "skip" ||
                  job.overwriteDecision === "cancel"
                ) {
                  if (ws.readyState === 1) {
                    ws.send(
                      JSON.stringify({ type: "complete", status: "skipped" })
                    );
                    ws.close();
                  }
                  return;
                }
              }

              let sourceToDecompress;

              if (job.isNestedZip) {
                const tempDir = fse.mkdtempSync(
                  path.join(os.tmpdir(), "nested-decompress-"),
                  { mode: 0o700 }
                );
                tempNestedZipPath = path.join(
                  tempDir,
                  path.basename(job.filePathInZip)
                );
                const readStream = await getZipFileStream(
                  job.zipFilePath,
                  job.filePathInZip
                );
                const writeStream = fse.createWriteStream(tempNestedZipPath);
                await new Promise((resolve, reject) => {
                  readStream.pipe(writeStream);
                  readStream.on("end", resolve);
                  readStream.on("error", reject);
                  writeStream.on("error", reject);
                });
                sourceToDecompress = tempNestedZipPath;
              } else {
                sourceToDecompress = job.source;
              }

              zipfile = await open(sourceToDecompress);

              let totalUncompressedSize = 0;
              let totalFiles = 0;
              const entriesToExtractNames = [];

              if (job.itemsToExtract && job.itemsToExtract.length > 0) {
                for await (const entry of zipfile) {
                  const shouldExtract = job.itemsToExtract.some(
                    (selectedItem) =>
                      entry.filename === selectedItem ||
                      entry.filename.startsWith(selectedItem + "/")
                  );
                  if (shouldExtract) {
                    entriesToExtractNames.push(entry.filename);
                    totalUncompressedSize += entry.uncompressedSize;
                    if (!entry.filename.endsWith("/")) {
                      totalFiles++;
                    }
                  }
                }
              } else {
                for await (const entry of zipfile) {
                  entriesToExtractNames.push(entry.filename);
                  totalUncompressedSize += entry.uncompressedSize;
                  if (!entry.filename.endsWith("/")) {
                    totalFiles++;
                  }
                }
              }

              await zipfile.close();
              zipfile = await open(sourceToDecompress);
              job.zipfile = zipfile;

              let processedBytes = 0;
              let processedFiles = 0;
              let lastUpdateTime = Date.now();
              let lastProcessedBytes = 0;
              job.currentFile = "Preparing...";
              job.currentFileTotalSize = 0;
              job.currentFileBytesProcessed = 0;

              if (ws.readyState === 1) {
                ws.send(
                  JSON.stringify({
                    type: "start",
                    totalSize: totalUncompressedSize,
                    totalFiles: totalFiles,
                  })
                );
              }

              progressInterval = setInterval(() => {
                if (ws.readyState === 1) {
                  const currentTime = Date.now();
                  const timeElapsed = (currentTime - lastUpdateTime) / 1000;
                  const bytesSinceLastUpdate =
                    processedBytes - lastProcessedBytes;
                  const instantaneousSpeed =
                    timeElapsed > 0 ? bytesSinceLastUpdate / timeElapsed : 0;

                  ws.send(
                    JSON.stringify({
                      type: "progress",
                      total: totalUncompressedSize,
                      processed: processedBytes,
                      totalFiles: totalFiles,
                      processedFiles: processedFiles,
                      currentFile: job.currentFile,
                      currentFileTotalSize: job.currentFileTotalSize,
                      currentFileBytesProcessed: job.currentFileBytesProcessed,
                      instantaneousSpeed: instantaneousSpeed,
                    })
                  );

                  lastProcessedBytes = processedBytes;
                  lastUpdateTime = currentTime;
                }
              }, 250);

              const entriesToExtractSet = new Set(entriesToExtractNames);
              for await (const entry of zipfile) {
                if (!entriesToExtractSet.has(entry.filename)) {
                  continue;
                }

                if (job.status === "cancelled") {
                  break;
                }

                job.currentFile = entry.filename;
                job.currentFileTotalSize = entry.uncompressedSize;
                job.currentFileBytesProcessed = 0;

                const destPath = path.join(job.destination, entry.filename);

                if (await fse.pathExists(destPath)) {
                  let decision = job.overwriteDecision;
                  const needsPrompt = ["prompt", "overwrite", "skip"].includes(
                    decision
                  );

                  if (needsPrompt) {
                    if (job.ws && job.ws.readyState === 1) {
                      ws.send(
                        JSON.stringify({
                          type: "overwrite_prompt",
                          file: entry.filename,
                          itemType: entry.filename.endsWith("/")
                            ? "folder"
                            : "file",
                        })
                      );
                      await new Promise(
                        (resolve) => (job.resolveOverwrite = resolve)
                      );
                      decision = job.overwriteDecision;
                    }
                  }

                  const evaluateDecision = () => {
                    switch (decision) {
                      case "skip":
                      case "skip_all":
                        return true;
                      case "if_newer":
                        return true;
                      case "size_differs": {
                        if (entry.filename.endsWith("/")) return false;
                        const destStats = fse.statSync(destPath);
                        return entry.uncompressedSize === destStats.size;
                      }
                      case "smaller_only": {
                        if (entry.filename.endsWith("/")) return false;
                        const destStats = fse.statSync(destPath);
                        return destStats.size >= entry.uncompressedSize;
                      }
                      case "no_zero_length": {
                        return entry.uncompressedSize === 0;
                      }
                      default:
                        return false;
                    }
                  };

                  if (evaluateDecision()) {
                    processedBytes += entry.uncompressedSize;
                    if (!entry.filename.endsWith("/")) {
                      processedFiles++;
                    }
                    if (job.overwriteDecision === "skip")
                      job.overwriteDecision = "prompt";
                    continue;
                  }
                  if (decision === "overwrite")
                    job.overwriteDecision = "prompt";
                }

                if (entry.filename.endsWith("/")) {
                  await fse.mkdirp(destPath);
                  let mtime;
                  try {
                    mtime = entry.getLastMod();
                    if (isNaN(mtime.getTime())) {
                      mtime = new Date();
                    }
                  } catch (dateError) {
                    mtime = new Date();
                  }
                  fse.utimes(destPath, mtime, mtime, (err) => {
                    if (err)
                      console.error(
                        `[ws:${jobId}] Error setting mtime for directory ${destPath}:`,
                        err
                      );
                  });
                  processedBytes += entry.uncompressedSize;
                } else {
                  await fse.mkdirp(path.dirname(destPath));
                  const readStream = await entry.openReadStream();
                  const writeStream = fse.createWriteStream(destPath);

                  readStream.on("data", (chunk) => {
                    processedBytes += chunk.length;
                    job.currentFileBytesProcessed += chunk.length;
                  });

                  await new Promise((resolve, reject) => {
                    writeStream.on("close", async () => {
                      if (job.status !== "cancelled") {
                        let mtime;
                        try {
                          mtime = entry.getLastMod();
                          if (isNaN(mtime.getTime())) mtime = new Date();
                        } catch (dateError) {
                          mtime = new Date();
                        }
                        fse.utimes(destPath, mtime, mtime, (err) => {
                          if (err)
                            console.error(
                              `[ws:${jobId}] Error setting mtime for file ${destPath}:`,
                              err
                            );
                        });
                      }
                      resolve();
                    });
                    writeStream.on("error", reject);
                    readStream.on("error", reject);
                    pipeline(readStream, writeStream, {
                      signal: job.controller.signal,
                    }).catch(reject);
                  });
                }
                if (!entry.filename.endsWith("/")) {
                  processedFiles++;
                }
              }

              if (job.status !== "cancelled" && ws.readyState === 1) {
                ws.send(JSON.stringify({ type: "complete" }));
                ws.close();
              }
            } catch (error) {
              console.error(`[ws:${jobId}] Decompression job failed:`, error);
              if (ws.readyState === 1) {
                try {
                  const type =
                    error.name === "AbortError" ? "complete" : "failed";
                  const status =
                    error.name === "AbortError" ? "cancelled" : "failed";
                  ws.send(
                    JSON.stringify({
                      type: type,
                      status: status,
                      title:
                        status === "cancelled"
                          ? "Decompression cancelled."
                          : "Could not open or process archive.",
                      details: error.message,
                    })
                  );
                } catch (sendError) {
                  console.error(
                    `[ws:${jobId}] Error sending status to client:`,
                    sendError
                  );
                }
                ws.close();
              }
            } finally {
              clearInterval(progressInterval);
              if (job.zipfile) {
                await job.zipfile.close();
              }
              if (tempNestedZipPath) {
                await fse.remove(path.dirname(tempNestedZipPath));
              }
            }
          })();
        }

        if (jobType === "archive-test") {
          (async () => {
            let zipfile;
            const failedFiles = [];
            let testedFiles = 0;
            let totalFiles = null;
            let generalError = null;
            let currentFile = null;
            let jobComplete = false;

            const sendComplete = () => {
              if (jobComplete || ws.readyState !== 1) return;
              jobComplete = true;

              if (failedFiles.length === 0 && generalError) {
                failedFiles.push({
                  fileName: currentFile || "unknown",
                  message: generalError,
                });
              }

              ws.send(
                JSON.stringify({
                  type: "complete",
                  report: {
                    totalFiles,
                    testedFiles,
                    failedFiles,
                    generalError,
                  },
                })
              );
              ws.close();
            };

            const testEntry = async (entry) => {
              try {
                const readStream = await entry.openReadStream();
                const nullStream = new NullWritable();
                await new Promise((resolve, reject) => {
                  readStream.on("error", reject);
                  nullStream.on("error", reject);
                  nullStream.on("finish", resolve);

                  job.controller.signal.onabort = () => {
                    readStream.destroy();
                    nullStream.destroy();
                    reject(new Error("Archive test cancelled"));
                  };

                  readStream.pipe(nullStream);
                });
              } catch (err) {
                const message =
                  err.message ||
                  err.code ||
                  (err.cause && err.cause.message) ||
                  "Error reading entry stream";
                throw new Error(message);
              }
            };

            try {
              zipfile = await open(job.source);
              job.zipfile = zipfile;
              totalFiles = zipfile.entryCount || null;

              if (ws.readyState === 1) {
                ws.send(JSON.stringify({ type: "start", totalFiles }));
              }

              for await (const entry of zipfile) {
                if (job.status === "cancelled") break;

                currentFile = entry.filename;
                testedFiles++;

                if (ws.readyState === 1) {
                  ws.send(
                    JSON.stringify({
                      type: "progress",
                      testedFiles,
                      currentFile,
                    })
                  );
                }

                try {
                  await testEntry(entry);
                } catch (err) {
                  failedFiles.push({
                    fileName: entry.filename,
                    message: err.message,
                  });
                }
              }
            } catch (err) {
              console.error(`[ws:${jobId}] Archive test error:`, err);
              generalError = err.message || String(err);

              if (
                currentFile &&
                !failedFiles.some((f) => f.fileName === currentFile)
              ) {
                const perFileMessage =
                  err.message && !/Central Directory/i.test(err.message)
                    ? err.message
                    : err.code || "Error processing this file";

                failedFiles.push({
                  fileName: currentFile,
                  message: perFileMessage,
                });
              }
            } finally {
              try {
                if (zipfile) await zipfile.close();
              } catch {}
              sendComplete();
            }
          })();
        }

        if (jobType === "copy-paths") {
          (async () => {
            const allPaths = [];
            const visited = new Set();
            let count = 0;

            const getPathsRecursive = async (dir) => {
              if (visited.has(dir)) return;
              visited.add(dir);

              try {
                const files = await fse.readdir(dir, { withFileTypes: true });
                for (const file of files) {
                  const fullPath = path.join(dir, file.name);
                  allPaths.push(fullPath);
                  count++;
                  if (ws.readyState === 1) {
                    ws.send(
                      JSON.stringify({
                        type: "progress",
                        path: fullPath,
                        count,
                      })
                    );
                  }
                  if (file.isDirectory()) {
                    await getPathsRecursive(fullPath);
                  }
                }
              } catch (error) {
                console.error(`Could not read directory: ${dir}`, error);
              }
            };

            try {
              if (ws.readyState === 1) {
                ws.send(JSON.stringify({ type: "start" }));
              }

              for (const item of job.items) {
                const fullPath = path.join(job.basePath, item.name);
                allPaths.push(fullPath);
                count++;
                if (ws.readyState === 1) {
                  ws.send(
                    JSON.stringify({ type: "progress", path: fullPath, count })
                  );
                }
                if (job.includeSubfolders && item.type === "folder") {
                  await getPathsRecursive(fullPath);
                }
              }

              const formattedPaths = job.isAbsolute
                ? allPaths
                : allPaths.map((p) => path.relative(job.basePath, p));

              if (ws.readyState === 1) {
                ws.send(
                  JSON.stringify({ type: "complete", paths: formattedPaths })
                );
                ws.close(1000, "Job Completed");
              }
            } catch (error) {
              console.error(`Copy paths job ${jobId} failed:`, error.message);
              if (ws.readyState === 1) {
                ws.send(
                  JSON.stringify({ type: "error", message: error.message })
                );
                ws.close(1000, `Job finished with status: error`);
              }
            } finally {
              setTimeout(() => activeCopyPathsJobs.delete(jobId), 5000);
            }
          })();
        }

        ws.on("close", async () => {
          console.log(`[ws] Client disconnected for ${jobType} job: ${jobId}`);
          if (job.ws === ws) job.ws = null;

          if (
            jobType === "compress" &&
            job.status !== "completed" &&
            job.status !== "failed"
          ) {
            job.status = "cancelled";
            if (job.archive) {
              job.archive.destroy();
            }
            if (await fse.pathExists(job.outputPath)) {
              await fse.remove(job.outputPath);
            }
          }

          if (
            (jobType === "decompress" || jobType === "archive-test") &&
            job.status !== "completed" &&
            job.status !== "failed"
          ) {
            job.status = "cancelled";
          }
        });

        ws.on("error", (error) =>
          console.error(`[ws] WebSocket error for job ${jobId}:`, error)
        );
      } else {
        console.warn(`[ws] Connection rejected for invalid job ID: ${jobId}`);
        ws.close();
      }
    } else {
      console.log("[ws] Client connected for file watching.");
      watchingClients.set(ws, new Set());

      ws.on("message", (message) => {
        try {
          const data = JSON.parse(message);
          switch (data.type) {
            case "watch_path": {
              const watchedPaths = watchingClients.get(ws);
              if (watchedPaths && data.path && !watchedPaths.has(data.path)) {
                watcher.watch(data.path);
                watchedPaths.add(data.path);
              }
              break;
            }
            case "unwatch_path": {
              const watchedPaths = watchingClients.get(ws);
              if (watchedPaths && data.path && watchedPaths.has(data.path)) {
                watcher.unwatch(data.path);
                watchedPaths.delete(data.path);
              }
              break;
            }
          }
        } catch (e) {
          console.error(
            "[ws] Error parsing message from file watching client:",
            e
          );
        }
      });

      ws.on("close", () => {
        console.log("[ws] File watching client disconnected.");
        const watchedPaths = watchingClients.get(ws);
        if (watchedPaths) {
          for (const path of watchedPaths) {
            watcher.unwatch(path);
          }
        }
        watchingClients.delete(ws);
      });

      ws.on("error", (error) =>
        console.error("[ws] File watching client error:", error)
      );
    }
  });

  console.log("[ws] WebSocket server initialized.");
  return wss;
}
