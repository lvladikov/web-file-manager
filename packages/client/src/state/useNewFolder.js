import { useState, useCallback } from "react";
import { createNewFolder } from "../lib/api";
import { buildFullPath, matchZipPath, isVerboseLogging } from "../lib/utils";

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
  setZipUpdateProgressModal,
}) {
  const [creatingFolder, setCreatingFolder] = useState({
    panelId: null,
    value: "",
  });

  const handleStartNewFolder = useCallback(
    (panelId, value) => {
      if (renamingItem.panelId || creatingFolder.panelId) {
        return;
      }
      const currentItems = panels[panelId]?.items || [];
      const existingNames = new Set(currentItems.map((item) => item.name));
      let newFolderName;
      if (typeof value === "string" && value.trim() !== "") {
        // Normalize separators to panel path style and preserve nested path
        const panelPath = panels[panelId]?.path || "";
        const sep = panelPath.includes("\\") ? "\\" : "/";
        // Accept both forward and back slashes as separators and normalize them to panel separator
        const incomingNormalized = value.replace(/[\\/]/g, sep);
        const parts = incomingNormalized.split(sep).filter(Boolean);
        const lastPart = parts.pop();
        if (!existingNames.has(lastPart)) {
          newFolderName =
            parts.length > 0 ? parts.join(sep) + sep + lastPart : lastPart;
        } else {
          let counter = 2;
          while (existingNames.has(`${lastPart} (${counter})`)) {
            counter++;
          }
          const finalLast = `${lastPart} (${counter})`;
          newFolderName =
            parts.length > 0 ? parts.join(sep) + sep + finalLast : finalLast;
        }
      } else {
        newFolderName = "New Folder";
        if (existingNames.has(newFolderName)) {
          let counter = 2;
          while (existingNames.has(`New Folder (${counter})`)) {
            counter++;
          }
          newFolderName = `New Folder (${counter})`;
        }
      }
      setCreatingFolder({ panelId: panelId, value: newFolderName });
      setSelections((prev) => ({ ...prev, [panelId]: new Set() }));
      // Return resolved name and panelId so external callers can use them immediately
      return { panelId, name: newFolderName };
    },
    [renamingItem, creatingFolder.panelId, panels, setSelections]
  );

  const handleCancelNewFolder = useCallback(() => {
    setCreatingFolder({ panelId: null, value: "" });
  }, []);

  const handleConfirmNewFolder = useCallback(
    async (panelIdOverride, overrideValue, options = {}) => {
      const panelId = panelIdOverride ?? creatingFolder.panelId;
      const existingValue = creatingFolder.value;
      const finalValue =
        typeof overrideValue === "string" && overrideValue !== ""
          ? overrideValue
          : existingValue;
      if (!panelId || !finalValue) {
        handleCancelNewFolder();
        return;
      }
      const panel = panels[panelId];
      const newFolderPath = buildFullPath(panel.path, finalValue);
      try {
        if (isVerboseLogging())
          console.log(
            `[useNewFolder] Creating folder '${finalValue}' on panel ${panelId}`
          );
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
        jobId = response?.jobId ?? null; // Get the jobId from the server response

        if (zipPathMatch && response && response.jobId) {
          // Start the modal now that server accepted the job
          startZipUpdate({
            jobId: response.jobId,
            zipFilePath,
            filePathInZip,
            originalZipSize: 0,
            itemType: "folder",
            title: "Creating folder in zip...",
            triggeredFromConsole: options?.triggeredFromConsole,
          });
          // Safety timeout to prevent stuck UI
          const timeoutId = setTimeout(() => {
            console.error("[useNewFolder] Zip operation timed out");
            setError("Zip operation timed out");
            handleCancelNewFolder();
            hideZipUpdate();
          }, 30000);

          // Now that we have the jobId, connect the WebSocket and only navigate after completion
          connectZipUpdateWebSocket(response.jobId, "create-folder-in-zip", {
            onComplete: async () => {
              clearTimeout(timeoutId);
              handleCancelNewFolder(); // Reset state after navigation so the create modal stays visible until done
              await handleNavigate(panelId, panel.path, "");
              setFocusedItem((prev) => ({ ...prev, [panelId]: finalValue }));
              setSelectionAnchor((prev) => ({
                ...prev,
                [panelId]: finalValue,
              }));
              setSelections((prev) => ({
                ...prev,
                [panelId]: new Set([finalValue]),
              }));
            },
            onProgress: (data) => {
              try {
                if (
                  setZipUpdateProgressModal &&
                  data &&
                  data.tempZipSize !== undefined
                ) {
                  setZipUpdateProgressModal((prev) =>
                    prev.jobId === response.jobId
                      ? { ...prev, tempZipSize: data.tempZipSize }
                      : prev
                  );
                }
              } catch (e) {}
            },
            onError: (err) => {
              clearTimeout(timeoutId);
              console.error("Zip folder creation failed:", err);
              setError(err || "Failed to create folder in zip");
              handleCancelNewFolder();
            },
            onCancel: () => {
              clearTimeout(timeoutId);
              handleCancelNewFolder();
            },
          });
          return {
            success: true,
            result: response,
            createdPath: newFolderPath,
          };
        } else {
          handleCancelNewFolder(); // Reset state before navigation
          await handleNavigate(panelId, panel.path, "");
          setFocusedItem((prev) => ({ ...prev, [panelId]: finalValue }));
          setSelectionAnchor((prev) => ({ ...prev, [panelId]: finalValue }));
          setSelections((prev) => ({
            ...prev,
            [panelId]: new Set([finalValue]),
          }));
          return {
            success: true,
            result: response,
            createdPath: newFolderPath,
          };
        }
      } catch (err) {
        // If folder already exists, return the error but avoid showing App Error modal
        const conflictMsg =
          err && err.message && err.message.includes("already exists");
        if (conflictMsg) {
          // Ensure the app error modal is not shown
          if (typeof setError === "function") setError(null);
          handleCancelNewFolder();
          return {
            success: false,
            error: err.message,
            createdPath: newFolderPath,
          };
        }
        setError(err.message);
        handleCancelNewFolder();
        hideZipUpdate(); // Hide modal on error
        return { success: false, error: err.message };
      }
    },
    [
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
    ]
  );

  return {
    creatingFolder,
    setCreatingFolder,
    handleStartNewFolder,
    handleCancelNewFolder,
    handleConfirmNewFolder,
  };
}
