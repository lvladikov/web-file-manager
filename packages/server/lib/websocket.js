import { WebSocketServer } from "ws";

import { getDirSizeWithProgress, performCopyCancellation } from "./utils.js";

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

      if (jobType === "copy" && job.resolveWsReady) {
        job.resolveWsReady();
      }

      if (jobType === "copy") {
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
      }

      if (jobType === "size") {
        (async () => {
          try {
            job.sizeSoFar = 0;
            await getDirSizeWithProgress(job.folderPath, job);
            const totalSize = job.sizeSoFar;

            if (job.ws && job.ws.readyState === 1) {
              job.ws.send(
                JSON.stringify({ type: "complete", size: totalSize })
              );
              job.ws.close();
            }
          } catch (error) {
            if (job.status !== "cancelled") job.status = "failed";
            console.error(`Size job ${jobId} failed:`, error.message);
            if (job.ws && job.ws.readyState === 1) {
              const type = job.status === "cancelled" ? "cancelled" : "error";
              job.ws.send(JSON.stringify({ type, message: error.message }));
              job.ws.close();
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
  return wss; // Return the instance in case you need it later
}
