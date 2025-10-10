import { WebSocketServer } from "ws";
import path from "path";
import fse from "fs-extra";

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
  activeCompressJobs
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
                const bytesSinceLastUpdate = job.compressedBytes - job.lastProcessedBytes;
                const instantaneousSpeed = timeElapsed > 0 ? bytesSinceLastUpdate / timeElapsed : 0;

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

