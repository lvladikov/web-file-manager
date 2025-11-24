import fse from "fs-extra";
import path from "path";
import crypto from "crypto";
import { pipeline } from "stream/promises";
import {
  registerPromptResolver,
  unregisterPromptResolver,
  unregisterAllForJob,
  registerPromptMeta,
  ensureInstrumentedResolversMap,
} from "./prompt-registry.js";

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
        job.sizeSoFar += stats.size;
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
        console.error(`Could not stat ${itemPath}, skipping.`, e.message);
      }
    }
  }
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
    const needsPrompt = decision === "prompt";

    if (needsPrompt) {
      if (job.ws && job.ws.readyState === 1) {
        const promptId = crypto.randomUUID();
        if (!job.overwriteResolversMap) {
          ensureInstrumentedResolversMap(job);
          console.log(
            `[copyWithProgress] job ${job?.id} trace=${
              job?._traceId ?? "n/a"
            } initialized overwriteResolversMap`
          );
        }
        job.ws.send(
          JSON.stringify({
            type: "overwrite_prompt",
            promptId,
            file: path.basename(destination),
            itemType: sourceStats.isDirectory() ? "folder" : "file",
          })
        );
        decision = await new Promise((resolve) => {
          job.overwriteResolversMap.set(promptId, (d) => {
            try {
              job._lastResolvedPromptId = promptId;
            } catch (e) {}
            // Defensive check: ensure promptId is defined in closure (helps catch ReferenceError)
            if (typeof promptId === "undefined") {
              console.error(
                `[copyWithProgress] RESOLVER INVOKED: promptId is undefined in closure for job ${
                  job?.id || "unknown"
                }`
              );
            }
            try {
              unregisterPromptResolver(promptId);
              try {
                console.log(
                  `[copyWithProgress] job ${job?.id} trace=${
                    job?._traceId ?? "n/a"
                  } overwrite response received for prompt ${promptId}: ${d} for destination ${destination}`
                );
              } catch (e) {}
              try {
                console.log(
                  `[copyWithProgress] [debug] job ${job?.id} trace=${
                    job?._traceId ?? "n/a"
                  } destination=${destination} decision=${decision} current job.overwriteDecision=${
                    job.overwriteDecision
                  }`
                );
              } catch (e) {}
              job.overwriteDecision = d;
              job.overwriteResolversMap.delete(promptId);
              clearTimeout(job._promptTimers?.get(promptId));
              if (job._promptTimers) job._promptTimers.delete(promptId);
              try {
                if (job._lastResolvedPromptId === promptId)
                  delete job._lastResolvedPromptId;
              } catch (e) {}
              resolve(d);
            } catch (err) {
              console.error(
                `[copyWithProgress] Error in overwrite resolver for prompt ${promptId} for job ${job?.id}:`,
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
              throw err;
            }
          });
          try {
            registerPromptMeta(promptId, {
              entryName: destination,
              itemType: sourceStats.isDirectory() ? "folder" : "file",
              isFolderPrompt: sourceStats.isDirectory(),
            });
          } catch (e) {}
          // proxy will have registered resolver on set
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
                    `[copyWithProgress] Timer triggered resolver threw: ${e.message}`
                  );
                }
                job.overwriteResolversMap.delete(promptId);
                unregisterPromptResolver(promptId);
                console.warn(
                  `[copyWithProgress] Prompt ${promptId} for job ${job?.id} timed out and was auto-skipped`
                );
              }
            } finally {
              if (job._promptTimers) job._promptTimers.delete(promptId);
            }
          }, 30000);
          job._promptTimers.set(promptId, t);
        });
        console.log(
          `[copyWithProgress] After resolving prompt ${promptId} for ${destination}, decision=${decision}; remaining resolvers=${
            job.overwriteResolversMap ? job.overwriteResolversMap.size : 0
          }`
        );
        console.log(`
          [copyWithProgress] job ${job?.id} trace=${
          job?._traceId ?? "n/a"
        } sent overwrite_prompt for ${destination} promptId=${promptId} resolvers=${
          job.overwriteResolversMap.size
        }`);
      }
    }

    const evaluateDecision = () => {
      try {
        console.log(
          `[copyWithProgress] [debug-eval] job ${job?.id} trace=${
            job?._traceId ?? "n/a"
          } decision=${decision} job.overwriteDecision=${job.overwriteDecision}`
        );
      } catch (e) {}
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

    if (decision === "overwrite" || decision === "skip") {
      job.overwriteDecision = "prompt";
    } else {
      job.overwriteDecision = decision;
    }
    const shouldSkip = evaluateDecision();
    console.log(
      `[copyWithProgress] [debug] job ${job?.id} trace=${
        job?._traceId ?? "n/a"
      } evaluated decision=${decision} shouldSkip=${shouldSkip}`
    );

    // If decision says we should skip this item, advance overall progress
    // by the size of the skipped entry (file or directory) so job progress
    // remains consistent, then return without copying.
    if (shouldSkip) {
      try {
        if (sourceStats.isDirectory()) {
          // Directory: add full subtree bytes so progress reflects skipped bytes
          const dirSize = await getDirSize(source);
          job.copied += dirSize || 0;
        } else {
          job.copied += sourceStats.size || 0;
        }
        if (job.ws && job.ws.readyState === 1) {
          job.ws.send(JSON.stringify({ type: "progress", copied: job.copied }));
        }
      } catch (e) {
        // If computing dir size fails, just log and proceed without adjusting
        console.warn(
          `[copyWithProgress] failed to compute skipped size for ${source}: ${e?.message}`
        );
      }
      return; // skip actual copy
    }
  }

  // --- End of Decision Logic. If we are here, we need to copy. ---
  try {
    console.log(
      `[copyWithProgress] [debug-action] job ${job?.id} trace=${
        job?._traceId ?? "n/a"
      } about to copy ${source} -> ${destination} decision=${decision} job.overwriteDecision=${
        job.overwriteDecision
      } shouldSkip=${evaluateDecision()}`
    );
  } catch (e) {}

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
  const items = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path
        .relative(basePath, fullPath)
        .replace(/\\\\/g, "/");
      if (entry.isDirectory()) {
        const subItems = await getAllFiles(fullPath, basePath);
        if (subItems.length === 0) {
          // It's an empty directory
          try {
            const stats = await fse.stat(fullPath);
            return [
              {
                fullPath,
                relativePath: relativePath + "/",
                stats,
                isEmptyDir: true,
              },
            ];
          } catch (e) {
            console.error(`Could not stat ${fullPath}, skipping.`);
            return [];
          }
        }
        return subItems;
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
  return items.flat();
};

