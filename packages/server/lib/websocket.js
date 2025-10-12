import { WebSocketServer } from "ws";
import path from "path";
import fse from "fs-extra";
import yauzl from "yauzl";
import { pipeline } from "stream";
import { Writable } from "stream";

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
        yauzl.open(job.source, { lazyEntries: true }, (err, zipfile) => {
          if (err) {
            if (ws.readyState === 1) {
              ws.send(
                JSON.stringify({
                  type: "failed",
                  title: "Could not open archive.",
                  details: err.message,
                })
              );
              ws.close();
            }
            return;
          }

          job.zipfile = zipfile;
          job.currentWriteStream = null;

          const totalUncompressedSize = zipfile.fileSize;
          let processedBytes = 0;
          let lastUpdateTime = Date.now();
          let lastProcessedBytes = 0;

          if (ws.readyState === 1) {
            ws.send(
              JSON.stringify({
                type: "start",
                totalSize: totalUncompressedSize,
              })
            );
          }

          zipfile.on("error", (err) => {
            console.error(`[ws:${jobId}] Decompression archive error:`, err);
            if (ws.readyState === 1) {
              ws.send(
                JSON.stringify({
                  type: "failed",
                  title: "Archive processing error.",
                  details: err.message,
                })
              );
              ws.close();
            }
          });

          zipfile.on("close", async () => {
            console.log(`[ws:${jobId}] Zipfile closed.`);
            if (job.ws && job.ws.readyState === 1) {
              job.ws.close();
            }
          });

          zipfile.on("entry", (entry) => {
            if (job.status === "cancelled") return;

            const destPath = path.join(job.destination, entry.fileName);

            if (/\/$/.test(entry.fileName)) {
              fse.mkdirpSync(destPath);
              // Set modification time for directories
              fse.utimes(
                destPath,
                entry.getLastModDate(),
                entry.getLastModDate(),
                (err) => {
                  if (err)
                    console.error(
                      `[ws:${jobId}] Error setting mtime for directory ${destPath}:`,
                      err
                    );
                }
              );
              processedBytes += entry.uncompressedSize;
              zipfile.readEntry();
            } else {
              zipfile.openReadStream(entry, (err, readStream) => {
                if (err) {
                  console.error(
                    `[ws:${jobId}] Error opening read stream for ${entry.fileName}:`,
                    err
                  );
                  zipfile.readEntry();
                  return;
                }
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
                        currentFile: entry.fileName,
                        currentFileTotalSize: entry.uncompressedSize,
                        currentFileBytesProcessed: currentFileBytesProcessed,
                        instantaneousSpeed: instantaneousSpeed,
                      })
                    );
                  }

                  lastProcessedBytes = processedBytes;
                  lastUpdateTime = currentTime;
                });

                readStream.on("end", () => {
                  zipfile.readEntry();
                });

                readStream.on("error", (readErr) => {
                  console.error(
                    `[ws:${jobId}] Read stream error for ${entry.fileName}:`,
                    readErr
                  );
                });

                writeStream.on("close", async () => {
                  // Set modification time for files after writing
                  if (job.status !== "cancelled") {
                    fse.utimes(
                      destPath,
                      entry.getLastModDate(),
                      entry.getLastModDate(),
                      (err) => {
                        if (err)
                          console.error(
                            `[ws:${jobId}] Error setting mtime for file ${destPath}:`,
                            err
                          );
                      }
                    );
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
                });

                writeStream.on("error", (writeErr) => {
                  console.error(
                    `[ws:${jobId}] Write stream error for ${destPath}:`,
                    writeErr
                  );
                });

                readStream.pipe(writeStream);
              });
            }
          });

          zipfile.on("end", () => {
            if (job.status !== "cancelled" && ws.readyState === 1) {
              ws.send(JSON.stringify({ type: "complete" }));
              ws.close();
            }
          });

          zipfile.readEntry();
        });
      }

      if (jobType === "archive-test") {
        yauzl.open(job.source, { lazyEntries: true }, (err, zipfile) => {
          if (err) {
            if (ws.readyState === 1) {
              ws.send(
                JSON.stringify({
                  type: "failed",
                  title: "Failed to open archive",
                  details: err.message,
                })
              );
              ws.close();
            }
            return;
          }
          job.zipfile = zipfile;
          let testedFiles = 0;
          const failedFiles = [];
          let generalError = null;
          const totalFiles = zipfile.entryCount;
          let jobComplete = false;

          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: "start", totalFiles: totalFiles }));
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

          zipfile.on("entry", (entry) => {
            console.log(`[ws:${jobId}] Testing entry: ${entry.fileName}`);
            if (job.status === "cancelled") {
              zipfile.close();
              return;
            }

            testedFiles++;
            let displayFileName = entry.fileName;
            // Basic check for malformed filenames (e.g., non-printable characters)
            if (!/^[ -~]*$/.test(entry.fileName)) {
              displayFileName = `(corrupt filename: ${entry.fileName.substring(
                0,
                20
              )}...)`;
            }

            if (ws.readyState === 1) {
              ws.send(
                JSON.stringify({
                  type: "progress",
                  testedFiles,
                  currentFile: displayFileName,
                })
              );
            }

            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) {
                console.error(
                  `[ws:${jobId}] Error opening stream for ${entry.fileName}:`,
                  err
                );
                failedFiles.push({
                  fileName: entry.fileName,
                  message: `Error opening stream: ${err.message}`,
                });
                zipfile.readEntry();
                return;
              }

              const done = (streamErr) => {
                if (streamErr) {
                  console.error(
                    `[ws:${jobId}] Stream error for ${entry.fileName}:`,
                    streamErr
                  );
                  failedFiles.push({
                    fileName: entry.fileName,
                    message: streamErr.message,
                  });
                }
                console.log(
                  `[ws:${jobId}] Finished processing ${entry.fileName}, requesting next entry.`
                );
                zipfile.readEntry();
              };

              readStream.on("error", done);
              readStream.on("end", () => done());

              const nullStream = new NullWritable();
              pipeline(readStream, nullStream, (err) => {
                if (err) {
                  // pipeline will automatically destroy streams on error
                  done(err);
                } else {
                  // Stream finished successfully
                  done();
                }
              });
            });
          });

          zipfile.on("end", () => {
            console.log(`[ws:${jobId}] Reached end of archive.`);
            sendCompletionReport();
          });

          zipfile.on("error", (err) => {
            console.error(`[ws:${jobId}] General archive error:`, err);
            generalError = err.message;
            sendCompletionReport(); // Send completion report with general error
          });

          console.log(`[ws:${jobId}] Starting to read entries.`);
          zipfile.readEntry();
        });
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
          if (job.zipfile && !job.zipfile.isOpen) {
            console.log(`[ws:${jobId}] Client disconnected, closing zipfile.`);
            job.zipfile.close();
          }
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
