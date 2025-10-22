import { useState, useCallback } from "react";
import { createNewFile } from "../lib/api";
import { buildFullPath, matchZipPath } from "../lib/utils";

export default function useNewFile({
  renamingItem,
  panels,
  handleNavigate,
  setSelections,
  setFocusedItem,
  setSelectionAnchor,
  setError,
  creatingFolder,
  startZipUpdate,
  hideZipUpdate,
  connectZipUpdateWebSocket,
}) {
  const [creatingFile, setCreatingFile] = useState({
    panelId: null,
    value: "",
  });

  const handleStartNewFile = useCallback(
    (panelId) => {
      if (
        renamingItem.panelId ||
        creatingFolder.panelId ||
        creatingFile.panelId
      ) {
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
    [
      renamingItem,
      creatingFolder.panelId,
      creatingFile.panelId,
      panels,
      setSelections,
    ]
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
      const zipPathMatch = matchZipPath(newFilePath);
      let jobId = null;

      if (zipPathMatch) {
        const zipFilePath = zipPathMatch[1];
        const filePathInZip = zipPathMatch[2].startsWith("/")
          ? zipPathMatch[2].substring(1)
          : zipPathMatch[2];

        startZipUpdate({
          zipFilePath,
          filePathInZip,
          originalZipSize: 0, // Value will be updated by WebSocket
          itemType: "file",
        });
      }

      const response = await createNewFile(newFilePath);
      jobId = response.jobId;

      if (zipPathMatch) {
        connectZipUpdateWebSocket(jobId, "create-file-in-zip");
      }

      handleCancelNewFile(); // Reset state before navigation
      await handleNavigate(panelId, panel.path, "");
      setFocusedItem((prev) => ({ ...prev, [panelId]: value }));
      setSelectionAnchor((prev) => ({ ...prev, [panelId]: value }));
      setSelections((prev) => ({ ...prev, [panelId]: new Set([value]) }));
    } catch (err) {
      setError(err.message);
      handleCancelNewFile();
      if (hideZipUpdate) {
        hideZipUpdate(); // Hide modal on error
      }
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
    startZipUpdate,
    hideZipUpdate,
    connectZipUpdateWebSocket,
  ]);

  return {
    creatingFile,
    setCreatingFile,
    handleStartNewFile,
    handleCancelNewFile,
    handleConfirmNewFile,
  };
}
