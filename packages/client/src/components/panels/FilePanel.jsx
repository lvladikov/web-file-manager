import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  HardDrive,
  LoaderCircle,
  Star,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

import { formatBytes, isModKey } from "../../lib/utils";
import { fetchDiskSpace } from "../../lib/api";

import Breadcrumbs from "../ui/Breadcrumbs";
import FavouritesDropdown from "../ui/FavouritesDropdown";
import Resizer from "../ui/Resizer";
import NewFolderItem from "../panels/NewFolderItem";
import NewFileItem from "../panels/NewFileItem";
import FileItem from "../panels/FileItem";
import FilterInput from "../ui/FilterInput";
import EmptyAreaContextMenu from "../context-menus/EmptyAreaContextMenu";
import PathContextMenu from "../context-menus/PathContextMenu";

const FilePanel = React.forwardRef(
  (
    {
      panelData,
      activePanel,
      panelId,
      renamingItem,
      isCreating,
      newFolderValue,
      isCreatingFile,
      newFileValue,
      setActivePanel,
      onNavigate,
      onNavigateToPath,
      onOpenFile,
      onStartRename,
      onRenameChange,
      onRenameSubmit,
      onRenameCancel,
      onNewFolderChange,
      onNewFolderSubmit,
      onNewFolderCancel,
      onNewFileChange,
      onNewFileSubmit,
      onNewFileCancel,
      loading,
      selectedItems,
      setSelectedItems,
      focusedItem,
      setFocusedItem,
      selectionAnchor,
      setSelectionAnchor,
      isEditingPath,
      pathInputValue,
      onPathDoubleClick,
      onPathInputChange,
      onPathInputSubmit,
      onPathInputCancel,
      isFavourite,
      onToggleFavourite,
      favourites,
      recentPaths,
      columnWidths,
      setColumnWidths,
      filter,
      isFiltering,
      filterPanelId,
      onFilterChange,
      onCloseFilter,
      filteredItems,
      onNewFolder,
      onNewFile,
      copyAbsolutePaths,
      copyRelativePaths,
      onRefreshPanel,
      onRefreshBothPanels,
      onRefreshOtherPanel,
      onSelectAll,
      onUnselectAll,
      onInvertSelection,
      onQuickSelect,
      onQuickUnselect,
      onQuickFilter,
      onSwapPanels,
      onTerminal,
      onTerminalOtherPanel,
      onSearchActivePanel,
      onSearchOtherPanel,
      onPreview,
      onOpen,
      onOpenWith,
      onView,
      onEdit,
      onCopyToOtherPanel,
      onMoveToOtherPanel,
      onCopyTo,
      onMoveTo,
      onRename,
      onDelete,
      onDuplicate,
      onSetOtherPanelPath,
      onCalculateSize,
      onCompressInActivePanel,
      onCompressToOtherPanel,
      onDecompressInActivePanel,
      onDecompressToOtherPanel,
      onTestArchive,
      appState,
      onChooseFolder,
      boundaryRef,
      sortConfig,
      onSort,
      clipboard,
      onCopyToClipboard,
      onCutToClipboard,
      onPasteFromClipboard,
    },
    ref
  ) => {
    const clickTimerRef = useRef(null);
    const scrollContainerRef = useRef(null);
    const [isFavouritesDropdownOpen, setIsFavouritesDropdownOpen] =
      useState(false);
    const [diskSpace, setDiskSpace] = useState(null);

    useEffect(() => {
      setSelectedItems(new Set());
      setFocusedItem(null);
      setSelectionAnchor(null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [panelData.path]);

    const [selectedFileCount, setSelectedFileCount] = useState(0);
    const [selectedFolderCount, setSelectedFolderCount] = useState(0);
    const [selectedItemsTotalSize, setSelectedItemsTotalSize] = useState(0);

    useEffect(() => {
      let files = 0;
      let folders = 0;
      let totalSize = 0;

      const itemsToConsider = filter.pattern ? filteredItems : panelData.items;

      const selectedFullItems = itemsToConsider.filter((item) =>
        selectedItems.has(item.name)
      );

      selectedFullItems.forEach((item) => {
        if (item.type === "folder") {
          folders++;
          // Folder sizes are calculated on demand, so we don't add item.size here
          // unless it's already available (e.g., from a previous size calculation)
          if (item.size !== null) {
            totalSize += item.size;
          }
        } else {
          // All other file types (file, archive, image, video, audio, pdf)
          files++;
          if (item.size !== null) {
            totalSize += item.size;
          }
        }
      });
      setSelectedFileCount(files);
      setSelectedFolderCount(folders);
      setSelectedItemsTotalSize(totalSize);
    }, [selectedItems, panelData.items, filter.pattern, filteredItems]);

    useEffect(() => {
      const getDiskSpace = async () => {
        try {
          const data = await fetchDiskSpace(panelData.path);
          setDiskSpace(data);
        } catch (error) {
          console.error("Error fetching disk space:", error);
          setDiskSpace(null);
        }
      };
      getDiskSpace();
    }, [panelData.path]);

    useEffect(() => {
      if (focusedItem && scrollContainerRef.current) {
        const element = scrollContainerRef.current.querySelector(
          `[data-name="${CSS.escape(focusedItem)}"]`
        );
        if (element) {
          element.scrollIntoView({
            block: "nearest",
            inline: "nearest",
          });
        }
      }
    }, [focusedItem]);

    const [resizing, setResizing] = useState({
      active: false,
      column: null,
      initialX: 0,
      initialWidth: 0,
    });

    const gridStyle = {
      display: "grid",
      gridTemplateColumns: `28px 1fr 6px ${columnWidths.size}px 6px ${columnWidths.modified}px`,
    };

    const handleResizeMove = useCallback(
      (e) => {
        e.preventDefault();
        if (!resizing.active) return;

        const deltaX = e.clientX - resizing.initialX;
        let newWidth = resizing.initialWidth;

        // Invert deltaX for the size and modified columns, as the handle is on their left edge.
        if (resizing.column === "size" || resizing.column === "modified") {
          newWidth += deltaX * -1; // Reverse the direction of change
        } else {
          newWidth += deltaX;
        }

        const minWidth = 60;

        if (newWidth < minWidth) {
          newWidth = minWidth;
        }

        setColumnWidths((prev) => ({
          ...prev,
          [panelId]: {
            ...prev[panelId],
            [resizing.column]: newWidth,
          },
        }));
      },
      [resizing, panelId, setColumnWidths]
    );

    const handleResizeStop = useCallback(() => {
      document.body.style.cursor = "default";
      document.body.style.userSelect = "auto";
      window.removeEventListener("mousemove", handleResizeMove);
      window.removeEventListener("mouseup", handleResizeStop);
      setResizing({
        active: false,
        column: null,
        initialX: 0,
        initialWidth: 0,
      });
    }, [handleResizeMove]);

    const handleResizeStart = (e, column) => {
      e.preventDefault();
      // Store the initial width of the column being dragged
      const initialWidth = columnWidths[column];
      setResizing({
        active: true,
        column: column,
        initialX: e.clientX,
        initialWidth: initialWidth,
      });
    };

    useEffect(() => {
      if (resizing.active) {
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        window.addEventListener("mousemove", handleResizeMove);
        window.addEventListener("mouseup", handleResizeStop);
      }
      return () => {
        window.removeEventListener("mousemove", handleResizeMove);
        window.removeEventListener("mouseup", handleResizeStop);
      };
    }, [resizing.active, handleResizeMove, handleResizeStop]);

    const getColumnFitWidth = (columnName) => {
      const tempSpan = document.createElement("span");
      tempSpan.className =
        "absolute invisible whitespace-nowrap font-mono text-sm";
      document.body.appendChild(tempSpan);

      let maxWidth = 0;
      const PADDING = 16; // Corresponds to pr-4

      // Measure header
      tempSpan.style.fontWeight = "bold";
      const headerText =
        columnName.charAt(0).toUpperCase() + columnName.slice(1);
      tempSpan.innerText = headerText;
      maxWidth = tempSpan.offsetWidth;

      // Measure content
      tempSpan.style.fontWeight = "normal";
      panelData.items.forEach((item) => {
        let text = "";
        if (columnName === "size") text = formatBytes(item.size);
        else if (columnName === "modified") text = item.modified;

        if (text) {
          tempSpan.innerText = text;
          maxWidth = Math.max(maxWidth, tempSpan.offsetWidth);
        }
      });

      document.body.removeChild(tempSpan);
      return maxWidth + PADDING;
    };

    const handleAutoSize = (columnName) => {
      const newWidth = getColumnFitWidth(columnName);
      setColumnWidths((prev) => ({
        ...prev,
        [panelId]: {
          ...prev[panelId],
          [columnName]: newWidth,
        },
      }));
    };

    const handlePanelClick = () => {
      if (activePanel !== panelId) {
        setActivePanel(panelId);
      }
      ref.current?.focus();
    };

    // Handle header click for sorting
    const handleHeaderClick = (key) => {
      onSort(panelId, key);
    };

    // Helper component for sort indicator
    const SortIndicator = ({ columnKey }) => {
      if (sortConfig.key !== columnKey) return null;
      return sortConfig.direction === "asc" ? (
        <ChevronUp className="w-4 h-4 ml-1 text-sky-400" />
      ) : (
        <ChevronDown className="w-4 h-4 ml-1 text-sky-400" />
      );
    };

    // Helper component for clickable header
    const SortableHeader = ({
      children,
      columnKey,
      className = "",
      style = {},
    }) => {
      const keyName = children;
      const nextDirection =
        sortConfig.key === columnKey && sortConfig.direction === "asc"
          ? "Descending"
          : "Ascending";
      const titleText = `Click here to sort by ${keyName} in ${nextDirection} order.`;

      return (
        <span
          onClick={() => handleHeaderClick(columnKey)}
          className={`flex items-center cursor-pointer hover:text-white transition-colors duration-150 ${
            sortConfig.key === columnKey ? "text-sky-400" : "text-gray-400"
          } ${className}`}
          style={style}
          title={titleText}
        >
          {children}
          <SortIndicator columnKey={columnKey} />
        </span>
      );
    };

    const handleDoubleClick = (item) => {
      // A double-click is definitive. Cancel any pending rename timer.
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }

      // Immediately perform the double-click action.
      if (
        item.type === "folder" ||
        item.type === "parent" ||
        item.type === "archive"
      ) {
        onNavigate(item.type === "archive" ? `${item.name}/` : item.name);
      } else {
        onOpenFile(panelData.path, item.name);
      }
    };

    const handleItemClick = (itemName, e) => {
      // Always clear any pending rename timer on any click.
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }

      handlePanelClick(); // Activate the panel instantly.

      // If the "go up" item is clicked, clear selection and prevent further selection logic.
      if (itemName === "..") {
        setSelectedItems(new Set());
        setFocusedItem(null);
        setSelectionAnchor(null);
        return; // Exit early
      }

      // Check if this is a potential rename trigger (a non-modifier click on an already-focused item).
      const isRenameTrigger =
        itemName === focusedItem && !e.shiftKey && !isModKey(e);

      if (isRenameTrigger) {
        // If it's a rename trigger, we only set a timer. Selection is already correct.
        // If a double-click happens, the handler above will cancel this timer.
        clickTimerRef.current = setTimeout(() => {
          onStartRename(panelId, itemName);
        }, 300);
      } else {
        setFocusedItem(itemName);
        const { items } = panelData;
        if (isModKey(e)) {
          const newSelection = new Set(selectedItems);
          if (newSelection.has(itemName)) newSelection.delete(itemName);
          else newSelection.add(itemName);
          setSelectedItems(newSelection);
          setSelectionAnchor(itemName);
        } else if (e.shiftKey && selectionAnchor) {
          // IMPORTANT: When calculating a range selection, we must use the **currently sorted** list (`filteredItems`).
          const sortedItems = filteredItems.filter((i) => i.name !== "..");

          // Find indices in the sorted list, then find the corresponding item names from the original list
          const anchorIndex = sortedItems.findIndex(
            (i) => i.name === selectionAnchor
          );
          const clickedIndex = sortedItems.findIndex(
            (i) => i.name === itemName
          );

          const start = Math.min(anchorIndex, clickedIndex);
          const end = Math.max(anchorIndex, clickedIndex);
          if (start === -1 || end === -1) {
            // Fallback: simple shift click if one item is outside the current filtered view
            setSelectedItems(new Set([itemName]));
            setSelectionAnchor(itemName);
            return;
          }

          const newSelection = new Set(
            sortedItems.slice(start, end + 1).map((i) => i.name)
          );

          setSelectedItems(newSelection);
        } else {
          setSelectedItems(new Set([itemName]));
          setSelectionAnchor(itemName);
        }
      }
    };

    const tooltipText =
      selectedItems.size === 0
        ? "No items selected"
        : selectedFolderCount > 0
        ? `${selectedFolderCount} folders, ${selectedFileCount} files selected. To include folder sizes, right-click on the items list and select 'Calculate size of ${selectedFolderCount} folders'.`
        : `${selectedFolderCount} folders, ${selectedFileCount} files selected (${formatBytes(
            selectedItemsTotalSize,
            false
          )})`;

    return (
      <div
        ref={ref}
        className={`relative flex flex-col bg-gray-800 text-gray-200 font-mono w-1/2 p-2 border-2 ${
          activePanel === panelId ? "border-blue-500" : "border-gray-700"
        } rounded-lg outline-none`}
        onClick={handlePanelClick}
        tabIndex={-1}
      >
        <div className="bg-gray-900 p-2 rounded-t-md mb-2 flex items-center">
          <HardDrive className="w-5 h-5 mr-3 text-gray-400 flex-shrink-0" />
          <div className="flex-grow min-w-0 mr-3">
            {isEditingPath ? (
              <input
                type="text"
                value={pathInputValue}
                onChange={onPathInputChange}
                onKeyDown={(e) =>
                  e.key === "Enter"
                    ? onPathInputSubmit()
                    : e.key === "Escape" && onPathInputCancel()
                }
                onBlur={onPathInputSubmit}
                autoFocus
                onFocus={(e) => e.target.select()}
                className="bg-gray-700 text-white w-full focus:outline-none focus:ring-1 focus:ring-sky-500 rounded px-1"
              />
            ) : (
              <PathContextMenu
                onChooseFolder={() => onChooseFolder(panelId)}
                onSwapPanels={onSwapPanels}
                onTerminal={onTerminal}
                onTerminalOtherPanel={onTerminalOtherPanel}
                onCopyPathToClipboard={() =>
                  navigator.clipboard.writeText(panelData.path)
                }
              >
                <div
                  onDoubleClick={onPathDoubleClick}
                  onContextMenu={handlePanelClick}
                  title={`${panelData.path || "..."} | Double click to edit`}
                  className="truncate"
                >
                  <Breadcrumbs
                    path={panelData.path}
                    onNavigate={onNavigateToPath}
                  />
                </div>
              </PathContextMenu>
            )}
          </div>
          <div className="relative">
            <Star
              className={`w-5 h-5 cursor-pointer flex-shrink-0 ${
                isFavourite
                  ? "text-yellow-400 fill-current"
                  : "text-gray-500 hover:text-yellow-300"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setIsFavouritesDropdownOpen((prev) => !prev);
              }}
              title="Favourites"
            />
            {isFavouritesDropdownOpen && (
              <FavouritesDropdown
                favourites={favourites}
                recentPaths={recentPaths}
                isFavourite={isFavourite}
                currentPath={panelData.path}
                onSelect={(path) => {
                  onNavigateToPath(path);
                  setIsFavouritesDropdownOpen(false);
                }}
                onToggle={onToggleFavourite}
                onClose={() => setIsFavouritesDropdownOpen(false)}
              />
            )}
          </div>
        </div>

        <div
          style={gridStyle}
          className="items-center text-gray-400 font-bold border-b border-gray-600 pb-2 mb-1 text-sm"
        >
          <span style={{ gridColumn: "1 / 2" }} />
          <SortableHeader
            columnKey="name"
            className="pl-3 pr-2"
            style={{ gridColumn: "2 / 3" }}
          >
            Name
          </SortableHeader>
          <Resizer
            onMouseDown={(e) => handleResizeStart(e, "size")}
            onDoubleClick={() => handleAutoSize("size")}
            title="Drag right to increase Name column width and decrease Size column width. Drag left to decrease Name column width and increase Size column width. Double-click to auto-size."
          />
          <SortableHeader
            columnKey="size"
            className="text-right pr-3 pl-2"
            style={{ gridColumn: "4 / 5" }}
          >
            Size
          </SortableHeader>
          <Resizer
            onMouseDown={(e) => handleResizeStart(e, "modified")}
            onDoubleClick={() => handleAutoSize("modified")}
            title="Drag right to increase Size column width and decrease Modified column width. Drag left to decrease Size column width and increase Modified column width. Double-click to auto-size."
          />
          <SortableHeader
            columnKey="modified"
            className="text-right pl-2"
            style={{ gridColumn: "6 / 7" }}
          >
            Modified
          </SortableHeader>
        </div>

        <EmptyAreaContextMenu
          boundaryRef={boundaryRef}
          onNewFolder={onNewFolder}
          onNewFile={onNewFile}
          panelId={panelId}
          onRefreshPanel={() => onRefreshPanel(panelId)}
          onRefreshBothPanels={() => onRefreshBothPanels(panelId)}
          onRefreshOtherPanel={onRefreshOtherPanel}
          onSelectAll={() => onSelectAll(panelId)}
          onUnselectAll={() => onUnselectAll(panelId)}
          onInvertSelection={() => onInvertSelection(panelId)}
          onQuickSelect={() => onQuickSelect(panelId)}
          onQuickUnselect={() => onQuickUnselect(panelId)}
          onQuickFilter={() => onQuickFilter(panelId)}
          onSwapPanels={() => onSwapPanels(panelId)}
          onTerminal={onTerminal}
          onTerminalOtherPanel={onTerminalOtherPanel}
          onPasteFromClipboard={onPasteFromClipboard}
          clipboard={clipboard}
          onSearchActivePanel={() => onSearchActivePanel?.(panelId)}
          onSearchOtherPanel={() => onSearchOtherPanel?.(panelId)}
        >
          <div
            ref={scrollContainerRef}
            className="flex-grow overflow-y-auto overflow-x-hidden relative"
            onContextMenu={handlePanelClick}
          >
            {isCreating && (
              <NewFolderItem
                value={newFolderValue}
                onChange={onNewFolderChange}
                onSubmit={onNewFolderSubmit}
                onCancel={onNewFolderCancel}
                style={gridStyle}
              />
            )}
            {isCreatingFile && (
              <NewFileItem
                value={newFileValue}
                onChange={onNewFileChange}
                onSubmit={onNewFileSubmit}
                onCancel={onNewFileCancel}
                style={gridStyle}
              />
            )}
            {loading && (
              <div className="absolute inset-0 bg-gray-800/50 flex items-center justify-center z-10">
                <LoaderCircle className="w-8 h-8 animate-spin text-sky-400" />
              </div>
            )}
            {Array.isArray(filteredItems) &&
              filteredItems.map((item) => (
                <FileItem
                  key={item.fullPath || `${panelData.path}-${item.name}`}
                  item={item}
                  isSelected={selectedItems.has(item.name)}
                  isFocused={focusedItem === item.name}
                  isRenaming={
                    renamingItem.panelId === panelId &&
                    renamingItem.name === item.name
                  }
                  renameValue={renamingItem.value}
                  onRenameChange={onRenameChange}
                  onRenameSubmit={onRenameSubmit}
                  onRenameCancel={onRenameCancel}
                  onClick={(e) => handleItemClick(item.name, e)}
                  onDoubleClick={() => handleDoubleClick(item)}
                  onActivatePanel={handlePanelClick}
                  style={gridStyle}
                  onPreview={onPreview}
                  onOpen={onOpen}
                  onOpenWith={onOpenWith}
                  onView={onView}
                  onEdit={onEdit}
                  onCopyToOtherPanel={onCopyToOtherPanel}
                  onMoveToOtherPanel={onMoveToOtherPanel}
                  onCopyTo={onCopyTo}
                  onMoveTo={onMoveTo}
                  onRename={onRename}
                  onDelete={onDelete}
                  onDuplicate={onDuplicate}
                  onSetOtherPanelPath={onSetOtherPanelPath}
                  onCalculateSize={onCalculateSize}
                  onCompressInActivePanel={onCompressInActivePanel}
                  onCompressToOtherPanel={onCompressToOtherPanel}
                  onDecompressInActivePanel={onDecompressInActivePanel}
                  onDecompressToOtherPanel={onDecompressToOtherPanel}
                  onTestArchive={onTestArchive}
                  appState={appState}
                  boundaryRef={boundaryRef}
                  allItems={panelData.items}
                  selectedItems={selectedItems}
                  onSelectAll={() => onSelectAll(panelId)}
                  onUnselectAll={() => onUnselectAll(panelId)}
                  onInvertSelection={() => onInvertSelection(panelId)}
                  onQuickSelect={() => onQuickSelect(panelId)}
                  onQuickUnselect={() => onQuickUnselect(panelId)}
                  onQuickFilter={() => onQuickFilter(panelId)}
                  onSearchActivePanel={() => onSearchActivePanel?.(panelId)}
                  onSearchOtherPanel={() => onSearchOtherPanel?.(panelId)}
                  onRefreshPanel={() => onRefreshPanel(panelId)}
                  onRefreshBothPanels={() => onRefreshBothPanels(panelId)}
                  onRefreshOtherPanel={onRefreshOtherPanel}
                  onSwapPanels={() => onSwapPanels(panelId)}
                  onTerminal={onTerminal}
                  onTerminalOtherPanel={onTerminalOtherPanel}
                  clipboard={clipboard}
                  onCopyToClipboard={onCopyToClipboard}
                  onCutToClipboard={onCutToClipboard}
                  onPasteFromClipboard={onPasteFromClipboard}
                  onNewFolder={onNewFolder}
                  onNewFile={onNewFile}
                  copyAbsolutePaths={copyAbsolutePaths}
                  copyRelativePaths={copyRelativePaths}
                  filter={filter}
                  filteredItems={filteredItems}
                />
              ))}
          </div>
        </EmptyAreaContextMenu>
        {filterPanelId === panelId && (
          <FilterInput
            filter={filter}
            onFilterChange={(newFilter) => onFilterChange(panelId, newFilter)}
            onClose={() => onCloseFilter(panelId)}
            isFiltering={isFiltering}
          />
        )}
        <div className="text-sm pt-2 border-t border-gray-600 mt-1 flex justify-between items-center">
          <p title={tooltipText}>
            {selectedItems.size} / {panelData.items.length} items selected
            {selectedItems.size > 0 && (
              <>
                {" ("}
                <span className="text-sky-400">
                  {formatBytes(selectedItemsTotalSize, false)}
                </span>
                {")"}
              </>
            )}
          </p>
          {diskSpace &&
            (() => {
              const freePercentage = (diskSpace.free / diskSpace.size) * 100;
              let percentageColorClass = "text-gray-300";
              if (freePercentage > 25) {
                percentageColorClass = "text-green-400";
              } else if (freePercentage >= 10 && freePercentage <= 25) {
                percentageColorClass = "text-yellow-400";
              } else {
                percentageColorClass = "text-red-400";
              }
              return (
                <p
                  className="text-gray-400"
                  title={`${formatBytes(
                    diskSpace.free,
                    true
                  )} free out of ${formatBytes(
                    diskSpace.size,
                    true
                  )} total | (${freePercentage.toFixed(1)}% free / ${(
                    ((diskSpace.size - diskSpace.free) / diskSpace.size) *
                    100
                  ).toFixed(1)}% used)`}
                >
                  <span className="text-sky-400">
                    {formatBytes(diskSpace.free, false)}
                  </span>
                  /
                  <span className="text-sky-400">
                    {formatBytes(diskSpace.size, false)}
                  </span>{" "}
                  (
                  <span className={percentageColorClass}>
                    {freePercentage.toFixed(1)}%
                  </span>
                  )
                </p>
              );
            })()}
        </div>
      </div>
    );
  }
);

export default FilePanel;
