import { useState, useRef, useCallback } from "react";
import { buildFullPath, basename } from "../lib/utils";
import { compressFiles } from "../lib/api";

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

  const handleCancelCompress = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
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

  const handleCompress = useCallback(async (targetPanelId) => {
    const sourcePanelId = activePanel;
    const sourcePath = panels[sourcePanelId].path;

    const itemsToConsider = filter[sourcePanelId].pattern
      ? filteredItems[sourcePanelId]
      : panels[sourcePanelId].items;

    const itemsToCompress = [...selections[sourcePanelId]]
      .map((itemName) =>
        itemsToConsider.find((item) => item.name === itemName)
      )
      .filter(Boolean); // Filter out any nulls if item not found

    if (itemsToCompress.length === 0) {
      setError("No items selected for compression.");
      return;
    }

    const itemPaths = itemsToCompress.map((item) =>
      buildFullPath(sourcePath, item.name)
    );
    const destinationPath =
      targetPanelId === sourcePanelId ? sourcePath : panels[targetPanelId].path;

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
      const response = await compressFiles(
        itemPaths,
        destinationPath,
        sourcePath
      );
      const { jobId } = response;

      setCompressProgress((prev) => ({ ...prev, jobId }));

      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${wsProtocol}//${window.location.host}/ws?jobId=${jobId}&type=compress`
      );
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
            setFocusedItem((prev) => ({ ...prev, [targetPanel]: zipFileName }));
            setActivePanel(targetPanel);
            panelRefs[targetPanel].current?.focus();
          }, 500); // Small delay to allow panel to refresh

          ws.close();
        } else if (data.type === "error") {
          setCompressProgress((prev) => ({
            ...prev,
            isVisible: false,
            error: data.message,
          }));
          setError(`Compression failed: ${data.message}`);
          ws.close();
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
        ws.close();
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
  }, [activePanel, panels, selections, setError, handleRefreshPanel, setSelections, setFocusedItem, setActivePanel, panelRefs, wsRef, filter, filteredItems]);

  const handleCompressInActivePanel = useCallback(() => {
    handleCompress(activePanel);
  }, [handleCompress, activePanel]);

  const handleCompressToOtherPanel = useCallback(() => {
    const otherPanelId = activePanel === "left" ? "right" : "left";
    handleCompress(otherPanelId);
  }, [handleCompress, activePanel]);

  return {
    compressProgress,
    handleCancelCompress,
    handleCompressInActivePanel,
    handleCompressToOtherPanel,
  };
};

export default useCompress;
