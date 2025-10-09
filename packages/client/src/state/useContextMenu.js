import { useState, useCallback, useEffect } from "react";
import { buildFullPath } from "../lib/utils";

export default function useContextMenu({
  selections,
  panels,
  calculateSizeForMultipleFolders,
  setActivePanel,
  setSelections,
  setFocusedItem,
  setAppBrowserModal,
  handleNavigate,
  handleOpenFile,
}) {
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    targetItems: [],
    path: null,
  });
  const [pathContextMenu, setPathContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    panelId: null,
  });
  const [emptyAreaContextMenu, setEmptyAreaContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    panelId: null,
  });

  const closeContextMenus = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
    setPathContextMenu((prev) => ({ ...prev, visible: false }));
    setEmptyAreaContextMenu((prev) => ({ ...prev, visible: false }));
  }, []);

  const handleContextMenuOpen = (x, y, rightClickedItem, panelId) => {
    const currentSelection = selections[panelId];
    const panelItems = panels[panelId].items;
    let finalTargetItems = [];
    const rightClickedIsSelected = currentSelection.has(rightClickedItem.name);

    if (rightClickedIsSelected && currentSelection.size > 1) {
      finalTargetItems = panelItems.filter((item) =>
        currentSelection.has(item.name)
      );
    } else {
      finalTargetItems = [rightClickedItem];
      setActivePanel(panelId);
      setSelections((s) => ({
        ...s,
        [panelId]: new Set([rightClickedItem.name]),
      }));
      setFocusedItem((s) => ({ ...s, [panelId]: rightClickedItem.name }));
    }

    setContextMenu({
      visible: true,
      x,
      y,
      targetItems: finalTargetItems,
      path: panels[panelId].path,
    });
  };

  const handleContextOpen = () => {
    if (!contextMenu.path || contextMenu.targetItems.length !== 1) return;
    const itemToOpen = contextMenu.targetItems[0];

    if (itemToOpen.type === "folder" || itemToOpen.type === "parent") {
      const panelId = contextMenu.path === panels.left.path ? "left" : "right";
      handleNavigate(panelId, contextMenu.path, itemToOpen.name);
    } else {
      handleOpenFile(contextMenu.path, itemToOpen.name);
    }
    closeContextMenus();
  };

  const handleContextOpenWith = () => {
    if (!contextMenu.path || contextMenu.targetItems.length !== 1) return;
    const itemToOpen = contextMenu.targetItems[0];

    setAppBrowserModal({
      isVisible: true,
      file: itemToOpen,
      path: contextMenu.path,
    });
    closeContextMenus();
  };

  const handleSetOtherPanelPath = () => {
    // Ensure only one item is targeted for this action
    if (!contextMenu.path || contextMenu.targetItems.length !== 1) {
      closeContextMenus();
      return;
    }

    const itemToNavigate = contextMenu.targetItems[0];

    // This action only makes sense for folders
    if (itemToNavigate.type !== "folder") {
      closeContextMenus();
      return;
    }

    const otherPanelId =
      contextMenu.path === panels.left.path ? "right" : "left";
    const newPath = buildFullPath(contextMenu.path, itemToNavigate.name);

    handleNavigate(otherPanelId, newPath, "");
    closeContextMenus();
  };

  const handlePathContextMenu = (e, panelId) => {
    e.preventDefault();
    closeContextMenus();
    setPathContextMenu({ visible: true, x: e.pageX, y: e.pageY, panelId });
  };

  const handleEmptyAreaContextMenu = (e, panelId) => {
    e.preventDefault();
    closeContextMenus();
    setEmptyAreaContextMenu({ visible: true, x: e.pageX, y: e.pageY, panelId });
  };

  const contextCalculateSize = useCallback(() => {
    const foldersToCalc = contextMenu.targetItems.filter(
      (i) => i.type === "folder"
    );
    closeContextMenus();
    if (foldersToCalc.length === 0) return;
    const panelId = contextMenu.path === panels.left.path ? "left" : "right";
    calculateSizeForMultipleFolders(foldersToCalc, panelId);
  }, [contextMenu, panels, calculateSizeForMultipleFolders, closeContextMenus]);

  useEffect(() => {
    window.addEventListener("click", closeContextMenus);
    return () => window.removeEventListener("click", closeContextMenus);
  }, [closeContextMenus]);

  return {
    contextMenu,
    setContextMenu,
    pathContextMenu,
    setPathContextMenu,
    emptyAreaContextMenu,
    setEmptyAreaContextMenu,
    closeContextMenus,
    handleContextMenuOpen,
    handleContextOpen,
    handleContextOpenWith,
    handleSetOtherPanelPath,
    handlePathContextMenu,
    handleEmptyAreaContextMenu,
    contextCalculateSize,
  };
}
