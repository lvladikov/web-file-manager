import { useState, useCallback, useRef } from "react";
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
  panelRefs,
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
    totalArchives: 0,
    processedArchives: 0,
    currentArchiveName: "",
    targetPanelId: null,
  });

  const queueRef = useRef([]);

  const processNextArchive = useCallback(
    async (targetPanelId) => {
      if (queueRef.current.length === 0) {
        setDecompressProgress((prev) => ({ ...prev, isVisible: false }));
        handleRefreshPanel("left");
        handleRefreshPanel("right");
        setActivePanel(targetPanelId);
        panelRefs[targetPanelId].current?.focus();
        return;
      }

      const archiveItem = queueRef.current.shift();
      const itemsToExtract = archiveItem.itemsToExtract;
      const sourcePanelId = activePanel;
      const sourcePath = panels[sourcePanelId].path;

      setDecompressProgress((prev) => ({
        ...prev,
        currentArchiveName: archiveItem.name,
        currentFile: `Preparing to decompress ${archiveItem.name}...`,
        processedArchives: prev.totalArchives - queueRef.current.length,
        error: null,
        jobId: null,
      }));

      let hasError = false;
      let errorMessage = "";

      const source = { path: sourcePath, name: archiveItem.name };
      const baseDestinationPath = panels[targetPanelId].path;

      const destinationPath = itemsToExtract
        ? baseDestinationPath
        : buildFullPath(
            baseDestinationPath,
            archiveItem.name.replace(/\.[^/.]+$/, "")
          );

      try {
        const { jobId } = await decompressFiles(
          source,
          destinationPath,
          itemsToExtract
        );
        setDecompressProgress((prev) => ({ ...prev, jobId }));

        const ws = new WebSocket(
          `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${
            window.location.host
          }/ws?jobId=${jobId}&type=decompress`
        );
        wsRef.current = ws;

        await new Promise((resolve) => {
          ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            switch (data.type) {
              case "start":
                setDecompressProgress((prev) => ({
                  ...prev,
                  totalBytes: data.totalSize,
                }));
                break;
              case "progress":
                setDecompressProgress((prev) => ({
                  ...prev,
                  currentFile: data.currentFile,
                  totalBytes: data.total,
                  processedBytes: data.processed,
                  currentFileTotalSize: data.currentFileTotalSize,
                  currentFileBytesProcessed: data.currentFileBytesProcessed,
                  instantaneousSpeed: data.instantaneousSpeed,
                }));
                break;
              case "overwrite_prompt":
                setOverwritePrompt({
                  isVisible: true,
                  item: { name: data.file, type: data.itemType },
                  jobType: "decompress",
                });
                break;
              case "failed":
              case "error":
                hasError = true;
                errorMessage = data.title
                  ? `${data.title} (${data.details || data.message || ""})`
                  : data.details || data.message || "Decompression failed.";
                ws.close();
                resolve();
                break;
              case "complete":
                ws.close();
                resolve();
                break;
              default:
                break;
            }
          };
          ws.onclose = resolve;
          ws.onerror = () => {
            hasError = true;
            errorMessage = "WebSocket connection error during decompression.";
            resolve();
          };
        });
      } catch (err) {
        hasError = true;
        errorMessage = err.message;
      }

      if (hasError) {
        setDecompressProgress((prev) => ({ ...prev, error: errorMessage }));
      } else {
        processNextArchive(targetPanelId);
      }
    },
    [
      activePanel,
      panels,
      handleRefreshPanel,
      setActivePanel,
      panelRefs,
      wsRef,
      setOverwritePrompt,
    ]
  );

  const handleDecompress = useCallback(
    async (targetPanelId, itemsToExtract = null) => {
      const sourcePanelId = activePanel;
      const itemsToConsider = filter[sourcePanelId].pattern
        ? filteredItems[sourcePanelId]
        : panels[sourcePanelId].items;
      const archivesToDecompress = [...selections[sourcePanelId]]
        .map((itemName) =>
          itemsToConsider.find((item) => item.name === itemName)
        )
        .filter(Boolean)
        .filter((item) => item.type === "archive");

      if (archivesToDecompress.length === 0) {
        setError("No archive files selected for decompression.");
        return;
      }

      if (itemsToExtract) {
        const singleArchive = archivesToDecompress[0];
        if (singleArchive) {
          singleArchive.itemsToExtract = itemsToExtract;
          queueRef.current = [singleArchive];
        }
      } else {
        queueRef.current = [...archivesToDecompress];
      }

      setDecompressProgress((prev) => ({
        ...prev,
        isVisible: true,
        jobId: null,
        currentFile: "Initializing...",
        totalBytes: 0,
        processedBytes: 0,
        error: null,
        totalArchives: queueRef.current.length,
        processedArchives: 0,
        currentArchiveName: "",
        targetPanelId: targetPanelId,
      }));

      processNextArchive(targetPanelId);
    },
    [
      activePanel,
      panels,
      selections,
      filter,
      filteredItems,
      setError,
      processNextArchive,
    ]
  );

  const handleModalCloseOrCancel = () => {
    if (decompressProgress.error) {
      processNextArchive(decompressProgress.targetPanelId);
      return;
    }

    if (decompressProgress.jobId) {
      cancelDecompress(decompressProgress.jobId);
    }
    queueRef.current = [];
    setDecompressProgress((prev) => ({ ...prev, isVisible: false }));
  };

  const handleDecompressInActivePanel = useCallback(
    (itemsToExtract = null) => {
      handleDecompress(activePanel, itemsToExtract);
    },
    [handleDecompress, activePanel]
  );

  const handleDecompressToOtherPanel = useCallback(
    (itemsToExtract = null) => {
      const otherPanelId = activePanel === "left" ? "right" : "left";
      handleDecompress(otherPanelId, itemsToExtract);
    },
    [handleDecompress, activePanel]
  );

  return {
    decompressProgress,
    handleCancelDecompress: handleModalCloseOrCancel,
    handleDecompressInActivePanel,
    handleDecompressToOtherPanel,
  };
};

export default useDecompress;
