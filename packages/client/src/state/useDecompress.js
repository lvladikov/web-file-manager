import { useState } from "react";
import { decompressFiles, cancelDecompress } from "../lib/api";
import { buildFullPath } from "../lib/utils";

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
    if (decompressProgress.jobId) {
      cancelDecompress(decompressProgress.jobId);
    }
    // The ws.onclose will handle the state reset.
  };

  const handleDecompress = async (targetPanelId) => {
    const sourcePanelId = activePanel;
    const sourcePath = panels[sourcePanelId].path;
    const selection = [...selections[sourcePanelId]];

    if (selection.length !== 1) {
      setError("Please select a single archive to decompress.");
      return;
    }

    const archiveItem = panels[sourcePanelId].items.find(
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
        `${wsProtocol}//${window.location.host.replace(
          /:\d+$/,
          ":3001"
        )}?jobId=${jobId}&type=decompress`
      );
      wsRef.current = ws;

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
            currentFile: data.currentFile,
            totalBytes: data.total,
            processedBytes: data.processed,
            currentFileTotalSize: data.currentFileTotalSize,
            currentFileBytesProcessed: data.currentFileBytesProcessed,
            instantaneousSpeed: data.instantaneousSpeed,
          }));
        } else if (data.type === "complete") {
          handleRefreshPanel(targetPanelId);
          setTimeout(() => {
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
          }, 500);
        } else if (data.type === "failed" || data.type === "error") {
          const errorMessage = data.title
            ? `${data.title} ${data.details || data.message ? `(${data.details || data.message})` : ""}`
            : data.details || data.message || "Decompression failed.";
          setError(errorMessage);
        }
      };

      ws.onclose = () => {
        // This runs for both successful completion and cancellation
        handleRefreshPanel(decompressProgress.targetPanelId || targetPanelId);
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
      };

      ws.onerror = (error) => {
        setError("WebSocket connection error during decompression.");
      };
    } catch (err) {
      setError(err.message);
      setDecompressProgress((prev) => ({ ...prev, isVisible: false }));
    }
  };

  const handleDecompressInActivePanel = () => {
    handleDecompress(activePanel);
  };

  const handleDecompressToOtherPanel = () => {
    const otherPanelId = activePanel === "left" ? "right" : "left";
    handleDecompress(otherPanelId);
  };

  return {
    decompressProgress,
    handleCancelDecompress,
    handleDecompressInActivePanel,
    handleDecompressToOtherPanel,
  };
};

export default useDecompress;
