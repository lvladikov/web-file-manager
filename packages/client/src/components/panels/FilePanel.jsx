import React, { useState, useEffect, useCallback, useRef } from "react";
import { HardDrive, LoaderCircle, Star } from "lucide-react";

import { formatBytes, isMac } from "../../lib/utils";

import Breadcrumbs from "../ui/Breadcrumbs";
import FavouritesDropdown from "../ui/FavouritesDropdown";
import Resizer from "../ui/Resizer";
import NewFolderItem from "../panels/NewFolderItem";
import FileItem from "../panels/FileItem";
import FilterInput from "../ui/FilterInput";

const FilePanel = React.forwardRef(
  (
    {
      panelData,
      activePanel,
      panelId,
      onEmptyAreaContextMenu,
      renamingItem,
      isCreating,
      newFolderValue,
      setActivePanel,
      onNavigate,
      onNavigateToPath,
      onOpenFile,
      onContextMenu,
      onStartRename,
      onRenameChange,
      onRenameSubmit,
      onRenameCancel,
      onNewFolderChange,
      onNewFolderSubmit,
      onNewFolderCancel,
      onPathContextMenu,
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
      columnWidths,
      setColumnWidths,
      filter,
      isFiltering,
      filterPanelId,
      onFilterChange,
      onCloseFilter,
      filteredItems,
    },
    ref
  ) => {
    const clickTimerRef = useRef(null);
    const scrollContainerRef = useRef(null);
    const [isFavouritesDropdownOpen, setIsFavouritesDropdownOpen] =
      useState(false);

    useEffect(() => {
      setSelectedItems(new Set());
      setFocusedItem(null);
      setSelectionAnchor(null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
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
        let newWidth = resizing.initialWidth + deltaX;
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
      setResizing({
        active: true,
        column: column,
        initialX: e.clientX,
        initialWidth: columnWidths[column],
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

    const handleDoubleClick = (item) => {
      // A double-click is definitive. Cancel any pending rename timer.
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }

      // Immediately perform the double-click action.
      item.type === "folder" || item.type === "parent"
        ? onNavigate(item.name)
        : onOpenFile(panelData.path, item.name);
    };

    const handleItemClick = (itemName, e) => {
      handlePanelClick(); // Activate the panel instantly.

      // Check if this is a potential rename trigger (a non-modifier click on an already-focused item).
      const isRenameTrigger =
        itemName === focusedItem &&
        !e.shiftKey &&
        !(isMac ? e.metaKey : e.ctrlKey);

      if (isRenameTrigger) {
        // If it's a rename trigger, we only set a timer. Selection is already correct.
        // If a double-click happens, the handler above will cancel this timer.
        clickTimerRef.current = setTimeout(() => {
          onStartRename(panelId, itemName);
        }, 300);
      } else {
        // This is a click on a NEW item, or a click with a modifier key.
        // This action is unambiguous, so we perform selection instantly and cancel any old timers.
        if (clickTimerRef.current) {
          clearTimeout(clickTimerRef.current);
          clickTimerRef.current = null;
        }

        setFocusedItem(itemName);
        const { items } = panelData;
        if (isMac ? e.metaKey : e.ctrlKey) {
          const newSelection = new Set(selectedItems);
          if (newSelection.has(itemName)) newSelection.delete(itemName);
          else newSelection.add(itemName);
          setSelectedItems(newSelection);
          setSelectionAnchor(itemName);
        } else if (e.shiftKey && selectionAnchor) {
          const anchorIndex = items.findIndex(
            (i) => i.name === selectionAnchor
          );
          const clickedIndex = items.findIndex((i) => i.name === itemName);
          const start = Math.min(anchorIndex, clickedIndex);
          const end = Math.max(anchorIndex, clickedIndex);
          if (start === -1 || end === -1) return;
          const newSelection = new Set(
            items.slice(start, end + 1).map((i) => i.name)
          );
          setSelectedItems(newSelection);
        } else {
          setSelectedItems(new Set([itemName]));
          setSelectionAnchor(itemName);
        }
      }
    };

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
              <div
                onDoubleClick={onPathDoubleClick}
                onContextMenu={(e) => onPathContextMenu(e, panelId)}
                title={`${panelData.path || "..."} | Double click to edit`}
                className="truncate"
              >
                <Breadcrumbs
                  path={panelData.path}
                  onNavigate={onNavigateToPath}
                />
              </div>
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
          <span style={{ gridColumn: "2 / 3" }} className="pl-8">
            Name
          </span>
          <Resizer
            onMouseDown={(e) => handleResizeStart(e, "size")}
            onDoubleClick={() => handleAutoSize("size")}
          />
          <span style={{ gridColumn: "4 / 5" }} className="text-right pr-4">
            Size
          </span>
          <Resizer
            onMouseDown={(e) => handleResizeStart(e, "modified")}
            onDoubleClick={() => handleAutoSize("modified")}
          />
          <span style={{ gridColumn: "6 / 7" }} className="text-right">
            Modified
          </span>
        </div>

        <div
          ref={scrollContainerRef}
          className="flex-grow overflow-y-auto pr-1 relative"
          onContextMenu={(e) => {
            // Ensure the click is on the container itself, not on a child element
            if (e.target === e.currentTarget) {
              onEmptyAreaContextMenu(e);
            }
          }}
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
          {loading && (
            <div className="absolute inset-0 bg-gray-800/50 flex items-center justify-center z-10">
              <LoaderCircle className="w-8 h-8 animate-spin text-sky-400" />
            </div>
          )}
          {Array.isArray(filteredItems) &&
            filteredItems.map((item) => (
              <FileItem
                key={`${panelData.path}-${item.name}`}
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
                onContextMenu={(x, y, file) =>
                  onContextMenu(x, y, file, panelData.path)
                }
                style={gridStyle}
              />
            ))}
        </div>
        {filterPanelId === panelId && (
          <FilterInput
            filter={filter}
            onFilterChange={(newFilter) => onFilterChange(panelId, newFilter)}
            onClose={() => onCloseFilter(panelId)}
            isFiltering={isFiltering}
          />
        )}
        <div className="text-sm pt-2 border-t border-gray-600 mt-1">
          <p>
            {selectedItems.size} / {panelData.items.length} items selected
          </p>
        </div>
      </div>
    );
  }
);

export default FilePanel;