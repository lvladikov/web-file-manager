import React, { useEffect } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import {
  metaKey,
  itemClassName,
  separatorClassName,
  submenuTriggerClassName,
} from "../../lib/utils.js";

const AppContextMenu = ({
  targetItems,
  isPreviewable,
  onPreview,
  onOpen,
  onOpenWith,
  onView,
  onCopyToOtherPanel,
  onMoveToOtherPanel,
  onCopyTo,
  onMoveTo,
  onCopyToClipboard,
  onCutToClipboard,
  onPasteFromClipboard,
  onRename,
  onEdit,
  onDelete,
  onDuplicate,
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
  isRenaming,
  onRenameCancel,
  children,
  clipboard,
  onNewFolder,
  onNewFile,
  copyAbsolutePaths,
  copyRelativePaths,
}) => {
  useEffect(() => {
    const handleGlobalKeyDown = (event) => {
      if (event.key === "Escape" && isRenaming) {
        onRenameCancel();
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown, true); // Capture phase

    return () => {
      document.removeEventListener("keydown", handleGlobalKeyDown, true);
    };
  }, [isRenaming, onRenameCancel]);

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

  const isAllArchives =
    hasFiles &&
    !hasFolders &&
    targetItems.every((item) => item.type === "archive");
  const selectedArchiveCount = targetItems.filter(
    (item) => item.type === "archive"
  ).length;

  const deleteLabel = `Delete ${
    isMultiSelect
      ? isMixed
        ? `${count} Items`
        : isAllArchives
        ? `${count} Archives`
        : isAllFolders
        ? `${count} Folders`
        : `${count} Files`
      : ""
  }`;
  const calculateSizeLabel =
    folderCount > 1
      ? `Calculate size of ${folderCount} folders`
      : "Calculate folder size";

  const testArchiveLabel =
    selectedArchiveCount > 1
      ? `Test ${selectedArchiveCount} Archives`
      : "Test Archive";

  const onPlaceholder = () => alert("This feature will be implemented soon!");

  const shouldShowArchiveGroup = count > 0;
  const canCompress = count > 0 && !isAllArchives;
  const canDecompress = selectedArchiveCount > 0;
  const canTestArchive = selectedArchiveCount > 0;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          collisionBoundary={boundaryRef.current}
          collisionPadding={80}
          className="z-50 bg-gray-700 border border-gray-500 rounded-md shadow-lg text-white font-mono text-sm overflow-hidden w-72"
        >
          <ScrollArea.Root className="w-full h-full" type="auto">
            <ScrollArea.Viewport
              className="w-full h-full rounded"
              style={{ maxHeight: "80vh" }}
            >
              <ContextMenu.Sub>
                <ContextMenu.SubTrigger className={submenuTriggerClassName}>
                  <span>New</span>
                  <span className="text-gray-400">&gt;</span>
                </ContextMenu.SubTrigger>
                <ContextMenu.Portal>
                  <ContextMenu.SubContent
                    className="z-50 bg-gray-700 border border-gray-500 rounded-md shadow-lg text-white font-mono text-sm overflow-hidden w-40"
                    sideOffset={2}
                    alignOffset={-5}
                  >
                    <ContextMenu.Item
                      onSelect={onNewFolder}
                      className={itemClassName}
                    >
                      <span>New Folder</span>
                      <span className="text-gray-400">F7</span>
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      onSelect={onNewFile}
                      className={itemClassName}
                    >
                      New File
                    </ContextMenu.Item>
                  </ContextMenu.SubContent>
                </ContextMenu.Portal>
              </ContextMenu.Sub>
              <div className={separatorClassName}></div>
              {!isMultiSelect && isPreviewable && (
                <ContextMenu.Item
                  onSelect={onPreview}
                  className={itemClassName}
                >
                  <span>Preview</span>
                  <span className="text-gray-400">Space</span>
                </ContextMenu.Item>
              )}
              {!isMultiSelect &&
                firstItem.type !== "folder" &&
                firstItem.type !== "parent" && (
                  <ContextMenu.Item onSelect={onView} className={itemClassName}>
                    <span>View</span>
                    <span className="text-gray-400">F3</span>
                  </ContextMenu.Item>
                )}
              {!isMultiSelect && (
                <ContextMenu.Item onSelect={onOpen} className={itemClassName}>
                  <span>Open</span>
                  <span className="text-gray-400">Enter</span>
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

              <ContextMenu.Sub>
                <ContextMenu.SubTrigger className={submenuTriggerClassName}>
                  <span>Copy & Move</span>
                  <span className="text-gray-400">&gt;</span>
                </ContextMenu.SubTrigger>
                <ContextMenu.Portal>
                  <ContextMenu.SubContent
                    className="z-50 bg-gray-700 border border-gray-500 rounded-md shadow-lg text-white font-mono text-sm overflow-hidden w-72"
                    sideOffset={2}
                    alignOffset={-5}
                  >
                    <ContextMenu.Item
                      onSelect={onCopyToOtherPanel}
                      className={itemClassName}
                    >
                      <span>Copy to other panel</span>
                      <span className="text-gray-400">F5</span>
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      onSelect={onCopyToClipboard}
                      className={itemClassName}
                    >
                      <span>Copy to clipboard</span>
                      <span className="text-gray-400">{metaKey}+C</span>
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      onSelect={onCopyTo}
                      className={itemClassName}
                    >
                      Copy to...
                    </ContextMenu.Item>
                    <div className={separatorClassName}></div>
                    <ContextMenu.Item
                      onSelect={onDuplicate}
                      className={itemClassName}
                    >
                      <span>Duplicate</span>
                    </ContextMenu.Item>
                    <div className={separatorClassName}></div>
                    <ContextMenu.Sub>
                      <ContextMenu.SubTrigger
                        className={submenuTriggerClassName}
                      >
                        <span>Copy Paths to clipboard</span>
                        <span className="text-gray-400">&gt;</span>
                      </ContextMenu.SubTrigger>
                      <ContextMenu.Portal>
                        <ContextMenu.SubContent
                          className="z-50 bg-gray-700 border border-gray-500 rounded-md shadow-lg text-white font-mono text-sm overflow-hidden w-52"
                          sideOffset={2}
                          alignOffset={-5}
                        >
                          <ContextMenu.Sub>
                            <ContextMenu.SubTrigger
                              className={submenuTriggerClassName}
                            >
                              <span>Include Subfolders</span>
                              <span className="text-gray-400">&gt;</span>
                            </ContextMenu.SubTrigger>
                            <ContextMenu.Portal>
                              <ContextMenu.SubContent
                                className="z-50 bg-gray-700 border border-gray-500 rounded-md shadow-lg text-white font-mono text-sm overflow-hidden w-56"
                                sideOffset={2}
                                alignOffset={-5}
                              >
                                <ContextMenu.Item
                                  onSelect={() => copyAbsolutePaths(true)}
                                  className={itemClassName}
                                >
                                  Copy absolute paths
                                </ContextMenu.Item>
                                <ContextMenu.Item
                                  onSelect={() => copyRelativePaths(true)}
                                  className={itemClassName}
                                >
                                  Copy relative paths
                                </ContextMenu.Item>
                              </ContextMenu.SubContent>
                            </ContextMenu.Portal>
                          </ContextMenu.Sub>
                          <ContextMenu.Sub>
                            <ContextMenu.SubTrigger
                              className={submenuTriggerClassName}
                            >
                              <span>Exclude Subfolders</span>
                              <span className="text-gray-400">&gt;</span>
                            </ContextMenu.SubTrigger>
                            <ContextMenu.Portal>
                              <ContextMenu.SubContent
                                className="z-50 bg-gray-700 border border-gray-500 rounded-md shadow-lg text-white font-mono text-sm overflow-hidden w-56"
                                sideOffset={2}
                                alignOffset={-5}
                              >
                                <ContextMenu.Item
                                  onSelect={() => copyAbsolutePaths(false)}
                                  className={itemClassName}
                                >
                                  Copy absolute paths
                                </ContextMenu.Item>
                                <ContextMenu.Item
                                  onSelect={() => copyRelativePaths(false)}
                                  className={itemClassName}
                                >
                                  Copy relative paths
                                </ContextMenu.Item>
                              </ContextMenu.SubContent>
                            </ContextMenu.Portal>
                          </ContextMenu.Sub>
                        </ContextMenu.SubContent>
                      </ContextMenu.Portal>
                    </ContextMenu.Sub>
                    <ContextMenu.Sub>
                      <ContextMenu.SubTrigger
                        className={submenuTriggerClassName}
                      >
                        <span>Copy Paths and download</span>
                        <span className="text-gray-400">&gt;</span>
                      </ContextMenu.SubTrigger>
                      <ContextMenu.Portal>
                        <ContextMenu.SubContent
                          className="z-50 bg-gray-700 border border-gray-500 rounded-md shadow-lg text-white font-mono text-sm overflow-hidden w-52"
                          sideOffset={2}
                          alignOffset={-5}
                        >
                          <ContextMenu.Sub>
                            <ContextMenu.SubTrigger
                              className={submenuTriggerClassName}
                            >
                              <span>Include Subfolders</span>
                              <span className="text-gray-400">&gt;</span>
                            </ContextMenu.SubTrigger>
                            <ContextMenu.Portal>
                              <ContextMenu.SubContent
                                className="z-50 bg-gray-700 border border-gray-500 rounded-md shadow-lg text-white font-mono text-sm overflow-hidden w-56"
                                sideOffset={2}
                                alignOffset={-5}
                              >
                                <ContextMenu.Item
                                  onSelect={() => copyAbsolutePaths(true, true)}
                                  className={itemClassName}
                                >
                                  Absolute paths
                                </ContextMenu.Item>
                                <ContextMenu.Item
                                  onSelect={() => copyRelativePaths(true, true)}
                                  className={itemClassName}
                                >
                                  Relative paths
                                </ContextMenu.Item>
                              </ContextMenu.SubContent>
                            </ContextMenu.Portal>
                          </ContextMenu.Sub>
                          <ContextMenu.Sub>
                            <ContextMenu.SubTrigger
                              className={submenuTriggerClassName}
                            >
                              <span>Exclude Subfolders</span>
                              <span className="text-gray-400">&gt;</span>
                            </ContextMenu.SubTrigger>
                            <ContextMenu.Portal>
                              <ContextMenu.SubContent
                                className="z-50 bg-gray-700 border border-gray-500 rounded-md shadow-lg text-white font-mono text-sm overflow-hidden w-56"
                                sideOffset={2}
                                alignOffset={-5}
                              >
                                <ContextMenu.Item
                                  onSelect={() =>
                                    copyAbsolutePaths(false, true)
                                  }
                                  className={itemClassName}
                                >
                                  Absolute paths
                                </ContextMenu.Item>
                                <ContextMenu.Item
                                  onSelect={() =>
                                    copyRelativePaths(false, true)
                                  }
                                  className={itemClassName}
                                >
                                  Relative paths
                                </ContextMenu.Item>
                              </ContextMenu.SubContent>
                            </ContextMenu.Portal>
                          </ContextMenu.Sub>
                        </ContextMenu.SubContent>
                      </ContextMenu.Portal>
                    </ContextMenu.Sub>
                    <div className={separatorClassName}></div>
                    <ContextMenu.Item
                      onSelect={onMoveToOtherPanel}
                      className={itemClassName}
                    >
                      <span>Move to other panel</span>
                      <span className="text-gray-400">F6</span>
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      onSelect={onCutToClipboard}
                      className={itemClassName}
                    >
                      <span>Move (Cut) to clipboard</span>
                      <span className="text-gray-400">{metaKey}+X</span>
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      onSelect={onMoveTo}
                      className={itemClassName}
                    >
                      Move to...
                    </ContextMenu.Item>
                    {clipboard && clipboard.sources.length > 0 && (
                      <>
                        <div className={separatorClassName}></div>
                        <ContextMenu.Item
                          onSelect={onPasteFromClipboard}
                          className={itemClassName}
                        >
                          <span>Paste from clipboard</span>
                          <span className="text-gray-400">{metaKey}+V</span>
                        </ContextMenu.Item>
                      </>
                    )}
                  </ContextMenu.SubContent>
                </ContextMenu.Portal>
              </ContextMenu.Sub>

              <div className={separatorClassName}></div>

              {!isMultiSelect && (
                <ContextMenu.Item onSelect={onRename} className={itemClassName}>
                  <span>Rename</span>
                  <span className="text-gray-400">F2</span>
                </ContextMenu.Item>
              )}
              {!isMultiSelect &&
                firstItem.type !== "folder" &&
                firstItem.type !== "parent" && (
                  <ContextMenu.Item onSelect={onEdit} className={itemClassName}>
                    <span>Edit</span>
                    <span className="text-gray-400">F4</span>
                  </ContextMenu.Item>
                )}
              <ContextMenu.Item
                onSelect={onDelete}
                className={`${itemClassName} text-red-400 hover:text-red-300`}
              >
                <span>{deleteLabel}</span>
                <span className="text-gray-400">F8</span>
              </ContextMenu.Item>

              {shouldShowArchiveGroup && (
                <>
                  <div className={separatorClassName}></div>
                  <ContextMenu.Sub>
                    <ContextMenu.SubTrigger className={submenuTriggerClassName}>
                      <span>Archive</span>
                      <span className="text-gray-400">&gt;</span>
                    </ContextMenu.SubTrigger>
                    <ContextMenu.Portal>
                      <ContextMenu.SubContent
                        className="z-50 bg-gray-700 border border-gray-500 rounded-md shadow-lg text-white font-mono text-sm overflow-hidden w-66"
                        sideOffset={2}
                        alignOffset={-5}
                      >
                        {canDecompress ? (
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
                          </>
                        ) : null}
                        {canTestArchive ? (
                          <ContextMenu.Item
                            onSelect={onTestArchive}
                            className={itemClassName}
                          >
                            {testArchiveLabel}
                          </ContextMenu.Item>
                        ) : null}
                        {canCompress ? (
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
                      </ContextMenu.SubContent>
                    </ContextMenu.Portal>
                  </ContextMenu.Sub>
                </>
              )}

              {folderCount > 0 && (
                <>
                  <div className={separatorClassName}></div>
                  <ContextMenu.Item
                    onSelect={onCalculateSize}
                    className={itemClassName}
                  >
                    <span>{calculateSizeLabel}</span>
                    <span className="text-gray-400">Space</span>
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
              <ContextMenu.Sub>
                <ContextMenu.SubTrigger className={submenuTriggerClassName}>
                  <span>Select & Filter</span>
                  <span className="text-gray-400">&gt;</span>
                </ContextMenu.SubTrigger>
                <ContextMenu.Portal>
                  <ContextMenu.SubContent
                    className="z-50 bg-gray-700 border border-gray-500 rounded-md shadow-lg text-white font-mono text-sm overflow-hidden w-60"
                    sideOffset={2}
                    alignOffset={-5}
                  >
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
                  </ContextMenu.SubContent>
                </ContextMenu.Portal>
              </ContextMenu.Sub>

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
                <span>Swap panels</span>
                <span className="text-gray-400">{metaKey}+U</span>
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
