import { useState, useCallback } from "react";
import { createNewFolder } from "../lib/api";
import { buildFullPath, matchZipPath } from "../lib/utils";

export default function useNewFolder({
  renamingItem,
  panels,
  handleNavigate,
  setSelections,
  setFocusedItem,
  setSelectionAnchor,
  setError,
  startZipUpdate,
  hideZipUpdate,
  connectZipUpdateWebSocket,
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
      const zipPathMatch = matchZipPath(newFolderPath);
      let jobId = null;

      let zipFilePath, filePathInZip;
      if (zipPathMatch) {
        zipFilePath = zipPathMatch[1];
        filePathInZip = zipPathMatch[2].startsWith("/")
          ? zipPathMatch[2].substring(1)
          : zipPathMatch[2];
      }

      const response = await createNewFolder(newFolderPath);
      jobId = response.jobId; // Get the jobId from the server response

      if (zipPathMatch && response && response.jobId) {
        // Start the modal now that server accepted the job
        startZipUpdate({
          jobId: response.jobId,
          zipFilePath,
          filePathInZip,
          originalZipSize: 0,
          itemType: "folder",
          title: "Creating folder in zip...",
        });
        // Now that we have the jobId, connect the WebSocket and only navigate after completion
        connectZipUpdateWebSocket(
          response.jobId,
          "create-folder-in-zip",
          async () => {
            handleCancelNewFolder(); // Reset state after navigation so the create modal stays visible until done
            await handleNavigate(panelId, panel.path, "");
            setFocusedItem((prev) => ({ ...prev, [panelId]: value }));
            setSelectionAnchor((prev) => ({ ...prev, [panelId]: value }));
            setSelections((prev) => ({ ...prev, [panelId]: new Set([value]) }));
          }
        );
      } else {
        handleCancelNewFolder(); // Reset state before navigation
        await handleNavigate(panelId, panel.path, "");
        setFocusedItem((prev) => ({ ...prev, [panelId]: value }));
        setSelectionAnchor((prev) => ({ ...prev, [panelId]: value }));
        setSelections((prev) => ({ ...prev, [panelId]: new Set([value]) }));
      }
    } catch (err) {
      setError(err.message);
      handleCancelNewFolder();
      hideZipUpdate(); // Hide modal on error
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
    startZipUpdate,
    hideZipUpdate,
    connectZipUpdateWebSocket,
  ]);

  return {
    creatingFolder,
    setCreatingFolder,
    handleStartNewFolder,
    handleCancelNewFolder,
    handleConfirmNewFolder,
  };
}
