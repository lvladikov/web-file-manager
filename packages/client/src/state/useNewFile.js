import { useState, useCallback } from "react";
import { createNewFile, saveFileContent } from "../lib/api";
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
    (panelId, value) => {
      if (
        renamingItem.panelId ||
        creatingFolder.panelId ||
        creatingFile.panelId
      ) {
        return;
      }
      const currentItems = panels[panelId]?.items || [];
      const existingNames = new Set(currentItems.map((item) => item.name));
      // If a specific value was provided, try to use it, but make it unique for the last segment if necessary
      let newFileName;
      if (typeof value === "string" && value.trim() !== "") {
        // Normalize incoming separators to match panel path style
        const panelPath = panels[panelId]?.path || "";
        const sep = panelPath.includes("\\") ? "\\" : "/";
        // Accept both forward and back slashes as separators and normalize them to panel separator
        const incomingNormalized = value.replace(/[\\/]/g, sep);
        const parts = incomingNormalized.split(sep).filter(Boolean);
        const lastPart = parts.pop();
        // Split last part into base and extension
        const dotIndex = lastPart.lastIndexOf(".");
        const baseName =
          dotIndex === -1 ? lastPart : lastPart.substring(0, dotIndex);
        const extension = dotIndex === -1 ? "" : lastPart.substring(dotIndex);
        if (!existingNames.has(lastPart)) {
          newFileName =
            parts.length > 0 ? parts.join(sep) + sep + lastPart : lastPart;
        } else {
          let counter = 2;
          while (existingNames.has(`${baseName} (${counter})${extension}`)) {
            counter++;
          }
          const finalLast = `${baseName} (${counter})${extension}`;
          newFileName =
            parts.length > 0 ? parts.join(sep) + sep + finalLast : finalLast;
        }
      } else {
        const base = "New File";
        const extension = ".txt";
        newFileName = `${base}${extension}`;
        if (existingNames.has(newFileName)) {
          let counter = 2;
          while (existingNames.has(`${base} (${counter})${extension}`)) {
            counter++;
          }
          newFileName = `${base} (${counter})${extension}`;
        }
      }

      setCreatingFile({ panelId: panelId, value: newFileName });
      setSelections((prev) => ({ ...prev, [panelId]: new Set() }));
      // Return resolved name and panelId so callers can use them immediately
      return { panelId, name: newFileName };
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

  const handleConfirmNewFile = useCallback(
    async (panelIdOverride, overrideValue, content = "") => {
      const panelId = panelIdOverride ?? creatingFile.panelId;
      const existingValue = creatingFile.value;
      const finalValue =
        typeof overrideValue === "string" && overrideValue !== ""
          ? overrideValue
          : existingValue;
      if (!panelId || !finalValue) {
        handleCancelNewFile();
        return;
      }
      const panel = panels[panelId];
      const newFilePath = buildFullPath(panel.path, finalValue);
      try {
        const zipPathMatch = matchZipPath(newFilePath);
        let jobId = null;

        let zipFilePath, filePathInZip;
        if (zipPathMatch) {
          zipFilePath = zipPathMatch[1];
          filePathInZip = zipPathMatch[2].startsWith("/")
            ? zipPathMatch[2].substring(1)
            : zipPathMatch[2];
        }

        const response = await createNewFile(newFilePath);
        jobId = response?.jobId ?? null;
        let contentSaveResult = null;
        if (typeof content === "string" && content !== "") {
          // If the create call returned a jobId (zip), pass it to saveFileContent so the server can reuse/attach
          contentSaveResult = await saveFileContent(
            newFilePath,
            content,
            null,
            jobId
          );
        }

        if (zipPathMatch && response && response.jobId) {
          // Start the modal now that server accepted the job
          startZipUpdate({
            jobId: response.jobId,
            zipFilePath,
            filePathInZip,
            originalZipSize: 0,
            itemType: "file",
            title: "Creating file in zip...",
          });
          connectZipUpdateWebSocket(jobId, "create-file-in-zip", async () => {
            handleCancelNewFile();
            await handleNavigate(panelId, panel.path, "");
            setFocusedItem((prev) => ({ ...prev, [panelId]: finalValue }));
            setSelectionAnchor((prev) => ({ ...prev, [panelId]: finalValue }));
            setSelections((prev) => ({
              ...prev,
              [panelId]: new Set([finalValue]),
            }));
          });
          return {
            success: true,
            result: response,
            contentSaveResult,
            createdPath: newFilePath,
          };
        } else {
          handleCancelNewFile(); // Reset state before navigation
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
            contentSaveResult,
            createdPath: newFilePath,
          };
        }
      } catch (err) {
        // If file already exists (409), don't trigger App Error modal; return error in the response
        const conflictMsg =
          err && err.message && err.message.includes("already exists");
        if (conflictMsg) {
          if (typeof setError === "function") setError(null);
          handleCancelNewFile();
          return {
            success: false,
            error: err.message,
            createdPath: newFilePath,
          };
        }
        setError(err.message);
        handleCancelNewFile();
        if (hideZipUpdate) {
          hideZipUpdate(); // Hide modal on error
        }
        // Return error object for callers
        return { success: false, error: err.message };
      }
    },
    [
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
    ]
  );

  return {
    creatingFile,
    setCreatingFile,
    handleStartNewFile,
    handleCancelNewFile,
    handleConfirmNewFile,
  };
}
