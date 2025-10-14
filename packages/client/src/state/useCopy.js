import { useState, useEffect, useCallback, useRef } from "react";
import { startCopyItems, cancelCopy, deleteItem } from "../lib/api";
import { buildFullPath, truncatePath } from "../lib/utils";

export default function useCopy({
  activePanel,
  panels,
  activeSelection,
  filteredItems,
  handleNavigate,
  setError,
  panelRefs,
  handleCancelRename,
  handleCancelNewFolder,
  wsRef,
  overwritePrompt,
  setOverwritePrompt,
}) {
  const [copyProgress, setCopyProgress] = useState({
    isVisible: false,
    status: "idle",
    copied: 0,
    total: 0,
    jobId: null,
    currentFile: "",
    currentFileBytesProcessed: 0,
    currentFileSize: 0,
    sourceCount: 0,
    startTime: null,
    lastUpdateTime: null,
    isMove: false,
    sources: [],
  });

  // --- START: useRef pattern to prevent re-renders ---
  const latestProps = useRef({});
  useEffect(() => {
    // Keep a ref with the latest props and handlers.
    // This allows the WebSocket useEffect to access fresh data without needing to re-run.
    latestProps.current = {
      activePanel,
      panels,
      handleNavigate,
      setError,
      panelRefs,
    };
  }); // No dependency array, so it updates on every render.

  const performCopy = useCallback(
    async (sources, destinationPath, isMove = false) => {
      if (!sources || sources.length === 0) return;
      handleCancelRename();
      handleCancelNewFolder();

      try {
        const { jobId } = await startCopyItems(sources, destinationPath, isMove);
        setCopyProgress({
          isVisible: true,
          status: "scanning",
          copied: 0,
          total: 0,
          jobId,
          currentFile: "Initializing...",
          sourceCount: sources.length,
          startTime: Date.now(),
          lastUpdateTime: Date.now(),
          isMove,
          sources,
        });
      } catch (err) {
        setError(`${isMove ? "Move" : "Copy"} failed: ${err.message}`);
      }
    },
    [handleCancelRename, handleCancelNewFolder, setError]
  );

  const handleCopyAction = useCallback(
    async (isMove = false) => {
      const sourcePanelId = activePanel;
      const destPanelId = sourcePanelId === "left" ? "right" : "left";
      const sourcePanel = panels[sourcePanelId];
      const destPanel = panels[destPanelId];

      if (!sourcePanel || !destPanel) {
        setError("Panel data is not available.");
        return;
      }

      const sourcePath = sourcePanel.path;
      const destinationPath = destPanel.path;

      if (sourcePath === destinationPath) {
        setError("Source and destination paths cannot be the same.");
        return;
      }

      if (activeSelection.size === 0) {
        return;
      }

      const sources = filteredItems
        .filter((item) => activeSelection.has(item.name))
        .map((item) => buildFullPath(sourcePath, item.name));

      await performCopy(sources, destinationPath, isMove);
    },
    [
      activePanel,
      panels,
      activeSelection,
      filteredItems,
      performCopy,
      setError,
    ]
  );

  const handleCancelCopy = useCallback(async () => {
    if (
      overwritePrompt.isVisible &&
      wsRef.current?.readyState === WebSocket.OPEN
    ) {
      wsRef.current.send(
        JSON.stringify({ type: "overwrite_response", decision: "cancel" })
      );
      setOverwritePrompt({ isVisible: false, item: null });
    } else if (copyProgress.jobId) {
      try {
        await cancelCopy(copyProgress.jobId);
      } catch (err) {
        setError(`Failed to send cancel request: ${err.message}`);
      }
    }
  }, [
    copyProgress.jobId,
    overwritePrompt.isVisible,
    setError,
    wsRef,
    setOverwritePrompt,
  ]);

  useEffect(() => {
    if (!copyProgress.jobId) return;

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${wsProtocol}//${window.location.host.replace(
        /:\d+$/,
        ":3001"
      )}?jobId=${copyProgress.jobId}&type=copy`
    );
    wsRef.current = ws;

    ws.onmessage = (event) => {
      // Get the latest props from the ref, avoiding stale closures.
      const { activePanel, panels, handleNavigate, setError, panelRefs } =
        latestProps.current;
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "scan_progress":
        case "copy_progress":
          setCopyProgress((prev) => ({
            ...prev,
            currentFile: truncatePath(data.file, 60),
          }));
          break;
        case "scan_complete":
          setCopyProgress((prev) => ({
            ...prev,
            status: "copying",
            total: data.total,
          }));
          break;
        case "progress":
          setCopyProgress((prev) => ({
            ...prev,
            copied: data.copied,
            currentFileBytesProcessed: data.currentFileBytesProcessed,
            currentFileSize: data.currentFileSize,
            lastUpdateTime: Date.now(),
          }));
          break;
        case "overwrite_prompt":
          setOverwritePrompt({
            isVisible: true,
            item: { name: data.file, type: data.itemType },
            jobType: copyProgress.isMove ? "move" : "copy",
          });
          break;
        case "complete":
          if (copyProgress.isMove) {
            Promise.all(
              copyProgress.sources.map((source) => deleteItem(source))
            ).catch((err) => {
              setError(`Failed to delete source files after move: ${err.message}`);
            });
          }
        // Fallthrough intended
        case "cancelled":
        case "error": {
          ws.close();
          const sourcePanelId = activePanel;
          const destPanelId = sourcePanelId === "left" ? "right" : "left";
          handleNavigate(sourcePanelId, panels[sourcePanelId].path, ""); // Refresh source
          handleNavigate(destPanelId, panels[destPanelId].path, ""); // Refresh destination
          if (data.type === "error")
            setError(
              `${copyProgress.isMove ? "Move" : "Copy"} error: ${data.message}`
            );
          panelRefs[activePanel].current?.focus();
          break;
        }
        default:
          break;
      }
    };

    ws.onclose = (event) => {
      if (event.code !== 1000) {
        console.error("WebSocket closed unexpectedly:", event);
        latestProps.current.setError(
          "Lost connection to progress server. The operation may still be running in the background."
        );
      }

      setCopyProgress({
        isVisible: false,
        status: "idle",
        copied: 0,
        total: 0,
        jobId: null,
        currentFile: "",
        sourceCount: 0,
        startTime: null,
        lastUpdateTime: null,
        isMove: false,
        sources: [],
      });
    };

    ws.onerror = () => {
      latestProps.current.setError("Could not connect to progress server.");
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [
    copyProgress.jobId,
    wsRef,
    setOverwritePrompt,
    copyProgress.isMove,
    copyProgress.sources,
    setError,
  ]);

  return {
    copyProgress,
    setCopyProgress,
    handleCopyAction,
    handleCancelCopy,
    performCopy,
  };
}
