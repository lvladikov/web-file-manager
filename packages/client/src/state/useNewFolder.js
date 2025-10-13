import { useState, useCallback } from "react";
import { createNewFolder } from "../lib/api";
import { buildFullPath } from "../lib/utils";

export default function useNewFolder({
  renamingItem,
  panels,
  handleNavigate,
  setSelections,
  setFocusedItem,
  setSelectionAnchor,
  setError,
}) {
  const [creatingFolder, setCreatingFolder] = useState({
    panelId: null,
    value: "",
  });

  const handleStartNewFolder = useCallback(
    (panelId) => {
      if (renamingItem.panelId || creatingFolder.panelId) {
        return;
      }
      const currentItems = panels[panelId]?.items || [];
      const existingNames = new Set(currentItems.map((item) => item.name));
      let newFolderName = "New Folder";
      if (existingNames.has(newFolderName)) {
        let counter = 2;
        while (existingNames.has(`New Folder (${counter})`)) {
          counter++;
        }
        newFolderName = `New Folder (${counter})`;
      }
      setCreatingFolder({ panelId: panelId, value: newFolderName });
      setSelections((prev) => ({ ...prev, [panelId]: new Set() }));
    },
    [renamingItem, creatingFolder.panelId, panels, setSelections]
  );

  const handleCancelNewFolder = useCallback(() => {
    setCreatingFolder({ panelId: null, value: "" });
  }, []);

  const handleConfirmNewFolder = useCallback(async () => {
    const { panelId, value } = creatingFolder;
    if (!panelId || !value) {
      handleCancelNewFolder();
      return;
    }
    const panel = panels[panelId];
    const newFolderPath = buildFullPath(panel.path, value);
    try {
      await createNewFolder(newFolderPath);
      handleCancelNewFolder(); // Reset state before navigation
      await handleNavigate(panelId, panel.path, "");
      setFocusedItem((prev) => ({ ...prev, [panelId]: value }));
      setSelectionAnchor((prev) => ({ ...prev, [panelId]: value }));
      setSelections((prev) => ({ ...prev, [panelId]: new Set([value]) }));
    } catch (err) {
      setError(err.message);
      handleCancelNewFolder();
    }
  }, [
    creatingFolder,
    panels,
    handleNavigate,
    setError,
    handleCancelNewFolder,
    setFocusedItem,
    setSelectionAnchor,
    setSelections,
  ]);

  return {
    creatingFolder,
    setCreatingFolder,
    handleStartNewFolder,
    handleCancelNewFolder,
    handleConfirmNewFolder,
  };
}
