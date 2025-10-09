import { WebSocketServer } from "ws";
import path from "path";
import fse from "fs-extra";

import {
  getDirSizeWithProgress,
  performCopyCancellation,
  getDirSizeWithScanProgress,
  copyWithProgress,
} from "./utils.js";

export function initializeWebSocketServer(
  server,
  activeCopyJobs,
  activeSizeJobs
) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const jobId = url.searchParams.get("jobId");
    const jobType = url.searchParams.get("type") || "copy";

    const jobMap = jobType === "size" ? activeSizeJobs : activeCopyJobs;

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
            job.sizeSoFar = 0;
            await getDirSizeWithProgress(job.folderPath, job);
            const totalSize = job.sizeSoFar;
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

      ws.on("close", () => {
        console.log(`[ws] Client disconnected for job: ${jobId}`);
        if (job.ws === ws) job.ws = null;
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
