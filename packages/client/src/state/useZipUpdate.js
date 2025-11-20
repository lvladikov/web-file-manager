import { useState, useCallback, useRef } from "react";
import { cancelZipOperation } from "../lib/api";
import { isVerboseLogging } from "../lib/utils";

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
    triggeredFromConsole: false,
  });

  const wsRef = useRef(null);
  const jobIdRef = useRef(null);
  // Map of jobId -> { onComplete: Set, onError: Set, onCancel: Set, onProgress: Set }
  const jobListenersRef = useRef(new Map());

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
    // Remove per-job listeners for the current job if present
    if (jobIdRef.current && jobListenersRef.current) {
      try {
        jobListenersRef.current.delete(jobIdRef.current);
      } catch (e) {}
    }
    jobIdRef.current = null;
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
        try {
          if (isVerboseLogging()) {
            console.warn(
              `[useZipUpdate] WebSocket not open for job ${jobIdToCancel}, hiding modal directly.`
            );
          }
        } catch (e) {}
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
      triggeredFromConsole = false,
    }) => {
      // If the same job is already running, don't reset the state
      if (jobId && jobIdRef.current === jobId) {
        // Just ensure it's visible
        setZipUpdateProgressModal((prev) => ({ ...prev, isVisible: true }));
        return;
      }

      if (jobId) {
        jobIdRef.current = jobId; // Store jobId immediately if provided
        // Ensure listener entry exists for job
        if (!jobListenersRef.current.has(jobId)) {
          jobListenersRef.current.set(jobId, {
            onComplete: new Set(),
            onError: new Set(),
            onCancel: new Set(),
            onProgress: new Set(),
          });
        }
      } else {
        jobIdRef.current = null; // Reset if jobId is not provided initially
      }

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
            try {
              if (isVerboseLogging()) {
                console.warn(
                  "[useZipUpdate] Attempted to cancel zip update before jobId was known."
                );
              }
            } catch (e) {}
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
        triggeredFromConsole: triggeredFromConsole,
      };

      setZipUpdateProgressModal(newState);
    },
    [setZipUpdateProgressModal, cancelZipUpdate, hideZipUpdate]
  );

  const connectZipUpdateWebSocket = useCallback(
    (jobId, jobType, callbacksOrOnComplete = null) => {
      if (!jobId || !jobType) {
        console.error(
          "connectZipUpdateWebSocket called without jobId or jobType"
        );
        return;
      }

      // Normalize callbacks argument
      let callbacks = {};
      if (typeof callbacksOrOnComplete === "function") {
        callbacks = { onComplete: callbacksOrOnComplete };
      } else if (
        typeof callbacksOrOnComplete === "object" &&
        callbacksOrOnComplete !== null
      ) {
        callbacks = callbacksOrOnComplete;
      }

      // Add the callbacks to the per-job listeners if provided
      if (Object.keys(callbacks).length > 0) {
        if (!jobListenersRef.current.has(jobId)) {
          jobListenersRef.current.set(jobId, {
            onComplete: new Set(),
            onError: new Set(),
            onCancel: new Set(),
            onProgress: new Set(),
          });
        }
        const listeners = jobListenersRef.current.get(jobId);
        if (
          callbacks.onComplete &&
          typeof callbacks.onComplete === "function"
        ) {
          listeners.onComplete.add(callbacks.onComplete);
        }
        if (callbacks.onError && typeof callbacks.onError === "function") {
          listeners.onError.add(callbacks.onError);
        }
        if (callbacks.onCancel && typeof callbacks.onCancel === "function") {
          listeners.onCancel.add(callbacks.onCancel);
        }
        if (
          callbacks.onProgress &&
          typeof callbacks.onProgress === "function"
        ) {
          listeners.onProgress.add(callbacks.onProgress);
        }
        jobListenersRef.current.set(jobId, listeners);
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
        try {
          if (isVerboseLogging()) {
            console.warn(
              `[useZipUpdate] WebSocket already connected or connecting for job ${jobId}. Skipping reconnect.`
            );
          }
        } catch (e) {}
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
              try {
                if (isVerboseLogging()) {
                  console.warn(
                    `[useZipUpdate] Modal not visible or jobId mismatch (modal: ${prev.jobId}, connection: ${currentWsJobId}). Ignoring message.`
                  );
                }
              } catch (e) {}
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

                if (prev.triggeredFromConsole) {
                  try {
                    if (isVerboseLogging()) {
                      console.log(
                        `[Zip Update Progress] Job: ${currentWsJobId}`,
                        data
                      );
                    }
                  } catch (e) {}
                }
                // Fire per-job onProgress listeners
                try {
                  const listeners = jobListenersRef.current.get(currentWsJobId);
                  if (
                    listeners &&
                    listeners.onProgress &&
                    listeners.onProgress.size
                  ) {
                    for (const fn of listeners.onProgress) {
                      try {
                        fn(data);
                      } catch (err) {
                        console.error(
                          "useZipUpdate: onProgress listener error",
                          err
                        );
                      }
                    }
                  }
                } catch (err) {
                  console.error(
                    "useZipUpdate: error invoking onProgress listeners",
                    err
                  );
                }
                break;
              case "complete":
                if (prev.triggeredFromConsole) {
                  try {
                    if (isVerboseLogging()) {
                      console.log(
                        `[Zip Update Progress] Job Completed: ${currentWsJobId}`
                      );
                    }
                  } catch (e) {}
                }
                // Execute per-job onComplete listeners
                try {
                  const listeners = jobListenersRef.current.get(currentWsJobId);
                  if (
                    listeners &&
                    listeners.onComplete &&
                    listeners.onComplete.size
                  ) {
                    for (const fn of listeners.onComplete) {
                      try {
                        fn();
                      } catch (err) {
                        console.error(
                          "useZipUpdate: onComplete listener error",
                          err
                        );
                      }
                    }
                  }
                  jobListenersRef.current.delete(currentWsJobId);
                } catch (err) {
                  console.error(
                    "useZipUpdate: error invoking onComplete listeners",
                    err
                  );
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
                try {
                  const listeners = jobListenersRef.current.get(currentWsJobId);
                  if (
                    listeners &&
                    listeners.onError &&
                    listeners.onError.size
                  ) {
                    for (const fn of listeners.onError) {
                      try {
                        fn(data.message);
                      } catch (err) {
                        console.error(
                          "useZipUpdate: onError listener error",
                          err
                        );
                      }
                    }
                  }
                  jobListenersRef.current.delete(currentWsJobId);
                } catch (err) {
                  console.error(
                    "useZipUpdate: error invoking onError listeners",
                    err
                  );
                }

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
                try {
                  const listeners = jobListenersRef.current.get(currentWsJobId);
                  if (
                    listeners &&
                    listeners.onCancel &&
                    listeners.onCancel.size
                  ) {
                    for (const fn of listeners.onCancel) {
                      try {
                        fn();
                      } catch (err) {
                        console.error(
                          "useZipUpdate: onCancel listener error",
                          err
                        );
                      }
                    }
                  }
                  jobListenersRef.current.delete(currentWsJobId);
                } catch (err) {
                  console.error(
                    "useZipUpdate: error invoking onCancel listeners",
                    err
                  );
                }

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
                try {
                  if (isVerboseLogging()) {
                    console.warn(
                      `[useZipUpdate] Unhandled WS message type for job ${currentWsJobId}: ${data.type}`
                    );
                  }
                } catch (e) {}
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
          // If callbacks remain, it means the connection closed without a final message (unexpected)
          const listeners = jobListenersRef.current.get(closedWsJobId);
          if (
            listeners &&
            (listeners.onCancel.size > 0 || listeners.onError.size > 0)
          ) {
            try {
              if (isVerboseLogging()) {
                console.warn(
                  `[useZipUpdate] WebSocket closed unexpectedly for job ${closedWsJobId}. Triggering onCancel/onError.`
                );
              }
            } catch (e) {}
            try {
              if (listeners.onCancel && listeners.onCancel.size) {
                for (const fn of listeners.onCancel) {
                  try {
                    fn();
                  } catch (err) {
                    console.error("useZipUpdate: onCancel listener error", err);
                  }
                }
              } else if (listeners.onError && listeners.onError.size) {
                for (const fn of listeners.onError) {
                  try {
                    fn("Connection closed unexpectedly");
                  } catch (err) {
                    console.error("useZipUpdate: onError listener error", err);
                  }
                }
              }
            } catch (err) {
              console.error(
                "useZipUpdate: error calling onclose listeners",
                err
              );
            }
            jobListenersRef.current.delete(closedWsJobId);
          }
          hideZipUpdate();
        } else {
          try {
            if (isVerboseLogging()) {
              console.warn(
                `[useZipUpdate] Closed WebSocket for job ${closedWsJobId} is not the current tracked job (${jobIdRef.current}). No cleanup via this onclose.`
              );
            }
          } catch (e) {}
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
          try {
            if (isVerboseLogging()) {
              console.warn(
                `[useZipUpdate] Cleaning up refs and hiding modal via onerror for currently active job ${errorWsJobId}.`
              );
            }
          } catch (e) {}
          // Trigger onError callbacks
          const listeners = jobListenersRef.current.get(errorWsJobId);
          if (listeners && listeners.onError && listeners.onError.size) {
            for (const fn of listeners.onError) {
              try {
                fn(error.message || "WebSocket connection error");
              } catch (err) {
                console.error("useZipUpdate: onError listener error", err);
              }
            }
            jobListenersRef.current.delete(errorWsJobId);
          }
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
