import React, { useState } from "react";
import * as NavigationMenu from "@radix-ui/react-navigation-menu";
import { metaKey, isEditable, submenuTriggerClassName } from "../../lib/utils";
import { exitApp } from "../../lib/api";

const itemClassName =
  "px-4 py-2 flex justify-between hover:bg-sky-600 cursor-pointer";
const disabledItemClassName =
  "px-4 py-2 flex justify-between text-gray-500 cursor-not-allowed";
const separatorClassName = "border-t border-gray-600 mx-2 my-1";

const MenuItem = ({
  label,
  shortcut,
  onClick,
  disabled = false,
  className = "",
}) => (
  <div
    onClick={!disabled ? onClick : undefined}
    className={
      disabled ? disabledItemClassName : itemClassName + " " + className
    }
  >
    <span>{label}</span>
    {shortcut && <span className="text-gray-400">{shortcut}</span>}
  </div>
);

const FileMenu = ({ ...props }) => {
  const {
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
    canDuplicate,
    onCalculateSize,
    onSetOtherPanelPath,
    onRefreshPanel,
    onRefreshBothPanels,
    onCompressInActivePanel,
    onCompressToOtherPanel,
    onDecompressInActivePanel,
    onDecompressToOtherPanel,
    onDecompressInSubfolderInActivePanel,
    onDecompressInSubfolderToOtherPanel,
    onTestArchive,
    onSwapPanels,
    canCopyToOtherPanel,
    canMoveToOtherPanel,
    canRename,
    canEdit,
    canDelete,
    canCalculateSize,
    canSetOtherPanelPath,
    activePanelSelections,
    calculateSizeLabel,
    handleItemClick,
    onPreview,
    onView,
    onOpen,
    onOpenWith,
    canPreview,
    canView,
    canOpen,
    canOpenWith,
    clipboard,
    onNewFolder,
    onNewFile,
    activePanel,
    copyAbsolutePaths,
    copyRelativePaths,
    selectedItemsDetails,
  } = props;

  const [isCopyMoveSubmenuOpen, setIsCopyMoveSubmenuOpen] = useState(false);
  const [isArchiveSubmenuOpen, setIsArchiveSubmenuOpen] = useState(false);
  const [isNewSubmenuOpen, setIsNewSubmenuOpen] = useState(false);

  const selectedArchiveCount = selectedItemsDetails.filter(
    (item) => item.type === "archive"
  ).length;
  const canCompress =
    selectedItemsDetails.length > 0 &&
    selectedArchiveCount !== selectedItemsDetails.length;
  const canDecompress = selectedArchiveCount > 0;
  const canTestArchive = selectedArchiveCount > 0;

  const testArchiveLabel =
    selectedArchiveCount > 1
      ? `Test ${selectedArchiveCount} Archives`
      : "Test Archive";

  const shouldShowArchiveGroup = selectedItemsDetails.length > 0;

  // Archive submenu width: wide for decompress, medium for compress-only, narrow otherwise
  // Use standard Tailwind width classes so styling is reliable.
  const archiveSubWidthClass = canDecompress
    ? "w-96"
    : canCompress
    ? "w-64"
    : "w-40";

  const NewGroup = () => (
    <div
      onMouseEnter={() => setIsNewSubmenuOpen(true)}
      onMouseLeave={() => setIsNewSubmenuOpen(false)}
      className="relative"
    >
      <div className={submenuTriggerClassName}>
        <span>New</span>
        <span className="text-gray-400">&gt;</span>
      </div>
      {isNewSubmenuOpen && (
        <div className="absolute top-0 left-full mt-[-1px] w-40 bg-gray-800 border border-gray-600 rounded-md shadow-lg text-white font-mono text-sm z-50">
          <MenuItem
            label="New Folder"
            shortcut="F7"
            onClick={() => handleItemClick(() => onNewFolder(activePanel))}
          />
          <MenuItem
            label="New File"
            onClick={() => handleItemClick(() => onNewFile(activePanel))}
          />
        </div>
      )}
    </div>
  );

  // Archive submenu logic
  const ArchiveGroup = () => (
    <div
      onMouseEnter={() => setIsArchiveSubmenuOpen(true)}
      onMouseLeave={() => setIsArchiveSubmenuOpen(false)}
      className="relative"
    >
      {/* Submenu Trigger UI: Use submenuTriggerClassName */}
      <div className={submenuTriggerClassName}>
        <span>Archive</span>
        <span className="text-gray-400">&gt;</span>
      </div>

      {/* Submenu Content (Simulated popover) */}
      {isArchiveSubmenuOpen && (
        <div
          className={`absolute top-0 left-full mt-[-1px] ${archiveSubWidthClass} bg-gray-800 border border-gray-600 rounded-md shadow-lg text-white font-mono text-sm z-50`}
        >
          {canDecompress ? (
            <>
              <MenuItem
                label="Decompress in active panel"
                onClick={() => handleItemClick(onDecompressInActivePanel)}
                className="whitespace-nowrap"
              />
              <MenuItem
                label="Decompress to other panel"
                onClick={() => handleItemClick(onDecompressToOtherPanel)}
                className="whitespace-nowrap"
              />
              <MenuItem
                label={
                  selectedArchiveCount > 1
                    ? "Decompress in subfolders in active panel"
                    : "Decompress in subfolder in active panel"
                }
                onClick={() =>
                  handleItemClick(onDecompressInSubfolderInActivePanel)
                }
                className="whitespace-nowrap"
              />
              <MenuItem
                label={
                  selectedArchiveCount > 1
                    ? "Decompress in subfolders in other panel"
                    : "Decompress in subfolder in other panel"
                }
                onClick={() =>
                  handleItemClick(onDecompressInSubfolderToOtherPanel)
                }
                className="whitespace-nowrap"
              />
            </>
          ) : null}
          {canTestArchive ? (
            <MenuItem
              label={testArchiveLabel}
              onClick={() => handleItemClick(onTestArchive)}
            />
          ) : null}
          {canCompress ? (
            <>
              <MenuItem
                label="Compress in active panel"
                onClick={() => handleItemClick(onCompressInActivePanel)}
              />
              <MenuItem
                label="Compress to other panel"
                onClick={() => handleItemClick(onCompressToOtherPanel)}
              />
            </>
          ) : null}
        </div>
      )}
    </div>
  );

  // Copy & Move Submenu logic
  const CopyMoveGroup = () => (
    <div
      onMouseEnter={() => setIsCopyMoveSubmenuOpen(true)}
      onMouseLeave={() => setIsCopyMoveSubmenuOpen(false)}
      className="relative"
    >
      {/* Submenu Trigger UI: Use submenuTriggerClassName */}
      <div className={submenuTriggerClassName}>
        <span>Copy & Move</span>
        <span className="text-gray-400">&gt;</span>
      </div>

      {/* Submenu Content (Simulated popover) */}
      {isCopyMoveSubmenuOpen && (
        <div className="absolute top-0 left-full mt-[-1px] w-72 bg-gray-800 border border-gray-600 rounded-md shadow-lg text-white font-mono text-sm z-50">
          <MenuItem
            label="Copy to other panel"
            shortcut="F5"
            onClick={() => handleItemClick(onCopyToOtherPanel)}
            disabled={!canCopyToOtherPanel}
          />
          <MenuItem
            label="Copy to clipboard"
            shortcut={`${metaKey}+C`}
            onClick={() => handleItemClick(onCopyToClipboard)}
            disabled={!canCopyToOtherPanel}
          />
          <MenuItem
            label="Copy to ..."
            onClick={() => handleItemClick(onCopyTo)}
            disabled={!canCopyToOtherPanel}
          />
          <div className={separatorClassName} />
          <MenuItem
            label="Duplicate"
            onClick={() => handleItemClick(onDuplicate)}
            disabled={!canDuplicate}
          />
          <div className={separatorClassName} />
          <MenuItem
            label="Move to other panel"
            shortcut="F6"
            onClick={() => handleItemClick(onMoveToOtherPanel)}
            disabled={!canMoveToOtherPanel}
          />
          <MenuItem
            label="Move (Cut) to clipboard"
            shortcut={`${metaKey}+X`}
            onClick={() => handleItemClick(onCutToClipboard)}
            disabled={!canMoveToOtherPanel}
          />
          <MenuItem
            label="Move to ..."
            onClick={() => handleItemClick(onMoveTo)}
            disabled={!canMoveToOtherPanel}
          />
          {clipboard.sources.length > 0 && (
            <>
              <div className={separatorClassName} />
              <MenuItem
                label="Paste from clipboard"
                shortcut={`${metaKey}+V`}
                onClick={() => handleItemClick(onPasteFromClipboard)}
              />
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <NavigationMenu.Item value="file">
      <NavigationMenu.Trigger className="px-3 py-1 rounded hover:bg-gray-700">
        File
      </NavigationMenu.Trigger>
      <NavigationMenu.Content className="absolute top-full left-0 mt-1 w-80 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-50 text-white font-mono text-sm">
        <NewGroup />
        <div className={separatorClassName} />
        {canPreview && (
          <MenuItem
            label="Preview"
            shortcut="Space"
            onClick={() => handleItemClick(onPreview)}
          />
        )}
        {canView && (
          <MenuItem
            label="View"
            shortcut="F3"
            onClick={() => handleItemClick(onView)}
          />
        )}
        {canOpen && (
          <MenuItem
            label="Open"
            shortcut="Enter"
            onClick={() => handleItemClick(onOpen)}
          />
        )}
        {canOpenWith && (
          <MenuItem
            label="Open with..."
            onClick={() => handleItemClick(onOpenWith)}
          />
        )}
        {(canPreview || canOpen || canOpenWith) && (
          <div className={separatorClassName} />
        )}

        <CopyMoveGroup />
        <div className={separatorClassName} />

        <MenuItem
          label="Rename"
          shortcut="F2"
          onClick={() => handleItemClick(onRename)}
          disabled={!canRename}
        />
        <MenuItem
          label="Edit"
          shortcut="F4"
          onClick={() => handleItemClick(onEdit)}
          disabled={!canEdit}
        />
        <MenuItem
          label="Delete"
          shortcut="F8"
          onClick={() => handleItemClick(onDelete)}
          disabled={!canDelete}
          className={`${itemClassName} text-red-400 hover:text-red-300`}
        />
        <div className={separatorClassName} />

        {shouldShowArchiveGroup && (
          <>
            <ArchiveGroup />
            <div className={separatorClassName} />
          </>
        )}

        <MenuItem
          label={calculateSizeLabel}
          onClick={() => handleItemClick(onCalculateSize)}
          shortcut="Space"
          disabled={!canCalculateSize}
        />
        {canSetOtherPanelPath && (
          <>
            <div className={separatorClassName} />
            <MenuItem
              label="Set as other panel's path"
              onClick={() => handleItemClick(onSetOtherPanelPath)}
            />
          </>
        )}
        <div className={separatorClassName} />
        <MenuItem
          label="Exit"
          shortcut="F10"
          onClick={async () => {
            try {
              await exitApp();
            } catch (e) {
              console.error("[Menu] Failed to exit:", e);
            }
          }}
        />
      </NavigationMenu.Content>
    </NavigationMenu.Item>
  );
};

const SelectMenu = ({ ...props }) => {
  const {
    onSelectAll,
    onUnselectAll,
    onInvertSelection,
    onQuickSelect,
    onQuickUnselect,
    onQuickFilter,
    onSelectFiles,
    onSelectFolders,
    onSelectZipFiles,
    onUnselectFiles,
    onUnselectFolders,
    onUnselectZipFiles,
    onQuickFilterFiles,
    onQuickFilterFolders,
    onQuickFilterZipFiles,
    onResetQuickFilter,
    handleItemClick,
  } = props;

  return (
    <NavigationMenu.Item value="select">
      <NavigationMenu.Trigger className="px-3 py-1 rounded hover:bg-gray-700">
        Select & Filter
      </NavigationMenu.Trigger>
      <NavigationMenu.Content className="absolute top-full left-0 mt-1 w-72 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-50 text-white font-mono text-sm">
        <MenuItem
          label="Select All"
          shortcut={`${metaKey}+A`}
          onClick={() => handleItemClick(onSelectAll)}
        />
        <MenuItem
          label="Unselect All"
          shortcut={`${metaKey}+D`}
          onClick={() => handleItemClick(onUnselectAll)}
        />
        <MenuItem
          label="Invert Selection"
          shortcut="*"
          onClick={() => handleItemClick(onInvertSelection)}
        />
        <div className={separatorClassName} />
        <MenuItem
          label="Select Files only"
          onClick={() => handleItemClick(onSelectFiles)}
        />
        <MenuItem
          label="Select Folders only"
          onClick={() => handleItemClick(onSelectFolders)}
        />
        <MenuItem
          label="Select Zip Files only"
          onClick={() => handleItemClick(onSelectZipFiles)}
        />
        <div className={separatorClassName} />
        <MenuItem
          label="Unselect Files only"
          onClick={() => handleItemClick(onUnselectFiles)}
        />
        <MenuItem
          label="Unselect Folders only"
          onClick={() => handleItemClick(onUnselectFolders)}
        />
        <MenuItem
          label="Unselect Zip Files only"
          onClick={() => handleItemClick(onUnselectZipFiles)}
        />
        <div className={separatorClassName} />
        <MenuItem
          label="Quick Select"
          shortcut="+"
          onClick={() => handleItemClick(onQuickSelect)}
        />
        <MenuItem
          label="Quick Unselect"
          shortcut="-"
          onClick={() => handleItemClick(onQuickUnselect)}
        />
        <div className={separatorClassName} />
        <MenuItem
          label="Quick Filter"
          shortcut="."
          onClick={() => handleItemClick(onQuickFilter)}
        />
        <MenuItem
          label="Quick Filter Files only"
          onClick={() => handleItemClick(onQuickFilterFiles)}
        />
        <MenuItem
          label="Quick Filter Folders only"
          onClick={() => handleItemClick(onQuickFilterFolders)}
        />
        <MenuItem
          label="Quick Filter Zip Files only"
          onClick={() => handleItemClick(onQuickFilterZipFiles)}
        />
        <MenuItem
          label="Reset Quick Filter"
          onClick={() => handleItemClick(onResetQuickFilter)}
        />
      </NavigationMenu.Content>
    </NavigationMenu.Item>
  );
};

const CommandsMenu = ({
  handleItemClick,
  onSearchActivePanel,
  onSearchOtherPanel,
  onRefreshPanel,
  onRefreshOtherPanel,
  onRefreshBothPanels,
  onTerminal,
  onTerminalOtherPanel,
  onSwapPanels,
  copyAbsolutePaths,
  copyRelativePaths,
}) => {
  const [isCopyPathsSubmenuOpen, setIsCopyPathsSubmenuOpen] = useState(false);
  const [isIncludeSubfoldersSubmenuOpen, setIsIncludeSubfoldersSubmenuOpen] =
    useState(false);
  const [isExcludeSubfoldersSubmenuOpen, setIsExcludeSubfoldersSubmenuOpen] =
    useState(false);
  const [isCopyPathsDownloadSubmenuOpen, setIsCopyPathsDownloadSubmenuOpen] =
    useState(false);

  return (
    <NavigationMenu.Item value="commands">
      <NavigationMenu.Trigger className="px-3 py-1 rounded hover:bg-gray-700">
        Commands
      </NavigationMenu.Trigger>
      <NavigationMenu.Content className="absolute top-full left-0 mt-1 w-72 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-50 text-white font-mono text-sm">
        <MenuItem
          label="Search in active panel"
          shortcut={`${metaKey}+F`}
          onClick={() => handleItemClick(onSearchActivePanel)}
        />
        <MenuItem
          label="Search in other panel"
          onClick={() => handleItemClick(onSearchOtherPanel)}
        />
        <div className={separatorClassName} />

        {/* Copy Paths group */}
        <div
          onMouseEnter={() => setIsCopyPathsSubmenuOpen(true)}
          onMouseLeave={() => setIsCopyPathsSubmenuOpen(false)}
          className="relative"
        >
          <div className={submenuTriggerClassName}>
            <span>Copy Paths to clipboard</span>
            <span className="text-gray-400">&gt;</span>
          </div>
          {isCopyPathsSubmenuOpen && (
            <div className="absolute top-0 left-full mt-[-1px] w-52 bg-gray-800 border border-gray-600 rounded-md shadow-lg text-white font-mono text-sm z-50">
              <div
                onMouseEnter={() => setIsIncludeSubfoldersSubmenuOpen(true)}
                onMouseLeave={() => setIsIncludeSubfoldersSubmenuOpen(false)}
                className="relative"
              >
                <div className={submenuTriggerClassName}>
                  <span>Include Subfolders</span>
                  <span className="text-gray-400">&gt;</span>
                </div>
                {isIncludeSubfoldersSubmenuOpen && (
                  <div className="absolute top-0 left-full mt-[-1px] w-56 bg-gray-800 border border-gray-600 rounded-md shadow-lg text-white font-mono text-sm z-50">
                    <MenuItem
                      label="Copy absolute paths"
                      onClick={() =>
                        handleItemClick(() => copyAbsolutePaths(true))
                      }
                    />
                    <MenuItem
                      label="Copy relative paths"
                      onClick={() =>
                        handleItemClick(() => copyRelativePaths(true))
                      }
                    />
                  </div>
                )}
              </div>
              <div
                onMouseEnter={() => setIsExcludeSubfoldersSubmenuOpen(true)}
                onMouseLeave={() => setIsExcludeSubfoldersSubmenuOpen(false)}
                className="relative"
              >
                <div className={submenuTriggerClassName}>
                  <span>Exclude Subfolders</span>
                  <span className="text-gray-400">&gt;</span>
                </div>
                {isExcludeSubfoldersSubmenuOpen && (
                  <div className="absolute top-0 left-full mt-[-1px] w-56 bg-gray-800 border border-gray-600 rounded-md shadow-lg text-white font-mono text-sm z-50">
                    <MenuItem
                      label="Copy absolute paths"
                      onClick={() =>
                        handleItemClick(() => copyAbsolutePaths(false))
                      }
                    />
                    <MenuItem
                      label="Copy relative paths"
                      onClick={() =>
                        handleItemClick(() => copyRelativePaths(false))
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div
          onMouseEnter={() => setIsCopyPathsDownloadSubmenuOpen(true)}
          onMouseLeave={() => setIsCopyPathsDownloadSubmenuOpen(false)}
          className="relative"
        >
          <div className={submenuTriggerClassName}>
            <span>Copy Paths and download</span>
            <span className="text-gray-400">&gt;</span>
          </div>
          {isCopyPathsDownloadSubmenuOpen && (
            <div className="absolute top-0 left-full mt-[-1px] w-52 bg-gray-800 border border-gray-600 rounded-md shadow-lg text-white font-mono text-sm z-50">
              <div
                onMouseEnter={() => setIsIncludeSubfoldersSubmenuOpen(true)}
                onMouseLeave={() => setIsIncludeSubfoldersSubmenuOpen(false)}
                className="relative"
              >
                <div className={submenuTriggerClassName}>
                  <span>Include Subfolders</span>
                  <span className="text-gray-400">&gt;</span>
                </div>
                {isIncludeSubfoldersSubmenuOpen && (
                  <div className="absolute top-0 left-full mt-[-1px] w-56 bg-gray-800 border border-gray-600 rounded-md shadow-lg text-white font-mono text-sm z-50">
                    <MenuItem
                      label="Absolute paths"
                      onClick={() =>
                        handleItemClick(() => copyAbsolutePaths(true, true))
                      }
                    />
                    <MenuItem
                      label="Relative paths"
                      onClick={() =>
                        handleItemClick(() => copyRelativePaths(true, true))
                      }
                    />
                  </div>
                )}
              </div>
              <div
                onMouseEnter={() => setIsExcludeSubfoldersSubmenuOpen(true)}
                onMouseLeave={() => setIsExcludeSubfoldersSubmenuOpen(false)}
                className="relative"
              >
                <div className={submenuTriggerClassName}>
                  <span>Exclude Subfolders</span>
                  <span className="text-gray-400">&gt;</span>
                </div>
                {isExcludeSubfoldersSubmenuOpen && (
                  <div className="absolute top-0 left-full mt-[-1px] w-56 bg-gray-800 border border-gray-600 rounded-md shadow-lg text-white font-mono text-sm z-50">
                    <MenuItem
                      label="Absolute paths"
                      onClick={() =>
                        handleItemClick(() => copyAbsolutePaths(false, true))
                      }
                    />
                    <MenuItem
                      label="Relative paths"
                      onClick={() =>
                        handleItemClick(() => copyRelativePaths(false, true))
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className={separatorClassName} />
        <MenuItem
          label="Terminal in active panel"
          shortcut="F9"
          onClick={() => handleItemClick(onTerminal)}
        />
        <MenuItem
          label="Terminal in other panel"
          onClick={() => handleItemClick(onTerminalOtherPanel)}
        />
        <div className={separatorClassName} />
        <MenuItem
          label="Refresh active panel"
          onClick={() => handleItemClick(onRefreshPanel)}
        />
        <MenuItem
          label="Refresh other panel"
          onClick={() => handleItemClick(onRefreshOtherPanel)}
        />
        <MenuItem
          label="Refresh both panels"
          onClick={() => handleItemClick(onRefreshBothPanels)}
        />
        <div className={separatorClassName} />
        <MenuItem
          label="Swap panels"
          shortcut={`${metaKey}+U`}
          onClick={() => handleItemClick(onSwapPanels)}
        />
      </NavigationMenu.Content>
    </NavigationMenu.Item>
  );
};

const AppMenu = (props) => {
  const {
    activePanelSelections,
    panels,
    activePanel,
    filter,
    filteredItems,
    onSearchActivePanel,
    onSearchOtherPanel,
    onRefreshPanel,
    onRefreshBothPanels,
    onTerminal,
    onTerminalOtherPanel,
    onRefreshOtherPanel,
    onSwapPanels,
  } = props;

  const [openMenu, setOpenMenu] = useState("");

  const handleItemClick = (action) => {
    if (action) {
      action();
    }
    setOpenMenu("");
  };

  const itemsToConsider = filter[activePanel].pattern
    ? filteredItems[activePanel]
    : panels[activePanel].items;

  const selectedItemsDetails = Array.from(activePanelSelections)
    .map((name) => itemsToConsider.find((item) => item.name === name))
    .filter(Boolean);

  const singleItemSelected = selectedItemsDetails.length === 1;
  const firstSelectedItemDetails = singleItemSelected
    ? selectedItemsDetails[0]
    : null;

  const folderCount = selectedItemsDetails.filter(
    (item) => item.type === "folder"
  ).length;
  const calculateSizeLabel =
    folderCount > 1
      ? `Calculate size of ${folderCount} folders`
      : "Calculate folder size";

  const canCopyToOtherPanel = activePanelSelections.size > 0;
  const canMoveToOtherPanel = activePanelSelections.size > 0;
  const canRename =
    singleItemSelected &&
    firstSelectedItemDetails &&
    firstSelectedItemDetails.name !== "..";
  const canEdit = singleItemSelected && isEditable(firstSelectedItemDetails);
  const canDelete = activePanelSelections.size > 0;
  const canCalculateSize = folderCount > 0;
  const canSetOtherPanelPath =
    singleItemSelected &&
    firstSelectedItemDetails &&
    firstSelectedItemDetails.type === "folder";

  const canPerformArchiveAction =
    singleItemSelected &&
    firstSelectedItemDetails &&
    firstSelectedItemDetails.type === "archive";
  const canDuplicate = activePanelSelections.size > 0;

  const fileMenuProps = {
    ...props,
    canCopyToOtherPanel,
    canMoveToOtherPanel,
    canRename,
    canEdit,
    canDelete,
    canCalculateSize,
    canSetOtherPanelPath,
    canPerformArchiveAction,
    calculateSizeLabel,
    handleItemClick,
    canDuplicate,
    selectedItemsDetails,
  };

  const selectMenuProps = {
    ...props,
    handleItemClick,
  };

  const commandsMenuProps = {
    handleItemClick,
    onSearchActivePanel,
    onSearchOtherPanel,
    onRefreshPanel,
    onRefreshOtherPanel,
    onRefreshBothPanels,
    onTerminal,
    onTerminalOtherPanel,
    onSwapPanels,
    copyAbsolutePaths: props.copyAbsolutePaths,
    copyRelativePaths: props.copyRelativePaths,
  };

  return (
    <NavigationMenu.Root
      value={openMenu}
      onValueChange={setOpenMenu}
      className="relative flex items-center space-x-2 text-sm font-mono"
    >
      <NavigationMenu.List className="flex items-center space-x-2">
        <FileMenu {...fileMenuProps} />
        <SelectMenu {...selectMenuProps} />
        <CommandsMenu {...commandsMenuProps} />
      </NavigationMenu.List>
    </NavigationMenu.Root>
  );
};

export default AppMenu;
