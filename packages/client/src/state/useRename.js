import { useState, useCallback } from "react";
import { renameItem } from "../lib/api";
import { buildFullPath } from "../lib/utils";

export default function useRename({
  panels,
  handleNavigate,
  setFocusedItem,
  setSelectionAnchor,
  setSelections,
  setError,
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
    try {
      await renameItem(oldPath, value);
      await handleNavigate(panelId, panel.path, "");
      setFocusedItem((prev) => ({ ...prev, [panelId]: value }));
      setSelectionAnchor((prev) => ({ ...prev, [panelId]: value }));
      setSelections((prev) => ({ ...prev, [panelId]: new Set([value]) }));
    } catch (err) {
      setError(err.message);
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
  ]);

  return {
    renamingItem,
    setRenamingItem,
    handleStartRename,
    handleCancelRename,
    handleConfirmRename,
  };
}
