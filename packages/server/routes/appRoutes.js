import express from "express";
import { performCopyCancellation } from "../lib/utils.js";

export default function createAppRoutes(
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
  const router = express.Router();

  // POST /api/exit - Gracefully exit/quit the application
  // Works for both Node dev and Electron builds
  router.post("/exit", async (req, res) => {
    try {
      console.log(
        "[server] Exit request received. Initiating graceful shutdown..."
      );

      // Cancel all active jobs before shutting down
      let cancelledCount = 0;

      // Cancel copy jobs using proper cancellation
      for (const [jobId, job] of activeCopyJobs.entries()) {
        try {
          await performCopyCancellation(job);
          console.log(`[server] Cancelled copy job: ${jobId}`);
          cancelledCount++;
        } catch (e) {
          console.warn(
            `[server] Failed to cancel copy job ${jobId}:`,
            e.message
          );
        }
      }

      // Cancel duplicate jobs - set status first, then abort
      for (const [jobId, job] of activeDuplicateJobs.entries()) {
        try {
          if (job.status === "scanning" || job.status === "copying") {
            job.status = "cancelled";
            job.controller.abort();
            console.log(`[server] Cancelled duplicate job: ${jobId}`);
            cancelledCount++;
          }
        } catch (e) {
          console.warn(
            `[server] Failed to cancel duplicate job ${jobId}:`,
            e.message
          );
        }
      }

      // Cancel copy paths jobs - set status first
      for (const [jobId, job] of activeCopyPathsJobs.entries()) {
        try {
          if (job.controller && !job.controller.signal.aborted) {
            job.status = "cancelled";
            job.controller.abort();
            console.log(`[server] Cancelled copy paths job: ${jobId}`);
            cancelledCount++;
          }
        } catch (e) {
          console.warn(
            `[server] Failed to cancel copy paths job ${jobId}:`,
            e.message
          );
        }
      }

      // Cancel size calculation jobs
      for (const [jobId, job] of activeSizeJobs.entries()) {
        try {
          if (job.controller && !job.controller.signal.aborted) {
            job.status = "cancelled";
            job.controller.abort();
            console.log(`[server] Cancelled size calculation job: ${jobId}`);
            cancelledCount++;
          }
        } catch (e) {
          console.warn(
            `[server] Failed to cancel size job ${jobId}:`,
            e.message
          );
        }
      }

      // Cancel compression jobs
      for (const [jobId, job] of activeCompressJobs.entries()) {
        try {
          if (job.controller && !job.controller.signal.aborted) {
            job.status = "cancelled";
            job.controller.abort();
            console.log(`[server] Cancelled compression job: ${jobId}`);
            cancelledCount++;
          }
        } catch (e) {
          console.warn(
            `[server] Failed to cancel compression job ${jobId}:`,
            e.message
          );
        }
      }

      // Cancel decompression jobs
      for (const [jobId, job] of activeDecompressJobs.entries()) {
        try {
          if (job.controller && !job.controller.signal.aborted) {
            job.status = "cancelled";
            job.controller.abort();
            console.log(`[server] Cancelled decompression job: ${jobId}`);
            cancelledCount++;
          }
        } catch (e) {
          console.warn(
            `[server] Failed to cancel decompression job ${jobId}:`,
            e.message
          );
        }
      }

      // Cancel archive test jobs
      for (const [jobId, job] of activeArchiveTestJobs.entries()) {
        try {
          if (job.controller && !job.controller.signal.aborted) {
            job.status = "cancelled";
            job.controller.abort();
            console.log(`[server] Cancelled archive test job: ${jobId}`);
            cancelledCount++;
          }
        } catch (e) {
          console.warn(
            `[server] Failed to cancel archive test job ${jobId}:`,
            e.message
          );
        }
      }

      // Cancel zip operations
      for (const [jobId, job] of activeZipOperations.entries()) {
        try {
          if (job.controller && !job.controller.signal.aborted) {
            job.status = "cancelled";
            job.controller.abort();
            console.log(`[server] Cancelled zip operation: ${jobId}`);
            cancelledCount++;
          }
        } catch (e) {
          console.warn(
            `[server] Failed to cancel zip operation ${jobId}:`,
            e.message
          );
        }
      }

      // Kill all terminal sessions
      for (const [jobId, job] of activeTerminalJobs.entries()) {
        try {
          if (job.ptyProcess) {
            job.ptyProcess.kill();
            console.log(`[server] Killed terminal session: ${jobId}`);
            cancelledCount++;
          }
        } catch (e) {
          console.warn(`[server] Failed to kill terminal ${jobId}:`, e.message);
        }
      }

      console.log(`[server] Cancelled ${cancelledCount} active job(s)`);

      // Send response before shutting down
      res.status(200).json({
        success: true,
        message: "Application shutting down",
        cancelledJobs: cancelledCount,
      });

      // Give the response time to be sent and jobs to clean up before exiting
      setTimeout(() => {
        console.log("[server] Graceful shutdown complete. Exiting...");

        // Detect if we're running in Electron or standalone Node
        const isElectron = process.versions && process.versions.electron;

        if (isElectron) {
          // In Electron, the window close will trigger app.quit, but we need
          // to ensure the process exits if the window doesn't close properly
          console.log(
            "[server] Running in Electron - window close will trigger app.quit"
          );
          // Exit after a delay to allow window close handler to take over
          setTimeout(() => {
            console.log("[server] Forcing exit after window close timeout");
            process.exit(0);
          }, 1000);
        } else {
          // In Node dev build, kill parent npm process to force clean shutdown
          console.log("[server] Running in Node dev - terminating npm process");

          setTimeout(() => {
            try {
              // Kill the parent npm process which will cascade to concurrently
              if (process.ppid) {
                if (process.platform === "win32") {
                  // On Windows, use taskkill to forcefully terminate the parent process tree
                  const { execSync } = require("child_process");
                  try {
                    execSync(`taskkill /pid ${process.ppid} /T /F`, {
                      stdio: "ignore",
                    });
                  } catch (e) {
                    // If taskkill fails, just exit normally
                    console.log("[server] taskkill failed, exiting normally");
                  }
                } else {
                  // On Unix-like systems (macOS, Linux), use SIGTERM
                  process.kill(process.ppid, "SIGTERM");
                }
              }
            } catch (e) {
              console.log("[server] Could not kill parent:", e.message);
            }
            // Exit this process
            process.exit(0);
          }, 100);
        }
      }, 250);
    } catch (error) {
      console.error("[server] Error during exit:", error);
      res.status(500).json({
        success: false,
        message: "Failed to exit application",
        error: error.message,
      });
    }
  });

  return router;
}
