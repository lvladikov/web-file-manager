import express from "express";
import crypto from "crypto";

export default function createSizeRoutes(activeSizeJobs) {
  const router = express.Router();

  // Endpoint to initiate a folder size calculation
  router.post("/folder-size", async (req, res) => {
    const { folderPath } = req.body;
    if (!folderPath) {
      return res.status(400).json({ message: "Folder path is required." });
    }

    const jobId = crypto.randomUUID();
    const job = {
      id: jobId,
      status: "running",
      ws: null,
      controller: new AbortController(),
      folderPath,
    };
    activeSizeJobs.set(jobId, job);

    res.status(202).json({ jobId });
  });

  // Endpoint to cancel a size calculation
  router.post("/folder-size/cancel", (req, res) => {
    const { jobId } = req.body;
    if (!jobId || !activeSizeJobs.has(jobId)) {
      return res.status(404).json({ message: "Job not found." });
    }
    const job = activeSizeJobs.get(jobId);
    if (job.status === "running") {
      job.status = "cancelled";
      job.controller.abort();
    }
    res.status(200).json({ message: "Cancellation request received." });
  });

  return router;
}