const getAllFilesAndDirsRecursive = async (dirPath, basePath = dirPath) => {
  let allFiles = [];
  let allDirs = [];

  const entries = await fse.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path
      .relative(basePath, fullPath)
      .replace(/\\\\/g, "/");

    if (entry.isDirectory()) {
      allDirs.push(relativePath + "/");
      const { files, dirs } = await getAllFilesAndDirsRecursive(
        fullPath,
        basePath
      );
      allFiles = allFiles.concat(files);
      allDirs = allDirs.concat(dirs);
    } else {
      try {
        const stats = await fse.stat(fullPath);
        allFiles.push({ fullPath, relativePath, stats });
      } catch (e) {
        console.error(`Could not stat ${fullPath}, skipping.`);
      }
    }
  }
  return { files: allFiles, dirs: allDirs };
};

// Cancels any copy in-progress for the given job and resolves pending overwrite prompts with 'cancel'
const performCopyCancellation = async (job) => {
  try {
    if (!job) return;
    
    // Abort the controller signal to stop the copy operation
    if (job.controller && !job.controller.signal.aborted) {
      job.controller.abort();
      console.log(
        `[performCopyCancellation] job ${job?.id} trace=${
          job?._traceId ?? "n/a"
        } controller aborted`
      );
    }
    
    // Mark the job as cancelled
    job.status = "cancelled";
    job.overwriteDecision = "cancel";
    console.log(
      `[performCopyCancellation] job ${job?.id} trace=${
        job?._traceId ?? "n/a"
      } status and overwriteDecision set to 'cancelled' and 'cancel'`
    );

    // If using legacy array-based resolvers, invoke them
    if (
      Array.isArray(job.overwriteResolvers) &&
      job.overwriteResolvers.length > 0
    ) {
      try {
        for (const r of job.overwriteResolvers) {
          try {
            if (typeof r === "function") r("cancel");
          } catch (err) {
            console.warn(
              `[performCopyCancellation] legacy resolver threw: ${err.message}`
            );
          }
        }
      } finally {
        job.overwriteResolvers = [];
      }
    }

    // If we have a Map of resolvers, delete and invoke each
    if (job.overwriteResolversMap && job.overwriteResolversMap.size > 0) {
      for (const [pid, r] of Array.from(job.overwriteResolversMap.entries())) {
        try {
          if (typeof r === "function") r("cancel");
        } catch (err) {
          console.warn(
            `[performCopyCancellation] resolver threw for prompt ${pid}: ${err?.message}`
          );
        }
        try {
          job.overwriteResolversMap.delete(pid);
        } catch (err) {}
      }
      try {
        unregisterAllForJob(job?.id, job);
      } catch (e) {
        console.warn(
          `[performCopyCancellation] Failed to unregister all prompts for job ${job?.id}: ${e?.message}`
        );
      }
    }

    // Clear timers if present
    try {
      if (job._promptTimers) {
        for (const t of job._promptTimers.values()) {
          try {
            clearTimeout(t);
          } catch (e) {}
        }
        job._promptTimers.clear();
      }
    } catch (e) {}
  } catch (e) {
    console.error(`[performCopyCancellation] exception: ${e?.message}`, e);
  }
};

export {
  getDirSizeWithProgress,
  getDirTotalSize,
  performCopyCancellation,
  getDirSize,
  getDirSizeWithScanProgress,
  copyWithProgress,
  getAllFiles,
  getAllFilesAndDirsRecursive,
};
