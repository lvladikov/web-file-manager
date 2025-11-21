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
import {
  getAndRemovePromptResolver,
  unregisterPromptResolver,
  unregisterAllForJob,
  registerPromptResolver,
  registerPromptMeta,
  ensureInstrumentedResolversMap,
  countRegistry,
} from "./prompt-registry.js";
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
  wss.on("error", (err) => {
    console.error(`[ws] WebSocketServer error: ${err && (err.message || err)}`);
  });

  async function safeCloseJobWs(job, code = 1000, reason = "") {
    try {
      if (!job) return;
      // Wait for any pending prompt resolvers to resolve before closing the WS
      const start = Date.now();
      const timeoutMs = 30000; // 30s max wait
      while (
        job.overwriteResolversMap &&
        job.overwriteResolversMap.size > 0 &&
        Date.now() - start < timeoutMs
      ) {
        console.log(
          `[ws] safeCloseJobWs waiting for ${
            job.overwriteResolversMap.size
          } pending overwrite prompts for job ${job.id} trace=${
            job._traceId ?? "n/a"
          }`
        );
        // wait briefly
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (job.overwriteResolversMap && job.overwriteResolversMap.size > 0) {
        console.warn(
          `[ws] safeCloseJobWs timed out waiting for overwrite prompts to clear for job ${
            job.id
          } trace=${job._traceId ?? "n/a"}`
        );
      }
      if (job.ws && job.ws.readyState === 1) {
        try {
          job.ws.close(code, reason);
          console.log(
            `[ws] safeCloseJobWs closed job ${job.id} with code=${code} reason='${reason}'`
          );
        } catch (e) {
          console.warn(
            `[ws] safeCloseJobWs failed to close socket for job ${job.id}: ${e.message}`
          );
        }
      }
    } catch (e) {
      console.warn(
        `[ws] safeCloseJobWs exception for job ${job?.id}: ${e.message}`
      );
    }
  }

  wss.on("connection", (ws, req) => {
    function getJobById(id) {
      const maps = [
        activeCopyJobs,
        activeSizeJobs,
        activeCompressJobs,
        activeDecompressJobs,
        activeArchiveTestJobs,
        activeDuplicateJobs,
        activeCopyPathsJobs,
        activeZipOperations,
        activeTerminalJobs,
      ];
      for (const m of maps) {
        try {
          if (m && typeof m.has === "function" && m.has(id)) return m.get(id);
        } catch (e) {
          // ignore
        }
      }
      return null;
    }
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
          // Add terminal-specific runtime state
          job.ws = ws;
          job.pendingWrites = job.pendingWrites || [];
          job.ready = job.ready || false; // will be set true upon first child stdout
        }
        console.log(
          `[ws] Client connected for ${jobType} job: ${jobId} trace=${
            job?._traceId ?? "n/a"
          }`
        );

        ws.on("error", (err) => {
          console.error(
            `[ws] WebSocket error for ${jobType} job ${jobId} trace=${
              job?._traceId ?? "n/a"
            }:`,
            err && (err.message || err)
          );
        });

        ws.on("message", (message) => {
          try {
            console.log(
              `[ws] Received raw message for job ${jobId}: ${message}`
            );
            const data = JSON.parse(message);
            if (data.type === "overwrite_response") {
              console.log(
                `[ws] overwrite_response received for job ${jobId} trace=${
                  job?._traceId ?? "n/a"
                }: decision=${data.decision} promptId=${
                  data.promptId || "n/a"
                } currentStatus=${job?.status} overwriteResolversMap.size=${
                  job?.overwriteResolversMap
                    ? job.overwriteResolversMap.size
                    : 0
                } overwriteResolvers.length=${
                  Array.isArray(job?.overwriteResolvers)
                    ? job.overwriteResolvers.length
                    : 0
                }`
              );
              if (job && job.overwriteResolversMap) {
                try {
                  const keys = Array.from(job.overwriteResolversMap.keys());
                  console.log(
                    `[ws] overwriteResolversMap keys for job ${jobId}: ${keys.join(
                      ", "
                    )}`
                  );
                } catch (e) {
                  // ignore
                }
              }
              if (data.decision === "cancel") {
                if (jobType === "copy" || jobType === "duplicate") {
                  // Ensure the decision is set so awaiting prompts read it as a cancel.
                  if (job) job.overwriteDecision = "cancel";
                  performCopyCancellation(job);
                } else if (jobType === "decompress") {
                  job.status = "cancelled";
                  job.controller.abort();
                  // Unblock any pending overwrite prompts for this job
                  if (
                    Array.isArray(job.overwriteResolvers) &&
                    job.overwriteResolvers.length > 0
                  ) {
                    job.overwriteResolvers.forEach((r) => {
                      try {
                        r("cancel");
                      } catch (e) {
                        console.warn(
                          `[ws] overwrite resolver threw during cancel for job ${jobId}: ${e.message}`
                        );
                      }
                    });
                    job.overwriteResolvers = [];
                  } else if (job.resolveOverwrite) {
                    // Back-compat
                    job.overwriteDecision = "cancel";
                    try {
                      job.resolveOverwrite();
                    } catch (e) {
                      console.warn(
                        `[ws] single resolveOverwrite threw during cancel for job ${jobId}: ${e.message}`
                      );
                    }
                  }
                }
              } else if (job) {
                // If a promptId was passed but not found in the job's local map,
                // attempt to resolve via shared prompt registry (handles the case
                // where job objects have been replaced and lost their map)
                if (
                  data.promptId &&
                  !(
                    job.overwriteResolversMap &&
                    job.overwriteResolversMap.has(data.promptId)
                  )
                ) {
                  let entry = getAndRemovePromptResolver(data.promptId);
                  // If registry didn't have it, but client sent a jobId, try resolving from that job's map
                  if (!entry && data.jobId) {
                    try {
                      const providedJob = getJobById(data.jobId);
                      if (
                        providedJob &&
                        providedJob.overwriteResolversMap &&
                        providedJob.overwriteResolversMap.has(data.promptId)
                      ) {
                        const resolver = providedJob.overwriteResolversMap.get(
                          data.promptId
                        );
                        entry = { jobId: data.jobId, resolver };
                        console.log(
                          `[ws] Found resolver in provided job ${data.jobId} for prompt ${data.promptId}. Using it.`
                        );
                      }
                    } catch (err) {
                      console.warn(
                        `[ws] Error checking provided job map for prompt ${data.promptId}: ${err.message}`
                      );
                    }
                  }
                  if (entry && entry.resolver) {
                    if (entry && entry.meta) {
                      console.log(
                        `[ws] Resolved registry prompt ${
                          data.promptId
                        } meta=${JSON.stringify(entry.meta)}`
                      );
                      try {
                        const meta = entry.meta || {};
                        if (meta.isFolderPrompt && data.decision === "skip") {
                          console.warn(
                            `[ws] Received skip decision for folder prompt ${
                              data.promptId
                            }. Consider using skip_all to avoid child prompts. meta=${JSON.stringify(
                              meta
                            )}`
                          );
                        }
                      } catch (e) {}
                    }
                    console.warn(
                      `[ws] Found resolver in global registry for prompt ${data.promptId} (registered job ${entry.jobId}) (ws job ${jobId}). Invoking it.`
                    );
                    try {
                      // If the registry's jobId differs from the current ws jobId, prefer
                      // invoking the resolver that was registered for the original job so that
                      // closure-bound values are applied correctly.
                      const registeredJob = getJobById(entry.jobId) || null;
                      const targetJob = registeredJob || job;
                      // Keep a log of which job had the registered resolver vs current ws job
                      console.log(
                        `[ws] Invoking registry resolver for prompt ${
                          data.promptId
                        }: registryJob=${
                          entry.jobId
                        } currentWsJob=${jobId} targetJob=${
                          registeredJob ? registeredJob.id : "none"
                        }`
                      );
                      // Set the overwriteDecision on the target job (if available)
                      if (targetJob)
                        targetJob.overwriteDecision = data.decision;
                      // If the prompt belonged to a folder but client sent 'skip', treat it as 'skip_all'
                      if (
                        entry &&
                        entry.meta &&
                        entry.meta.isFolderPrompt &&
                        data.decision === "skip"
                      ) {
                        console.warn(
                          `[ws] Converting decision 'skip' -> 'skip_all' for folder prompt ${data.promptId}`
                        );
                        data.decision = "skip_all";
                        if (targetJob) targetJob.overwriteDecision = "skip_all";
                      }
                      // Invoke the resolver that was registered; it's bound to its original job's closure
                      entry.resolver(data.decision);
                      // Also attempt to clean up from the current job if present
                      if (job && job.overwriteResolversMap)
                        job.overwriteResolversMap.delete(data.promptId);
                    } catch (err) {
                      console.error(
                        `[ws] Error invoking global registry resolver for prompt ${data.promptId}:`,
                        err
                      );
                    }
                    // Don't proceed with local resolving logic below since we've resolved it
                    return;
                  }
                }
                job.overwriteDecision = data.decision;
                // If promptId is provided, consume exact resolver by id
                if (
                  data.promptId &&
                  job.overwriteResolversMap &&
                  job.overwriteResolversMap.has(data.promptId)
                ) {
                  try {
                    const resolver = job.overwriteResolversMap.get(
                      data.promptId
                    );
                    job.overwriteResolversMap.delete(data.promptId);
                    try {
                      unregisterPromptResolver(data.promptId);
                    } catch (e) {
                      console.warn(
                        `[ws] Failed to unregister prompt ${data.promptId} from registry: ${e}`
                      );
                    }
                    console.log(
                      `[ws] Deleting resolver for prompt ${
                        data.promptId
                      } from job ${jobId} trace=${
                        job?._traceId ?? "n/a"
                      }. newSize=${job.overwriteResolversMap.size}`
                    );
                    if (typeof resolver === "function") {
                      try {
                        // Ensure job.overwriteDecision reflects latest decision before invoking resolver
                        job.overwriteDecision = data.decision;
                        resolver(data.decision);
                        // Log job.overwriteDecision set by the resolver to help debug why 'overwrite' sometimes behaves like 'skip'
                        console.log(
                          `[ws] Local resolver set job.overwriteDecision for prompt ${data.promptId} job ${jobId} -> ${job?.overwriteDecision}`
                        );
                      } catch (err) {
                        console.error(
                          `[ws] Error while invoking resolver for prompt ${data.promptId} job ${jobId}:`,
                          err
                        );
                      }
                    } else {
                      console.warn(
                        `[ws] overwrite resolver for prompt ${data.promptId} is not a function for job ${jobId}`
                      );
                    }
                  } catch (err) {
                    console.error(
                      `[ws] Error while resolving overwrite for prompt ${data.promptId} job ${jobId}:`,
                      err
                    );
                  }
                } else if (
                  Array.isArray(job.overwriteResolvers) &&
                  job.overwriteResolvers.length > 0
                ) {
                  try {
                    const resolver = job.overwriteResolvers.shift();
                    console.log(
                      `[ws] Consuming overwrite resolver for job ${jobId}. queueRemaining=${job.overwriteResolvers.length}`
                    );
                    if (typeof resolver === "function") {
                      resolver(data.decision);
                      console.log(
                        `[ws] Resolved overwrite for job ${jobId} with decision '${data.decision}'.`
                      );
                    } else {
                      console.warn(
                        `[ws] overwrite resolver is not a function for job ${jobId}`
                      );
                    }
                  } catch (err) {
                    console.error(
                      `[ws] Error while resolving overwrite for job ${jobId}:`,
                      err
                    );
                  }
                } else if (job.resolveOverwrite) {
                  // Back-compat: fall back to single resolver
                  try {
                    job.resolveOverwrite();
                  } catch (err) {
                    console.error(
                      `[ws] Error while invoking single resolveOverwrite for job ${jobId}:`,
                      err
                    );
                  }
                } else {
                  console.warn(
                    `[ws] Received overwrite_response for job ${jobId} but no resolver exists`
                  );
                }
                console.log(
                  `[ws] overwrite_response processed for job ${jobId}, decision=${
                    data.decision
                  }, promptId=${
                    data.promptId
                  }, registryCount=${countRegistry()}`
                );
                // Fallback: if we have a promptId but not an exact match, try to consume the first available resolver in the map.
                if (
                  data.promptId &&
                  job.overwriteResolversMap &&
                  job.overwriteResolversMap.size > 0 &&
                  !job.overwriteResolversMap.has(data.promptId)
                ) {
                  try {
                    const firstKey = job.overwriteResolversMap
                      .keys()
                      .next().value;
                    const resolver = job.overwriteResolversMap.get(firstKey);
                    job.overwriteResolversMap.delete(firstKey);
                    try {
                      unregisterPromptResolver(firstKey);
                    } catch (e) {}
                    console.warn(
                      `[ws] Received overwrite_response for prompt ${
                        data.promptId
                      } but no exact resolver; falling back to first resolver ${firstKey} for job ${jobId} trace=${
                        job?._traceId ?? "n/a"
                      }`
                    );
                    if (typeof resolver === "function") resolver(data.decision);
                  } catch (err) {
                    console.error(
                      `[ws] Error while falling back resolving overwrite for job ${jobId}:`,
                      err
                    );
                  }
                }
              }
            } else if (jobType === "terminal") {
              const job = activeTerminalJobs.get(jobId);
              if (job && job.ptyProcess) {
                const term = job.ptyProcess;
                if (data.type === "resize") {
                  term.resize(data.cols, data.rows);
                } else if (data.type === "data") {
                  // Determine whether we should queue writes for non-PTY
                  // fallback until the child sends its first stdout data
                  // (indicating it's ready). For PTY we can write immediately.
                  if (term.isPty === false && !job.ready) {
                    // Queue sanitized write until terminal reports ready.
                    job.pendingWrites = job.pendingWrites || [];
                    const sanitizedShell = term.normalizeForShell(data.data);
                    job.pendingWrites.push(sanitizedShell);
                    // Echo sanitized data for immediate feedback to the client.
                    try {
                      if (job.ws && job.ws.readyState === 1) {
                        const sanitizedEcho = term.normalizeForEcho(data.data);
                        job.ws.send(sanitizedEcho);
                      }
                    } catch (e) {}
                  } else {
                    // Write immediately for PTY or when fallback terminal is ready
                    const sanitizedShell = term.normalizeForShell(data.data);
                    term.write(sanitizedShell);
                    try {
                      if (
                        term.isPty === false &&
                        job.ws &&
                        job.ws.readyState === 1
                      ) {
                        const sanitizedEcho = term.normalizeForEcho(data.data);
                        job.ws.send(sanitizedEcho);
                      }
                    } catch (e) {}
                  }
                }
              }
            }
            // Log for tracing, including central registry size
            try {
              console.log(
                `[ws] After processing overwrite_response job ${jobId} trace=${
                  job?._traceId ?? "n/a"
                } status=${job?.status} jobMapResolverCount=${
                  job?.overwriteResolversMap
                    ? job.overwriteResolversMap.size
                    : 0
                } globalRegistryCount=${countRegistry()}`
              );
            } catch (e) {}
          } catch (e) {
            console.error(`[ws] Error handling message for job ${jobId}:`, e);
            // don't re-throw — close the connection gracefully to avoid the abnormally closed WebSocket
            try {
              if (ws && ws.readyState === 1) {
                ws.close(1000, `Server error: ${e.message}`);
              }
            } catch (err) {}
          }
        });

        ws.on("close", (code, reason) => {
          console.log(
            `[ws] Connection closed for job ${jobId} trace=${
              job?._traceId ?? "n/a"
            }. code=${code}, reason=${reason} jobStatus=${
              job?.status
            } overwriteResolversMap.size=${
              job?.overwriteResolversMap ? job.overwriteResolversMap.size : 0
            } globalRegistryCount=${countRegistry()}`
          );
          if (job && job.ws === ws) {
            job.ws = null; // clear attached ws reference
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

              // Await the completion promise set up by the corresponding route handler (e.g., zipRoutes)
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
                console.log(
                  `[ws] Closing ws for job ${jobId} with code=1000 reason='Job Completed'`
                );
                await safeCloseJobWs(job, 1000, "Job Completed");
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
                console.log(
                  `[ws] Closing ws for job ${jobId} with code=1000 reason='Job finished with status: ${type}'`
                );
                await safeCloseJobWs(
                  job,
                  1000,
                  `Job finished with status: ${type}`
                );
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
                  try {
                    unregisterAllForJob(jobId, job);
                  } catch (e) {}
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
                    const relativePath = path.relative(basePath, sourcePath);
                    emptyDirsToAdd.push(relativePath + "/");
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
                    ws.send(
                      JSON.stringify({
                        type: "complete",
                        status: "skipped_all",
                      })
                    );
                    console.log(
                      `[ws] Closing ws for job ${jobId} with code=1000 reason='Job Completed - Skipped All'`
                    );
                    await safeCloseJobWs(
                      job,
                      1000,
                      "Job Completed - Skipped All"
                    );
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
                console.log(
                  `[ws] Closing ws for job ${jobId} with code=1000 reason='Job Completed'`
                );
                await safeCloseJobWs(job, 1000, "Job Completed");
              } catch (error) {
                if (job.status !== "cancelled") job.status = "failed";
                console.error(`Zip add job ${jobId} failed:`, error.message);
                if (ws.readyState === 1) {
                  const type =
                    job.status === "cancelled" ? "cancelled" : "error";
                  ws.send(JSON.stringify({ type, message: error.message }));
                  console.log(
                    `[ws] Closing ws for job ${jobId} with code=1000 reason='Job finished with status: ${type}'`
                  );
                  await safeCloseJobWs(
                    job,
                    1000,
                    `Job finished with status: ${type}`
                  );
                }
              } finally {
                clearInterval(progressInterval);
                setTimeout(() => {
                  try {
                    unregisterAllForJob(jobId, job);
                  } catch (e) {}
                  activeCopyJobs.delete(jobId);
                }, 5000);
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

                // Determine which zip file actually contains the requested source entries.
                // If the source is inside a nested zip, extract the nested zips to temp files and operate on the innermost zip.
                const filenamesToExtract = new Set();
                let totalUncompressedSize = 0;
                const tempDirs = [];

                for (const source of sources) {
                  const sourceMatch = matchZipPath(source);
                  if (!sourceMatch) continue;
                  const pathInZip = sourceMatch[2].startsWith("/")
                    ? sourceMatch[2].substring(1)
                    : sourceMatch[2];

                  // If this source references nested zips (e.g. outer.zip/inner.zip/...)
                  if (pathInZip.toLowerCase().includes(".zip/")) {
                    // Walk nested zip chain and extract to temp files until we reach the innermost zip
                    let currentZipPath = zipFilePath;
                    let remainingPath = pathInZip;
                    while (true) {
                      const zipEndIndex = remainingPath
                        .toLowerCase()
                        .indexOf(".zip/");
                      if (zipEndIndex === -1) break;
                      const nestedZipPathInParent = remainingPath.substring(
                        0,
                        zipEndIndex + 4
                      );
                      remainingPath = remainingPath.substring(zipEndIndex + 5);

                      const tempDir = fse.mkdtempSync(
                        path.join(os.tmpdir(), "nested-zip-")
                      );
                      tempDirs.push(tempDir);
                      const tmpInnerZipPath = path.join(
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
                        throw new Error(
                          `Nested zip not found: ${nestedZipPathInParent}`
                        );
                      }
                      const readStream = await parentZip.openReadStream(
                        entryFound
                      );
                      const writeStream =
                        fse.createWriteStream(tmpInnerZipPath);
                      await new Promise((resolve, reject) => {
                        readStream.pipe(writeStream);
                        readStream.on("end", resolve);
                        readStream.on("error", reject);
                        writeStream.on("error", reject);
                      });
                      await parentZip.close();
                      currentZipPath = tmpInnerZipPath;
                    }

                    // currentZipPath now points to the innermost zip, remainingPath points to path inside it
                    // Record the inner zip as job.zipFilePath for extractFilesFromZip to open it
                    job.zipFilePath = currentZipPath;
                    // Set original zip size for progress context
                    job.originalZipSize = (await fse.pathExists(currentZipPath))
                      ? (await fse.stat(currentZipPath)).size
                      : 0;
                    const innerZip = await yauzl.open(currentZipPath);
                    try {
                      job.zipfile = innerZip; // ensure the job knows the ZIP instance it's extracting from
                      for await (const entry of innerZip) {
                        if (
                          entry.filename === remainingPath ||
                          entry.filename.startsWith(remainingPath + "/")
                        ) {
                          if (!filenamesToExtract.has(entry.filename)) {
                            filenamesToExtract.add(entry.filename);
                            totalUncompressedSize += entry.uncompressedSize;
                          }
                        }
                      }
                    } finally {
                      // Close the innerZip if it was opened. Also clear job.zipfile if it refers to an inner temp.
                      try {
                        await innerZip.close();
                      } catch (closeErr) {
                        console.warn(
                          `[zip-extract] Failed to close innerZip: ${closeErr.message}`
                        );
                      }
                      if (job && job.zipfile === innerZip) delete job.zipfile;
                    }
                  } else {
                    // Non-nested path, operate on top-level zip
                    const topZip = await yauzl.open(zipFilePath);
                    try {
                      for await (const entry of topZip) {
                        if (
                          entry.filename === pathInZip ||
                          entry.filename.startsWith(pathInZip + "/")
                        ) {
                          if (!filenamesToExtract.has(entry.filename)) {
                            filenamesToExtract.add(entry.filename);
                            totalUncompressedSize += entry.uncompressedSize;
                          }
                        }
                      }
                    } finally {
                      try {
                        await topZip.close();
                      } catch (e) {
                        console.warn(
                          `[zip-extract] Failed to close top-level zip: ${e.message}`
                        );
                      }
                    }
                  }
                }

                job.filenamesToExtract = Array.from(filenamesToExtract);
                // If the user selected exactly one source and that source corresponds
                // to a directory inside the zip, preserve the base path so the
                // extracted data is placed into a new subfolder with that name.
                // This matches user expectation when copying a folder from a zip
                // into a non-zip destination.
                try {
                  if (
                    sources &&
                    Array.isArray(sources) &&
                    sources.length === 1
                  ) {
                    const singleSource = sources[0];
                    const sourceMatch = matchZipPath(singleSource);
                    if (sourceMatch) {
                      // Path inside zip without leading slash
                      const pathInZip = sourceMatch[2].startsWith("/")
                        ? sourceMatch[2].substring(1)
                        : sourceMatch[2];

                      // If any extracted filename lives under this path, treat it as a folder
                      const pathPrefix = pathInZip.endsWith("/")
                        ? pathInZip
                        : `${pathInZip}/`;
                      if (
                        job.filenamesToExtract.some((f) =>
                          f.startsWith(pathPrefix)
                        )
                      ) {
                        job.preserveBasePath = true;
                      }
                    }
                  }
                } catch (err) {
                  // Don't fail the operation if detection fails; leave default behavior
                  console.warn(
                    "[zip-extract] preserveBasePath detection failed:",
                    err && err.message
                  );
                }
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

                // If extraction targets were identified from nested inner zip(s), we should set job.zipfile accordingly
                // Set job.zipfile only if it's not already set by other logic and there is a single source nested zip path
                if (
                  !job.zipfile &&
                  job.filenamesToExtract &&
                  job.filenamesToExtract.length > 0
                ) {
                  // Try to detect if we extracted an inner temp zip earlier
                  // If we created tempDirs for nested extraction in this scope, we can't access them here; so job.zipfile must be set by nested code before calling extract
                }
                await extractFilesFromZip(job);

                job.status = "completed";
                ws.send(JSON.stringify({ type: "complete" }));
                console.log(
                  `[ws] Closing ws for job ${jobId} with code=1000 reason='Job Completed'`
                );
                await safeCloseJobWs(job, 1000, "Job Completed");
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
                  console.log(
                    `[ws] Closing ws for job ${jobId} with code=1000 reason='Job finished with status: ${type}'`
                  );
                  await safeCloseJobWs(
                    job,
                    1000,
                    `Job finished with status: ${type}`
                  );
                }
              } finally {
                clearInterval(progressInterval);
                if (job.zipfile) await job.zipfile.close();
                // Clean up any nested tmpDirs created during nested extraction
                try {
                  if (
                    typeof tempDirs !== "undefined" &&
                    Array.isArray(tempDirs) &&
                    tempDirs.length > 0
                  ) {
                    for (const td of tempDirs) {
                      try {
                        await fse.remove(td);
                      } catch (e) {
                        console.warn(
                          `[zip-extract] Failed to remove temp dir ${td}: ${e.message}`
                        );
                      }
                    }
                  }
                } catch (cleanupErr) {
                  console.warn(
                    `[zip-extract] Error during temp dirs cleanup: ${cleanupErr.message}`
                  );
                }
                setTimeout(() => {
                  try {
                    unregisterAllForJob(jobId, job);
                  } catch (e) {}
                  activeCopyJobs.delete(jobId);
                }, 5000);
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

                  // Await the completion promise set up by the corresponding route handler (e.g., copy/duplicate/zip route)
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
                    console.log(
                      `[ws] Closing ws for job ${jobId} with code=1000 reason='Zip Duplication Completed'`
                    );
                    await safeCloseJobWs(
                      job,
                      1000,
                      "Zip Duplication Completed"
                    );
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
                    // Defensive check: prevent copying a folder into itself or into one of its
                    // own subfolders which would cause infinite nesting (endless copy).
                    try {
                      const src = path.resolve(item.sourcePath);
                      const dst = path.resolve(item.destPath);
                      const relative = path.relative(src, dst);
                      // If `relative` is empty (same path) or does not start with '..',
                      // then the destination is the same as or inside the source.
                      if (
                        relative === "" ||
                        (!relative.startsWith("..") &&
                          !path.isAbsolute(relative))
                      ) {
                        const msg = `Destination '${dst}' is inside source '${src}' — aborting to avoid recursive copy.`;
                        console.error(`[ws] ${msg}`);
                        // Propagate an error to abort the job and notify the client
                        throw new Error(msg);
                      }
                    } catch (e) {
                      // If path.relative or resolve throws for some reason, fail safe and abort
                      console.error(
                        `[ws] Error checking source/destination relationship for job ${jobId}:`,
                        e.message || e
                      );
                      throw e;
                    }

                    await copyWithProgress(item.sourcePath, item.destPath, job);
                  }

                  job.status = "completed";
                  ws.send(JSON.stringify({ type: "complete" }));
                  console.log(
                    `[ws] Closing ws for job ${jobId} with code=1000 reason='Job Completed'`
                  );
                  console.log(
                    `[ws] Closing ws for job ${jobId} with code=1000 reason='Job Completed'`
                  );
                  await safeCloseJobWs(job, 1000, "Job Completed");
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
                  console.log(
                    `[ws] Closing ws for job ${jobId} with code=1000 reason='Job finished with status: ${type}'`
                  );
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
                  console.log(
                    `[ws] Closing ws for job ${jobId} with code=1000 reason='Job Completed'`
                  );
                  await safeCloseJobWs(job, 1000, "Job Completed");
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
                  await safeCloseJobWs(job, 1000, "Job Completed");
                }
              }
            } catch (error) {
              if (job.status !== "cancelled") job.status = "failed";
              console.error(`Size job ${jobId} failed:`, error.message);
              if (ws.readyState === 1) {
                const type = job.status === "cancelled" ? "cancelled" : "error";
                ws.send(JSON.stringify({ type, message: error.message }));
                console.log(
                  `[ws] Closing ws for job ${jobId} with code=1000 reason='Job finished with status: ${type}'`
                );
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

              job.output.on("close", async function () {
                clearInterval(progressInterval);
                job.status = "completed";
                if (job.ws && job.ws.readyState === 1) {
                  job.ws.send(
                    JSON.stringify({
                      type: "complete",
                      outputPath: job.outputPath,
                    })
                  );
                  console.log(
                    `[ws] Closing ws for job ${jobId} with code=1000 reason='Job Completed'`
                  );
                  await safeCloseJobWs(job, 1000, "Job Completed");
                }
                setTimeout(() => {
                  try {
                    unregisterAllForJob(jobId, job);
                  } catch (e) {}
                  activeCompressJobs.delete(jobId);
                }, 5000);
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
              const allDirs = new Set(); // Use a Set to avoid duplicate directory entries

              for (const source of job.sources) {
                const stats = await fse.stat(source);
                const relativePath = path
                  .relative(job.sourceDirectory, source)
                  .replace(/\\/g, "/");
                if (stats.isDirectory()) {
                  allDirs.add(relativePath + "/"); // Add the directory itself
                  const { files, dirs } = await getAllFilesAndDirsRecursive(
                    source,
                    job.sourceDirectory
                  );
                  files.forEach((f) => allFiles.push(f));
                  dirs.forEach((d) => allDirs.add(d));
                } else {
                  allFiles.push({
                    fullPath: source,
                    relativePath: relativePath,
                    stats: stats,
                  });
                }
              }

              // Add directories to the archive
              for (const dir of allDirs) {
                job.archive.append(null, { name: dir });
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
                await safeCloseJobWs(
                  job,
                  1000,
                  `Job finished with status: ${type}`
                );
              }
            } finally {
              if (job.status !== "completed" && job.status !== "failed") {
                setTimeout(() => {
                  try {
                    unregisterAllForJob(jobId, job);
                  } catch (e) {}
                  activeCompressJobs.delete(jobId);
                }, 5000);
              }
            }
          })();
        } else if (jobType === "decompress") {
          (async () => {
            let zipfile;
            let progressInterval;
            let tempNestedZipPath = null;

            try {
              // Only set default prompt behavior if an initial overwriteDecision
              // was not provided by the route handler. This preserves explicit
              // client preferences such as 'skip_all' or 'overwrite_all'.
              if (typeof job.overwriteDecision === "undefined") {
                job.overwriteDecision = "prompt";
              }

              // Show overwrite prompt for the destination FOLDER only on FULL extraction.
              if (
                false &&
                (await fse.pathExists(job.destination)) &&
                !(job.itemsToExtract && job.itemsToExtract.length > 0)
              ) {
                if (ws.readyState === 1) {
                  const promptId = crypto.randomUUID();
                  if (!job.overwriteResolversMap) {
                    ensureInstrumentedResolversMap(job);
                  }
                  ws.send(
                    JSON.stringify({
                      type: "overwrite_prompt",
                      promptId,
                      file: path.basename(job.destination),
                      itemType: "folder",
                    })
                  );
                  decision = await new Promise((resolve) => {
                    job.overwriteResolversMap.set(promptId, (d) => {
                      try {
                        // Defensive check: ensure promptId is defined in closure
                        if (typeof promptId === "undefined") {
                          console.error(
                            `[websocket] RESOLVER INVOKED: promptId is undefined in closure for job ${jobId}`
                          );
                        }
                        console.log(
                          `[websocket] job ${jobId} overwrite response received for prompt ${promptId}: ${d}`
                        );
                        job.overwriteDecision = d;
                        job.overwriteResolversMap.delete(promptId);
                        try {
                          unregisterPromptResolver(promptId);
                        } catch (e) {}
                        clearTimeout(job._promptTimers?.get(promptId));
                        if (job._promptTimers)
                          job._promptTimers.delete(promptId);
                        resolve(d);
                      } catch (err) {
                        console.error(
                          `[websocket] Error in overwrite resolver for prompt ${promptId} job ${jobId}:`,
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
                          if (job._promptTimers)
                            job._promptTimers.delete(promptId);
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
                        // Resolve gracefully with skip to prevent UI getting stuck
                        try {
                          resolve("skip");
                        } catch (e) {}
                      }
                    });
                    try {
                      registerPromptMeta(promptId, {
                        entryName: entry.filename,
                        itemType: entry.filename.endsWith("/")
                          ? "folder"
                          : "file",
                        jobId,
                      });
                    } catch (e) {}
                    try {
                      registerPromptMeta(promptId, {
                        entryName: job.destination,
                        itemType: "folder",
                        jobId,
                      });
                    } catch (e) {}
                    if (!job._promptTimers) job._promptTimers = new Map();
                    const t = setTimeout(() => {
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
                              `[ws] Timer triggered resolver threw: ${e.message}`
                            );
                          }
                          job.overwriteResolversMap.delete(promptId);
                          try {
                            unregisterPromptResolver(promptId);
                          } catch (e) {}
                          console.warn(
                            `[ws] Prompt ${promptId} for job ${jobId} timed out and was auto-skipped`
                          );
                        }
                      } finally {
                        if (job._promptTimers)
                          job._promptTimers.delete(promptId);
                      }
                    }, 30000);
                    job._promptTimers.set(promptId, t);
                    // proxy will have registered resolver on set
                  });
                }

                if (
                  job.overwriteDecision === "skip" ||
                  job.overwriteDecision === "cancel"
                ) {
                  if (ws.readyState === 1) {
                    ws.send(
                      JSON.stringify({ type: "complete", status: "skipped" })
                    );
                    console.log(
                      `[ws] Closing ws for job ${jobId} with code=1000 reason='Job Completed'`
                    );
                    await safeCloseJobWs(job, 1000, "Job Completed");
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

              // Track whether the destination existed when the job started
              // and keep a set of paths created during this job so we don't
              // prompt on paths that the job itself just created (new subfolder).
              try {
                job._destinationExistedAtStart = await fse.pathExists(
                  job.destination
                );
              } catch (e) {
                job._destinationExistedAtStart = false;
              }
              job._createdPaths = new Set();

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

              // --- Pre-scan for folder-level overwrite prompts ---
              // Collect candidate folder prefixes from entriesToExtractNames
              const collectAncestors = (relPath) => {
                const parts = relPath.split("/");
                const ancestors = [];
                if (parts.length <= 1) return ancestors;
                let accum = "";
                for (let i = 0; i < parts.length - 1; i++) {
                  accum = accum ? `${accum}${parts[i]}/` : `${parts[i]}/`;
                  ancestors.push(accum);
                }
                return ancestors;
              };

              const folderPrefixes = new Set();
              for (const entryName of entriesToExtractNames) {
                const rel = entryName;
                if (rel.endsWith("/")) {
                  folderPrefixes.add(rel.endsWith("/") ? rel : `${rel}/`);
                  for (const a of collectAncestors(rel.slice(0, -1)))
                    folderPrefixes.add(a);
                } else {
                  const parent = path.dirname(rel);
                  if (parent && parent !== ".") {
                    for (const a of collectAncestors(parent))
                      folderPrefixes.add(a);
                    folderPrefixes.add(
                      parent.endsWith("/") ? parent : `${parent}/`
                    );
                  }
                }
              }

              // Sort shallow-to-deep so outer folder prompts appear first
              const sortedFolderPrefixes = Array.from(folderPrefixes).sort(
                (a, b) => a.split("/").length - b.split("/").length
              );

              // Attach folder decisions map to job so per-entry logic can consult it
              const folderDecisions = new Map();
              job._folderDecisions = folderDecisions;

              // Ask folder-level overwrite prompts for existing destination folders
              for (const folderPrefix of sortedFolderPrefixes) {
                if (job.controller.signal.aborted)
                  throw new Error("Zip extract cancelled.");
                const relFolder = folderPrefix.endsWith("/")
                  ? folderPrefix.slice(0, -1)
                  : folderPrefix;
                const destFolder = path.join(job.destination, relFolder);
                try {
                  if (await fse.pathExists(destFolder)) {
                    const st = await fse.stat(destFolder);
                    if (st.isDirectory()) {
                      if (
                        job.overwriteDecision === "prompt" &&
                        ws &&
                        ws.readyState === 1
                      ) {
                        const promptId = crypto.randomUUID();
                        if (!job.overwriteResolversMap)
                          ensureInstrumentedResolversMap(job);
                        ws.send(
                          JSON.stringify({
                            type: "overwrite_prompt",
                            promptId,
                            file: path.basename(relFolder),
                            itemType: "folder",
                            isFolderPrompt: true,
                          })
                        );
                        const decision = await new Promise((resolve) => {
                          job.overwriteResolversMap.set(promptId, (d) => {
                            try {
                              job.overwriteDecision = d;
                              job.overwriteResolversMap.delete(promptId);
                              try {
                                unregisterPromptResolver(promptId);
                              } catch (e) {}
                              if (job._promptTimers) {
                                clearTimeout(job._promptTimers.get(promptId));
                                job._promptTimers.delete(promptId);
                              }
                              resolve(d);
                            } catch (err) {
                              try {
                                job.overwriteResolversMap.delete(promptId);
                              } catch (e) {}
                              try {
                                unregisterPromptResolver(promptId);
                              } catch (e) {}
                              resolve("skip");
                            }
                          });
                        });
                        let mapped = null;
                        switch (decision) {
                          case "skip":
                          case "skip_all":
                            mapped = "skip";
                            break;
                          case "overwrite":
                          case "overwrite_all":
                            mapped = "overwrite";
                            break;
                          case "cancel":
                            throw new Error("Zip extract cancelled by user.");
                          default:
                            mapped = "skip";
                        }
                        const normalized = relFolder.endsWith("/")
                          ? relFolder
                          : `${relFolder}/`;
                        folderDecisions.set(normalized, mapped);
                        if (job.verboseLogging)
                          console.log(
                            `[ws] job ${jobId} folderDecision set ${normalized} -> ${mapped}`
                          );
                      }
                    }
                  }
                } catch (err) {
                  console.warn(
                    `[ws] pre-scan folder check failed for ${destFolder}:`,
                    err.message
                  );
                }
              }

              // If doing a full extraction (no specific items selected), and the
              // destination folder already exists, only prompt the user if the
              // archive actually contains entries that would be extracted into
              // a top-level folder matching the destination's basename.
              if (!(job.itemsToExtract && job.itemsToExtract.length > 0)) {
                try {
                  const targetBase = path.basename(job.destination);
                  if (
                    targetBase &&
                    (await fse.pathExists(job.destination)) &&
                    entriesToExtractNames.some((n) => {
                      const seg = n.split("/")[0];
                      return seg === targetBase;
                    })
                  ) {
                    if (ws && ws.readyState === 1) {
                      const promptId = crypto.randomUUID();
                      if (!job.overwriteResolversMap)
                        ensureInstrumentedResolversMap(job);
                      ws.send(
                        JSON.stringify({
                          type: "overwrite_prompt",
                          promptId,
                          file: targetBase,
                          itemType: "folder",
                        })
                      );
                      // Register metadata pointing at the job destination so
                      // registry consumers can inspect context.
                      try {
                        registerPromptMeta(promptId, {
                          entryName: job.destination,
                          itemType: "folder",
                          isFolderPrompt: true,
                          jobId,
                        });
                      } catch (e) {}

                      let destDecision;
                      try {
                        destDecision = await new Promise((resolve) => {
                          job.overwriteResolversMap.set(promptId, (d) => {
                            try {
                              job.overwriteDecision = d;
                              job.overwriteResolversMap.delete(promptId);
                              try {
                                unregisterPromptResolver(promptId);
                              } catch (e) {}
                              if (job._promptTimers) {
                                clearTimeout(job._promptTimers.get(promptId));
                                job._promptTimers.delete(promptId);
                              }
                              resolve(d);
                            } catch (err) {
                              try {
                                job.overwriteResolversMap.delete(promptId);
                              } catch (e) {}
                              try {
                                unregisterPromptResolver(promptId);
                              } catch (e) {}
                              try {
                                if (job._promptTimers)
                                  job._promptTimers.delete(promptId);
                              } catch (e) {}
                              try {
                                resolve("skip");
                              } catch (e) {}
                            }
                          });
                        });
                      } catch (err) {
                        destDecision = "skip";
                      }

                      // If user says skip or cancel, end the job early.
                      if (
                        destDecision === "skip" ||
                        destDecision === "cancel"
                      ) {
                        if (ws.readyState === 1) {
                          ws.send(
                            JSON.stringify({
                              type: "complete",
                              status: "skipped",
                            })
                          );
                          console.log(
                            `[ws] Closing ws for job ${jobId} with code=1000 reason='Job Completed'`
                          );
                          await safeCloseJobWs(job, 1000, "Job Completed");
                        }
                        return;
                      }
                      // Otherwise, continue with extraction; the user choice
                      // is now stored in job.overwriteDecision for per-entry evaluation.
                    }
                  }
                } catch (e) {
                  // If anything goes wrong while deciding whether to prompt,
                  // prefer to continue the operation rather than fail.
                  console.warn(
                    `[ws] Error while checking for top-level destination conflicts for job ${jobId}: ${e}`
                  );
                }
              }
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

                // Check whether a destination path exists. If it is under the
                // job.destination and the destination folder did not exist at
                // the start of the job, treat it as non-existent unless the
                // path was created earlier by this same job (createdPaths).
                let destPathExists = await fse.pathExists(destPath);
                const destPathResolved = path.resolve(destPath);
                const jobDestResolved = path.resolve(job.destination);
                const destIsUnderJobDestination =
                  destPathResolved === jobDestResolved ||
                  destPathResolved.startsWith(jobDestResolved + path.sep);

                if (
                  destPathExists &&
                  destIsUnderJobDestination &&
                  !job._destinationExistedAtStart
                ) {
                  // The path exists but it was created by this job in a prior
                  // step or otherwise (shouldn't happen) — do not prompt in
                  // this case. Treat as not pre-existing.
                  destPathExists = false;
                }

                if (destPathExists) {
                  let decision = job.overwriteDecision;

                  // Consult any folder-level decisions made during pre-scan.
                  if (
                    job &&
                    job._folderDecisions &&
                    job._folderDecisions.size > 0
                  ) {
                    for (const [
                      folderPrefixOrig,
                      fdDecision,
                    ] of job._folderDecisions.entries()) {
                      const folderPrefix = folderPrefixOrig.endsWith("/")
                        ? folderPrefixOrig
                        : `${folderPrefixOrig}/`;
                      if (
                        entry.filename === folderPrefix ||
                        entry.filename.startsWith(folderPrefix)
                      ) {
                        if (fdDecision === "skip") {
                          // Skip this entry entirely
                          if (job.verboseLogging)
                            console.log(
                              `[ws] job ${jobId} skipping entry ${entry.filename} due to folder-level skip ${folderPrefix}`
                            );
                          decision = "skip";
                        } else if (fdDecision === "overwrite") {
                          // Treat as overwrite without prompting
                          if (job.verboseLogging)
                            console.log(
                              `[ws] job ${jobId} auto-overwriting entry ${entry.filename} due to folder-level overwrite ${folderPrefix}`
                            );
                          decision = "overwrite";
                        }
                        break;
                      }
                    }
                  }

                  const needsPrompt = decision === "prompt";

                  if (needsPrompt) {
                    if (job.ws && job.ws.readyState === 1) {
                      const promptId = crypto.randomUUID();
                      if (!job.overwriteResolversMap) {
                        ensureInstrumentedResolversMap(job);
                      }
                      ws.send(
                        JSON.stringify({
                          type: "overwrite_prompt",
                          promptId,
                          file: entry.filename,
                          itemType: entry.filename.endsWith("/")
                            ? "folder"
                            : "file",
                        })
                      );
                      decision = await new Promise((resolve) => {
                        job.overwriteResolversMap.set(promptId, (d) => {
                          try {
                            if (typeof promptId === "undefined") {
                              console.error(
                                `[websocket] RESOLVER INVOKED: promptId is undefined in extract resolver closure for job ${jobId}`
                              );
                            }
                            console.log(
                              `[websocket] job ${jobId} overwrite response received for prompt ${promptId}: ${d} (extract)`
                            );
                            job.overwriteDecision = d;
                            job.overwriteResolversMap.delete(promptId);
                            try {
                              unregisterPromptResolver(promptId);
                            } catch (e) {}
                            resolve(d);
                          } catch (err) {
                            console.error(
                              `[websocket] Error in extract overwrite resolver for prompt ${promptId} job ${jobId}:`,
                              err,
                              err.stack
                            );
                            try {
                              job.overwriteResolversMap.delete(promptId);
                            } catch (e) {}
                            try {
                              unregisterPromptResolver(promptId);
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
                            try {
                              resolve("skip");
                            } catch (e) {}
                          }
                        });
                        // proxy will have registered resolver on set
                      });
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
                  try {
                    job._createdPaths.add(path.resolve(destPath));
                  } catch (e) {}
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
                      try {
                        job._createdPaths.add(path.resolve(destPath));
                      } catch (e) {}
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
                console.log(
                  `[ws] Closing ws for job ${jobId} with code=1000 reason='Job Completed'`
                );
                await safeCloseJobWs(job, 1000, "Job Completed");
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
                console.log(
                  `[ws] Closing ws for job ${jobId} with code=1000 reason='Job Completed'`
                );
                await safeCloseJobWs(job, 1000, "Job Completed");
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

            const sendComplete = async () => {
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
              console.log(
                `[ws] Closing ws for job ${jobId} with code=1000 reason='Archive test completed'`
              );
              await safeCloseJobWs(job, 1000, "Archive test completed");
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
                await safeCloseJobWs(job, 1000, "Job Completed");
              }
            } catch (error) {
              if (ws.readyState !== 1) return;
              if (job.status !== "cancelled") job.status = "failed";
              console.error(`Copy paths job ${jobId} failed:`, error);
              ws.send(
                JSON.stringify({ type: "error", message: error.message })
              );
              await safeCloseJobWs(
                job,
                1000,
                `Job finished with status: error`
              );
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
              // Provide information about the underlying pty type so the
              // client can avoid duplicating typed writes on the non-PTY
              // fallback which echoes typed characters back to the client.
              try {
                ws.send(
                  JSON.stringify({
                    type: "pty_info",
                    isPty: !!job.ptyProcess.isPty,
                  })
                );
              } catch (e) {}
            }

            let _loggedFirstChunk = false;
            term.on("data", (data) => {
              if (!process.env.DEBUG_TERMINAL) {
                // no-op
              } else {
                try {
                  const snippet =
                    typeof data === "string" ? data : data.toString("utf8");
                  if (!_loggedFirstChunk) {
                    console.info(
                      `[pty] first data for job ${jobId}: [${snippet
                        .slice(0, 100)
                        .replace(/\n/g, "\\n")}]`
                    );
                    _loggedFirstChunk = true;
                  } else {
                    console.info(
                      `[pty] data for job ${jobId} snippet=${snippet
                        .slice(0, 80)
                        .replace(/\n/g, "\\n")} length=${snippet.length}`
                    );
                  }
                } catch (e) {}
              }
              if (ws.readyState === 1) {
                try {
                  ws.send(data);
                } catch (e) {}
              }

              // Mark the terminal as ready so queued writes (sent before
              // shell emitted its first stdout) can be flushed. This is
              // important for pipe-based fallback shells which may not
              // be able to accept inputs sent too early.
              try {
                if (!job.ready) {
                  job.ready = true;
                  // Delay flush slightly so the shell settles after emitting
                  // the initial prompt (some shells may need a few ms to
                  // update internal state before accepting commands).
                  const flushPending = () => {
                    if (
                      Array.isArray(job.pendingWrites) &&
                      job.pendingWrites.length > 0
                    ) {
                      for (const w of job.pendingWrites) {
                        try {
                          term.write(w);
                          if (
                            !term.isPty &&
                            job.ws &&
                            job.ws.readyState === 1
                          ) {
                            job.ws.send(w);
                          }
                        } catch (err) {
                          console.warn(
                            `[ws] Failed to flush queued write for job ${jobId}:`,
                            err.message || err
                          );
                        }
                      }
                      job.pendingWrites = [];
                    }
                  };
                  try {
                    setTimeout(flushPending, 25);
                  } catch (e) {
                    flushPending();
                  }
                }
              } catch (e) {}
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
            console.log(
              `[ws] Closing ws for job ${jobId} with code=1000 reason='Job Completed'`
            );
            ws.close(1000, "Job Completed");
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
                try {
                  unregisterAllForJob(jobId, zipJob);
                } catch (e) {}
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
                try {
                  unregisterAllForJob(jobId, zipJob);
                } catch (e) {}
                activeZipOperations.delete(jobId);
              }, 5000);
            }
          }
        });
      } else {
        console.warn(`[ws] Connection rejected for invalid job ID: ${jobId}`);
        console.log(
          `[ws] Closing ws for job ${jobId} with code=1000 reason='Job Completed'`
        );
        ws.close(1000, "Job Completed");
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
