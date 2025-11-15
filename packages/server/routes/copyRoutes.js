import express from "express";
import fse from "fs-extra";
import path from "path";
import crypto from "crypto";
import {
  performCopyCancellation,
  matchZipPath,
  duplicateInZip,
} from "../lib/utils.js";

export default function createCopyRoutes(
  activeCopyJobs,
  activeDuplicateJobs,
  activeCopyPathsJobs
) {
  const router = express.Router();

  // Endpoint to initiate copy
  router.post("/copy", async (req, res) => {
    const { sources, destination, isMove } = req.body;
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

      const job = {
        id: jobId,
        status: "pending",
        ws: null,
        controller: new AbortController(),
        destination,
        sources,
        isMove: isMove || false,
        overwriteDecision: "prompt",
        resolveOverwrite: null,
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
        status: "pending",
        ws: null,
        controller: new AbortController(),
        items,
        // These properties are similar to a copy job and will be used by copyWithProgress
        total: 0,
        copied: 0,
        overwriteDecision: "prompt",
        resolveOverwrite: null,
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
