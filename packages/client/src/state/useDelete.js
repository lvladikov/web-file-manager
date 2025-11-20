import { useState, useCallback } from "react";
import { deleteItem, fetchDeleteSummary } from "../lib/api";
import { matchZipPath, isVerboseLogging } from "../lib/utils";

export default function useDelete({
  activePanel,
  panels,
  focusedItem,
  activeSelection,
  filteredItems,
  handleNavigate,
  setError,
  panelRefs,
  startZipUpdate,
  hideZipUpdate,
  connectZipUpdateWebSocket,
}) {
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteSummary, setDeleteSummary] = useState(null);
  const [deleteTargets, setDeleteTargets] = useState([]);

  const handleDeleteItem = useCallback(
    async (itemsToDeleteOverride) => {
      let itemsToDelete;

      // Determine the correct items to delete.
      if (itemsToDeleteOverride) {
        // If an explicit list is passed, use it (for context menu, etc.).
        itemsToDelete = itemsToDeleteOverride;
      } else if (activeSelection && activeSelection.size > 0) {
        // If no override, check for a multi-item selection.
        itemsToDelete = filteredItems.filter((item) =>
          activeSelection.has(item.name)
        );
      } else {
        // If no selection, fall back to the single focused item.
        const name = focusedItem[activePanel];
        const focused = name
          ? panels[activePanel].items.find((i) => i.name === name)
          : null;
        itemsToDelete = focused ? [focused] : [];
      }

      if (
        itemsToDelete.length === 0 ||
        (itemsToDelete[0] && itemsToDelete[0].name === "..")
      )
        return;
      if (isVerboseLogging()) {
        console.log(
          `[useDelete] Prepared ${itemsToDelete.length} items for deletion (panel=${activePanel})`
        );
      }
      setDeleteTargets(itemsToDelete);

      try {
        let totalFiles = 0;
        let totalFolders = 0;

        const topLevelFiles = itemsToDelete.filter((i) => i.type !== "folder");
        const topLevelFolders = itemsToDelete.filter(
          (i) => i.type === "folder"
        );

        totalFiles += topLevelFiles.length;
        totalFolders += topLevelFolders.length;

        for (const folder of topLevelFolders) {
          try {
            const deepSummary = await fetchDeleteSummary(folder.fullPath);
            totalFiles += deepSummary.files;
            totalFolders += deepSummary.folders;
          } catch (e) {
            console.error(`Could not get summary for ${folder.name}`, e);
          }
        }

        setDeleteSummary({ files: totalFiles, folders: totalFolders });
        setDeleteModalVisible(true);
      } catch (err) {
        setError(`Could not analyze items for deletion: ${err.message}`);
        setDeleteTargets([]);
        setDeleteSummary(null);
      }
    },
    [activePanel, focusedItem, panels, activeSelection, filteredItems, setError]
  );

  const confirmDeletion = useCallback(async () => {
    if (deleteTargets.length === 0) return;

    const pathsToDelete = deleteTargets.map((item) => item.fullPath);
    const zipPathMatch = matchZipPath(pathsToDelete[0]);
    const zipFilePath = zipPathMatch ? zipPathMatch[1] : null;
    const isInnerZipPath =
      !!zipPathMatch && zipPathMatch[2] && zipPathMatch[2] !== "/";

    if (isVerboseLogging()) {
      try {
        const summary = deleteTargets.map((t) => ({
          name: t.name,
          fullPath: t.fullPath,
          type: t.type,
        }));
        console.log(
          `[useDelete] Confirming deletion of ${pathsToDelete.length} items:`,
          summary
        );
      } catch (e) {
        console.log(
          `[useDelete] Confirming deletion of ${pathsToDelete.length} items`
        );
      }
    }

    try {
      const response = await deleteItem(pathsToDelete);

      if (isInnerZipPath && response && response.jobId) {
        try {
          if (isVerboseLogging())
            console.log(
              `[useDelete] Starting zip delete job ${response.jobId} for ${zipFilePath}`
            );
        } catch (e) {}
        const zipFilePath = zipPathMatch[1];
        startZipUpdate({
          jobId: response.jobId,
          zipFilePath,
          operationDescription: `Deleting ${deleteTargets.length} item${
            deleteTargets.length > 1 ? "s" : ""
          }...`,
          title: "Deleting items from zip...",
        });
        connectZipUpdateWebSocket(response.jobId, "delete-in-zip", async () => {
          const otherPanelId = activePanel === "left" ? "right" : "left";
          await handleNavigate(activePanel, panels[activePanel].path, "");
          await handleNavigate(otherPanelId, panels[otherPanelId].path, "");
        });
      } else {
        // For non-zip operations, refresh panels immediately
        const otherPanelId = activePanel === "left" ? "right" : "left";
        await handleNavigate(activePanel, panels[activePanel].path, "");
        await handleNavigate(otherPanelId, panels[otherPanelId].path, "");
      }
    } catch (err) {
      setError(`Delete failed: ${err.message}`);
      if (isInnerZipPath) {
        hideZipUpdate();
      }
    } finally {
      setDeleteModalVisible(false);
      setDeleteTargets([]);
      setDeleteSummary(null);
      panelRefs[activePanel].current?.focus();
    }
  }, [
    deleteTargets,
    activePanel,
    panels,
    handleNavigate,
    setError,
    panelRefs,
    startZipUpdate,
    hideZipUpdate,
    connectZipUpdateWebSocket,
  ]);

  const handleCancelDelete = useCallback(() => {
    setDeleteModalVisible(false);
    setDeleteTargets([]);
    setDeleteSummary(null);
    panelRefs[activePanel].current?.focus();
  }, [activePanel, panelRefs]);

  return {
    deleteModalVisible,
    setDeleteModalVisible,
    deleteSummary,
    setDeleteSummary,
    deleteTargets,
    setDeleteTargets,
    handleDeleteItem,
    confirmDeletion,
    handleCancelDelete,
  };
}
