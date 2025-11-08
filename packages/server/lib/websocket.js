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
  getAllZipEntriesRecursive,
  extractFilesFromZip,
  getDirTotalSizeInZip,
  getAllFilesAndDirsRecursive,
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
  activeCopyPathsJobs,
  activeZipOperations,
  activeTerminalJobs
) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const jobId = url.searchParams.get("jobId");
    const jobType = url.searchParams.get("type");

    if (jobId) {
      let jobMap;
      let isZipOperation = false; // Flag to identify zip operations handled by activeZipOperations

      // Determine jobMap and if it's a generic zip operation
      switch (jobType) {
        case "size":
          jobMap = activeSizeJobs;
          break;
        case "compress":
          jobMap = activeCompressJobs;
          break;
        case "decompress":
          jobMap = activeDecompressJobs;
          break;
        case "archive-test":
          jobMap = activeArchiveTestJobs;
          break;
        case "duplicate":
          jobMap = activeDuplicateJobs;
          break;
        case "copy-paths":
          jobMap = activeCopyPathsJobs;
          break;
        case "rename-in-zip":
        case "delete-in-zip":
        case "create-file-in-zip":
        case "create-folder-in-zip":
        case "update-file-in-zip":
          jobMap = activeZipOperations;
          isZipOperation = true;
          break;
        case "terminal":
          jobMap = activeTerminalJobs;
          break;
        default:
          jobMap = activeCopyJobs;
          break;
      }

      if (jobMap.has(jobId)) {
        const job = jobMap.get(jobId);
        if (job) {
          job.ws = ws;
        }
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
          } else if (jobType === "terminal") {
            const job = activeTerminalJobs.get(jobId);
            if (job && job.ptyProcess) {
              const term = job.ptyProcess;
              if (data.type === "resize") {
                term.resize(data.cols, data.rows);
              } else if (data.type === "data") {
                // Write to the child process stdin
                term.write(data.data);

                // If this is the non-PTY fallback, echo typed characters
                // back to the client so they appear immediately in the
                // terminal UI (the shell may not echo when not attached to
                // a real TTY).
                try {
                  if (term.isPty === false && job.ws && job.ws.readyState === 1) {
                    // send raw data so the renderer's onmessage will treat
                    // it as terminal output and render it
                    job.ws.send(data.data);
                  }
                } catch (e) {
                  // ignore send errors
                }
              }
            }
          }
        });

        // --- Handle generic zip operations ---
        if (isZipOperation) {
          (async () => {
            let progressInterval;
            try {
              job.status = "running";

              // Wait for the WebSocket to be connected (important!)
              await new Promise((resolve) => {
                if (job.ws && job.ws.readyState === 1) {
                  resolve();
                } else {
                  const interval = setInterval(() => {
                    if (job.ws && job.ws.readyState === 1) {
                      clearInterval(interval);
                      resolve();
                    }
                  }, 50);
                }
              });

              if (job.ws && job.ws.readyState === 1) {
                job.ws.send(
                  JSON.stringify({
                    type: "start",
                    totalSize: job.totalBytes,
                    originalZipSize: job.originalZipSize,
                  })
                );
              }

              job.lastProcessedBytes = 0;
              job.lastUpdateTime = Date.now();
              job.tempZipSize = 0;

              progressInterval = setInterval(async () => {
                if (job.ws && job.ws.readyState === 1) {
                  // Get current size of the temporary zip file
                  let currentTempSize = 0;
                  if (
                    job.tempZipPath &&
                    (await fse.pathExists(job.tempZipPath))
                  ) {
                    try {
                      const stats = await fse.stat(job.tempZipPath);
                      currentTempSize = stats.size;
                    } catch (statError) {
                      console.warn(
                        `[Job ${jobId}] Error stating temp file ${job.tempZipPath}:`,
                        statError.message
                      );
                    }
                  }
                  job.tempZipSize = currentTempSize;

                  // Send progress update including tempZipSize
                  job.ws.send(
                    JSON.stringify({
                      type: "progress",
                      tempZipSize: job.tempZipSize,
                      originalZipSize: job.originalZipSize,
                      currentFile: job.currentFile,
                      processed: job.processedBytes, // Assuming processedBytes is updated elsewhere
                      total: job.totalBytes,
                    })
                  );

                  job.lastProcessedBytes = job.processedBytes; // Update based on actual progress if tracked
                  job.lastUpdateTime = Date.now();
                } else {
                  // If WebSocket is closed, clear interval
                  clearInterval(progressInterval);
                }
              }, 250); // Send updates every 250ms

              // Await the completion promise set up in fileRoutes.js
              if (job.completionPromise) {
                job.controller.signal.addEventListener("abort", () => {
                  console.log(
                    "[websocket] Abort signal received for job:",
                    job.id
                  );
                  if (job.rejectCompletion) {
                    job.rejectCompletion(new Error("Zip operation cancelled."));
                  }
                });
                await job.completionPromise;
              } else {
                console.warn(
                  `[Job ${jobId}] No completionPromise found for job type ${jobType}`
                );
                // Handle cases where completionPromise might not be set (though it should be for async zip ops)
              }

              job.status = "completed";
              if (job.ws && job.ws.readyState === 1) {
                job.ws.send(JSON.stringify({ type: "complete" }));
                job.ws.close(1000, "Job Completed");
              }
            } catch (error) {
              console.error(`[Job ${jobId}] Zip operation failed:`, error);
              clearInterval(progressInterval); // Stop interval on error
              if (job.status !== "cancelled") job.status = "failed";
              if (job.ws && job.ws.readyState === 1) {
                const type = job.status === "cancelled" ? "cancelled" : "error";
                job.ws.send(
                  JSON.stringify({
                    type,
                    message: error.message || "Zip operation failed.",
                  })
                );
                job.ws.close(1000, `Job finished with status: ${type}`);
              }
            } finally {
              clearInterval(progressInterval); // Ensure interval is cleared
              // Only delete the job after a delay if it finished (completed, failed, cancelled)
              if (
                job.status === "completed" ||
                job.status === "failed" ||
                job.status === "cancelled"
              ) {
                console.log(`[Job ${jobId}] Scheduling deletion for job.`);
                setTimeout(() => {
                  console.log(
                    `[Job ${jobId}] Deleting job from activeZipOperations.`
                  );
                  activeZipOperations.delete(jobId);
                }, 5000); // Delay deletion
              } else {
                console.warn(
                  `[Job ${jobId}] Job status is ${job.status}, not scheduling deletion.`
                );
              }
            }
          })();
        } else if (jobType === "copy" || jobType === "duplicate") {
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

                const originalZipSize = (await fse.pathExists(zipFilePath))
                  ? (await fse.stat(zipFilePath)).size
                  : 0;
                job.originalZipSize = originalZipSize;

                let totalNewBytes = 0;
                const filesToProcess = [];
                const emptyDirsToAdd = [];

                for (const sourcePath of sources) {
                  if (job.controller.signal.aborted)
                    throw new Error("Scan cancelled");
                  const stats = await fse.stat(sourcePath);
                  const basePath = path.dirname(sourcePath);

                  if (stats.isDirectory()) {
                    const { files, dirs } = await getAllFilesAndDirsRecursive(
                      sourcePath,
                      basePath
                    );
                    filesToProcess.push(...files);
                    emptyDirsToAdd.push(...dirs);
                  } else {
                    filesToProcess.push({
                      fullPath: sourcePath,
                      relativePath: path.relative(basePath, sourcePath),
                      stats,
                    });
                  }
                }

                // Calculate totalNewBytes from filesToProcess
                for (const file of filesToProcess) {
                  totalNewBytes += file.stats.size;
                }

                job.filesToProcess = filesToProcess;
                job.emptyDirsToAdd = emptyDirsToAdd;

                job.total = totalNewBytes;
                job.copied = 0;
                job.status = "copying";
                job.lastProcessedBytes = 0;
                job.lastUpdateTime = Date.now();
                job.tempZipSize = 0;

                ws.send(
                  JSON.stringify({ type: "scan_complete", total: job.total })
                );

                progressInterval = setInterval(async () => {
                  if (ws.readyState === 1) {
                    const currentTime = Date.now();
                    const timeElapsed = Math.max(
                      1,
                      currentTime - job.lastUpdateTime
                    );
                    const bytesSinceLastUpdate =
                      job.copied - job.lastProcessedBytes;
                    const instantaneousSpeed =
                      (bytesSinceLastUpdate / timeElapsed) * 1000; // Convert to bytes/second

                    const displaySpeed =
                      isNaN(instantaneousSpeed) || !isFinite(instantaneousSpeed)
                        ? 0
                        : instantaneousSpeed;

                    // Get current size of the temporary zip file
                    if (
                      job.tempZipPath &&
                      (await fse.pathExists(job.tempZipPath))
                    ) {
                      const stats = await fse.stat(job.tempZipPath);
                      job.tempZipSize = stats.size;
                    }

                    ws.send(
                      JSON.stringify({
                        type: "progress",
                        copied: job.copied,
                        total: job.total,
                        currentFile: job.currentFile,
                        currentFileBytesProcessed:
                          job.currentFileBytesProcessed,
                        currentFileSize: job.currentFileTotalSize,
                        instantaneousSpeed: displaySpeed,
                        tempZipSize: job.tempZipSize,
                        originalZipSize: job.originalZipSize,
                      })
                    );

                    job.lastProcessedBytes = job.copied;
                    job.lastUpdateTime = currentTime;
                  }
                }, 250);

                const result = await addFilesToZip(zipFilePath, pathInZip, job);

                // If addFilesToZip returned early (e.g., all skipped), it already sent a complete message.
                // In that case, we just need to ensure the WebSocket is closed here if it wasn't already.
                if (result && result.status === "skipped_all") {
                  job.status = "completed"; // Mark job as completed even if skipped
                  if (ws.readyState === 1) {
                    ws.close(1000, "Job Completed - Skipped All");
                  }
                  return; // Exit early from this async IIFE
                }

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

                const filenamesToExtract = new Set();
                let totalUncompressedSize = 0;

                for await (const entry of zipfile) {
                  for (const source of sources) {
                    const inZipPath = matchZipPath(source)[2].substring(1);
                    if (
                      entry.filename === inZipPath ||
                      entry.filename.startsWith(inZipPath + "/")
                    ) {
                      if (!filenamesToExtract.has(entry.filename)) {
                        filenamesToExtract.add(entry.filename);
                        totalUncompressedSize += entry.uncompressedSize;
                      }
                    }
                  }
                }
                await zipfile.close();

                job.filenamesToExtract = Array.from(filenamesToExtract);
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
            // HANDLE FS-to-FS COPY or ZIP DUPLICATION
            (async () => {
              const currentJobType = job.jobType || jobType;
              let progressInterval;

              try {
                if (currentJobType === "duplicate" && job.isZipDuplicate) {
                  job.status = "running"; // Or 'copying', align with how zip ops are tracked

                  // Wait for the WebSocket to be connected (important!)
                  await new Promise((resolve) => {
                    if (job.ws && job.ws.readyState === 1) {
                      resolve();
                    } else {
                      const interval = setInterval(() => {
                        if (job.ws && job.ws.readyState === 1) {
                          clearInterval(interval);
                          resolve();
                        }
                      }, 50);
                    }
                  });

                  // Send initial start/scan message (optional, as progress updates will follow)
                  if (job.ws && job.ws.readyState === 1) {
                    job.ws.send(
                      JSON.stringify({
                        type: "scan_complete",
                        total: job.total || job.originalZipSize,
                      })
                    ); // Estimate
                  }

                  job.lastProcessedBytes = 0; // Use tempZipSize for zip progress instead
                  job.lastUpdateTime = Date.now();
                  job.tempZipSize = 0;

                  // Use progress interval similar to other zip operations
                  progressInterval = setInterval(async () => {
                    if (ws.readyState === 1) {
                      // Get current size of the temporary zip file (if tempZipPath is set by updateFileInZip)
                      let currentTempSize = job.tempZipSize;
                      if (
                        job.tempZipPath &&
                        (await fse.pathExists(job.tempZipPath))
                      ) {
                        try {
                          const stats = await fse.stat(job.tempZipPath);
                          currentTempSize = stats.size;
                          job.tempZipSize = currentTempSize;
                        } catch (statError) {
                          console.warn(
                            `[Job ${jobId}] Error stating temp file ${job.tempZipPath}:`,
                            statError.message
                          );
                        }
                      }

                      // Simplified progress for zip duplicate - focus on temp size change
                      ws.send(
                        JSON.stringify({
                          type: "progress",
                          copied: currentTempSize, // Use temp size as 'copied' progress
                          total: job.total, // Original size as total estimate
                          currentFile: job.currentFile, // Should be updated by duplicateInZip/updateFileInZip
                          // Include other relevant fields if available from job object
                          tempZipSize: currentTempSize,
                          originalZipSize: job.originalZipSize,
                          // Speed calculation might be less meaningful here, could be omitted or based on temp size change
                        })
                      );
                    } else {
                      clearInterval(progressInterval);
                    }
                  }, 250); // Send updates frequently

                  // Await the completion promise set up in fileRoutes.js
                  if (job.completionPromise) {
                    job.controller.signal.addEventListener("abort", () => {
                      if (job.rejectCompletion) {
                        job.rejectCompletion(
                          new Error("Zip duplication cancelled.")
                        );
                      }
                    });
                    await job.completionPromise;
                  } else {
                    console.warn(
                      `[Job ${jobId}] No completionPromise found for zip duplicate job.`
                    );
                    // Handle potential error or assume completion if no promise
                  }

                  job.status = "completed";
                  if (ws.readyState === 1) {
                    ws.send(JSON.stringify({ type: "complete" }));
                    ws.close(1000, "Zip Duplication Completed");
                  }
                } else {
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
                }
              } catch (error) {
                // Generic error handling for both zip and FS duplication
                if (job.status !== "cancelled") {
                  job.status = "failed";
                }
                console.error(
                  `${currentJobType} job ${jobId} failed or was cancelled:`,
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
                const jobMapToClear = activeDuplicateJobs; // Always use duplicate map for this endpoint
                setTimeout(() => {
                  // Deleting job from activeDuplicateJobs
                  jobMapToClear.delete(jobId);
                }, 5000);
              }
            })();
          }
        } else if (jobType === "size") {
          (async () => {
            try {
              const zipPathMatch = matchZipPath(job.folderPath);
              if (zipPathMatch) {
                const zipFilePath = zipPathMatch[1];
                const pathInZip = zipPathMatch[2].startsWith("/")
                  ? zipPathMatch[2].substring(1)
                  : zipPathMatch[2];

                const { totalSize } = await getDirTotalSizeInZip(
                  zipFilePath,
                  pathInZip,
                  job
                );
                job.totalSize = totalSize;

                if (ws.readyState === 1) {
                  ws.send(
                    JSON.stringify({ type: "complete", size: totalSize })
                  );
                  ws.close(1000, "Job Completed");
                }
              } else {
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
                  ws.send(
                    JSON.stringify({ type: "complete", size: totalSize })
                  );
                  ws.close(1000, "Job Completed");
                }
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
        } else if (jobType === "compress") {
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
                  const timeElapsed = Math.max(
                    1,
                    currentTime - job.lastUpdateTime
                  ); // Ensure timeElapsed is at least 1ms to avoid division by zero
                  const bytesSinceLastUpdate =
                    job.compressedBytes - job.lastProcessedBytes;
                  const instantaneousSpeed =
                    (bytesSinceLastUpdate / timeElapsed) * 1000; // Convert to bytes/second

                  // Ensure instantaneousSpeed is a valid number, otherwise default to 0
                  const displaySpeed =
                    isNaN(instantaneousSpeed) || !isFinite(instantaneousSpeed)
                      ? 0
                      : instantaneousSpeed;

                  job.ws.send(
                    JSON.stringify({
                      type: "progress",
                      total: job.totalBytes,
                      processed: job.compressedBytes,
                      currentFile: job.currentFile,
                      currentFileTotalSize: job.currentFileTotalSize,
                      currentFileBytesProcessed: job.currentFileBytesProcessed,
                      instantaneousSpeed: displaySpeed,
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
        } else if (jobType === "decompress") {
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
                  const timeElapsed = Math.max(1, currentTime - lastUpdateTime); // Ensure timeElapsed is at least 1ms to avoid division by zero
                  const bytesSinceLastUpdate =
                    processedBytes - lastProcessedBytes;
                  const instantaneousSpeed =
                    (bytesSinceLastUpdate / timeElapsed) * 1000; // Convert to bytes/second

                  // Ensure instantaneousSpeed is a valid number, otherwise default to 0
                  const displaySpeed =
                    isNaN(instantaneousSpeed) || !isFinite(instantaneousSpeed)
                      ? 0
                      : instantaneousSpeed;

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
                      instantaneousSpeed: displaySpeed,
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
        } else if (jobType === "archive-test") {
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
        } else if (jobType === "copy-paths") {
          (async () => {
            try {
              const allPaths = [];
              let count = 0;
              const visited = new Set(); // Keep track of visited directories for FS recursion

              // Helper for filesystem recursion
              const getPathsRecursiveFS = async (dir) => {
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
                      await getPathsRecursiveFS(fullPath);
                    }
                  }
                } catch (error) {
                  console.error(`Could not read directory: ${dir}`, error);
                  ws.send(
                    JSON.stringify({
                      type: "error",
                      message: `Could not read directory: ${error}`,
                    })
                  );
                }
              };

              if (ws.readyState === 1) {
                ws.send(JSON.stringify({ type: "start" }));
              }

              const zipPathMatch = matchZipPath(job.basePath);

              for (const item of job.items) {
                // Construct the full path differently depending on whether it's in a zip or not
                const fullPath = zipPathMatch
                  ? `${job.basePath}${job.basePath.endsWith("/") ? "" : "/"}${
                      item.name
                    }` // Use posix style for zip paths
                  : path.join(job.basePath, item.name);

                allPaths.push(fullPath);
                count++;
                if (ws.readyState === 1) {
                  ws.send(
                    JSON.stringify({ type: "progress", path: fullPath, count })
                  );
                }

                if (job.includeSubfolders && item.type === "folder") {
                  if (zipPathMatch) {
                    const zipFilePath = zipPathMatch[1];
                    // Ensure pathInZip starts correctly relative to the zip root
                    const pathInZip = fullPath.substring(
                      zipFilePath.length + 1
                    );
                    await getAllZipEntriesRecursive(
                      zipFilePath,
                      pathInZip,
                      job,
                      allPaths,
                      (newCount) => {
                        count = newCount;
                      }
                    );
                  } else {
                    await getPathsRecursiveFS(fullPath);
                  }
                }
              }

              // Formatting happens *after* collecting all paths
              const formattedPaths = job.isAbsolute
                ? allPaths
                : allPaths.map((p) => {
                    // Adjust relative path calculation for zip entries
                    if (zipPathMatch && p.startsWith(job.basePath)) {
                      // Make relative to the *initial base path within the zip*
                      const zipBaseDirInZip = job.basePath.substring(
                        zipPathMatch[1].length + 1
                      );
                      const itemPathInZip = p.substring(
                        zipPathMatch[1].length + 1
                      );
                      return path.posix.relative(
                        zipBaseDirInZip,
                        itemPathInZip
                      );
                    }
                    return path.relative(job.basePath, p);
                  });

              if (ws.readyState === 1) {
                ws.send(
                  JSON.stringify({ type: "complete", paths: formattedPaths })
                );
                ws.close(1000, "Job Completed");
              }
            } catch (error) {
              if (ws.readyState !== 1) return;
              if (job.status !== "cancelled") job.status = "failed";
              console.error(`Copy paths job ${jobId} failed:`, error);
              ws.send(
                JSON.stringify({ type: "error", message: error.message })
              );
              ws.close(1000, `Job finished with status: error`);
            } finally {
              setTimeout(() => activeCopyPathsJobs.delete(jobId), 5000);
            }
          })();
        } else if (jobType === "terminal") {
          const job = activeTerminalJobs.get(jobId);
          if (job && job.ptyProcess) {
            const term = job.ptyProcess;
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: "cwd", data: job.initialCwd }));
            }

            term.on("data", (data) => {
              if (ws.readyState === 1) {
                ws.send(data);
              }
            });

            ws.on("close", () => {
              term.kill();
              activeTerminalJobs.delete(jobId);
            });

            term.on("exit", (code, signal) => {
              console.log(
                `[pty] Process for job ${jobId} exited with code ${code} and signal ${signal}`
              );
              if (ws.readyState === 1) {
                ws.send(JSON.stringify({ type: "exit", code, signal })); // Inform frontend
                ws.close(1000, "Terminal process exited"); // Close WebSocket
              }
              activeTerminalJobs.delete(jobId);
            });
          } else {
            console.warn(`[ws] No terminal found for job ID: ${jobId}`);
            ws.close();
          }
        }

        ws.on("close", async () => {
          console.log(`[ws] Client disconnected for ${jobType} job: ${jobId}`);
          if (job.ws === ws) job.ws = null;

          if (jobType === "terminal") {
            const job = activeTerminalJobs.get(jobId);
            if (job && job.ptyProcess) {
              job.ptyProcess.kill();
              activeTerminalJobs.delete(jobId);
            }
          }

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
          // Ensure zip operations clean up correctly on close
          if (isZipOperation && jobMap.has(jobId)) {
            const zipJob = jobMap.get(jobId);
            if (
              zipJob &&
              zipJob.status !== "completed" &&
              zipJob.status !== "failed" &&
              zipJob.status !== "cancelled"
            ) {
              console.log(
                `[Job ${jobId}] WS closed unexpectedly, attempting cancellation.`
              );
              zipJob.status = "cancelled";
              if (zipJob.controller) {
                zipJob.controller.abort();
              }
              // Remove temp file if path exists
              if (
                zipJob.tempZipPath &&
                (await fse.pathExists(zipJob.tempZipPath))
              ) {
                await fse
                  .remove(zipJob.tempZipPath)
                  .catch((err) =>
                    console.error(
                      `Error removing temp zip ${zipJob.tempZipPath}:`,
                      err
                    )
                  );
              }
              // Schedule deletion even on unexpected close
              setTimeout(() => {
                console.log(
                  `[Job ${jobId}] Deleting job due to unexpected WS close.`
                );
                activeZipOperations.delete(jobId);
              }, 5000);
            }
          }
        });

        ws.on("error", (error) => {
          console.error(`[ws] WebSocket error for job ${jobId}:`, error);
          if (isZipOperation && jobMap.has(jobId)) {
            const zipJob = jobMap.get(jobId);
            if (
              zipJob &&
              zipJob.status !== "completed" &&
              zipJob.status !== "failed"
            ) {
              zipJob.status = "failed"; // Mark as failed due to WS error
              if (zipJob.controller) {
                zipJob.controller.abort(); // Attempt to stop underlying operation
              }
              // Schedule deletion on error
              setTimeout(() => {
                console.log(`[Job ${jobId}] Deleting job due to WS error.`);
                activeZipOperations.delete(jobId);
              }, 5000);
            }
          }
        });
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
