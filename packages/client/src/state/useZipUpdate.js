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
  });

  const wsRef = useRef(null);
  const jobIdRef = useRef(null);

  const cancelZipUpdate = useCallback(
    async (jobIdToCancel) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        // Send cancellation request to the server
        await cancelZipOperation(jobIdToCancel);
        // The server will then close the WebSocket, triggering onclose
      } else {
        // If WebSocket is not open, just hide the modal
        setZipUpdateProgressModal((prev) => ({ ...prev, isVisible: false }));
      }
    },
    [setZipUpdateProgressModal]
  );

  const startZipUpdate = useCallback(
    ({
      zipFilePath,
      filePathInZip,
      originalZipSize,
      itemType = "file",
      operationDescription = "",
    }) => {
      setZipUpdateProgressModal({
        isVisible: true,
        zipFilePath,
        filePathInZip,
        originalZipSize,
        itemType,
        operationDescription,
        onCancel: () => {
          cancelZipUpdate(jobIdRef.current);
        },
        jobId: null, // jobId will be set later
        progress: 0,
        total: originalZipSize,
        currentFile: filePathInZip,
        currentFileBytesProcessed: 0,
        currentFileTotalSize: 0,
        instantaneousSpeed: 0,
      });
    },
    [setZipUpdateProgressModal, cancelZipUpdate]
  );

  const connectZipUpdateWebSocket = useCallback(
    (jobId, jobType) => {
      if (!jobId || !jobType) return;

      jobIdRef.current = jobId;

      // Establish WebSocket connection
      const ws = new WebSocket(
        `ws://${window.location.host}/ws/zip-operations?jobId=${jobId}&type=${jobType}`
      );
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setZipUpdateProgressModal((prev) => {
          switch (data.type) {
            case "start":
              return {
                ...prev,
                total: data.totalSize,
                originalZipSize: data.originalZipSize,
                isVisible: true,
                itemType: prev.itemType,
              };
            case "progress":
              return {
                ...prev,
                progress: data.processed,
                total: data.total,
                currentFile: data.currentFile,
                currentFileBytesProcessed: data.currentFileBytesProcessed,
                currentFileTotalSize: data.currentFileTotalSize,
                instantaneousSpeed: data.instantaneousSpeed,
                tempZipSize: data.tempZipSize || 0,
                originalZipSize: data.originalZipSize || 0,
                itemType: prev.itemType,
              };
            case "complete":
              ws.close();
              return { ...prev, isVisible: false };
            case "error":
            case "cancelled":
              ws.close();
              return { ...prev, isVisible: false };
            default:
              return prev;
          }
        });
      };

      ws.onclose = () => {
        setZipUpdateProgressModal((prev) => ({ ...prev, isVisible: false }));
        wsRef.current = null;
        jobIdRef.current = null;
      };

      ws.onerror = (error) => {
        console.error(
          `[ws] WebSocket error for zip folder creation job ${jobId}:`,
          error
        );
        setZipUpdateProgressModal((prev) => ({ ...prev, isVisible: false }));
      };
    },
    [setZipUpdateProgressModal, cancelZipUpdate]
  );

  const hideZipUpdate = useCallback(() => {
    setZipUpdateProgressModal((prev) => ({ ...prev, isVisible: false }));
  }, [setZipUpdateProgressModal]);

  return {
    zipUpdateProgressModal,
    startZipUpdate,
    hideZipUpdate,
    connectZipUpdateWebSocket,
    setZipUpdateProgressModal,
  };
}
