import { useState, useRef, useCallback } from "react";
import { buildFullPath, basename, isVerboseLogging } from "../lib/utils";
import { compressFiles, cancelZipOperation } from "../lib/api";

const useCompress = ({
  activePanel,
  panels,
  selections,
  setError,
  handleRefreshPanel,
  setSelections,
  setFocusedItem,
  setActivePanel,
  panelRefs,
  wsRef,
  filter,
  filteredItems,
}) => {
  const [compressProgress, setCompressProgress] = useState({
    isVisible: false,
    jobId: null,
    currentFile: "",
    totalBytes: 0,
    processedBytes: 0,
    currentFileTotalSize: 0,
    currentFileBytesProcessed: 0,
    instantaneousSpeed: 0,
    outputPath: null,
    error: null,
  });

  const handleCancelCompress = async () => {
    if (wsRef.current && wsRef.current.jobId === compressProgress.jobId) {
      wsRef.current.close(1000, "Starting new job connection");
      wsRef.current = null;
    }
    if (compressProgress.jobId) {
      try {
        await cancelZipOperation(compressProgress.jobId);
      } catch (error) {
        console.error("Failed to cancel zip operation on server:", error);
      }
    }
    setCompressProgress({
      isVisible: false,
      jobId: null,
      currentFile: "",
      totalBytes: 0,
      processedBytes: 0,
      currentFileTotalSize: 0,
      currentFileBytesProcessed: 0,
      instantaneousSpeed: 0,
      outputPath: null,
      error: null,
    });
  };

  const handleCompress = useCallback(
    async (targetPanelId, sourcesArg = null) => {
      const sourcePanelId = activePanel;
      const sourcePath = panels[sourcePanelId].path;

      const itemsToConsider = filter[sourcePanelId].pattern
        ? filteredItems[sourcePanelId]
        : panels[sourcePanelId].items;

      let itemsToCompress = [];
      if (Array.isArray(sourcesArg) && sourcesArg.length > 0) {
        // If FM handler provided explicit full-path sources, use them.
        itemsToCompress = sourcesArg;
      } else {
        itemsToCompress = [...selections[sourcePanelId]]
          .map((itemName) =>
            itemsToConsider.find((item) => item.name === itemName)
          )
          .filter(Boolean); // Filter out any nulls if item not found
      }

      if (!itemsToCompress || itemsToCompress.length === 0) {
        setError("No items selected for compression.");
        return;
      }
      let itemPaths;
      if (
        typeof itemsToCompress[0] === "string" &&
        itemsToCompress[0].includes(sourcePath)
      ) {
        // Already full paths
        itemPaths = itemsToCompress;
      } else {
        itemPaths = itemsToCompress.map((item) =>
          buildFullPath(sourcePath, item.name)
        );
      }
      const destinationPath =
        targetPanelId === sourcePanelId
          ? sourcePath
          : panels[targetPanelId].path;

      setCompressProgress({
        isVisible: true,
        jobId: null,
        currentFile: "",
        totalBytes: 0,
        processedBytes: 0,
        currentFileTotalSize: 0,
        currentFileBytesProcessed: 0,
        instantaneousSpeed: 0,
        outputPath: null,
        error: null,
      });

      try {
        if (isVerboseLogging())
          console.log(
            `[useCompress] Starting compress of ${itemPaths.length} items -> ${destinationPath}`
          );
      } catch (e) {}

      try {
        const response = await compressFiles(
          itemPaths,
          destinationPath,
          sourcePath
        );
        const { jobId } = response;

        setCompressProgress((prev) => ({ ...prev, jobId }));

        try {
          if (isVerboseLogging()) console.log(`[useCompress] jobId=${jobId}`);
        } catch (e) {}

        const wsProtocol =
          window.location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(
          `${wsProtocol}//${window.location.host}/ws?jobId=${jobId}&type=compress`
        );
        ws.jobId = jobId; // attach jobId for safety checks when closing shared ref
        wsRef.current = ws; // Store WebSocket in ref if needed for global access/cancellation

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === "start") {
            setCompressProgress((prev) => ({
              ...prev,
              totalBytes: data.totalSize,
            }));
          } else if (data.type === "progress") {
            setCompressProgress((prev) => ({
              ...prev,
              currentFile: data.currentFile,
              totalBytes: data.total,
              processedBytes: data.processed,
              currentFileTotalSize: data.currentFileTotalSize,
              currentFileBytesProcessed: data.currentFileBytesProcessed,
              instantaneousSpeed: data.instantaneousSpeed,
            }));
          } else if (data.type === "complete") {
            setCompressProgress((prev) => ({
              ...prev,
              isVisible: false,
              outputPath: data.outputPath,
            }));
            setError(null);

            // Select the new ZIP file and focus the correct panel
            const zipFileName = basename(data.outputPath);
            const targetPanel = targetPanelId;

            // Refresh both panels to ensure UI is up-to-date
            handleRefreshPanel("left");
            handleRefreshPanel("right");

            // After refresh, select the item and focus the panel
            // This might require a slight delay or a mechanism to wait for panel data to load
            setTimeout(() => {
              setSelections((prev) => ({
                ...prev,
                [targetPanel]: new Set([zipFileName]),
              }));
              setFocusedItem((prev) => ({
                ...prev,
                [targetPanel]: zipFileName,
              }));
              setActivePanel(targetPanel);
              panelRefs[targetPanel].current?.focus();
            }, 500); // Small delay to allow panel to refresh

            if (
              ws &&
              !ws._closeCalled &&
              (ws.readyState === WebSocket.OPEN ||
                ws.readyState === WebSocket.CONNECTING)
            ) {
              ws._closeCalled = true;
              ws.close(1000, "Compress complete");
            }
          } else if (data.type === "error") {
            setCompressProgress((prev) => ({
              ...prev,
              isVisible: false,
              error: data.message,
            }));
            setError(`Compression failed: ${data.message}`);
            if (
              ws &&
              !ws._closeCalled &&
              (ws.readyState === WebSocket.OPEN ||
                ws.readyState === WebSocket.CONNECTING)
            ) {
              ws._closeCalled = true;
              ws.close(1000, "Compression error");
            }
          }
        };

        ws.onclose = () => {
          // Clean up if not already completed or errored
          setCompressProgress((prev) => {
            if (prev.isVisible && !prev.error && !prev.outputPath) {
              return {
                ...prev,
                isVisible: false,
                error: "Compression cancelled or disconnected.",
              };
            }
            return prev;
          });
        };

        ws.onerror = (err) => {
          console.error("Compression WebSocket error:", err);
          setCompressProgress((prev) => ({
            ...prev,
            isVisible: false,
            error: "WebSocket error during compression.",
          }));
          setError("WebSocket error during compression.");
          if (
            ws &&
            !ws._closeCalled &&
            (ws.readyState === WebSocket.OPEN ||
              ws.readyState === WebSocket.CONNECTING)
          ) {
            ws._closeCalled = true;
            ws.close(1000, "Compression cancelled");
          }
        };
      } catch (err) {
        console.error("Compression failed:", err);
        setCompressProgress((prev) => ({
          ...prev,
          isVisible: false,
          error: err.message,
        }));
        setError(`Compression failed: ${err.message}`);
      }
    },
    [
      activePanel,
      panels,
      selections,
      setError,
      handleRefreshPanel,
      setSelections,
      setFocusedItem,
      setActivePanel,
      panelRefs,
      wsRef,
      filter,
      filteredItems,
    ]
  );

  const handleCompressInActivePanel = useCallback(
    (sourcesArg = null) => {
      handleCompress(activePanel, sourcesArg);
    },
    [handleCompress, activePanel]
  );

  const handleCompressToOtherPanel = useCallback(
    (sourcesArg = null) => {
      const otherPanelId = activePanel === "left" ? "right" : "left";
      handleCompress(otherPanelId, sourcesArg);
    },
    [handleCompress, activePanel]
  );

  return {
    compressProgress,
    handleCancelCompress,
    handleCompressInActivePanel,
    handleCompressToOtherPanel,
  };
};

export default useCompress;
