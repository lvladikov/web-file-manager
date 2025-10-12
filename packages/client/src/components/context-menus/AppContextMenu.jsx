import React from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { isMac } from "../../lib/utils.js";

const AppContextMenu = ({
  targetItems,
  isPreviewable,
  onPreview,
  onOpen,
  onOpenWith,
  onCopyToOtherPanel,
  onRename,
  onDelete,
  onCalculateSize,
  onSetOtherPanelPath,
  onRefreshPanel,
  onRefreshBothPanels,
  onSelectAll,
  onUnselectAll,
  onInvertSelection,
  onQuickSelect,
  onQuickUnselect,
  onQuickFilter,
  onCompressInActivePanel,
  onCompressToOtherPanel,
  onDecompressInActivePanel,
  onDecompressToOtherPanel,
  onTestArchive,
  onSwapPanels,
  boundaryRef,
  children,
}) => {
  if (!targetItems || targetItems.length === 0) {
    return <>{children}</>;
  }

  const count = targetItems.length;
  const isMultiSelect = count > 1;
  const firstItem = targetItems[0];

  const types = new Set(
    targetItems.map((item) => (item.type === "folder" ? "folder" : "file"))
  );
  const hasFolders = types.has("folder");
  const hasFiles = types.has("file");
  const isMixed = hasFolders && hasFiles;
  const isAllFolders = hasFolders && !hasFiles;

  const folderCount = targetItems.filter(
    (item) => item.type === "folder"
  ).length;

  const deleteLabel = `Delete ${
    isMultiSelect
      ? isMixed
        ? `${count} Items`
        : isAllFolders
        ? `${count} Folders`
        : `${count} Files`
      : ""
  }`;
  const calculateSizeLabel =
    folderCount > 1
      ? `Calculate size of ${folderCount} folders`
      : "Calculate folder size";

  const onPlaceholder = () => alert("This feature will be implemented soon!");

  const metaKey = isMac ? "CMD" : "Ctrl";
  const itemClassName =
    "px-4 py-2 hover:bg-sky-600 cursor-pointer flex justify-between";
  const separatorClassName = "border-t border-gray-600 mx-2 my-1";

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          collisionBoundary={boundaryRef.current}
          collisionPadding={80}
          className="z-50 bg-gray-700 border border-gray-500 rounded-md shadow-lg text-white font-mono text-sm overflow-hidden"
        >
          <ScrollArea.Root className="w-full h-full" type="auto">
            <ScrollArea.Viewport
              className="w-full h-full rounded"
              style={{ maxHeight: "80vh" }}
            >
              {!isMultiSelect && isPreviewable && (
                <ContextMenu.Item
                  onSelect={onPreview}
                  className={itemClassName}
                >
                  Preview (Space)
                </ContextMenu.Item>
              )}
              {!isMultiSelect && (
                <ContextMenu.Item onSelect={onOpen} className={itemClassName}>
                  Open (Enter)
                </ContextMenu.Item>
              )}
              {!isMultiSelect && firstItem.type !== "folder" && (
                <ContextMenu.Item
                  onSelect={onOpenWith}
                  className={itemClassName}
                >
                  Open with...
                </ContextMenu.Item>
              )}

              {!isMultiSelect && <div className={separatorClassName}></div>}

              <ContextMenu.Item
                onSelect={onCopyToOtherPanel}
                className={itemClassName}
              >
                Copy to other panel (F5)
              </ContextMenu.Item>
              <ContextMenu.Item
                onSelect={onPlaceholder}
                className={`${itemClassName} text-gray-400`}
              >
                Copy to clipboard ({metaKey}+C)
              </ContextMenu.Item>
              <ContextMenu.Item
                onSelect={onPlaceholder}
                className={`${itemClassName} text-gray-400`}
              >
                Move (Cut) to clipboard ({metaKey}+X)
              </ContextMenu.Item>
              <ContextMenu.Item
                onSelect={onPlaceholder}
                className={`${itemClassName} text-gray-400`}
              >
                Move to other panel (F6)
              </ContextMenu.Item>
              <ContextMenu.Item
                onSelect={onPlaceholder}
                className={`${itemClassName} text-gray-400`}
              >
                Move to...
              </ContextMenu.Item>

              <div className={separatorClassName}></div>

              {!isMultiSelect && (
                <ContextMenu.Item onSelect={onRename} className={itemClassName}>
                  Rename (F2)
                </ContextMenu.Item>
              )}
              <ContextMenu.Item
                onSelect={onDelete}
                className={`${itemClassName} text-red-400 hover:text-red-300`}
              >
                {deleteLabel} (F8)
              </ContextMenu.Item>

              <div className={separatorClassName}></div>

              {!isMultiSelect && firstItem.type === "archive" ? (
                <>
                  <ContextMenu.Item
                    onSelect={onDecompressInActivePanel}
                    className={itemClassName}
                  >
                    Decompress in active panel
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    onSelect={onDecompressToOtherPanel}
                    className={itemClassName}
                  >
                    Decompress to other panel
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    onSelect={onTestArchive}
                    className={itemClassName}
                  >
                    Test Archive
                  </ContextMenu.Item>
                </>
              ) : count > 0 ? (
                <>
                  <ContextMenu.Item
                    onSelect={onCompressInActivePanel}
                    className={itemClassName}
                  >
                    Compress in active panel
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    onSelect={onCompressToOtherPanel}
                    className={itemClassName}
                  >
                    Compress to other panel
                  </ContextMenu.Item>
                </>
              ) : null}

              {folderCount > 0 && (
                <>
                  <div className={separatorClassName}></div>
                  <ContextMenu.Item
                    onSelect={onCalculateSize}
                    className={itemClassName}
                  >
                    {calculateSizeLabel}
                  </ContextMenu.Item>
                  {count === 1 && firstItem.type === "folder" && (
                    <ContextMenu.Item
                      onSelect={onSetOtherPanelPath}
                      className={itemClassName}
                    >
                      Set as other panel's path
                    </ContextMenu.Item>
                  )}
                </>
              )}

              <div className={separatorClassName}></div>

              <ContextMenu.Item
                onSelect={onSelectAll}
                className={itemClassName}
              >
                <span>Select All</span>
                <span className="text-gray-400">{metaKey}+A</span>
              </ContextMenu.Item>
              <ContextMenu.Item
                onSelect={onUnselectAll}
                className={itemClassName}
              >
                <span>Unselect All</span>
                <span className="text-gray-400">{metaKey}+D</span>
              </ContextMenu.Item>
              <ContextMenu.Item
                onSelect={onInvertSelection}
                className={itemClassName}
              >
                <span>Invert Selection</span>
                <span className="text-gray-400">*</span>
              </ContextMenu.Item>

              <div className={separatorClassName}></div>

              <ContextMenu.Item
                onSelect={onQuickSelect}
                className={itemClassName}
              >
                <span>Quick Select</span>
                <span className="text-gray-400">+</span>
              </ContextMenu.Item>
              <ContextMenu.Item
                onSelect={onQuickUnselect}
                className={itemClassName}
              >
                <span>Quick Unselect</span>
                <span className="text-gray-400">-</span>
              </ContextMenu.Item>

              <div className={separatorClassName}></div>

              <ContextMenu.Item
                onSelect={onQuickFilter}
                className={itemClassName}
              >
                <span>Quick Filter</span>
                <span className="text-gray-400">.</span>
              </ContextMenu.Item>

              <div className={separatorClassName}></div>

              <ContextMenu.Item
                onSelect={onRefreshPanel}
                className={itemClassName}
              >
                Refresh active panel
              </ContextMenu.Item>
              <ContextMenu.Item
                onSelect={onRefreshBothPanels}
                className={itemClassName}
              >
                Refresh both panels
              </ContextMenu.Item>
              <div className={separatorClassName}></div>
              <ContextMenu.Item
                onSelect={onSwapPanels}
                className={itemClassName}
              >
                Swap Panels
              </ContextMenu.Item>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar
              className="flex select-none touch-none p-0.5 bg-gray-800 transition-colors duration-[160ms] ease-out hover:bg-gray-900 data-[orientation=vertical]:w-2.5 data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:h-2.5"
              orientation="vertical"
            >
              <ScrollArea.Thumb className="flex-1 bg-gray-500 rounded-[10px] relative before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:w-full before:h-full before:min-w-[44px] before:min-h-[44px]" />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
};

export default AppContextMenu;
