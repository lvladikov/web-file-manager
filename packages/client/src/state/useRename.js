import { useState, useCallback } from "react";
import { renameItem } from "../lib/api";
import { buildFullPath, matchZipPath } from "../lib/utils";

export default function useRename({
  panels,
  handleNavigate,
  setFocusedItem,
  setSelectionAnchor,
  setSelections,
  setError,
  startZipUpdate,
  hideZipUpdate,
  connectZipUpdateWebSocket,
}) {
  const [renamingItem, setRenamingItem] = useState({
    panelId: null,
    name: null,
    value: "",
  });

  const handleStartRename = (panelId, name) => {
    if (name === "..") return;
    setRenamingItem({ panelId, name, value: name });
  };

  const handleCancelRename = useCallback(() => {
    setRenamingItem({ panelId: null, name: null, value: "" });
  }, []);

  const handleConfirmRename = useCallback(async () => {
    const { panelId, name, value } = renamingItem;
    if (!panelId || !name || !value || name === value) {
      handleCancelRename();
      return;
    }

    const panel = panels[panelId];
    const oldPath = buildFullPath(panel.path, name);
    const zipPathMatch = matchZipPath(oldPath);

    try {
      if (zipPathMatch) {
        const zipFilePath = zipPathMatch[1];
        const oldFilePathInZip = zipPathMatch[2].startsWith("/")
          ? zipPathMatch[2].substring(1)
          : zipPathMatch[2];

        const lastSlashIndex = oldFilePathInZip.lastIndexOf('/');
        const dirPath = lastSlashIndex === -1 ? '' : oldFilePathInZip.substring(0, lastSlashIndex);
        const newFilePathInZip = dirPath ? `${dirPath}/${value}` : value;

        startZipUpdate({
          title: "Renaming item in zip...",
          zipFilePath,
          filePathInZip: newFilePathInZip,
        });
      }

      const response = await renameItem(oldPath, value);

      if (zipPathMatch) {
        connectZipUpdateWebSocket(response.jobId);
      } else {
        await handleNavigate(panelId, panel.path, "");
        setFocusedItem((prev) => ({ ...prev, [panelId]: value }));
        setSelectionAnchor((prev) => ({ ...prev, [panelId]: value }));
        setSelections((prev) => ({ ...prev, [panelId]: new Set([value]) }));
      }
    } catch (err) {
      setError(err.message);
      if (zipPathMatch) {
        hideZipUpdate();
      }
    } finally {
      handleCancelRename();
    }
  }, [
    renamingItem,
    panels,
    handleNavigate,
    setError,
    handleCancelRename,
    setFocusedItem,
    setSelectionAnchor,
    setSelections,
    startZipUpdate,
    hideZipUpdate,
    connectZipUpdateWebSocket,
  ]);

  return {
    renamingItem,
    setRenamingItem,
    handleStartRename,
    handleCancelRename,
    handleConfirmRename,
  };
}
