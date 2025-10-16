import { useState, useCallback } from "react";
import { createNewFile } from "../lib/api";
import { buildFullPath } from "../lib/utils";

export default function useNewFile({
  renamingItem,
  panels,
  handleNavigate,
  setSelections,
  setFocusedItem,
  setSelectionAnchor,
  setError,
  creatingFolder,
}) {
  const [creatingFile, setCreatingFile] = useState({
    panelId: null,
    value: "",
  });

  const handleStartNewFile = useCallback(
    (panelId) => {
      if (renamingItem.panelId || creatingFolder.panelId || creatingFile.panelId) {
        return;
      }
      const currentItems = panels[panelId]?.items || [];
      const existingNames = new Set(currentItems.map((item) => item.name));
      const baseName = "New File";
      const extension = ".txt";
      let newFileName = `${baseName}${extension}`;
      
      if (existingNames.has(newFileName)) {
        let counter = 2;
        while (existingNames.has(`${baseName} (${counter})${extension}`)) {
          counter++;
        }
        newFileName = `${baseName} (${counter})${extension}`;
      }

      setCreatingFile({ panelId: panelId, value: newFileName });
      setSelections((prev) => ({ ...prev, [panelId]: new Set() }));
    },
    [renamingItem, creatingFolder.panelId, creatingFile.panelId, panels, setSelections]
  );

  const handleCancelNewFile = useCallback(() => {
    setCreatingFile({ panelId: null, value: "" });
  }, []);

  const handleConfirmNewFile = useCallback(async () => {
    const { panelId, value } = creatingFile;
    if (!panelId || !value) {
      handleCancelNewFile();
      return;
    }
    const panel = panels[panelId];
    const newFilePath = buildFullPath(panel.path, value);
    try {
      await createNewFile(newFilePath);
      handleCancelNewFile(); // Reset state before navigation
      await handleNavigate(panelId, panel.path, "");
      setFocusedItem((prev) => ({ ...prev, [panelId]: value }));
      setSelectionAnchor((prev) => ({ ...prev, [panelId]: value }));
      setSelections((prev) => ({ ...prev, [panelId]: new Set([value]) }));
    } catch (err) {
      setError(err.message);
      handleCancelNewFile();
    }
  }, [
    creatingFile,
    panels,
    handleNavigate,
    setError,
    handleCancelNewFile,
    setFocusedItem,
    setSelectionAnchor,
    setSelections,
  ]);

  return {
    creatingFile,
    setCreatingFile,
    handleStartNewFile,
    handleCancelNewFile,
    handleConfirmNewFile,
  };
}
