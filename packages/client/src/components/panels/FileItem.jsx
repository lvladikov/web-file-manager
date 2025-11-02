import React, { useEffect, useRef } from "react";

import { formatBytes, isItemPreviewable, formatDate } from "../../lib/utils";

import Icon from "../ui/Icon";
import TruncatedText from "../ui/TruncatedText";
import AppContextMenu from "../context-menus/AppContextMenu";

const FileItem = ({
  item,
  isSelected,
  isFocused,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onClick,
  onDoubleClick,
  style,
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
  onSwapPanels,
  onTerminal,
  onTerminalOtherPanel,
  onRefreshPanel,
  onRefreshBothPanels,
  onSelectAll,
  onUnselectAll,
  onInvertSelection,
  onQuickSelect,
  onQuickUnselect,
  onQuickFilter,
  onActivatePanel,
  appState,
  boundaryRef,
  allItems,
  selectedItems,
  clipboard,
  onCopyToClipboard,
  onCutToClipboard,
  onPasteFromClipboard,
  onNewFolder,
  onNewFile,
  copyAbsolutePaths,
  copyRelativePaths,
  filter,
  filteredItems,
}) => {
  const inputRef = useRef(null);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      // Delay focusing to allow other elements (like the context menu) to release focus first
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 150);
    }
  }, [isRenaming]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") onRenameSubmit();
    if (e.key === "Escape") onRenameCancel();
  };

  let targetItems;
  const itemsToConsider = filter.pattern ? filteredItems : allItems;

  if (isSelected) {
    targetItems = itemsToConsider.filter((i) => selectedItems.has(i.name));
  } else {
    targetItems = [item];
  }

  const renderFileItemContent = () => (
    <div
      data-name={item.name}
      className={`grid items-center p-1.5 rounded select-none 
          ${
            isRenaming
              ? "bg-gray-700"
              : isSelected
              ? "bg-blue-600"
              : "hover:bg-gray-700"
          }
          ${isFocused && !isRenaming ? "ring-2 ring-gray-400 ring-inset" : ""}
        `}
      style={style}
      onClick={isRenaming ? (e) => e.stopPropagation() : onClick}
      onDoubleClick={isRenaming ? (e) => e.stopPropagation() : onDoubleClick}
      onContextMenu={(e) => {
        // Explicitly activate the panel on right-click to ensure activePanel is correct
        // before any action from the context menu is executed.
        onActivatePanel();

        if (!isSelected) {
          onClick(e);
        }
      }}
      title={
        isRenaming
          ? ""
          : item.type === "parent"
          ? "Go up one folder"
          : `${item.name}${
              item.type !== "folder"
                ? " | Double-click to open"
                : ""
            }`
      }
    >
      <div
        style={{ gridColumn: "1 / 2" }}
        className="flex justify-center items-center"
      >
        <Icon type={item.type} />
      </div>
      <div
        style={{ gridColumn: "2 / 3" }}
        className="pr-4 min-w-0 overflow-hidden"
      >
        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            value={renameValue}
            onChange={onRenameChange}
            onKeyDown={handleKeyDown}
            onBlur={onRenameCancel}
            autoFocus
            className="bg-sky-100 text-black w-full focus:outline-none focus:ring-2 focus:ring-sky-500 rounded px-1 -m-1"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <TruncatedText text={item.name} />
        )}
      </div>
      <span
        style={{ gridColumn: "4 / 5" }}
        className="text-right pr-4 flex-shrink-0 whitespace-nowrap"
      >
        {isRenaming ? "" : formatBytes(item.size)}
      </span>
      <span
        style={{ gridColumn: "6 / 7" }}
        className="text-right flex-shrink-0 whitespace-nowrap"
      >
        {isRenaming ? "" : formatDate(item.modified)}
      </span>
    </div>
  );

  if (item.type === "parent") {
    return renderFileItemContent();
  }

  const isPreviewable = isItemPreviewable(item);

  return (
    <AppContextMenu
      targetItems={targetItems}
      isPreviewable={isPreviewable}
      onPreview={onPreview}
      onOpen={onOpen}
      onOpenWith={onOpenWith}
      onView={onView}
      onCopyToOtherPanel={onCopyToOtherPanel}
      onMoveToOtherPanel={onMoveToOtherPanel}
      onCopyTo={onCopyTo}
      onMoveTo={onMoveTo}
      onRename={onRename}
      onEdit={onEdit}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onSetOtherPanelPath={onSetOtherPanelPath}
      onCalculateSize={onCalculateSize}
      onCompressInActivePanel={onCompressInActivePanel}
      onCompressToOtherPanel={onCompressToOtherPanel}
      onDecompressInActivePanel={onDecompressInActivePanel}
      onDecompressToOtherPanel={onDecompressToOtherPanel}
      onTestArchive={onTestArchive}
      onSwapPanels={onSwapPanels}
      onTerminal={onTerminal}
      onTerminalOtherPanel={onTerminalOtherPanel}
      onRefreshPanel={onRefreshPanel}
      onRefreshBothPanels={onRefreshBothPanels}
      onSelectAll={onSelectAll}
      onUnselectAll={onUnselectAll}
      onInvertSelection={onInvertSelection}
      onQuickSelect={onQuickSelect}
      onQuickUnselect={onQuickUnselect}
      onQuickFilter={onQuickFilter}
      appState={appState}
      boundaryRef={boundaryRef}
      isRenaming={isRenaming}
      onRenameCancel={onRenameCancel}
      clipboard={clipboard}
      onCopyToClipboard={onCopyToClipboard}
      onCutToClipboard={onCutToClipboard}
      onPasteFromClipboard={onPasteFromClipboard}
      onNewFolder={onNewFolder}
      onNewFile={onNewFile}
      copyAbsolutePaths={copyAbsolutePaths}
      copyRelativePaths={copyRelativePaths}
    >
      {renderFileItemContent()}
    </AppContextMenu>
  );
};

export default FileItem;
