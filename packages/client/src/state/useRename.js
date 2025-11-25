import { useState, useCallback } from "react";
import { renameItem } from "../lib/api";
import { buildFullPath, matchZipPath, isVerboseLogging } from "../lib/utils";

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
  setOverwritePrompt,
  setPendingOverwriteAction,
}) {
  const [renamingItem, setRenamingItem] = useState({
    panelId: null,
    name: null,
    value: "",
  });

  // Progress state for multi-rename operations
  const [multiRenameProgress, setMultiRenameProgress] = useState({
    isVisible: false,
    total: 0,
    processed: 0,
    currentOld: null,
    currentNew: null,
    successCount: 0,
    failureCount: 0,
    errors: [],
    cancelRequested: false,
    finished: false,
  });

  const handleStartRename = (panelId, name) => {
    if (name === "..") return;
    setRenamingItem({ panelId, name, value: name });
  };

  const handleCancelRename = useCallback(() => {
    setRenamingItem({ panelId: null, name: null, value: "" });
  }, []);

  const handleConfirmRename = useCallback(async () => {
    try {
      if (isVerboseLogging())
        console.log(
          `[useRename] Attempt rename: ${renamingItem.panelId}:${renamingItem.name} -> ${renamingItem.value}`
        );
    } catch (e) {}
    const { panelId, name, value } = renamingItem;
    if (!panelId || !name || !value || name === value) {
      handleCancelRename();
      return;
    }

    const panel = panels[panelId];
    const oldPath = buildFullPath(panel.path, name);
    const zipPathMatch = matchZipPath(oldPath);
    const isInnerZipPath =
      !!zipPathMatch && zipPathMatch[2] && zipPathMatch[2] !== "/";

    try {
      let zipFilePath, oldFilePathInZip, newFilePathInZip, type;
      if (isInnerZipPath) {
        zipFilePath = zipPathMatch[1];
        oldFilePathInZip = zipPathMatch[2].startsWith("/")
          ? zipPathMatch[2].substring(1)
          : zipPathMatch[2];

        const lastSlashIndex = oldFilePathInZip.lastIndexOf("/");
        const dirPath =
          lastSlashIndex === -1
            ? ""
            : oldFilePathInZip.substring(0, lastSlashIndex);
        newFilePathInZip = dirPath ? `${dirPath}/${value}` : value;

        const item = panel.items.find((i) => i.name === name);
        type = item?.type === "folder" ? "folder" : "file";
      }

      const response = await renameItem(oldPath, value);

      if (isInnerZipPath) {
        if (response && response.jobId) {
          // Now that we've got a jobId from the server, show the progress modal and connect.
          startZipUpdate({
            jobId: response.jobId,
            zipFilePath,
            filePathInZip: newFilePathInZip,
            originalZipSize: 0, // will be set by websocket
            itemType: type,
            title: "Renaming item in zip...",
          });
          connectZipUpdateWebSocket(
            response.jobId,
            "rename-in-zip",
            async () => {
              await handleNavigate(panelId, panel.path, "");
              setFocusedItem((prev) => ({ ...prev, [panelId]: value }));
              setSelectionAnchor((prev) => ({ ...prev, [panelId]: value }));
              setSelections((prev) => ({
                ...prev,
                [panelId]: new Set([value]),
              }));
            }
          );
        }
      } else {
        await handleNavigate(panelId, panel.path, "");
        setFocusedItem((prev) => ({ ...prev, [panelId]: value }));
        setSelectionAnchor((prev) => ({ ...prev, [panelId]: value }));
        setSelections((prev) => ({ ...prev, [panelId]: new Set([value]) }));
      }
    } catch (err) {
      if (
        err &&
        err.message &&
        err.message.includes("A file with that name already exists.")
      ) {
        const targetItem = panel.items.find((i) => i.name === value);
        const modalItem = targetItem
          ? { name: value, type: targetItem.type }
          : { name: value, type: "file" };
        setOverwritePrompt({
          isVisible: true,
          item: modalItem,
          jobType: "rename",
        });
        setPendingOverwriteAction(async (decision) => {
          const doOverwrite = ["overwrite", "overwrite_all"].includes(decision);
          if (!doOverwrite) {
            setOverwritePrompt({ isVisible: false, item: null });
            handleCancelRename();
            return;
          }
          try {
            if (isInnerZipPath) {
              // Recompute zip file path and new path in zip at the time the overwrite action is executed
              const currentZipMatch = matchZipPath(oldPath);
              if (!currentZipMatch) {
                throw new Error("Internal: zip path parsing failed.");
              }
              const currentZipFilePath = currentZipMatch[1];
              const currentOldFilePathInZip = currentZipMatch[2].startsWith("/")
                ? currentZipMatch[2].substring(1)
                : currentZipMatch[2];
              const currentDir =
                currentOldFilePathInZip.lastIndexOf("/") === -1
                  ? ""
                  : currentOldFilePathInZip.substring(
                      0,
                      currentOldFilePathInZip.lastIndexOf("/")
                    );
              const currentNewFilePathInZip = currentDir
                ? `${currentDir}/${value}`
                : value;

              const response = await renameItem(oldPath, value, {
                overwrite: true,
              });
              if (response && response.jobId) {
                startZipUpdate({
                  jobId: response.jobId,
                  zipFilePath: currentZipFilePath,
                  filePathInZip: currentNewFilePathInZip,
                  originalZipSize: 0,
                  itemType:
                    (panel.items.find((i) => i.name === name)?.type === "folder"
                      ? "folder"
                      : "file") || "file",
                  title: "Renaming item in zip...",
                });
                connectZipUpdateWebSocket(
                  response.jobId,
                  "rename-in-zip",
                  async () => {
                    await handleNavigate(panelId, panel.path, "");
                    setFocusedItem((prev) => ({ ...prev, [panelId]: value }));
                    setSelectionAnchor((prev) => ({
                      ...prev,
                      [panelId]: value,
                    }));
                    setSelections((prev) => ({
                      ...prev,
                      [panelId]: new Set([value]),
                    }));
                  }
                );
              }
            } else {
              await renameItem(oldPath, value, { overwrite: true });
              await handleNavigate(panelId, panel.path, "");
              setFocusedItem((prev) => ({ ...prev, [panelId]: value }));
              setSelectionAnchor((prev) => ({ ...prev, [panelId]: value }));
              setSelections((prev) => ({
                ...prev,
                [panelId]: new Set([value]),
              }));
            }
          } catch (reErr) {
            setError(reErr.message || "Rename failed after overwrite.");
            if (isInnerZipPath) {
              hideZipUpdate();
            }
          } finally {
            setOverwritePrompt({ isVisible: false, item: null });
            handleCancelRename();
          }
        });
      } else {
        setError(err.message);
        if (isInnerZipPath) {
          hideZipUpdate();
        }
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
    setOverwritePrompt,
    setPendingOverwriteAction,
  ]);

  return {
    renamingItem,
    setRenamingItem,
    handleStartRename,
    handleCancelRename,
    handleConfirmRename,
    multiRenameProgress,
    setMultiRenameProgress,
  };
}
