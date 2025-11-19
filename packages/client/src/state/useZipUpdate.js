import { useState, useCallback, useRef } from "react";
import { cancelZipOperation } from "../lib/api";

export default function useZipUpdate() {
  const [zipUpdateProgressModal, setZipUpdateProgressModal] = useState({
    isVisible: false,
    filePathInZip: "",
    zipFilePath: "",
    originalZipSize: 0,
    itemType: "file",
    operationDescription: "",
    onCancel: () => {},
    jobId: null,
    progress: 0,
    total: 0,
    currentFile: "",
    currentFileBytesProcessed: 0,
    currentFileTotalSize: 0,
    instantaneousSpeed: 0,
    tempZipSize: 0,
    title: "Updating Zip Archive...",
    triggeredFromPreview: false,
  });

  const wsRef = useRef(null);
  const jobIdRef = useRef(null);
  // Store multiple completion callbacks for the same job
  const completionCallbacksRef = useRef([]);

  const hideZipUpdate = useCallback(() => {
    setZipUpdateProgressModal((prev) => ({
      ...prev,
      isVisible: false,
      jobId: null,
      progress: 0,
      total: 0,
      currentFile: "",
      tempZipSize: 0,
      originalZipSize: 0,
      error: null,
    }));
    // Clear refs as the operation associated with the modal is ending
    wsRef.current = null;
    jobIdRef.current = null;
    completionCallbacksRef.current = [];
  }, [setZipUpdateProgressModal]);

  const cancelZipUpdate = useCallback(
    async (jobIdToCancel) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        // Send cancellation request to the server
        try {
          await cancelZipOperation(jobIdToCancel);
          // Server should close the WebSocket, triggering onclose which calls hideZipUpdate
        } catch (error) {
          console.error(
            `[useZipUpdate] Failed to send cancel request for job ${jobIdToCancel}:`,
            error
          );
          // Force hide modal if API call fails
          hideZipUpdate();
        }
      } else {
        console.warn(
          `[useZipUpdate] WebSocket not open for job ${jobIdToCancel}, hiding modal directly.`
        );
        hideZipUpdate();
      }
    },
    [hideZipUpdate]
  );

  const startZipUpdate = useCallback(
    ({
      zipFilePath,
      filePathInZip,
      originalZipSize = 0,
      itemType = "file",
      operationDescription = "",
      title = "Updating Zip Archive...",
      jobId = null, // Allow passing jobId directly if known initially
      triggeredFromPreview = false,
    }) => {
      // If the same job is already running, don't reset the state
      if (jobId && jobIdRef.current === jobId) {
        // Just ensure it's visible
        setZipUpdateProgressModal((prev) => ({ ...prev, isVisible: true }));
        return;
      }

      if (jobId) {
        jobIdRef.current = jobId; // Store jobId immediately if provided
      } else {
        jobIdRef.current = null; // Reset if jobId is not provided initially
      }
      
      // Clear callbacks for new job
      completionCallbacksRef.current = [];

      const newState = {
        isVisible: true,
        zipFilePath,
        filePathInZip,
        originalZipSize,
        itemType,
        operationDescription,
        onCancel: () => {
          const idToCancel = jobIdRef.current;
          if (idToCancel) {
            cancelZipUpdate(idToCancel);
          } else {
            console.warn(
              "[useZipUpdate] Attempted to cancel zip update before jobId was known."
            );
            hideZipUpdate();
          }
        },
        jobId: jobId,
        progress: 0,
        total: originalZipSize,
        currentFile: filePathInZip || "Initializing...",
        currentFileBytesProcessed: 0,
        currentFileTotalSize: 0,
        instantaneousSpeed: 0,
        tempZipSize: 0,
        title: title,
        triggeredFromPreview: triggeredFromPreview,
      };

      setZipUpdateProgressModal(newState);
    },
    [setZipUpdateProgressModal, cancelZipUpdate, hideZipUpdate]
  );

  const connectZipUpdateWebSocket = useCallback(
    (jobId, jobType, onComplete = null) => {
      if (!jobId || !jobType) {
        console.error(
          "connectZipUpdateWebSocket called without jobId or jobType"
        );
        return;
      }

      // Add the callback to the list if provided
      if (onComplete && typeof onComplete === "function") {
        // If this is a new job (different from current), clear old callbacks first
        if (jobIdRef.current && jobIdRef.current !== jobId) {
           completionCallbacksRef.current = [];
        }
        completionCallbacksRef.current.push(onComplete);
      }

      // If there's an existing WebSocket for a different job, close it first.
      if (wsRef.current && jobIdRef.current && jobIdRef.current !== jobId) {
        // Only close the ws if it belongs to a different job than the one we are starting
        if (wsRef.current.jobId && wsRef.current.jobId !== jobIdRef.current) {
          wsRef.current.close(1000, "Starting new job connection");
        }
        // Setting refs to null immediately can be problematic if onclose hasn't fired
        // Let the onclose handler manage clearing the refs based on the closed jobId
      }

      // If a WebSocket for the *same* job already exists, don't reconnect.
      if (
        wsRef.current &&
        jobIdRef.current === jobId &&
        wsRef.current.readyState < 2
      ) {
        // Check if not CLOSING or CLOSED
        console.warn(
          `[useZipUpdate] WebSocket already connected or connecting for job ${jobId}. Skipping reconnect.`
        );
        // Ensure the modal knows the correct jobId
        setZipUpdateProgressModal((prev) =>
          prev.jobId !== jobId
            ? { ...prev, jobId: jobId, isVisible: true }
            : { ...prev, isVisible: true }
        );
        return;
      }

      jobIdRef.current = jobId; // Store the new jobId as the *current* one

      // Ensure modal state reflects the current jobId we are connecting for
      setZipUpdateProgressModal((prev) => ({
        ...prev,
        jobId: jobId,
        isVisible: true,
      }));

      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${wsProtocol}//${window.location.host}/ws?jobId=${jobId}&type=${jobType}`
      );
      ws.jobId = jobId;
      wsRef.current = ws; // Store the new WebSocket instance

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Use the jobId captured in this specific WebSocket's closure scope
          const currentWsJobId = jobId;

          setZipUpdateProgressModal((prev) => {
            // Update state ONLY if the modal's jobId matches THIS WebSocket's jobId
            if (!prev.isVisible || prev.jobId !== currentWsJobId) {
              console.warn(
                `[useZipUpdate] Modal not visible or jobId mismatch (modal: ${prev.jobId}, connection: ${currentWsJobId}). Ignoring message.`
              );
              return prev; // Prevent updates if modal is closed or for a different job
            }

            let updatedState = { ...prev };

            switch (data.type) {
              case "start":
                if (data.totalSize !== undefined)
                  updatedState.total = data.totalSize;
                if (data.originalZipSize !== undefined)
                  updatedState.originalZipSize = data.originalZipSize;
                break;
              case "overwrite_prompt":
                // Show overwrite modal for zip update flows and include promptId
                setOverwritePrompt({
                  isVisible: true,
                  item: {
                    name: data.file,
                    type: data.itemType,
                    promptId: data.promptId,
                  },
                  jobType: jobType,
                });
                break;
              case "progress":
                if (data.processed !== undefined)
                  updatedState.progress = data.processed;
                if (data.total !== undefined) updatedState.total = data.total;
                if (data.currentFile !== undefined)
                  updatedState.currentFile = data.currentFile;
                if (data.currentFileBytesProcessed !== undefined)
                  updatedState.currentFileBytesProcessed =
                    data.currentFileBytesProcessed;
                if (data.currentFileTotalSize !== undefined)
                  updatedState.currentFileTotalSize = data.currentFileTotalSize;
                if (data.instantaneousSpeed !== undefined)
                  updatedState.instantaneousSpeed = data.instantaneousSpeed;
                if (data.tempZipSize !== undefined)
                  updatedState.tempZipSize = data.tempZipSize;
                if (data.originalZipSize !== undefined)
                  updatedState.originalZipSize = data.originalZipSize;
                break;
              case "complete":
                // Execute all registered callbacks
                if (completionCallbacksRef.current && completionCallbacksRef.current.length > 0) {
                  completionCallbacksRef.current.forEach(cb => {
                    try {
                      if (typeof cb === 'function') cb();
                    } catch (err) {
                      console.error("connectZipUpdateWebSocket callback error:", err);
                    }
                  });
                }
                
                if (
                  ws &&
                  !ws._closeCalled &&
                  (ws.readyState === WebSocket.OPEN ||
                    ws.readyState === WebSocket.CONNECTING)
                ) {
                  ws._closeCalled = true;
                  ws.close(1000, "Job Completed");
                }
                updatedState.isVisible = false;
                break;
              case "error":
                console.error(
                  `[useZipUpdate] Job ${currentWsJobId} error via WebSocket:`,
                  data.message
                );
                if (
                  ws &&
                  !ws._closeCalled &&
                  (ws.readyState === WebSocket.OPEN ||
                    ws.readyState === WebSocket.CONNECTING)
                ) {
                  ws._closeCalled = true;
                  ws.close(1000, "Job Error");
                }
                updatedState.isVisible = false;
                break;
              case "cancelled":
                if (
                  ws &&
                  !ws._closeCalled &&
                  (ws.readyState === WebSocket.OPEN ||
                    ws.readyState === WebSocket.CONNECTING)
                ) {
                  ws._closeCalled = true;
                  ws.close(1000, "Job Cancelled");
                }
                updatedState.isVisible = false;
                break;
              default:
                console.warn(
                  `[useZipUpdate] Unhandled WS message type for job ${currentWsJobId}: ${data.type}`
                );
                return prev; // Return previous state if type is unhandled
            }

            return updatedState; // Return the calculated new state
          });
        } catch (e) {
          console.error(
            "[useZipUpdate] Error parsing WebSocket message:",
            e,
            "Data:",
            event.data
          );
        }
      };

      ws.onopen = () => {
        // Use the jobId captured in this specific WebSocket's closure
        const currentWsJobId = jobId;
        // Check if the connection belongs to the currently tracked job in the ref
        if (jobIdRef.current !== currentWsJobId) {
          // This connection is for an older job, the ref has been updated. Close it.
          if (
            ws &&
            !ws._closeCalled &&
            (ws.readyState === WebSocket.OPEN ||
              ws.readyState === WebSocket.CONNECTING)
          ) {
            ws._closeCalled = true;
            ws.close(1000, "Stale connection");
          }
        }
      };

      ws.onclose = (event) => {
        // Use the jobId captured in this specific WebSocket's closure
        const closedWsJobId = jobId;

        // Only clear refs and hide modal if the closed WS corresponds to the *currently active* job reference
        if (jobIdRef.current === closedWsJobId) {
          hideZipUpdate();
        } else {
          console.warn(
            `[useZipUpdate] Closed WebSocket for job ${closedWsJobId} is not the current tracked job (${jobIdRef.current}). No cleanup via this onclose.`
          );
          // Do not clear refs here, as they belong to the newer connection.
          // Do not hide the modal, as it might be showing progress for the newer job.
        }
      };

      ws.onerror = (error) => {
        // Use the jobId captured in this specific WebSocket's closure
        const errorWsJobId = jobId;
        console.error(
          `[useZipUpdate] WebSocket error for job ${errorWsJobId}:`,
          error.message || "Unknown WS error"
        );
        // Only clear refs and hide modal if the error is for the currently active job reference
        if (jobIdRef.current === errorWsJobId) {
          console.warn(
            `[useZipUpdate] Cleaning up refs and hiding modal via onerror for currently active job ${errorWsJobId}.`
          );
          hideZipUpdate();
        } else {
          console.error(
            `[useZipUpdate] Error on WebSocket for job ${errorWsJobId}, but current job is ${jobIdRef.current}. No cleanup via this onerror.`
          );
        }
      };
    },
    [setZipUpdateProgressModal, hideZipUpdate]
  );

  return {
    zipUpdateProgressModal,
    startZipUpdate,
    hideZipUpdate,
    connectZipUpdateWebSocket,
    setZipUpdateProgressModal,
  };
}

