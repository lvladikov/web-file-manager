import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  savePaths,
  fetchDirectory,
  post,
  exitApp,
  fetchFileInfo,
} from "../lib/api";
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

// Development helper: monkey-patch WebSocket.prototype.close to trace who called it and include code/reason in logs.
// Guarded so it runs only once and only in dev contexts.
try {
  if (typeof WebSocket !== "undefined" && !WebSocket.prototype.__closePatched) {
    const originalClose = WebSocket.prototype.close;
    WebSocket.prototype.close = function patchedClose(code, reason) {
      try {
        const id = this && this.jobId ? this.jobId : undefined;
        const wsUrl = this && this.url ? this.url : undefined;
        const prefix = id
          ? `[client] WebSocket.prototype.close called for job=${id}`
          : `[client] WebSocket.prototype.close called`;
        // Use console.trace for stack and include the code/reason/url
        // Uncomment the next line to enable tracing
        // console.trace(
        //   `${prefix} with code=${code} reason='${reason}' url='${
        //     wsUrl || "n/a"
        //   }'`
        // );
      } catch (e) {
        // ignore any error while tracing
      }
      return originalClose.apply(this, arguments);
    };
    WebSocket.prototype.__closePatched = true;
  }
} catch (e) {
  // In case globals are not writable or in strict env, fall back silently
}

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

  // Ensure we hide the zip update modal if the overwrite prompt is shown
  useEffect(() => {
    if (overwritePrompt && overwritePrompt.isVisible) {
      try {
        zipUpdate.hideZipUpdate();
      } catch (err) {
        // ignore if zipUpdate not yet defined or other glitch
      }
    }
  }, [overwritePrompt]);
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
  const pendingOverwriteActionRef = useRef(null);

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

      // Handle special filter keywords
      if (currentFilter.pattern === "_FILES_ONLY_") {
        return items.filter(
          (item) =>
            item.name === ".." ||
            (item.type !== "folder" && item.type !== "parent")
        );
      }
      if (currentFilter.pattern === "_FOLDERS_ONLY_") {
        return items.filter(
          (item) => item.name === ".." || item.type === "folder"
        );
      }
      if (currentFilter.pattern === "_ZIP_FILES_ONLY_") {
        return items.filter(
          (item) => item.name === ".." || item.type === "archive"
        );
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

  const handleTerminal = useCallback(
    async (startingPath = null, initialCommand = null, options = {}) => {
      const { triggeredFromConsole = false } = options || {};
      try {
        let terminalPath = panels[activePanel].path;
        // If the caller supplied a startingPath, prefer it if valid
        if (typeof startingPath === "string" && startingPath.trim() !== "") {
          // Resolve relative paths to the panel path
          const looksAbsolute =
            startingPath.startsWith("/") || /^[a-zA-Z]:\\/.test(startingPath);
          const resolved = looksAbsolute
            ? startingPath
            : buildFullPath(panels[activePanel].path, startingPath);
          const zipMatch = matchZipPath(resolved);
          if (zipMatch) {
            terminalPath = dirname(zipMatch[1]);
          } else {
            try {
              const info = await fetchFileInfo(resolved);
              if (info && info.isDirectory) terminalPath = resolved;
              else terminalPath = dirname(resolved);
            } catch (e) {
              // fallback to the panel path
              terminalPath = panels[activePanel].path;
            }
          }
        } else {
          const zipMatch = matchZipPath(terminalPath);
          if (zipMatch) {
            const zipFilePath = zipMatch[1]; // The full path to the .zip file
            terminalPath = dirname(zipFilePath); // The directory containing the .zip file
          }
        }
        const zipMatch = matchZipPath(terminalPath);

        if (zipMatch) {
          // If inside a zip, open terminal in the parent directory of the zip file
          const zipFilePath = zipMatch[1]; // The full path to the .zip file
          terminalPath = dirname(zipFilePath); // The directory containing the .zip file
        }

        // Calculate terminal dimensions based on modal size and character dimensions
        // Modal will be 80vw x 80vh, estimate character size for xterm
        const charWidth = 8; // pixels per character (approximate for xterm font)
        const charHeight = 16; // pixels per character line (approximate for xterm font)

        // Get viewport dimensions
        const viewportWidth = window.innerWidth * 0.8 * 0.9; // 80vw * 90% (accounting for padding)
        const viewportHeight = window.innerHeight * 0.8 * 0.85; // 80vh * 85% (accounting for header and padding)

        const cols = Math.floor(viewportWidth / charWidth);
        const rows = Math.floor(viewportHeight / charHeight);

        const response = await post("/api/terminals", {
          path: terminalPath,
          cols,
          rows,
        });
        const { jobId } = await response.json();
        modals.setTerminalModal({
          isVisible: true,
          jobId,
          initialCommand: initialCommand || null,
          triggeredFromConsole,
        });
        return { success: true, jobId };
      } catch (error) {
        setError(error.message);
        return { success: false, error: error.message };
      }
    },
    [activePanel, panels, modals.setTerminalModal, setError]
  );

  const handleTerminalOtherPanel = useCallback(
    async (startingPath = null, initialCommand = null, options = {}) => {
      const { triggeredFromConsole = false } = options || {};
      try {
        let terminalPath = panels[otherPanelId].path;
        // If the caller supplied a startingPath, prefer it if valid
        if (typeof startingPath === "string" && startingPath.trim() !== "") {
          const looksAbsolute =
            startingPath.startsWith("/") || /^[a-zA-Z]:\\/.test(startingPath);
          const resolved = looksAbsolute
            ? startingPath
            : buildFullPath(panels[otherPanelId].path, startingPath);
          const zipMatch = matchZipPath(resolved);
          if (zipMatch) {
            terminalPath = dirname(zipMatch[1]);
          } else {
            try {
              const info = await fetchFileInfo(resolved);
              if (info && info.isDirectory) terminalPath = resolved;
              else terminalPath = dirname(resolved);
            } catch (e) {
              // fallback to the panel path
              terminalPath = panels[otherPanelId].path;
            }
          }
        } else {
          const zipMatch = matchZipPath(terminalPath);
          if (zipMatch) {
            const zipFilePath = zipMatch[1];
            terminalPath = dirname(zipFilePath);
          }
        }
        const zipMatch = matchZipPath(terminalPath);

        if (zipMatch) {
          // If inside a zip, open terminal in the parent directory of the zip file
          const zipFilePath = zipMatch[1]; // The full path to the .zip file
          terminalPath = dirname(zipFilePath);
        }

        // Calculate terminal dimensions based on modal size and character dimensions
        const charWidth = 8; // pixels per character (approximate for xterm font)
        const charHeight = 16; // pixels per character line (approximate for xterm font)

        const viewportWidth = window.innerWidth * 0.8 * 0.9;
        const viewportHeight = window.innerHeight * 0.8 * 0.85;

        const cols = Math.floor(viewportWidth / charWidth);
        const rows = Math.floor(viewportHeight / charHeight);

        const response = await post("/api/terminals", {
          path: terminalPath,
          cols,
          rows,
        });
        const { jobId } = await response.json();
        modals.setTerminalModal({
          isVisible: true,
          jobId,
          initialCommand: initialCommand || null,
          triggeredFromConsole,
        });
        return { success: true, jobId };
      } catch (error) {
        setError(error.message);
        return { success: false, error: error.message };
      }
    },
    [otherPanelId, panels, modals.setTerminalModal, setError]
  );

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
    setOverwritePrompt,
    setPendingOverwriteAction,
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
    setZipUpdateProgressModal: zipUpdate.setZipUpdateProgressModal,
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
    setZipUpdateProgressModal: zipUpdate.setZipUpdateProgressModal,
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
    setZipUpdateProgressModal: zipUpdate.setZipUpdateProgressModal,
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

      // Handle special keywords for type-based selection
      if (pattern === "_FILES_ONLY_") {
        items.forEach((item) => {
          if (item.name === "..") return;
          if (item.type !== "folder" && item.type !== "parent") {
            if (modals.quickSelectModal.mode === "select") {
              currentSelection.add(item.name);
            } else {
              currentSelection.delete(item.name);
            }
          }
        });
      } else if (pattern === "_FOLDERS_ONLY_") {
        items.forEach((item) => {
          if (item.name === "..") return;
          if (item.type === "folder") {
            if (modals.quickSelectModal.mode === "select") {
              currentSelection.add(item.name);
            } else {
              currentSelection.delete(item.name);
            }
          }
        });
      } else if (pattern === "_ZIP_FILES_ONLY_") {
        items.forEach((item) => {
          if (item.name === "..") return;
          if (item.type === "archive") {
            if (modals.quickSelectModal.mode === "select") {
              currentSelection.add(item.name);
            } else {
              currentSelection.delete(item.name);
            }
          }
        });
      } else {
        // Regular pattern matching
        const flags = caseSensitive ? "" : "i";
        const regex = useRegex
          ? new RegExp(pattern, flags)
          : new RegExp(
              pattern.replace(/\./g, "\\.").replace(/\*/g, ".*"),
              flags
            );

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
      }

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

  // Type-based selection handlers
  const handleSelectFiles = useCallback(
    (panelId) => {
      const items = filter[panelId].pattern
        ? sortedAndFilteredItems[panelId]
        : panels[panelId]?.items;
      if (!items) return;
      const fileItems = items
        .filter(
          (item) =>
            item.name !== ".." &&
            item.type !== "folder" &&
            item.type !== "parent"
        )
        .map((item) => item.name);
      setSelections((prev) => ({
        ...prev,
        [panelId]: new Set(fileItems),
      }));
    },
    [panels, filter, sortedAndFilteredItems, setSelections]
  );

  const handleSelectFolders = useCallback(
    (panelId) => {
      const items = filter[panelId].pattern
        ? sortedAndFilteredItems[panelId]
        : panels[panelId]?.items;
      if (!items) return;
      const folderItems = items
        .filter((item) => item.name !== ".." && item.type === "folder")
        .map((item) => item.name);
      setSelections((prev) => ({
        ...prev,
        [panelId]: new Set(folderItems),
      }));
    },
    [panels, filter, sortedAndFilteredItems, setSelections]
  );

  const handleSelectZipFiles = useCallback(
    (panelId) => {
      const items = filter[panelId].pattern
        ? sortedAndFilteredItems[panelId]
        : panels[panelId]?.items;
      if (!items) return;
      const zipItems = items
        .filter((item) => item.name !== ".." && item.type === "archive")
        .map((item) => item.name);
      setSelections((prev) => ({
        ...prev,
        [panelId]: new Set(zipItems),
      }));
    },
    [panels, filter, sortedAndFilteredItems, setSelections]
  );

  const handleUnselectFiles = useCallback(
    (panelId) => {
      const items = filter[panelId].pattern
        ? sortedAndFilteredItems[panelId]
        : panels[panelId]?.items;
      if (!items) return;
      const currentSelection = selections[panelId] || new Set();
      const fileNames = items
        .filter((item) => item.type !== "folder" && item.type !== "parent")
        .map((item) => item.name);
      const newSelection = new Set(
        [...currentSelection].filter((name) => !fileNames.includes(name))
      );
      setSelections((prev) => ({
        ...prev,
        [panelId]: newSelection,
      }));
    },
    [panels, filter, sortedAndFilteredItems, selections, setSelections]
  );

  const handleUnselectFolders = useCallback(
    (panelId) => {
      const items = filter[panelId].pattern
        ? sortedAndFilteredItems[panelId]
        : panels[panelId]?.items;
      if (!items) return;
      const currentSelection = selections[panelId] || new Set();
      const folderNames = items
        .filter((item) => item.type === "folder")
        .map((item) => item.name);
      const newSelection = new Set(
        [...currentSelection].filter((name) => !folderNames.includes(name))
      );
      setSelections((prev) => ({
        ...prev,
        [panelId]: newSelection,
      }));
    },
    [panels, filter, sortedAndFilteredItems, selections, setSelections]
  );

  const handleUnselectZipFiles = useCallback(
    (panelId) => {
      const items = filter[panelId].pattern
        ? sortedAndFilteredItems[panelId]
        : panels[panelId]?.items;
      if (!items) return;
      const currentSelection = selections[panelId] || new Set();
      const zipNames = items
        .filter((item) => item.type === "archive")
        .map((item) => item.name);
      const newSelection = new Set(
        [...currentSelection].filter((name) => !zipNames.includes(name))
      );
      setSelections((prev) => ({
        ...prev,
        [panelId]: newSelection,
      }));
    },
    [panels, filter, sortedAndFilteredItems, selections, setSelections]
  );

  // Type-based filter handlers
  const handleQuickFilterFiles = (panelId) => {
    setFilterPanelId(panelId);
    setFilter((prev) => ({
      ...prev,
      [panelId]: {
        pattern: "_FILES_ONLY_",
        useRegex: false,
        caseSensitive: false,
      },
    }));
  };

  const handleQuickFilterFolders = (panelId) => {
    setFilterPanelId(panelId);
    setFilter((prev) => ({
      ...prev,
      [panelId]: {
        pattern: "_FOLDERS_ONLY_",
        useRegex: false,
        caseSensitive: false,
      },
    }));
  };

  const handleQuickFilterZipFiles = (panelId) => {
    setFilterPanelId(panelId);
    setFilter((prev) => ({
      ...prev,
      [panelId]: {
        pattern: "_ZIP_FILES_ONLY_",
        useRegex: false,
        caseSensitive: false,
      },
    }));
  };

  const handleResetQuickFilter = (panelId) => {
    if (filterPanelId === panelId) {
      setFilterPanelId(null);
    }
    setFilter((prev) => ({
      ...prev,
      [panelId]: { pattern: "", useRegex: false, caseSensitive: false },
    }));
  };

  // Wrapper for quick select that works independently of modal state
  const handleQuickSelect = useCallback(
    (panelId, pattern, useRegex, caseSensitive, resetSelection) => {
      const items = filter[panelId].pattern
        ? sortedAndFilteredItems[panelId]
        : panels[panelId]?.items;
      if (!items) return 0;

      const currentSelection = resetSelection
        ? new Set()
        : new Set(selections[panelId]);

      // Handle special keywords
      if (pattern === "_FILES_ONLY_") {
        items.forEach((item) => {
          if (
            item.name === ".." ||
            item.type === "folder" ||
            item.type === "parent"
          )
            return;
          currentSelection.add(item.name);
        });
      } else if (pattern === "_FOLDERS_ONLY_") {
        items.forEach((item) => {
          if (item.name === ".." || item.type !== "folder") return;
          currentSelection.add(item.name);
        });
      } else if (pattern === "_ZIP_FILES_ONLY_") {
        items.forEach((item) => {
          if (item.name === ".." || item.type !== "archive") return;
          currentSelection.add(item.name);
        });
      } else {
        const flags = caseSensitive ? "" : "i";
        const regex = useRegex
          ? new RegExp(pattern, flags)
          : new RegExp(
              pattern.replace(/\./g, "\\.").replace(/\*/g, ".*"),
              flags
            );
        items.forEach((item) => {
          if (item.name === "..") return;
          if (regex.test(item.name)) {
            currentSelection.add(item.name);
          }
        });
      }

      setSelections((prev) => ({ ...prev, [panelId]: currentSelection }));
      return currentSelection.size;
    },
    [panels, filter, sortedAndFilteredItems, selections, setSelections]
  );

  // Wrapper for quick unselect that works independently of modal state
  const handleQuickUnselect = useCallback(
    (panelId, pattern, useRegex, caseSensitive, resetSelection) => {
      const items = filter[panelId].pattern
        ? sortedAndFilteredItems[panelId]
        : panels[panelId]?.items;
      if (!items) return 0;

      const currentSelection = resetSelection
        ? new Set()
        : new Set(selections[panelId]);

      // Handle special keywords
      if (pattern === "_FILES_ONLY_") {
        items.forEach((item) => {
          if (
            item.name === ".." ||
            item.type === "folder" ||
            item.type === "parent"
          )
            return;
          currentSelection.delete(item.name);
        });
      } else if (pattern === "_FOLDERS_ONLY_") {
        items.forEach((item) => {
          if (item.name === ".." || item.type !== "folder") return;
          currentSelection.delete(item.name);
        });
      } else if (pattern === "_ZIP_FILES_ONLY_") {
        items.forEach((item) => {
          if (item.name === ".." || item.type !== "archive") return;
          currentSelection.delete(item.name);
        });
      } else {
        const flags = caseSensitive ? "" : "i";
        const regex = useRegex
          ? new RegExp(pattern, flags)
          : new RegExp(
              pattern.replace(/\./g, "\\.").replace(/\*/g, ".*"),
              flags
            );
        items.forEach((item) => {
          if (item.name === "..") return;
          if (regex.test(item.name)) {
            currentSelection.delete(item.name);
          }
        });
      }

      setSelections((prev) => ({ ...prev, [panelId]: currentSelection }));
      return currentSelection.size;
    },
    [panels, filter, sortedAndFilteredItems, selections, setSelections]
  );

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
      context: null,
      title: "",
      overlayClassName: "",
      modalClassName: "",
    });
  };

  const handleFolderBrowserConfirm = (selectedPath) => {
    const { targetPanelId, context } = modals.folderBrowserModal;
    if (context === "search") {
      modals.setSearchModal((prev) => ({
        ...prev,
        basePath: selectedPath,
      }));
    }
    if (targetPanelId) {
      panelOps.handleNavigate(targetPanelId, selectedPath, "");
    }
    modals.setFolderBrowserModal({
      isVisible: false,
      targetPanelId: null,
      initialPath: "",
      context: null,
      title: "",
      overlayClassName: "",
      modalClassName: "",
    });
  };

  const handleChangeSearchBasePath = (path) => {
    if (!path) return;
    modals.setSearchModal((prev) => ({
      ...prev,
      basePath: path,
    }));
  };

  const openFolderBrowserForSearch = (panelId) => {
    const searchBasePath =
      modals.searchModal.basePath ||
      panels[panelId]?.path ||
      panels[activePanel].path ||
      "";
    modals.setFolderBrowserModal({
      isVisible: true,
      targetPanelId: null,
      initialPath: searchBasePath,
      context: "search",
      title: "Select a folder for searching...",
      overlayClassName:
        "fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60]",
      modalClassName: "",
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
      {
        label: "Exit",
        f_key: "F10",
        action: async () => {
          try {
            await exitApp();
          } catch (e) {
            console.error("[F10] Failed to exit:", e);
          }
        },
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

  function setPendingOverwriteAction(action) {
    pendingOverwriteActionRef.current = action;
  }

  const handleOverwriteDecision = (decision) => {
    // If there's a pending action (e.g. rename), call it instead of sending WS message.
    if (pendingOverwriteActionRef.current) {
      try {
        pendingOverwriteActionRef.current(decision);
      } catch (err) {
        console.error("Error executing pending overwrite action:", err);
      }
      pendingOverwriteActionRef.current = null;
      setOverwritePrompt({ isVisible: false, item: null });
      return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const payload = { type: "overwrite_response", decision };
      // Include promptId if available in overwritePrompt state
      if (
        overwritePrompt &&
        overwritePrompt.item &&
        overwritePrompt.item.promptId
      ) {
        payload.promptId = overwritePrompt.item.promptId;
      }
      // Include jobId of the socket if it exists, so server can accurately identify job when resolving
      if (wsRef.current && wsRef.current.jobId)
        payload.jobId = wsRef.current.jobId;
      wsRef.current.send(JSON.stringify(payload));
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
    searchModal: modals.searchModal,
    setSearchModal: modals.setSearchModal,
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
    handleSelectFiles,
    handleSelectFolders,
    handleSelectZipFiles,
    handleUnselectFiles,
    handleUnselectFolders,
    handleUnselectZipFiles,
    handleQuickSelect,
    handleQuickUnselect,
    handleQuickFilterFiles,
    handleQuickFilterFolders,
    handleQuickFilterZipFiles,
    handleResetQuickFilter,
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
    handleChangeSearchBasePath,
    openFolderBrowserForSearch,
    handlePathInputSubmit,
    handleSelectAll,
    handleUnselectAll,
    handleInvertSelection,
    handleStartQuickSelect,
    handleStartQuickUnselect,
    handleQuickSelectConfirm,
    handleSelectFiles,
    handleSelectFolders,
    handleSelectZipFiles,
    handleUnselectFiles,
    handleUnselectFolders,
    handleUnselectZipFiles,
    filter,
    setFilter,
    isFiltering,
    filterPanelId,
    handleStartFilter,
    handleCloseFilter,
    handleFilterChange,
    handleQuickSelect,
    handleQuickUnselect,
    handleQuickFilterFiles,
    handleQuickFilterFolders,
    handleQuickFilterZipFiles,
    handleResetQuickFilter,
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
