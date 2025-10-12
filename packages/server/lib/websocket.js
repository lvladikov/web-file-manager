import { WebSocketServer } from "ws";
import path from "path";
import fse from "fs-extra";
import { open } from "yauzl-promise";
import { pipeline, Writable, Readable } from "stream";

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
} from "./utils.js";

export function initializeWebSocketServer(
  server,
  activeCopyJobs,
  activeSizeJobs,
  activeCompressJobs,
  activeDecompressJobs,
  activeArchiveTestJobs
) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const jobId = url.searchParams.get("jobId");
    const jobType = url.searchParams.get("type");

    let jobMap;
    if (jobType === "size") {
      jobMap = activeSizeJobs;
    } else if (jobType === "compress") {
      jobMap = activeCompressJobs;
    } else if (jobType === "decompress") {
      jobMap = activeDecompressJobs;
    } else if (jobType === "archive-test") {
      jobMap = activeArchiveTestJobs;
    } else {
      // Default to copy if not specified or unknown
      jobMap = activeCopyJobs;
    }

    if (jobId && jobMap.has(jobId)) {
      const job = jobMap.get(jobId);
      job.ws = ws;
      console.log(`[ws] Client connected for ${jobType} job: ${jobId}`);

      ws.on("message", (message) => {
        const data = JSON.parse(message);
        if (data.type === "overwrite_response") {
          if (data.decision === "cancel") {
            performCopyCancellation(job);
          } else if (job.resolveOverwrite) {
            job.overwriteDecision = data.decision;
            job.resolveOverwrite();
          }
        }
      });

      if (jobType === "copy") {
        (async () => {
          try {
            job.status = "scanning";
            ws.send(JSON.stringify({ type: "scan_start" }));

            let totalSize = 0;
            for (const sourcePath of job.sources) {
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

            for (const sourcePath of job.sources) {
              const destPath = path.join(
                job.destination,
                path.basename(sourcePath)
              );
              await copyWithProgress(sourcePath, destPath, job);
            }

            job.status = "completed";
            ws.send(JSON.stringify({ type: "complete" }));
            ws.close(1000, "Job Completed");
          } catch (error) {
            // If the status was set to 'cancelled', don't mark it as 'failed'.
            if (job.status !== "cancelled") {
              job.status = "failed";
            }

            console.error(
              `Copy job ${jobId} failed or was cancelled:`,
              error.message
            );

            if (ws.readyState === 1) {
              // Determine the correct message type to send back to the client.
              const type = job.status === "cancelled" ? "cancelled" : "error";
              ws.send(JSON.stringify({ type, message: error.message }));
              // Close the connection gracefully with a normal (1000) code.
              ws.close(1000, `Job finished with status: ${type}`);
            }
          } finally {
            setTimeout(() => activeCopyJobs.delete(jobId), 5000);
          }
        })();
      }

      if (jobType === "size") {
        (async () => {
          try {
            // First, calculate the total size without sending progress updates
            const totalSize = await getDirTotalSize(
              job.folderPath,
              job.controller.signal
            );
            job.totalSize = totalSize; // Store total size in the job object

            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: "start", totalSize: totalSize }));
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
        console.log(`[ws] Entering compress job block for job: ${jobId}`);
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
                const timeElapsed = (currentTime - job.lastUpdateTime) / 1000; // in seconds
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
                job.currentFileBytesProcessed = 0; // Reset for the new file

                const stream = fse.createReadStream(file.fullPath);
                stream.on("data", (chunk) => {
                  job.currentFileBytesProcessed += chunk.length;
                  job.compressedBytes += chunk.length;
                });
                stream.on("error", reject); // Handle read stream errors

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
          try {
            zipfile = await open(job.source);
            job.zipfile = zipfile;
            job.currentWriteStream = null;

            let totalUncompressedSize = 0;
            let totalFiles = 0;
            for await (const entry of zipfile) {
              totalUncompressedSize += entry.uncompressedSize;
              if (!entry.filename.endsWith("/")) {
                totalFiles++;
              }
            }
            // Re-open the zipfile to reset the entry stream for actual decompression
            zipfile = await open(job.source);
            job.zipfile = zipfile;

            let processedBytes = 0;
            let processedFiles = 0;
            let lastUpdateTime = Date.now();
            let lastProcessedBytes = 0;

            if (ws.readyState === 1) {
              ws.send(
                JSON.stringify({
                  type: "start",
                  totalSize: totalUncompressedSize,
                  totalFiles: totalFiles,
                })
              );
            }

            for await (const entry of zipfile) {
              if (job.status === "cancelled") {
                break; // Exit loop if cancelled
              }

              const destPath = path.join(job.destination, entry.filename);

              if (entry.filename.endsWith("/")) {
                fse.mkdirpSync(destPath);
                // Set modification time for directories
                let mtime;
                try {
                  mtime = entry.getLastMod();
                  if (isNaN(mtime.getTime())) {
                    // If getLastMod() returns an invalid date, use current date as fallback
                    console.warn(
                      `[ws:${jobId}] Invalid modification date for ${entry.filename}. Using current date.`
                    );
                    mtime = new Date();
                  }
                } catch (dateError) {
                  console.error(
                    `[ws:${jobId}] Error getting modification date for ${entry.filename}:`,
                    dateError
                  );
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
                processedFiles++; // Increment processed files for actual files
                try {
                  const readStream = await entry.openReadStream();
                  job.currentReadStream = readStream;

                  fse.mkdirpSync(path.dirname(destPath));
                  const writeStream = fse.createWriteStream(destPath);
                  job.currentWriteStream = writeStream;

                  let currentFileBytesProcessed = 0;

                  readStream.on("data", (chunk) => {
                    processedBytes += chunk.length;
                    currentFileBytesProcessed += chunk.length;
                    const currentTime = Date.now();
                    const timeElapsed = (currentTime - lastUpdateTime) / 1000;
                    const bytesSinceLastUpdate =
                      processedBytes - lastProcessedBytes;
                    const instantaneousSpeed =
                      timeElapsed > 0 ? bytesSinceLastUpdate / timeElapsed : 0;

                    if (ws.readyState === 1) {
                      ws.send(
                        JSON.stringify({
                          type: "progress",
                          total: totalUncompressedSize,
                          processed: processedBytes,
                          totalFiles: totalFiles,
                          processedFiles: processedFiles,
                          currentFile: entry.filename,
                          currentFileTotalSize: entry.uncompressedSize,
                          currentFileBytesProcessed: currentFileBytesProcessed,
                          instantaneousSpeed: instantaneousSpeed,
                        })
                      );
                    }

                    lastProcessedBytes = processedBytes;
                    lastUpdateTime = currentTime;
                  });

                  readStream.on("error", (readErr) => {
                    console.error(
                      `[ws:${jobId}] Read stream error for ${entry.filename}:`,
                      readErr
                    );
                  });

                  await new Promise((resolve, reject) => {
                    readStream.on("error", reject);
                    writeStream.on("error", reject);
                    writeStream.on("close", async () => {
                      // Set modification time for files after writing
                      if (job.status !== "cancelled") {
                        let mtime;
                        try {
                          mtime = entry.getLastMod();
                          if (isNaN(mtime.getTime())) {
                            // If getLastMod() returns an invalid date, use current date as fallback
                            console.warn(
                              `[ws:${jobId}] Invalid modification date for ${entry.filename}. Using current date.`
                            );
                            mtime = new Date();
                          }
                        } catch (dateError) {
                          console.error(
                            `[ws:${jobId}] Error getting modification date for ${entry.filename}:`,
                            dateError
                          );
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
                      if (job.status === "cancelled") {
                        console.log(
                          `[ws:${jobId}] Write stream closed for cancelled file. Cleaning up: ${destPath}`
                        );
                        try {
                          if (await fse.pathExists(destPath)) {
                            await fse.remove(destPath);
                            console.log(
                              `[ws:${jobId}] Successfully cleaned up partial file.`
                            );
                          }
                        } catch (cleanupError) {
                          console.error(
                            `[ws:${jobId}] Error during cleanup of partial file:`,
                            cleanupError
                          );
                        }
                      }
                      resolve();
                    });

                    // Handle cancellation
                    job.controller.signal.onabort = () => {
                      readStream.destroy();
                      writeStream.destroy();
                      reject(new Error("Decompression cancelled"));
                    };

                    readStream.pipe(writeStream);
                  });
                } catch (streamError) {
                  if (streamError.message === "Decompression cancelled") {
                    console.log(
                      `[ws:${jobId}] Decompression of entry ${entry.filename} cancelled.`
                    );
                    // Do not re-throw or log as an error, just resolve to continue loop or break.
                  } else {
                    console.error(
                      `[ws:${jobId}] Error processing entry ${entry.filename}:`,
                      streamError
                    );
                    // Handle other errors, perhaps send a failed status to client
                  }
                }
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
            if (zipfile) {
              zipfile.close();
            }
          }
        })();
      }

      if (jobType === "archive-test") {
        (async () => {
          let zipfile;
          let testedFiles = 0;
          const failedFiles = [];
          let generalError = null;
          let totalFiles = 0; // Initialize totalFiles here
          let jobComplete = false;

          try {
            zipfile = await open(job.source);
            job.zipfile = zipfile;
            totalFiles = zipfile.entryCount; // Assign value here

            if (ws.readyState === 1) {
              ws.send(
                JSON.stringify({ type: "start", totalFiles: totalFiles })
              );
            }

            const sendCompletionReport = () => {
              if (jobComplete || ws.readyState !== 1) return;
              jobComplete = true;
              console.log(`[ws:${jobId}] Sending completion report.`);
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

            for await (const entry of zipfile) {
              if (job.status === "cancelled") {
                break; // Exit loop if cancelled
              }

              testedFiles++;
              let displayFileName = entry.filename; // Send full filename

              if (ws.readyState === 1) {
                ws.send(
                  JSON.stringify({
                    type: "progress",
                    testedFiles,
                    currentFile: displayFileName,
                  })
                );
              }

              try {
                const readStream = await entry.openReadStream();
                const nullStream = new NullWritable();

                await new Promise((resolve, reject) => {
                  readStream.on("error", reject);
                  nullStream.on("error", reject);
                  nullStream.on("finish", resolve);

                  // Handle cancellation
                  job.controller.signal.onabort = () => {
                    readStream.destroy();
                    nullStream.destroy();
                    reject(new Error("Archive test cancelled"));
                  };

                  readStream.pipe(nullStream);
                });
              } catch (streamErr) {
                console.error(
                  `[ws:${jobId}] Stream error for ${entry.filename}:`,
                  streamErr
                );
                failedFiles.push({
                  fileName: entry.filename,
                  message: streamErr.message,
                });
              }
            }

            console.log(`[ws:${jobId}] Reached end of archive.`);
            sendCompletionReport();
          } catch (error) {
            console.error(`[ws:${jobId}] General archive error:`, error);
            generalError = error.message;
            if (ws.readyState === 1) {
              try {
                ws.send(
                  JSON.stringify({
                    type: "failed",
                    title: "Failed to open or process archive",
                    details: error.message,
                  })
                );
              } catch (sendError) {
                console.error(
                  `[ws:${jobId}] Error sending failed status to client:`,
                  sendError
                );
              }
              ws.close();
            }
          } finally {
            if (zipfile) {
              zipfile.close();
            }
          }
        })();
      }

      ws.on("close", async () => {
        console.log(`[ws] Client disconnected for job: ${jobId}`);
        if (job.ws === ws) job.ws = null;

        // If a compress job is still running and the client disconnects, mark it as cancelled
        if (
          jobType === "compress" &&
          job.status !== "completed" &&
          job.status !== "failed"
        ) {
          job.status = "cancelled";
          if (job.archive) {
            job.archive.destroy(); // Destroy the archiver stream, which also destroys its piped destination
          }
          // Delete the partial archive immediately upon cancellation
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
          // The zipfile.close() is handled in the finally block of the job itself.
          // No need to close it here again, as it might be in progress.
        }
      });

      ws.on("error", (error) =>
        console.error(`[ws] WebSocket error for job ${jobId}:`, error)
      );
    } else {
      console.warn(`[ws] Connection rejected for invalid job ID: ${jobId}`);
      ws.close();
    }
  });

  console.log("[ws] WebSocket server initialized.");
  return wss;
}
