import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { savePaths, fetchDirectory } from "../lib/api";
import { isMac, isPreviewableText, isItemPreviewable } from "../lib/utils";

import useDelete from "./useDelete";
import useRename from "./useRename";
import useNewFolder from "./useNewFolder";
import useCopy from "./useCopy";
import useSizeCalculation from "./useSizeCalculation";
import useKeyboardShortcuts from "./useKeyboardShortcuts";
import useSettings from "./useSettings";
import useModals from "./useModals";
import usePanelOps from "./usePanelOps";
import useCompress from "./useCompress";
import useDecompress from "./useDecompress";
import useArchiveIntegrityTest from "./useArchiveIntegrityTest";
import useSwapPanels from "./useSwapPanels";

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
  const [filter, setFilter] = useState({
    left: { pattern: "", useRegex: false, caseSensitive: false },
    right: { pattern: "", useRegex: false, caseSensitive: false },
  });
  const [isFiltering, setIsFiltering] = useState({ left: false, right: false });
  const [filterPanelId, setFilterPanelId] = useState(null);
  const [overwritePrompt, setOverwritePrompt] = useState({
    isVisible: false,
    item: { name: null, type: "file" },
    jobType: null,
  });

  // --- Core Refs ---
  const wsRef = useRef(null);
  const panelRefs = { left: useRef(null), right: useRef(null) };

  const handleCloseFilter = (panelId) => {
    setFilterPanelId(null);
    setFilter((prev) => ({
      ...prev,
      [panelId]: { pattern: "", useRegex: false, caseSensitive: false },
    }));
  };

  const handleFilterChange = (panelId, newFilter) => {
    setFilter((prev) => ({ ...prev, [panelId]: newFilter }));
  };

  const filteredItems = useMemo(() => {
    const getFiltered = (panelId) => {
      const items = panels[panelId].items;
      const currentFilter = filter[panelId];
      if (!currentFilter.pattern) {
        return items;
      }
      const flags = currentFilter.caseSensitive ? "" : "i";
      const regex = currentFilter.useRegex
        ? new RegExp(currentFilter.pattern, flags)
        : new RegExp(
            currentFilter.pattern.replace(/\./g, "\\.").replace(/\*/g, ".*"),
            flags
          );
      return items.filter(
        (item) => item.name === ".." || regex.test(item.name)
      );
    };
    return {
      left: getFiltered("left"),
      right: getFiltered("right"),
    };
  }, [panels, filter]);

  // --- HOOK INITIALIZATION (Order is Important!) ---

  // 1. Independent hooks that provide state and setters
  const settings = useSettings({ setError });
  const modals = useModals();

  const wsFileWatcher = useRef(null);

  const watchPath = useCallback((path) => {
    if (
      wsFileWatcher.current &&
      wsFileWatcher.current.readyState === WebSocket.OPEN
    ) {
      wsFileWatcher.current.send(JSON.stringify({ type: "watch_path", path }));
    }
  }, []);

  const unwatchPath = useCallback((path) => {
    if (
      wsFileWatcher.current &&
      wsFileWatcher.current.readyState === WebSocket.OPEN
    ) {
      wsFileWatcher.current.send(
        JSON.stringify({ type: "unwatch_path", path })
      );
    }
  }, []);

  const panelOps = usePanelOps({
    panels,
    setPanels,
    setLoading,
    setError,
    setAppBrowserModal: modals.setAppBrowserModal,
    activePanel,
    focusedItem,
    watchPath,
    unwatchPath,
  });
  const sizeCalculation = useSizeCalculation({
    panels,
    setError,
    updateItemInPanel: panelOps.updateItemInPanel,
    wsRef,
  });

  const { isCalculatingSize, ...sizeCalculationHandlers } = sizeCalculation;

  // 2. Feature hooks
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
    filteredItems: filteredItems[activePanel],
    handleNavigate: panelOps.handleNavigate,
    setError,
    panelRefs,
    handleCancelRename: rename.handleCancelRename,
    handleCancelNewFolder: newFolder.handleCancelNewFolder,
    wsRef,
    overwritePrompt,
    setOverwritePrompt,
  });
  const del = useDelete({
    activePanel,
    panels,
    focusedItem,
    activeSelection,
    filteredItems: filteredItems[activePanel],
    handleNavigate: panelOps.handleNavigate,
    setError,
    panelRefs,
  });

  const compress = useCompress({
    activePanel,
    panels,
    selections,
    setError,
    handleRefreshPanel: panelOps.handleRefreshPanel,
    setSelections,
    setFocusedItem,
    setActivePanel,
    panelRefs,
    wsRef,
  });

  const decompress = useDecompress({
    activePanel,
    panels,
    selections,
    setError,
    handleRefreshPanel: panelOps.handleRefreshPanel,
    wsRef,
    setActivePanel,
    setSelections,
    setFocusedItem,
    panelRefs,
    overwritePrompt,
    setOverwritePrompt,
  });

  const archiveTest = useArchiveIntegrityTest({
    activePanel,
    panels,
    selections,
    setError,
    wsRef,
  });

  const { handleSwapPanels } = useSwapPanels({
    panels,
    handleNavigate: panelOps.handleNavigate,
  });

  const handleSelectAll = useCallback(
    (panelId) => {
      const items = filter[panelId].pattern
        ? filteredItems[panelId]
        : panels[panelId]?.items;
      if (!items) return;
      const allSelectableItems = items
        .filter((item) => item.name !== "..")
        .map((item) => item.name);
      setSelections((prev) => ({
        ...prev,
        [panelId]: new Set(allSelectableItems),
      }));
    },
    [panels, filter, filteredItems, setSelections]
  );

  const handleUnselectAll = useCallback(
    (panelId) => {
      setSelections((prev) => ({ ...prev, [panelId]: new Set() }));
    },
    [setSelections]
  );

  const handleInvertSelection = useCallback(
    (panelId) => {
      const items = filter[panelId].pattern
        ? filteredItems[panelId]
        : panels[panelId]?.items;
      if (!items) return;

      const currentSelection = selections[panelId];
      const allSelectableItems = items
        .filter((item) => item.name !== "..")
        .map((item) => item.name);

      const newSelection = new Set(
        allSelectableItems.filter((name) => !currentSelection.has(name))
      );

      setSelections((prev) => ({ ...prev, [panelId]: newSelection }));
    },
    [panels, filter, filteredItems, selections, setSelections]
  );

  const handleStartQuickSelect = (panelId) => {
    modals.setQuickSelectModal({ isVisible: true, mode: "select" });
  };

  const handleStartQuickUnselect = (panelId) => {
    modals.setQuickSelectModal({ isVisible: true, mode: "unselect" });
  };

  const handleQuickSelectConfirm = useCallback(
    (pattern, useRegex, caseSensitive, resetSelection) => {
      const items = filter[activePanel].pattern
        ? filteredItems[activePanel]
        : panels[activePanel]?.items;
      if (!items) return;

      const currentSelection = resetSelection
        ? new Set()
        : new Set(selections[activePanel]);
      const flags = caseSensitive ? "" : "i";
      const regex = useRegex
        ? new RegExp(pattern, flags)
        : new RegExp(pattern.replace(/\./g, "\\.").replace(/\*/g, ".*"), flags);

      items.forEach((item) => {
        if (item.name === "..") return;
        if (regex.test(item.name)) {
          if (modals.quickSelectModal.mode === "select") {
            currentSelection.add(item.name);
          } else {
            currentSelection.delete(item.name);
          }
        }
      });

      setSelections((prev) => ({ ...prev, [activePanel]: currentSelection }));
    },
    [
      activePanel,
      panels,
      filter,
      filteredItems,
      selections,
      modals.quickSelectModal.mode,
      setSelections,
    ]
  );

  const handleStartFilter = (panelId) => {
    setFilterPanelId(panelId);
  };

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

  useEffect(() => {
    const leftPath = panels.left.path;
    const rightPath = panels.right.path;

    if (leftPath) {
      watchPath(leftPath);
    }
    if (rightPath) {
      watchPath(rightPath);
    }
  }, [panels.left.path, panels.right.path, watchPath]);

  // --- "Connector" Handlers & UI Composition ---
  const openFolderBrowserForPanel = (panelId) => {
    const startPath = panels[panelId].path;
    modals.setFolderBrowserModal({
      isVisible: true,
      targetPanelId: panelId,
      initialPath: startPath,
    });
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
    let { panelId, value } = editingPath;
    if (!panelId) return;

    // Special handling for macOS root volume input
    if (isMac && value === "/Volumes/Macintosh HD") {
      value = "/";
    }

    if (value === panels[panelId].path) {
      setEditingPath({ panelId: null, value: "" });
      return;
    }
    await panelOps.handleNavigate(panelId, value, "");
    setEditingPath({ panelId: null, value: "" });
  };

  const activePath = panels[activePanel].path;

  const handleViewItem = useCallback(() => {
    const name = focusedItem[activePanel];
    if (name) {
      const item = panels[activePanel].items.find((i) => i.name === name);
      if (!item) return;

      if (item.type === "archive" || isItemPreviewable(item)) {
        modals.setPreviewModal({ isVisible: true, item: item });
      } else if (!["folder", "parent"].includes(item.type)) {
        panelOps.handleOpenFile(panels[activePanel].path, item.name);
      }
    }
  }, [activePanel, focusedItem, panels, modals, panelOps]);

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
        action: () => handleViewItem(),
        disabled: (() => {
          const name = focusedItem[activePanel];
          if (!name) return true;
          const item = panels[activePanel]?.items.find((i) => i.name === name);
          return !item || ["folder", "parent"].includes(item.type);
        })(),
      },
      {
        label: "Edit",
        f_key: "F4",
        action: () => {
          const name = focusedItem[activePanel];
          if (name) {
            const item = panels[activePanel].items.find((i) => i.name === name);
            if (item) {
              if (isPreviewableText(item.name)) {
                modals.setPreviewModal({
                  isVisible: true,
                  item: item,
                  isEditing: true,
                });
              } else if (!["folder", "parent"].includes(item.type)) {
                panelOps.handleOpenFile(activePath, item.name);
              }
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
      {
        label: "Copy",
        f_key: "F5",
        action: () => copy.handleCopyAction(),
        disabled: activeSelection.size === 0,
      },
      {
        label: "Move",
        f_key: "F6",
        action: () => copy.handleCopyAction(true),
        disabled: activeSelection.size === 0,
      },
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
      modals,
      rename.handleStartRename,
      handleViewItem,
    ]
  );

  const handleOverwriteDecision = (decision) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "overwrite_response", decision })
      );
    }
    setOverwritePrompt({ isVisible: false, item: null });
  };

  useKeyboardShortcuts({
    deleteModalVisible: del.deleteModalVisible,
    handleCancelDelete: del.handleCancelDelete,
    confirmDeletion: del.confirmDeletion,
    previewModal: modals.previewModal,
    setPreviewModal: modals.setPreviewModal,
    copyProgress: copy.copyProgress,
    overwritePrompt: overwritePrompt,
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
    selections,
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
    calculateSizeForMultipleFolders:
      sizeCalculation.calculateSizeForMultipleFolders,
    handleInvertSelection,
    handleStartQuickSelect,
    handleStartQuickUnselect,
    quickSelectModal: modals.quickSelectModal,
    setQuickSelectModal: modals.setQuickSelectModal,
    handleQuickSelectConfirm,
    handleStartFilter: () => handleStartFilter(activePanel),
    filterPanelId,
    handleCloseFilter,
    handleSelectAll,
    handleSwapPanels,
    openZipPreviewModal: modals.openZipPreviewModal,
    handleViewItem,
  });

  const panelsRef = useRef(panels);
  panelsRef.current = panels;

  const panelOpsRef = useRef(panelOps);
  panelOpsRef.current = panelOps;

  useEffect(() => {
    let isMounted = true;
    const WEBSOCKET_URL = `ws://${window.location.host}/ws`;
    wsFileWatcher.current = new WebSocket(WEBSOCKET_URL);

    wsFileWatcher.current.onopen = () => {
      if (!isMounted) return;
    };

    wsFileWatcher.current.onmessage = (event) => {
      if (!isMounted) return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === "path_changed") {
          const { path } = message;
          Object.entries(panelsRef.current).forEach(([panelId, panel]) => {
            if (panel.path === path) {
              panelOpsRef.current.handleRefreshPanel(panelId);
            }
          });
        }
      } catch (e) {
        console.error("Error parsing message from file watcher ws:", e);
      }
    };

    wsFileWatcher.current.onclose = () => {
      if (!isMounted) return;
    };

    wsFileWatcher.current.onerror = (error) => {
      if (!isMounted) return;
      console.error("File watcher WebSocket error:", error);
    };

    return () => {
      isMounted = false;
      if (wsFileWatcher.current) {
        wsFileWatcher.current.close();
      }
    };
  }, []);

  const { handleContextOpen, handleContextOpenWith, ...panelOpsHandlers } =
    panelOps;

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
    overwritePrompt,
    // Core Setters
    setActivePanel,
    setPanels,
    setSelections,
    setFocusedItem,
    setSelectionAnchor,
    setLoading,
    setError,
    setEditingPath,
    setOverwritePrompt,
    // State & Handlers from Hooks
    ...settings,
    ...modals,
    ...rename,
    ...newFolder,
    ...copy,
    ...del,
    ...sizeCalculationHandlers,
    ...panelOpsHandlers,
    ...compress,
    ...decompress,
    ...archiveTest,
    // Connector Handlers
    openFolderBrowserForPanel,
    handleFolderBrowserConfirm,
    handlePathInputSubmit,
    handleSelectAll,
    handleUnselectAll,
    handleInvertSelection,
    handleStartQuickSelect,
    handleStartQuickUnselect,
    handleQuickSelectConfirm,
    filter,
    isFiltering,
    filterPanelId,
    handleStartFilter,
    handleCloseFilter,
    handleFilterChange,
    filteredItems,
    handleSwapPanels,
    handleContextOpen,
    handleContextOpenWith,
    handleOverwriteDecision,
    handleViewItem,
    // UI Composition
    actionBarButtons,
  };
}
