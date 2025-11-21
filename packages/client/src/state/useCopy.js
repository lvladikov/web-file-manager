import { useState, useEffect, useCallback, useRef } from "react";
import {
  startCopyItems,
  cancelCopy,
  deleteItem,
  startDuplicateItems,
  cancelDuplicate,
} from "../lib/api";
import {
  buildFullPath,
  basename,
  dirname,
  matchZipPath,
  isVerboseLogging,
} from "../lib/utils";

const getUniqueName = (originalName, existingNames) => {
  const dotIndex = originalName.lastIndexOf(".");
  const name =
    dotIndex === -1 ? originalName : originalName.substring(0, dotIndex);
  const ext = dotIndex === -1 ? "" : originalName.substring(dotIndex);

  let newName = `${name} copy${ext}`;
  if (!existingNames.has(newName)) {
    return newName;
  }

  let counter = 2;
  while (true) {
    newName = `${name} copy ${counter}${ext}`;
    if (!existingNames.has(newName)) {
      return newName;
    }
    counter++;
  }
};

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
  setSelections,
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
    isDuplicate: false,
    sources: [],
    isZipAdd: false,
    tempZipSize: 0,
    originalZipSize: 0,
  });

  const latestProps = useRef({});
  useEffect(() => {
    latestProps.current = {
      activePanel,
      panels,
      handleNavigate,
      setError,
      panelRefs,
      setSelections,
    };
  });

  const performCopy = useCallback(
    async (sources, destinationPath, isMove = false) => {
      try {
        if (isVerboseLogging())
          console.log(
            `[useCopy] performCopy: sources=${
              sources?.length || 0
            } destination=${destinationPath} isMove=${isMove}`
          );
      } catch (e) {}
      if (!sources || sources.length === 0) return;
      handleCancelRename();
      handleCancelNewFolder();

      const sourceDir = dirname(sources[0]);

      if (sourceDir === destinationPath && !isMove) {
        try {
          const panelId = Object.keys(panels).find(
            (p) => panels[p].path === sourceDir
          );
          if (!panelId) {
            throw new Error("Could not find the source panel.");
          }
          const existingNames = new Set(
            panels[panelId].items.map((item) => item.name)
          );

          const itemsToDuplicate = sources.map((sourcePath) => {
            const originalName = basename(sourcePath);
            const newName = getUniqueName(originalName, existingNames);
            existingNames.add(newName);
            return { sourcePath, newName };
          });

          const isZipDuplicate = !!matchZipPath(sourceDir); // Check if the source directory is inside a zip

          const { jobId } = await startDuplicateItems(
            itemsToDuplicate,
            isZipDuplicate
          );
          setCopyProgress({
            isVisible: true,
            status: "scanning",
            copied: 0,
            total: 0,
            isZipDuplicate,
            jobId,
            currentFile: "Initializing...",
            sourceCount: sources.length,
            startTime: Date.now(),
            lastUpdateTime: Date.now(),
            isMove: false,
            isDuplicate: true,
            sources,
          });
        } catch (err) {
          setError(`Duplicate failed: ${err.message}`);
        }
        return;
      }

      try {
        // If a console-driven pending overwrite decision exists, consume it
        // and pass it to the server so the server can avoid prompting.
        let overwritePref = undefined;
        try {
          if (
            typeof window !== "undefined" &&
            window.__FM_PENDING_OVERWRITE__ !== undefined
          ) {
            overwritePref = window.__FM_PENDING_OVERWRITE__;
            // consume
            delete window.__FM_PENDING_OVERWRITE__;
          }
        } catch (e) {}

        const { jobId } = await startCopyItems(
          sources,
          destinationPath,
          isMove,
          overwritePref
        );
        const isZipAdd = !!matchZipPath(destinationPath);
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
          isDuplicate: false,
          sources,
          isZipAdd,
        });
      } catch (err) {
        setError(`${isMove ? "Move" : "Copy"} failed: ${err.message}`);
      }
    },
    [handleCancelRename, handleCancelNewFolder, panels, setError]
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
    [activePanel, panels, activeSelection, filteredItems, performCopy, setError]
  );

  const handleCancelCopy = useCallback(async () => {
    if (
      overwritePrompt.isVisible &&
      wsRef.current?.readyState === WebSocket.OPEN
    ) {
      const payload = { type: "overwrite_response", decision: "cancel" };
      if (overwritePrompt.item && overwritePrompt.item.promptId) {
        payload.promptId = overwritePrompt.item.promptId;
      }
      wsRef.current.send(JSON.stringify(payload));
      setOverwritePrompt({ isVisible: false, item: null });
    } else if (copyProgress.jobId) {
      try {
        if (copyProgress.isDuplicate) {
          await cancelDuplicate(copyProgress.jobId);
        } else {
          await cancelCopy(copyProgress.jobId);
        }
      } catch (err) {
        setError(`Failed to send cancel request: ${err.message}`);
      }
    }
  }, [
    copyProgress.jobId,
    copyProgress.isDuplicate,
    overwritePrompt.isVisible,
    setError,
    wsRef,
    setOverwritePrompt,
  ]);

  const handleDuplicate = useCallback(async () => {
    const sourcePanelId = activePanel;
    const sourcePanel = panels[sourcePanelId];

    if (!sourcePanel) {
      setError("Panel data is not available.");
      return;
    }

    const sourcePath = sourcePanel.path;

    if (activeSelection.size === 0) {
      return;
    }

    const sources = filteredItems
      .filter((item) => activeSelection.has(item.name))
      .map((item) => buildFullPath(sourcePath, item.name));

    await performCopy(sources, sourcePath, false);
  }, [
    activePanel,
    panels,
    activeSelection,
    filteredItems,
    performCopy,
    setError,
  ]);

  useEffect(() => {
    if (!copyProgress.jobId) return;

    const jobType = copyProgress.isDuplicate ? "duplicate" : "copy";
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${wsProtocol}//${window.location.host.replace(/:\d+$/, ":3001")}?jobId=${
        copyProgress.jobId
      }&type=${jobType}`
    );
    ws.jobId = copyProgress.jobId;
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const {
        activePanel,
        panels,
        handleNavigate,
        setError,
        panelRefs,
        setSelections,
      } = latestProps.current;
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "scan_progress":
        case "copy_progress":
          setCopyProgress((prev) => ({
            ...prev,
            currentFile: data.file,
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
            currentFile: data.currentFile ? data.currentFile : prev.currentFile,
            copied: data.copied,
            currentFileBytesProcessed: data.currentFileBytesProcessed,
            currentFileSize: data.currentFileSize,
            lastUpdateTime: Date.now(),
            tempZipSize: data.tempZipSize || 0,
            originalZipSize: data.originalZipSize || 0,
          }));
          break;
        case "overwrite_prompt":
          setOverwritePrompt({
            isVisible: true,
            item: {
              name: data.file,
              type: data.itemType,
              promptId: data.promptId,
            },
            jobType: copyProgress.isMove ? "move" : "copy",
          });
          // If a pending console-driven overwrite decision exists, apply it automatically.
          try {
            if (
              typeof window !== "undefined" &&
              window.__FM_PENDING_OVERWRITE__ !== undefined &&
              window.__APP_STATE__ &&
              typeof window.__APP_STATE__.handleOverwriteDecision === "function"
            ) {
              const pending = window.__FM_PENDING_OVERWRITE__;
              // consume pending value to avoid reusing for subsequent prompts
              delete window.__FM_PENDING_OVERWRITE__;
              let decision = null;
              // Map boolean values to server-friendly decisions
              if (typeof pending === "boolean") {
                decision = pending ? "overwrite" : "skip";
              } else if (typeof pending === "string") {
                decision = pending;
              }
              if (decision) {
                window.__APP_STATE__.handleOverwriteDecision(
                  decision,
                  data.promptId
                );
              }
            }
          } catch (e) {
            // swallow errors to avoid disrupting copy flow
          }
          break;
        case "complete":
          if (copyProgress.isMove) {
            // Send a single delete request with all source paths instead of
            // multiple concurrent requests. When moving many files from the
            // same archive this avoids race conditions where multiple
            // delete-in-zip jobs run concurrently and conflict with each
            // other. The server will group paths by container and process
            // them appropriately.
            deleteItem(copyProgress.sources).catch((err) => {
              setError(
                `Failed to delete source files after move: ${err.message}`
              );
            });
          }
          setSelections((prev) => ({ ...prev, [activePanel]: new Set() }));
        // Fallthrough intended
        case "cancelled":
        case "error": {
          if (
            ws &&
            !ws._closeCalled &&
            (ws.readyState === WebSocket.OPEN ||
              ws.readyState === WebSocket.CONNECTING)
          ) {
            ws._closeCalled = true;
            ws.close(1000, "Copy complete");
          }
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
        isDuplicate: false,
        sources: [],
      });
    };

    try {
      if (isVerboseLogging())
        console.log(
          `[useCopy] WebSocket created for job ${copyProgress.jobId}`
        );
    } catch (e) {}

    ws.onerror = () => {
      console.error(`[useCopy] WebSocket error for job ${copyProgress.jobId}`);
      latestProps.current.setError("Could not connect to progress server.");
    };

    return () => {
      if (ws && !ws._closeCalled && ws.readyState === WebSocket.OPEN) {
        ws._closeCalled = true;
        ws.close(1000, "Copy error / cancelled");
      }
    };
  }, [
    copyProgress.jobId,
    copyProgress.isDuplicate,
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
    handleDuplicate,
  };
}
