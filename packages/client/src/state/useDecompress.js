import { useState, useCallback } from "react";
import { decompressFiles, cancelDecompress } from "../lib/api";
import { buildFullPath, truncatePath } from "../lib/utils";

const useDecompress = ({
  activePanel,
  panels,
  selections,
  setError,
  handleRefreshPanel,
  wsRef,
  setActivePanel,
  setSelections,
  setFocusedItem,
  panelRefs,
  overwritePrompt,
  setOverwritePrompt,
  filter,
  filteredItems,
}) => {
  const [decompressProgress, setDecompressProgress] = useState({
    isVisible: false,
    jobId: null,
    currentFile: "",
    totalBytes: 0,
    processedBytes: 0,
    currentFileTotalSize: 0,
    currentFileBytesProcessed: 0,
    instantaneousSpeed: 0,
    error: null,
    targetPanelId: null, // Track target panel
  });

  const handleCancelDecompress = () => {
    if (
      overwritePrompt.isVisible &&
      wsRef.current?.readyState === WebSocket.OPEN
    ) {
      wsRef.current.send(
        JSON.stringify({ type: "overwrite_response", decision: "cancel" })
      );
      setOverwritePrompt({ isVisible: false, item: null, jobType: null });
    } else if (decompressProgress.jobId) {
      cancelDecompress(decompressProgress.jobId);
    }
    // Immediately close the modal and reset state on client-side cancellation
    setDecompressProgress({
      isVisible: false,
      jobId: null,
      currentFile: "",
      totalBytes: 0,
      processedBytes: 0,
      currentFileTotalSize: 0,
      currentFileBytesProcessed: 0,
      instantaneousSpeed: 0,
      error: null,
      destinationPath: null,
      targetPanelId: null,
    });
    if (wsRef.current) {
      wsRef.current.close(); // Explicitly close the WebSocket connection
    }
  };

  const handleDecompress = useCallback(async (targetPanelId) => {
    const sourcePanelId = activePanel;
    const sourcePath = panels[sourcePanelId].path;
    const selection = [...selections[sourcePanelId]];

    if (selection.length !== 1) {
      setError("Please select a single archive to decompress.");
      return;
    }

    const itemsToConsider = filter[sourcePanelId].pattern
      ? filteredItems[sourcePanelId]
      : panels[sourcePanelId].items;

    const archiveItem = itemsToConsider.find(
      (item) => item.name === selection[0]
    );

    if (!archiveItem || archiveItem.type !== "archive") {
      setError("The selected item is not a valid archive.");
      return;
    }

    const source = { path: sourcePath, name: archiveItem.name };

    // Create a subfolder name from the archive's name by removing the extension
    const subfolderName = archiveItem.name.replace(/\.[^/.]+$/, "");
    const baseDestinationPath = panels[targetPanelId].path;
    const destinationPath = buildFullPath(baseDestinationPath, subfolderName);

    setDecompressProgress({
      isVisible: true,
      jobId: null,
      currentFile: "Preparing...",
      totalBytes: 0,
      processedBytes: 0,
      currentFileTotalSize: 0,
      currentFileBytesProcessed: 0,
      instantaneousSpeed: 0,
      error: null,
      destinationPath: destinationPath,
      targetPanelId: targetPanelId,
    });

    try {
      const { jobId } = await decompressFiles(source, destinationPath);
      setDecompressProgress((prev) => ({ ...prev, jobId }));

      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${wsProtocol}//${window.location.host}/ws?jobId=${jobId}&type=decompress`
      );
      wsRef.current = ws;

      ws.onopen = () => {};

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "start") {
          setDecompressProgress((prev) => ({
            ...prev,
            totalBytes: data.totalSize,
          }));
        } else if (data.type === "progress") {
          setDecompressProgress((prev) => ({
            ...prev,
            currentFile: truncatePath(data.currentFile, 60),
            totalBytes: data.total,
            processedBytes: data.processed,
            currentFileTotalSize: data.currentFileTotalSize,
            currentFileBytesProcessed: data.currentFileBytesProcessed,
            instantaneousSpeed: data.instantaneousSpeed,
          }));
        } else if (data.type === "overwrite_prompt") {
          setOverwritePrompt({
            isVisible: true,
            item: { name: data.file, type: data.itemType },
            jobType: "decompress",
          });
        } else if (data.type === "complete") {
          if (data.status === "cancelled" || data.status === "skipped") {
            // Job was cancelled, just let ws.onclose handle the state reset.
            setDecompressProgress({
              isVisible: false,
              jobId: null,
              currentFile: "",
              totalBytes: 0,
              processedBytes: 0,
              currentFileTotalSize: 0,
              currentFileBytesProcessed: 0,
              instantaneousSpeed: 0,
              error: null,
              destinationPath: null,
              targetPanelId: null,
            });
          } else {
            // Successful completion
            handleRefreshPanel("left");
            handleRefreshPanel("right");
            setSelections((prev) => ({
              ...prev,
              [targetPanelId]: new Set([subfolderName]),
            }));
            setFocusedItem((prev) => ({
              ...prev,
              [targetPanelId]: subfolderName,
            }));
            if (activePanel !== targetPanelId) {
              setActivePanel(targetPanelId);
            }
            panelRefs[targetPanelId].current?.focus();
            setDecompressProgress((prev) => ({ ...prev, isVisible: false })); // Close modal on successful completion
          }
        } else if (data.type === "failed" || data.type === "error") {
          const errorMessage = data.title
            ? `${data.title} ${
                data.details || data.message
                  ? `(${data.details || data.message})`
                  : ""
              }`
            : data.details || data.message || "Decompression failed.";
          setError(errorMessage);
          setDecompressProgress((prev) => ({ ...prev, isVisible: false })); // Close modal on error
        }
      };

      ws.onclose = () => {};

      ws.onerror = (error) => {
        setError("WebSocket connection error during decompression.");
      };
    } catch (err) {
      setError(err.message);
      setDecompressProgress((prev) => ({ ...prev, isVisible: false }));
    }
  }, [activePanel, panels, selections, setError, handleRefreshPanel, wsRef, setActivePanel, setSelections, setFocusedItem, panelRefs, overwritePrompt, setOverwritePrompt, filter, filteredItems]);

  const handleDecompressInActivePanel = useCallback(() => {
    handleDecompress(activePanel);
  }, [handleDecompress, activePanel]);

  const handleDecompressToOtherPanel = useCallback(() => {
    const otherPanelId = activePanel === "left" ? "right" : "left";
    handleDecompress(otherPanelId);
  }, [handleDecompress, activePanel]);

  return {
    decompressProgress,
    handleCancelDecompress,
    handleDecompressInActivePanel,
    handleDecompressToOtherPanel,
  };
};

export default useDecompress;
