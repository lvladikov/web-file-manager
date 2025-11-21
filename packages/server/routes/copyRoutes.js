import express from "express";
import fse from "fs-extra";
import path from "path";
import crypto from "crypto";
import yauzl from "yauzl-promise";

import {
  performCopyCancellation,
  matchZipPath,
  duplicateInZip,
} from "../lib/utils.js";

// Reuse FM parsing helpers (supports wildcard and /pattern/flags regex strings)
import { parsePatternToRegex } from "../../../misc/fm/utils.js";

export default function createCopyRoutes(
  activeCopyJobs,
  activeDuplicateJobs,
  activeCopyPathsJobs
) {
  const router = express.Router();

  // Endpoint to initiate copy
  router.post("/copy", async (req, res) => {
    const { sources, destination, isMove, overwrite } = req.body;
    if (!sources || sources.length === 0 || !destination) {
      return res
        .status(400)
        .json({ message: "Invalid source or destination." });
    }

    try {
      const jobId = crypto.randomUUID();
      const zipDestMatch = matchZipPath(destination);
      const zipSourceMatch = matchZipPath(sources[0]);

      if (
        zipSourceMatch &&
        zipDestMatch &&
        zipSourceMatch[1] === zipDestMatch[1]
      ) {
        // This is an in-zip copy/duplication. The standard 'zip-add' flow can't handle this
        // because the source is virtual. Reroute to the duplication logic.
        const destPathInZip = zipDestMatch[2];
        let items;

        if (!destPathInZip || destPathInZip === "/") {
          // Destination is the zip root: create copy names
          items = sources.map((sourcePath) => {
            const sourcePathInZip = matchZipPath(sourcePath)[2];
            const sourceName = path.posix.basename(sourcePathInZip);
            const sourceExt = path.posix.extname(sourceName);
            const sourceBase = path.posix.basename(sourceName, sourceExt);
            const newName =
              sourceExt !== ""
                ? `${sourceBase} copy${sourceExt}`
                : `${sourceBase} copy`;
            return { sourcePath, newName };
          });
        } else {
          // Copy into the specified destination name
          items = sources.map((sourcePath) => ({
            sourcePath,
            newName: path.basename(destination),
          }));
        }

        const jobId = crypto.randomUUID();
        const job = {
          id: jobId,
          _traceId: crypto.randomUUID(),
          status: "pending",
          ws: null,
          controller: new AbortController(),
          items,
          isZipDuplicate: true,
          jobType: "duplicate",
          originalZipSize: 0,
          total: 0,
        };
        activeCopyJobs.set(jobId, job);

        let resolveCompletion, rejectCompletion;
        job.completionPromise = new Promise((res, rej) => {
          resolveCompletion = res;
          rejectCompletion = rej;
        });
        job.resolveCompletion = resolveCompletion;
        job.rejectCompletion = rejectCompletion;

        (async () => {
          try {
            const zipFilePath = zipSourceMatch[1];
            job.zipFilePath = zipFilePath;
            job.originalZipSize = (await fse.pathExists(zipFilePath))
              ? (await fse.stat(zipFilePath)).size
              : 0;
            job.total = job.originalZipSize;
            job.status = "copying";

            await duplicateInZip(job);

            job.status = "completed";
            job.resolveCompletion();
          } catch (error) {
            console.error("Error during in-zip copy/duplicate process:", error);
            job.status = job.controller.signal.aborted ? "cancelled" : "failed";
            job.rejectCompletion(error);
          }
        })();

        return res.status(202).json({ jobId });
      }

      let jobType = "copy";
      const sourceZipPathMatch = matchZipPath(sources[0]);
      const sourceZipFilePath = sourceZipPathMatch
        ? sourceZipPathMatch[1]
        : null;
      const sourcePathInZip = sourceZipPathMatch
        ? sourceZipPathMatch[2].startsWith("/")
          ? sourceZipPathMatch[2].substring(1)
          : sourceZipPathMatch[2]
        : null;

      if (zipDestMatch) {
        jobType = "zip-add";
      } else if (sourceZipPathMatch && sourcePathInZip === "") {
        // If the source is a zip file itself (not content within it) and destination is not a zip, treat as regular copy
        jobType = "copy";
      } else if (sourceZipPathMatch) {
        jobType = "zip-extract";
      }

      // If the source is inside a zip and the caller provided itemsToCopy (patterns)
      // expand those hints into explicit source entries inside the zip so websocket
      // handling will operate on concrete entry paths.
      if (
        sourceZipPathMatch &&
        Array.isArray(req.body.itemsToCopy) &&
        req.body.itemsToCopy.length > 0
      ) {
        try {
          const zipFilePath = sourceZipFilePath;
          // Open zip and collect entries
          const zipfileToScan = await yauzl.open(zipFilePath);
          const allEntries = [];
          for await (const entry of zipfileToScan) {
            allEntries.push(entry.filename);
          }
          await zipfileToScan.close();

          const entrySet = new Set(allEntries);
          const expandedSources = [];

          for (const raw of req.body.itemsToCopy) {
            const hint = String(raw).replace(/\\/g, "/").replace(/^\//, "");

            // Exact entry
            if (entrySet.has(hint)) {
              expandedSources.push(`${zipFilePath}/${hint}`);
              continue;
            }

            // Folder hint (entries that start with it)
            const folderHint = hint.endsWith("/") ? hint : `${hint}/`;
            for (const e of allEntries) {
              if (e.startsWith(folderHint)) {
                expandedSources.push(`${zipFilePath}/${e}`);
              }
            }

            // Regex or wildcard - use shared parser
            const re = parsePatternToRegex(hint);
            if (re) {
              for (const e of allEntries) {
                if (re.test(e) || re.test(path.posix.basename(e))) {
                  expandedSources.push(`${zipFilePath}/${e}`);
                }
              }
              continue;
            }

            // Match by basename
            for (const e of allEntries) {
              if (path.posix.basename(e) === hint || e.endsWith(`/${hint}`)) {
                expandedSources.push(`${zipFilePath}/${e}`);
              }
            }
          }

          // Remove duplicates and use these as the request's sources for the job
          req.body.sources = Array.from(new Set(expandedSources));
        } catch (e) {
          console.warn(
            "Failed to expand itemsToCopy for zip source:",
            e?.message || e
          );
        }
      }

      // Normalize client-provided overwrite hint.
      // Accepts:
      //  - boolean: true -> overwrite_all, false -> skip_all
      //  - short strings: 'overwrite' | 'skip' (mapped to global _all tokens)
      //  - canonical server tokens: 'if_newer','smaller_only','no_zero_length','size_differs','cancel'
      let initialOverwrite = "prompt";
      if (typeof overwrite !== "undefined") {
        if (typeof overwrite === "boolean") {
          initialOverwrite = overwrite ? "overwrite_all" : "skip_all";
        } else if (typeof overwrite === "string") {
          const s = overwrite.trim().toLowerCase();
          if (["overwrite", "true"].includes(s)) {
            initialOverwrite = "overwrite_all";
          } else if (["skip", "false"].includes(s)) {
            initialOverwrite = "skip_all";
          } else {
            initialOverwrite = s;
          }
        }
      }

      const job = {
        id: jobId,
        _traceId: crypto.randomUUID(),
        status: "pending",
        ws: null,
        controller: new AbortController(),
        destination,
        sources,
        isMove: isMove || false,
        overwriteDecision: initialOverwrite,
        overwriteResolvers: [],
        jobType,
      };

      activeCopyJobs.set(jobId, job);

      res.status(202).json({ jobId });
    } catch (error) {
      console.error("Error initiating copy:", error);
      res
        .status(500)
        .json({ message: `Failed to start copy: ${error.message}` });
    }
  });

  // Endpoint to cancel a copy job
  router.post("/copy/cancel", async (req, res) => {
    const { jobId } = req.body;
    if (!jobId || !activeCopyJobs.has(jobId)) {
      return res.status(404).json({ message: "Job not found." });
    }
    const job = activeCopyJobs.get(jobId);
    await performCopyCancellation(job);
    res.status(200).json({ message: "Cancellation request received." });
  });

  // Endpoint to duplicate files/folders
  router.post("/duplicate", async (req, res) => {
    const { items, isZipDuplicate } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Invalid items array." });
    }

    try {
      const jobId = crypto.randomUUID();
      const job = {
        id: jobId,
        _traceId: crypto.randomUUID(),
        status: "pending",
        ws: null,
        controller: new AbortController(),
        items,
        // These properties are similar to a copy job and will be used by copyWithProgress
        total: 0,
        copied: 0,
        overwriteDecision: "prompt",
        overwriteResolvers: [],
        isZipDuplicate: isZipDuplicate || false,
        jobType: "duplicate", // Explicitly set job type for websocket
        // Properties needed for zip operations, similar to saveFile
        originalZipSize: 0,
        processedBytes: 0,
        currentFile: "",
        currentFileTotalSize: 0,
        currentFileBytesProcessed: 0,
        tempZipPath: null,
      };
      activeDuplicateJobs.set(jobId, job);

      if (isZipDuplicate) {
        // Prepare a promise that the WebSocket handler can await
        let resolveCompletion;
        let rejectCompletion;
        const completionPromise = new Promise((resolve, reject) => {
          resolveCompletion = resolve;
          rejectCompletion = reject;
        });
        job.completionPromise = completionPromise;
        job.resolveCompletion = resolveCompletion;
        job.rejectCompletion = rejectCompletion;

        // Perform the zip duplication asynchronously
        (async () => {
          try {
            // Assume all items are within the same zip for a single duplicate operation
            const firstSourcePath = items[0]?.sourcePath;
            if (!firstSourcePath)
              throw new Error("No source path provided for zip duplicate.");

            const zipPathMatch = matchZipPath(firstSourcePath);
            if (!zipPathMatch)
              throw new Error(
                "Source path is not a valid zip path for duplication."
              );

            const zipFilePath = zipPathMatch[1];
            job.zipFilePath = zipFilePath; // Store for potential use

            // Calculate original size for progress reporting context
            job.originalZipSize = (await fse.pathExists(zipFilePath))
              ? (await fse.stat(zipFilePath)).size
              : 0;
            // Set total based on source file sizes (approximation for progress)
            job.total = 0;
            job.status = "scanning";

            // Send initial start message if WS connects quickly (or handle in WS handler)
            if (job.ws && job.ws.readyState === 1) {
              job.ws.send(JSON.stringify({ type: "scan_start" }));
            }

            job.total = job.originalZipSize; // coarse approximation

            if (job.ws && job.ws.readyState === 1) {
              job.ws.send(
                JSON.stringify({ type: "scan_complete", total: job.total })
              );
            }
            job.status = "copying"; // Move to copying state

            // The entire multi-step duplication process is now handled by the duplicateInZip function.
            await duplicateInZip(job);

            job.status = "completed";
            job.resolveCompletion(); // Signal success
          } catch (error) {
            console.error("Error during zip duplication process:", error);
            job.status = job.controller.signal.aborted ? "cancelled" : "failed";
            job.rejectCompletion(error); // Signal failure
          }
        })();
      }

      res.status(202).json({ jobId });
    } catch (error) {
      console.error("Duplicate error:", error);
      res
        .status(500)
        .json({ message: `Failed to start duplication: ${error.message}` });
    }
  });

  router.post("/duplicate/cancel", async (req, res) => {
    const { jobId } = req.body;
    if (!jobId || !activeDuplicateJobs.has(jobId)) {
      return res.status(404).json({ message: "Job not found." });
    }
    const job = activeDuplicateJobs.get(jobId);
    if (job.status === "scanning" || job.status === "copying") {
      job.status = "cancelled";
      job.controller.abort();
    }
    res.status(200).json({ message: "Cancellation request received." });
  });

  // Endpoint to get a list of paths
  router.post("/get-paths", async (req, res) => {
    const { items, basePath, isAbsolute, includeSubfolders } = req.body;

    if (!items || !Array.isArray(items) || !basePath) {
      return res.status(400).json({ message: "Invalid request body." });
    }

    const jobId = crypto.randomUUID();
    const job = {
      id: jobId,
      status: "pending",
      ws: null,
      items,
      basePath,
      isAbsolute,
      includeSubfolders,
      controller: new AbortController(),
    };
    activeCopyPathsJobs.set(jobId, job);

    res.status(202).json({ jobId });
  });

  return router;
}
