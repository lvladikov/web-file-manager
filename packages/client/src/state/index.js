import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { savePaths, fetchDirectory } from "../lib/api";

import useDelete from "./useDelete";
import useRename from "./useRename";
import useNewFolder from "./useNewFolder";
import useCopy from "./useCopy";
import useSizeCalculation from "./useSizeCalculation";
import useContextMenu from "./useContextMenu";
import useKeyboardShortcuts from "./useKeyboardShortcuts";
import useSettings from "./useSettings";
import useModals from "./useModals";
import usePanelOps from "./usePanelOps";

export default function appState() {
  // --- Core State ---
  const [activePanel, setActivePanel] = useState("left");
  const [panels, setPanels] = useState({
    left: { path: "", items: [] },
    right: { path: "", items: [] },
  });
  const [selections, setSelections] = useState({
    left: new Set(),
    right: new Set(),
  });
  const [focusedItem, setFocusedItem] = useState({ left: null, right: null });
  const [selectionAnchor, setSelectionAnchor] = useState({
    left: null,
    right: null,
  });
  const [loading, setLoading] = useState({ left: true, right: true });
  const [error, setError] = useState(null);
  const [editingPath, setEditingPath] = useState({ panelId: null, value: "" });

  // --- Core Refs ---
  const wsRef = useRef(null);
  const panelRefs = { left: useRef(null), right: useRef(null) };

  // --- HOOK INITIALIZATION (Order is Important!) ---

  // 1. Independent hooks that provide state and setters
  const settings = useSettings({ setError });
  const panelOps = usePanelOps({ panels, setPanels, setLoading, setError });
  const modals = useModals();
  const sizeCalculation = useSizeCalculation({
    panels,
    setError,
    updateItemInPanel: panelOps.updateItemInPanel,
    wsRef,
  });

  // 2. Hooks that depend on the hooks above
  const contextMenu = useContextMenu({
    selections,
    panels,
    setActivePanel,
    setSelections,
    setFocusedItem,
    setAppBrowserModal: modals.setAppBrowserModal,
    handleNavigate: panelOps.handleNavigate,
    handleOpenFile: panelOps.handleOpenFile,
  });

  // 3. Feature hooks
  const rename = useRename({
    panels,
    handleNavigate: panelOps.handleNavigate,
    setFocusedItem,
    setSelectionAnchor,
    setSelections,
    setError,
  });
  const newFolder = useNewFolder({
    renamingItem: rename.renamingItem,
    panels,
    handleNavigate: panelOps.handleNavigate,
    setSelections,
    setFocusedItem,
    setSelectionAnchor,
    setError,
  });
  const activeSelection = selections[activePanel];
  const copy = useCopy({
    activePanel,
    panels,
    activeSelection,
    handleNavigate: panelOps.handleNavigate,
    setError,
    panelRefs,
    handleCancelRename: rename.handleCancelRename,
    handleCancelNewFolder: newFolder.handleCancelNewFolder,
    wsRef,
  });
  const del = useDelete({
    activePanel,
    panels,
    focusedItem,
    activeSelection,
    handleNavigate: panelOps.handleNavigate,
    setError,
    panelRefs,
  });

  const handleSelectAll = useCallback(() => {
    const panelItems = panels[activePanel]?.items;
    if (!panelItems) return;
    const allSelectableItems = panelItems
      .filter((item) => item.name !== "..")
      .map((item) => item.name);
    setSelections((prev) => ({
      ...prev,
      [activePanel]: new Set(allSelectableItems),
    }));
  }, [activePanel, panels, setSelections]);

  const handleUnselectAll = useCallback(() => {
    setSelections((prev) => ({ ...prev, [activePanel]: new Set() }));
  }, [activePanel, setSelections]);

  const handleInvertSelection = useCallback(() => {
    const panelItems = panels[activePanel]?.items;
    if (!panelItems) return;

    const currentSelection = selections[activePanel];
    const allSelectableItems = panelItems
      .filter((item) => item.name !== "..")
      .map((item) => item.name);

    const newSelection = new Set(
      allSelectableItems.filter((name) => !currentSelection.has(name))
    );

    setSelections((prev) => ({ ...prev, [activePanel]: newSelection }));
  }, [activePanel, panels, selections, setSelections]);

  useEffect(() => {
    if (settings.settingsLoading) return;
    const loadPanelData = async () => {
      setLoading({ left: true, right: true });
      try {
        const [leftData, rightData] = await Promise.all([
          fetchDirectory(settings.initialPaths.left || ""),
          fetchDirectory(settings.initialPaths.right || ""),
        ]);
        setPanels({ left: leftData, right: rightData });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading({ left: false, right: false });
      }
    };
    loadPanelData();
  }, [
    settings.settingsLoading,
    settings.initialPaths,
    setError,
    setLoading,
    setPanels,
  ]);

  useEffect(() => {
    if (
      !modals.folderBrowserModal.isVisible &&
      !modals.appBrowserModal.isVisible
    ) {
      panelRefs[activePanel].current?.focus();
    }
  }, [
    activePanel,
    modals.folderBrowserModal.isVisible,
    modals.appBrowserModal.isVisible,
  ]);

  useEffect(() => {
    if (!modals.previewModal.isVisible) return;
    const focusedName = focusedItem[activePanel];
    if (!focusedName) return;
    const newItem = panels[activePanel].items.find(
      (i) => i.name === focusedName
    );
    if (newItem) {
      if (newItem.type === "parent") {
        modals.setPreviewModal({ isVisible: false, item: null });
      } else {
        modals.setPreviewModal((prev) => ({ ...prev, item: newItem }));
      }
    }
  }, [
    focusedItem,
    activePanel,
    panels,
    modals.previewModal.isVisible,
    modals.setPreviewModal,
  ]);

  useEffect(() => {
    const leftPath = panels.left.path;
    const rightPath = panels.right.path;
    if (leftPath && rightPath && (leftPath !== "" || rightPath !== "")) {
      savePaths({ left: leftPath, right: rightPath }).catch((err) =>
        console.error("Auto-save paths failed:", err.message)
      );
    }
  }, [panels.left.path, panels.right.path]);

  // --- "Connector" Handlers & UI Composition ---
  const openFolderBrowserForPanel = () => {
    const { panelId } = contextMenu.pathContextMenu;
    const startPath = panels[panelId].path;
    modals.setFolderBrowserModal({
      isVisible: true,
      targetPanelId: panelId,
      initialPath: startPath,
    });
    contextMenu.closeContextMenus();
  };

  const handleFolderBrowserConfirm = (selectedPath) => {
    const { targetPanelId } = modals.folderBrowserModal;
    if (targetPanelId) {
      panelOps.handleNavigate(targetPanelId, selectedPath, "");
    }
    modals.setFolderBrowserModal({
      isVisible: false,
      targetPanelId: null,
      initialPath: "",
    });
  };

  const handlePathInputSubmit = async () => {
    const { panelId, value } = editingPath;
    if (!panelId || value === panels[panelId].path) {
      setEditingPath({ panelId: null, value: "" });
      return;
    }
    await panelOps.handleNavigate(panelId, value, "");
    setEditingPath({ panelId: null, value: "" });
  };

  const activePath = panels[activePanel].path;

  const actionBarButtons = useMemo(
    () => [
      {
        label: "Help",
        f_key: "F1",
        action: () => modals.setHelpModal({ isVisible: true }),
      },
      {
        label: "Rename",
        f_key: "F2",
        action: () => {
          const name = focusedItem[activePanel];
          if (name && name !== "..") {
            rename.handleStartRename(activePanel, name);
          }
        },
        disabled:
          !focusedItem[activePanel] || focusedItem[activePanel] === "..",
      },
      {
        label: "View",
        f_key: "F3",
        action: () => {
          const name = focusedItem[activePanel];
          if (name) {
            const item = panels[activePanel].items.find((i) => i.name === name);
            if (item && !["folder", "parent"].includes(item.type)) {
              panelOps.handleOpenFile(activePath, item.name);
            }
          }
        },
        disabled: (() => {
          const name = focusedItem[activePanel];
          if (!name) return true;
          const item = panels[activePanel]?.items.find((i) => i.name === name);
          return !item || ["folder", "parent"].includes(item.type);
        })(),
      },
      { label: "Edit", f_key: "F4", action: () => {}, disabled: true },
      {
        label: "Copy",
        f_key: "F5",
        action: () => copy.handleCopyAction(),
        disabled: activeSelection.size === 0,
      },
      { label: "Move", f_key: "F6", action: () => {}, disabled: true },
      {
        label: "New Folder",
        f_key: "F7",
        action: () => newFolder.handleStartNewFolder(activePanel),
        disabled: loading[activePanel],
      },
      {
        label: "Delete",
        f_key: "F8",
        action: () => del.handleDeleteItem(),
        disabled:
          activeSelection.size === 0 || focusedItem[activePanel] === "..",
      },
    ],
    [
      focusedItem,
      activePanel,
      panels,
      panelOps.handleOpenFile,
      activePath,
      copy.handleCopyAction,
      activeSelection,
      newFolder.handleStartNewFolder,
      loading,
      del.handleDeleteItem,
      modals.setHelpModal,
      rename.handleStartRename,
    ]
  );

  useKeyboardShortcuts({
    deleteModalVisible: del.deleteModalVisible,
    handleCancelDelete: del.handleCancelDelete,
    confirmDeletion: del.confirmDeletion,
    previewModal: modals.previewModal,
    setPreviewModal: modals.setPreviewModal,
    copyProgress: copy.copyProgress,
    handleCancelCopy: copy.handleCancelCopy,
    folderBrowserModal: modals.folderBrowserModal,
    setFolderBrowserModal: modals.setFolderBrowserModal,
    appBrowserModal: modals.appBrowserModal,
    setAppBrowserModal: modals.setAppBrowserModal,
    sizeCalcModal: sizeCalculation.sizeCalcModal,
    helpModal: modals.helpModal,
    setHelpModal: modals.setHelpModal,
    error,
    setError,
    activePanel,
    panels,
    focusedItem,
    selectionAnchor,
    activePath,
    setActivePanel,
    setSelections,
    setFocusedItem,
    setSelectionAnchor,
    handleNavigate: panelOps.handleNavigate,
    handleOpenFile: panelOps.handleOpenFile,
    handleStartRename: rename.handleStartRename,
    handleCopyAction: copy.handleCopyAction,
    handleStartNewFolder: newFolder.handleStartNewFolder,
    handleDeleteItem: del.handleDeleteItem,
    handleStartSizeCalculation: sizeCalculation.handleStartSizeCalculation,
    handleInvertSelection,
  });

  return {
    // Core State
    activePanel,
    panels,
    selections,
    focusedItem,
    selectionAnchor,
    loading,
    error,
    editingPath,
    wsRef,
    panelRefs,
    activeSelection,
    activePath,
    // Core Setters
    setActivePanel,
    setPanels,
    setSelections,
    setFocusedItem,
    setSelectionAnchor,
    setLoading,
    setError,
    setEditingPath,
    // State & Handlers from Hooks
    ...settings,
    ...modals,
    ...rename,
    ...newFolder,
    ...copy,
    ...del,
    ...contextMenu,
    ...sizeCalculation,
    ...panelOps,
    // Connector Handlers
    openFolderBrowserForPanel,
    handleFolderBrowserConfirm,
    handlePathInputSubmit,
    handleSelectAll,
    handleUnselectAll,
    handleInvertSelection,
    // UI Composition
    actionBarButtons,
  };
}
