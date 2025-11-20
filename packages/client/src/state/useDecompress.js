import { useState, useCallback, useRef } from "react";
import { decompressFiles, cancelDecompress } from "../lib/api";
import { buildFullPath, isVerboseLogging } from "../lib/utils";

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
  const lastProgressRef = useRef({});

  const processNextArchive = useCallback(
    async (targetPanelId) => {
      if (isVerboseLogging())
        console.log(
          "📦 processNextArchive: Queue length:",
          queueRef.current.length
        );

      if (queueRef.current.length === 0) {
        if (isVerboseLogging())
          console.log("✅ All archives processed, closing modal");
        setDecompressProgress((prev) => ({ ...prev, isVisible: false }));
        handleRefreshPanel("left");
        handleRefreshPanel("right");
        setActivePanel(targetPanelId);
        panelRefs[targetPanelId].current?.focus();
        return;
      }

      const archiveItem = queueRef.current.shift();
      if (isVerboseLogging())
        console.log(
          "🔄 Processing archive:",
          archiveItem.name,
          "Queue remaining:",
          queueRef.current.length
        );

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

      // For multi-archive extraction, extract all to the same target directory
      // For single archive, create a subfolder (preserving original behavior)
      const isMultiArchive =
        queueRef.current.length > 0 || archiveItem.isMultiArchive;
      const destinationPath = itemsToExtract
        ? baseDestinationPath
        : isMultiArchive
        ? baseDestinationPath
        : buildFullPath(
            baseDestinationPath,
            archiveItem.name.replace(/\.[^/.]+$/, "")
          );

      // Log destination and extraction mode
      if (isVerboseLogging())
        console.log(
          `🗂️ Archive destination: ${destinationPath} (multiArchive=${isMultiArchive}) itemsToExtract=${!!itemsToExtract}`
        );

      try {
        const { jobId } = await decompressFiles(
          source,
          destinationPath,
          itemsToExtract,
          isVerboseLogging()
        );
        setDecompressProgress((prev) => ({ ...prev, jobId }));

        const ws = new WebSocket(
          `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${
            window.location.host
          }/ws?jobId=${jobId}&type=decompress`
        );
        ws.jobId = jobId;
        wsRef.current = ws;

        await new Promise((resolve) => {
          ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            switch (data.type) {
              case "start":
                if (isVerboseLogging())
                  console.log(
                    `[ws:${jobId}] start totalSize=${data.totalSize}`
                  );
                // initialize last progress for this job
                lastProgressRef.current[jobId] = {
                  file: null,
                  processed: null,
                };
                setDecompressProgress((prev) => ({
                  ...prev,
                  totalBytes: data.totalSize,
                }));
                break;
              case "progress":
                try {
                  const last = lastProgressRef.current[jobId] || {
                    file: null,
                    processed: null,
                  };
                  const sameFile = last.file === data.currentFile;
                  const sameProcessed = last.processed === data.processed;
                  if (!sameFile || !sameProcessed) {
                    if (isVerboseLogging())
                      console.log(
                        `[ws:${jobId}] progress file=${data.currentFile} processed=${data.processed} currentFileBytes=${data.currentFileBytesProcessed}`
                      );
                    lastProgressRef.current[jobId] = {
                      file: data.currentFile,
                      processed: data.processed,
                    };
                  }
                } catch (e) {}
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
                // Log prompt and reset last progress so subsequent progress after a decision will be logged once
                if (isVerboseLogging())
                  console.log(
                    `[ws:${jobId}] overwrite_prompt file=${data.file} itemType=${data.itemType} isFolder=${data.isFolderPrompt} promptId=${data.promptId}`
                  );
                try {
                  delete lastProgressRef.current[jobId];
                } catch (e) {}
                setOverwritePrompt({
                  isVisible: true,
                  item: {
                    name: data.file,
                    type: data.itemType,
                    promptId: data.promptId,
                  },
                  jobType: "decompress",
                  jobId,
                });
                break;
              case "failed":
              case "error":
                if (isVerboseLogging())
                  console.log(`[ws:${jobId}] error:`, data);
                hasError = true;
                errorMessage = data.title
                  ? `${data.title} (${data.details || data.message || ""})`
                  : data.details || data.message || "Decompression failed.";
                if (
                  ws &&
                  !ws._closeCalled &&
                  (ws.readyState === WebSocket.OPEN ||
                    ws.readyState === WebSocket.CONNECTING)
                ) {
                  ws._closeCalled = true;
                  ws.close(1000, "Decompress failed");
                }
                try {
                  delete lastProgressRef.current[jobId];
                } catch (e) {}
                resolve();
                break;
              case "complete":
                if (isVerboseLogging())
                  console.log("✅ Archive decompression completed");
                try {
                  delete lastProgressRef.current[jobId];
                } catch (e) {}
                if (
                  ws &&
                  !ws._closeCalled &&
                  (ws.readyState === WebSocket.OPEN ||
                    ws.readyState === WebSocket.CONNECTING)
                ) {
                  ws._closeCalled = true;
                  ws.close(1000, "Decompress complete");
                }
                resolve();
                break;
              default:
                break;
            }
          };
          ws.onclose = () => {
            resolve();
          };
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
        if (isVerboseLogging()) console.log("❌ Error occurred:", errorMessage);
        setDecompressProgress((prev) => ({ ...prev, error: errorMessage }));
      } else {
        if (isVerboseLogging())
          console.log("✅ Archive completed, processing next...");
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

      if (isVerboseLogging()) {
        console.log("🔍 Selection debug:");
        console.log("  - Source panel:", sourcePanelId);
        console.log("  - Selected items:", [...selections[sourcePanelId]]);
        console.log(
          "  - Items to consider:",
          itemsToConsider.length,
          "total items"
        );
        console.log("  - Filter active:", !!filter[sourcePanelId].pattern);
      }

      const archivesToDecompress = [...selections[sourcePanelId]]
        .map((itemName) => {
          const found = itemsToConsider.find((item) => item.name === itemName);
          if (isVerboseLogging())
            console.log(
              `  - Mapping ${itemName}:`,
              found ? `${found.name} (${found.type})` : "NOT FOUND"
            );
          return found;
        })
        .filter(Boolean)
        .filter((item) => {
          const isArchive = item.type === "archive";
          if (isVerboseLogging())
            console.log(`  - ${item.name} is archive:`, isArchive);
          return isArchive;
        });

      if (isVerboseLogging())
        console.log(
          "🗂️ Final archives to decompress:",
          archivesToDecompress.map((a) => a.name)
        );

      if (archivesToDecompress.length === 0) {
        setError("No archive files selected for decompression.");
        return;
      }

      if (isVerboseLogging()) console.log("🔍 itemsToExtract:", itemsToExtract);

      // The context menu `onSelect` handler passes a DOM/CustomEvent object as
      // the first argument. If that event gets forwarded here it will be truthy
      // and make the code treat it like a selective `itemsToExtract` array,
      // causing only the first archive to be processed. Detect and ignore
      // event-like objects so normal calls (with null or an array) work.
      if (
        itemsToExtract &&
        typeof itemsToExtract === "object" &&
        // SyntheticEvent/CustomEvent often include `isTrusted` and `type` props
        // so use those as heuristics to detect event objects.
        ("isTrusted" in itemsToExtract || "type" in itemsToExtract)
      ) {
        itemsToExtract = null;
      }

      if (itemsToExtract) {
        const singleArchive = archivesToDecompress[0];
        if (singleArchive) {
          singleArchive.itemsToExtract = itemsToExtract;
          queueRef.current = [singleArchive];
        }
      } else {
        // Mark all archives as part of multi-archive operation if there are multiple
        const isMultiArchive = archivesToDecompress.length > 1;
        if (isVerboseLogging()) {
          console.log(
            "🗜️ archivesToDecompress count:",
            archivesToDecompress.length
          );
          console.log(
            "🗜️ archivesToDecompress names:",
            archivesToDecompress.map((a) => a.name)
          );
        }

        queueRef.current = archivesToDecompress.map((archive, index) => {
          if (isVerboseLogging()) {
            console.log(
              `🗜️ Mapping archive ${index}:`,
              archive.name,
              archive.type
            );
          }
          const result = {
            ...archive,
            isMultiArchive,
          };
          if (isVerboseLogging()) {
            console.log(
              `🗜️ Result for ${archive.name}:`,
              result.name,
              result.type
            );
          }
          return result;
        });

        if (isVerboseLogging()) {
          console.log(
            "🗜️ queueRef after assignment count:",
            queueRef.current.length
          );
          console.log(
            "🗜️ queueRef after assignment names:",
            queueRef.current.map((a) => a.name)
          );
        }
      }

      if (isVerboseLogging()) {
        console.log(
          "🗜️ Starting decompression of",
          queueRef.current.length,
          "archives:",
          queueRef.current.map((a) => a.name)
        );
        console.log(
          "🗜️ About to call processNextArchive, queue length:",
          queueRef.current.length
        );
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
        isMultiArchive: queueRef.current.length > 1,
      }));

      if (isVerboseLogging())
        console.log(
          "🗜️ Calling processNextArchive with queue length:",
          queueRef.current.length
        );
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

  const handleModalCloseOrCancel = async () => {
    if (decompressProgress.error) {
      processNextArchive(decompressProgress.targetPanelId);
      return;
    }
    // Close websocket connection if it's the active job's connection
    if (wsRef.current && wsRef.current.jobId === decompressProgress.jobId) {
      wsRef.current.close(1000, "Starting new job connection");
      wsRef.current = null;
    }
    // Ensure overwrite prompt modal gets closed immediately so the UI reflects the cancel
    try {
      setOverwritePrompt({ isVisible: false, item: null });
    } catch (e) {}
    // Prefer the jobId from state, but fall back to the websocket jobId if absent
    const idToCancel =
      decompressProgress.jobId || (wsRef.current && wsRef.current.jobId);
    if (idToCancel) {
      try {
        await cancelDecompress(idToCancel);
      } catch (error) {
        // Cancellation may already have finished or the server returned 404; log and continue
        console.error(
          "Failed to cancel decompress operation on server:",
          error
        );
      }
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
