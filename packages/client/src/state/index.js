import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { savePaths, fetchDirectory, post } from "../lib/api";
import {
  isMac,
  isPreviewableText,
  isItemPreviewable,
  buildFullPath,
  matchZipPath,
  dirname,
} from "../lib/utils";

import useDelete from "./useDelete";
import useRename from "./useRename";
import useNewFolder from "./useNewFolder";
import useNewFile from "./useNewFile";
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
import useCopyPaths from "./useCopyPaths";
import useZipUpdate from "./useZipUpdate";

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
  const [sortConfig, setSortConfig] = useState({
    left: { key: "name", direction: "asc" },
    right: { key: "name", direction: "asc" },
  });
  const [recentPaths, setRecentPaths] = useState([]);
  const [clipboard, setClipboard] = useState({ sources: [], isMove: false });
  const [allowContextMenu, setAllowContextMenu] = useState(false);

  // --- Core Refs ---
  const wsRef = useRef(null);
  const panelRefs = { left: useRef(null), right: useRef(null) };
  const pathsToWatch = useRef(new Set());

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

  const rawFilteredItems = useMemo(() => {
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

  const handleSort = useCallback((panelId, key) => {
    setSortConfig((prev) => {
      const currentSort = prev[panelId];
      let direction = "asc";

      // If the same key is clicked, toggle direction
      if (currentSort.key === key) {
        direction = currentSort.direction === "asc" ? "desc" : "asc";
      }

      return {
        ...prev,
        [panelId]: { key, direction },
      };
    });
  }, []);

  const sortedAndFilteredItems = useMemo(() => {
    const sorted = {};
    for (const panelId of ["left", "right"]) {
      const items = rawFilteredItems[panelId];
      const { key, direction } = sortConfig[panelId];

      const parentItem = items.find((i) => i.name === "..");
      const sortableItems = items.filter((i) => i.name !== "..");

      const compareFunc = (a, b) => {
        // 1. Group Folders before Files
        if (a.type === "folder" && b.type !== "folder") return -1;
        if (a.type !== "folder" && b.type === "folder") return 1;

        // 2. Sort within the group
        let aVal = a[key];
        let bVal = b[key];

        let comparison = 0;

        if (key === "size") {
          // Null sizes (for folders before calculation) are treated as 0 for sorting
          aVal = aVal === null ? 0 : aVal;
          bVal = bVal === null ? 0 : bVal;
          comparison = aVal - bVal;
        } else if (key === "modified") {
          // Convert to timestamp for reliable sorting
          // Items with no modified date (like '..') are already filtered out
          aVal = aVal ? new Date(aVal).getTime() : 0;
          bVal = bVal ? new Date(bVal).getTime() : 0;
          comparison = aVal - bVal;
        } else if (key === "name") {
          // Case-insensitive name sort
          comparison = aVal.toLowerCase().localeCompare(bVal.toLowerCase());
        }

        return direction === "asc" ? comparison : -comparison;
      };

      const finalSortedItems = [...sortableItems].sort(compareFunc);
      if (parentItem) {
        finalSortedItems.unshift(parentItem);
      }

      sorted[panelId] = finalSortedItems;
    }
    return sorted;
  }, [rawFilteredItems, sortConfig]);

  // --- HOOK INITIALIZATION (Order is Important!) ---

  // Independent hooks that provide state and setters
  const settings = useSettings({ setError });
  const modals = useModals();
  const zipUpdate = useZipUpdate();

  const wsFileWatcher = useRef(null);

  const watchPath = useCallback((path) => {
    const zipPathMatch = matchZipPath(path);
    const pathToWatch = zipPathMatch ? zipPathMatch[1] : path;

    if (
      wsFileWatcher.current &&
      wsFileWatcher.current.readyState === WebSocket.OPEN
    ) {
      wsFileWatcher.current.send(
        JSON.stringify({ type: "watch_path", path: pathToWatch })
      );
    } else {
      pathsToWatch.current.add(pathToWatch);
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
    setRecentPaths,
  });
  const sizeCalculation = useSizeCalculation({
    panels,
    setError,
    updateItemInPanel: panelOps.updateItemInPanel,
    wsRef,
  });

  const { isCalculatingSize, ...sizeCalculationHandlers } = sizeCalculation;

  const otherPanelId = activePanel === "left" ? "right" : "left";

  const handleTerminal = useCallback(async () => {
    try {
      let terminalPath = panels[activePanel].path;
      const zipMatch = matchZipPath(terminalPath);

      if (zipMatch) {
        // If inside a zip, open terminal in the parent directory of the zip file
        const zipFilePath = zipMatch[1]; // The full path to the .zip file
        terminalPath = dirname(zipFilePath); // The directory containing the .zip file
      }

      const response = await post("/api/terminals", { path: terminalPath });
      const { jobId } = await response.json();
      modals.setTerminalModal({ isVisible: true, jobId });
    } catch (error) {
      setError(error.message);
    }
  }, [activePanel, panels, modals.setTerminalModal, setError]);

  const handleTerminalOtherPanel = useCallback(async () => {
    try {
      let terminalPath = panels[otherPanelId].path;
      const zipMatch = matchZipPath(terminalPath);

      if (zipMatch) {
        // If inside a zip, open terminal in the parent directory of the zip file
        const zipFilePath = zipMatch[1]; // The full path to the .zip file
        terminalPath = dirname(zipFilePath);
      }

      const response = await post("/api/terminals", { path: terminalPath });
      const { jobId } = await response.json();
      modals.setTerminalModal({ isVisible: true, jobId });
    } catch (error) {
      setError(error.message);
    }
  }, [otherPanelId, panels, modals.setTerminalModal, setError]);

  // Feature hooks
  const rename = useRename({
    panels,
    handleNavigate: panelOps.handleNavigate,
    setFocusedItem,
    setSelectionAnchor,
    setSelections,
    setError,
    startZipUpdate: zipUpdate.startZipUpdate,
    hideZipUpdate: zipUpdate.hideZipUpdate,
    connectZipUpdateWebSocket: zipUpdate.connectZipUpdateWebSocket,
  });
  const newFolder = useNewFolder({
    renamingItem: rename.renamingItem,
    panels,
    handleNavigate: panelOps.handleNavigate,
    setSelections,
    setFocusedItem,
    setSelectionAnchor,
    setError,
    startZipUpdate: zipUpdate.startZipUpdate,
    hideZipUpdate: zipUpdate.hideZipUpdate,
    connectZipUpdateWebSocket: zipUpdate.connectZipUpdateWebSocket,
  });

  const newFile = useNewFile({
    renamingItem: rename.renamingItem,
    creatingFolder: newFolder.creatingFolder,
    panels,
    handleNavigate: panelOps.handleNavigate,
    setSelections,
    setFocusedItem,
    setSelectionAnchor,
    setError,
    startZipUpdate: zipUpdate.startZipUpdate,
    hideZipUpdate: zipUpdate.hideZipUpdate,
    connectZipUpdateWebSocket: zipUpdate.connectZipUpdateWebSocket,
  });

  const activeSelection = selections[activePanel];

  const getSelectedSources = useCallback(() => {
    const sourcePanelId = activePanel;
    const sourcePanel = panels[sourcePanelId];
    if (!sourcePanel) return [];

    const sourcePath = sourcePanel.path;
    return sortedAndFilteredItems[sourcePanelId]
      .filter((item) => selections[sourcePanelId].has(item.name))
      .map((item) => buildFullPath(sourcePath, item.name));
  }, [activePanel, panels, sortedAndFilteredItems, selections]);

  const copy = useCopy({
    activePanel,
    panels,
    activeSelection,
    filteredItems: sortedAndFilteredItems[activePanel],
    handleNavigate: panelOps.handleNavigate,
    setError,
    panelRefs,
    handleCancelRename: rename.handleCancelRename,
    handleCancelNewFolder: newFolder.handleCancelNewFolder,
    wsRef,
    overwritePrompt,
    setOverwritePrompt,
    setSelections,
  });
  const del = useDelete({
    activePanel,
    panels,
    focusedItem,
    activeSelection,
    filteredItems: sortedAndFilteredItems[activePanel],
    handleNavigate: panelOps.handleNavigate,
    setError,
    panelRefs,
    startZipUpdate: zipUpdate.startZipUpdate,
    hideZipUpdate: zipUpdate.hideZipUpdate,
    connectZipUpdateWebSocket: zipUpdate.connectZipUpdateWebSocket,
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
    filter,
    filteredItems: sortedAndFilteredItems,
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
    filter,
    filteredItems: sortedAndFilteredItems,
  });

  const archiveTest = useArchiveIntegrityTest({
    activePanel,
    panels,
    selections,
    setError,
    wsRef,
    filter,
    filteredItems: sortedAndFilteredItems,
  });

  const { handleSwapPanels } = useSwapPanels({
    panels,
    handleNavigate: panelOps.handleNavigate,
  });

  const copyPaths = useCopyPaths({
    setError,
    activePanel,
    panels,
    selections,
    setCopyPathsModal: modals.setCopyPathsModal,
    wsRef,
    filter,
    filteredItems: sortedAndFilteredItems,
  });

  const handleCopyTo = useCallback(() => {
    const otherPanelId = activePanel === "left" ? "right" : "left";
    modals.setDestinationBrowserModal({
      isVisible: true,
      initialPath: panels[otherPanelId].path,
      action: "Copy to...",
    });
  }, [activePanel, panels, modals.setDestinationBrowserModal]);

  const handleMoveTo = useCallback(() => {
    const otherPanelId = activePanel === "left" ? "right" : "left";
    modals.setDestinationBrowserModal({
      isVisible: true,
      initialPath: panels[otherPanelId].path,
      action: "Move to...",
    });
  }, [activePanel, panels, modals.setDestinationBrowserModal]);

  const handleCopyToClipboard = useCallback(() => {
    const sources = getSelectedSources();
    if (sources.length > 0) {
      setClipboard({ sources, isMove: false });
    }
  }, [getSelectedSources]);

  const handleCutToClipboard = useCallback(() => {
    const sources = getSelectedSources();
    if (sources.length > 0) {
      setClipboard({ sources, isMove: true });
    }
  }, [getSelectedSources]);

  const handlePasteFromClipboard = useCallback(() => {
    if (clipboard.sources.length > 0) {
      const destinationPath = panels[activePanel].path;
      copy.performCopy(clipboard.sources, destinationPath, clipboard.isMove);
      setClipboard({ sources: [], isMove: false });
    }
  }, [clipboard, panels, activePanel, copy.performCopy]);

  const handleSelectAll = useCallback(
    (panelId) => {
      const items = filter[panelId].pattern
        ? sortedAndFilteredItems[panelId]
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
    [panels, filter, sortedAndFilteredItems, setSelections]
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
        ? sortedAndFilteredItems[panelId]
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
    [panels, filter, sortedAndFilteredItems, selections, setSelections]
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
        ? sortedAndFilteredItems[activePanel]
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
      sortedAndFilteredItems,
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

        const initialRecents = [];
        if (leftData.path) {
          initialRecents.push(leftData.path);
        }
        if (rightData.path && rightData.path !== leftData.path) {
          initialRecents.push(rightData.path);
        }
        setRecentPaths(initialRecents);
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
      {
        label: "Terminal",
        f_key: "F9",
        action: handleTerminal,
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
      handleTerminal,
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
  const handleDuplicate = useCallback(() => {
    copy.handleDuplicate();
  }, [copy]);

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
    destinationBrowserModal: modals.destinationBrowserModal,
    setDestinationBrowserModal: modals.setDestinationBrowserModal,
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
    handleCopyToClipboard,
    handleCutToClipboard,
    handlePasteFromClipboard,
    sortedAndFilteredItems,
    handleTerminal,
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
      // Watch any paths that were requested before the connection was open
      pathsToWatch.current.forEach((path) => {
        wsFileWatcher.current.send(
          JSON.stringify({ type: "watch_path", path })
        );
      });
      pathsToWatch.current.clear();
    };

    wsFileWatcher.current.onmessage = (event) => {
      if (!isMounted) return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === "path_changed") {
          const { path } = message;
          Object.entries(panelsRef.current).forEach(([panelId, panel]) => {
            const zipPathMatch = matchZipPath(panel.path);
            const panelZipPath = zipPathMatch ? zipPathMatch[1] : panel.path;

            if (panelZipPath === path) {
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
      if (
        wsFileWatcher.current &&
        wsFileWatcher.current.readyState === WebSocket.OPEN
      ) {
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
    sortConfig,
    recentPaths,
    clipboard,
    allowContextMenu,
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
    setAllowContextMenu,
    // State & Handlers from Hooks
    ...settings,
    ...modals,
    ...rename,
    ...newFolder,
    ...newFile,
    ...copy,
    ...del,
    ...sizeCalculationHandlers,
    ...panelOpsHandlers,
    ...compress,
    ...decompress,
    ...archiveTest,
    ...copyPaths,
    ...zipUpdate,

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
    filteredItems: sortedAndFilteredItems,
    handleSwapPanels,
    handleContextOpen,
    handleContextOpenWith,
    handleOverwriteDecision,
    handleViewItem,
    handleCopyTo,
    handleMoveTo,
    handleSort,
    handleCopyToClipboard,
    handleCutToClipboard,
    handlePasteFromClipboard,
    handleDuplicate,
    handleTerminal,
    handleTerminalOtherPanel,
    // UI Composition
    actionBarButtons,
  };
}
