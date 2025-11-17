import { useState, useCallback } from "react";
import { buildFullPath, calculateFolderSize } from "../lib/utils";
import { startSizeCalculation } from "../lib/api";

export default function useSizeCalculation({
  panels,
  setError,
  updateItemInPanel,
  wsRef,
}) {
  const [sizeCalcModal, setSizeCalcModal] = useState({
    isVisible: false,
    jobId: null,
    currentFile: "",
    sizeSoFar: 0,
    totalBytes: 0,
    folderName: null,
  });
  const [calculating, setCalculating] = useState(new Set());

  const handleStartSizeCalculation = useCallback(
    async (item) => {
      if (calculating.has(item.fullPath)) {
        return;
      }
      setCalculating((prev) => new Set(prev).add(item.fullPath));

      // Find which panel this item belongs to
      let panelId = null;
      let path = null;

      const leftPanelItem = panels.left.items.find((i) => i.name === item.name);
      const rightPanelItem = panels.right.items.find(
        (i) => i.name === item.name
      );

      // Check if the item exists and its path matches, to handle duplicate names
      if (
        leftPanelItem &&
        buildFullPath(panels.left.path, item.name) === item.fullPath
      ) {
        panelId = "left";
        path = panels.left.path;
      } else if (
        rightPanelItem &&
        buildFullPath(panels.right.path, item.name) === item.fullPath
      ) {
        panelId = "right";
        path = panels.right.path;
      }

      if (!panelId) {
        setError(
          "Could not determine the location of the item to calculate its size."
        );
        return;
      }

      const folder = {
        name: item.name,
        fullPath: buildFullPath(path, item.name),
      };

      try {
        const finalSize = await calculateFolderSize(
          folder,
          wsRef,
          setSizeCalcModal
        );
        updateItemInPanel(panelId, item.name, { size: finalSize });
      } catch (err) {
        setError(
          `Folder Size Calculation for "${item.name}" failed: ${err.message}`
        );
      } finally {
        setCalculating((prev) => {
          const newSet = new Set(prev);
          newSet.delete(item.fullPath);
          return newSet;
        });
      }
    },
    [panels, setError, updateItemInPanel, wsRef, setSizeCalcModal, calculating]
  );

  const calculateSizeForMultipleFolders = useCallback(
    async (foldersToCalc, panelId) => {
      if (foldersToCalc.length === 0) return;

      for (const folder of foldersToCalc) {
        const runJob = new Promise((resolve, reject) => {
          (async () => {
            try {
              const { jobId } = await startSizeCalculation(folder.fullPath);

              setSizeCalcModal({
                isVisible: true,
                jobId,
                currentFile: `Preparing ${folder.name}...`,
                sizeSoFar: 0,
                totalBytes: 0,
                folderName: folder.name,
              });

              const wsProtocol =
                window.location.protocol === "https:" ? "wss:" : "ws:";
              const jobWs = new WebSocket(
                `${wsProtocol}//${window.location.host}/ws?jobId=${jobId}&type=size`
              );
              jobWs.jobId = jobId;
              wsRef.current = jobWs;

              jobWs.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === "start") {
                  setSizeCalcModal((prev) => ({
                    ...prev,
                    totalBytes: data.totalSize,
                  }));
                } else if (data.type === "progress") {
                  setSizeCalcModal((prev) => ({
                    ...prev,
                    currentFile: data.file,
                    sizeSoFar: data.sizeSoFar,
                    totalBytes: data.totalSize,
                  }));
                } else if (data.type === "complete") {
                  resolve(data.size);
                } else if (data.type === "cancelled" || data.type === "error") {
                  reject(
                    new Error(data.message || "Job was cancelled or failed.")
                  );
                }
              };

              jobWs.onerror = () =>
                reject(new Error("WebSocket connection error."));

              jobWs.onclose = () => {
                setSizeCalcModal({
                  isVisible: false,
                  jobId: null,
                  currentFile: "",
                  folderName: null,
                  sizeSoFar: 0,
                  totalBytes: 0,
                });
              };
            } catch (err) {
              reject(err);
            }
          })();
        });

        try {
          const finalSize = await runJob;
          updateItemInPanel(panelId, folder.name, { size: finalSize });
        } catch (err) {
          if (
            !confirm(
              `Calculation for "${folder.name}" failed or was cancelled. Continue with the next folder?`
            )
          ) {
            break;
          }
        }
      }
    },
    [updateItemInPanel, wsRef, setSizeCalcModal]
  );

  return {
    sizeCalcModal,
    setSizeCalcModal,
    isCalculatingSize: sizeCalcModal.isVisible,
    handleStartSizeCalculation,
    calculateSizeForMultipleFolders,
  };
}
