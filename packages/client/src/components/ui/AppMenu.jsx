import React, { useState, useEffect, useRef } from "react";
import { isMac } from "../../lib/utils";

const MenuItem = ({ label, shortcut, onClick, disabled = false }) => (
  <li
    onClick={!disabled ? onClick : undefined}
    className={`px-4 py-2 flex justify-between ${
      disabled
        ? "text-gray-500 cursor-not-allowed"
        : "hover:bg-sky-600 cursor-pointer"
    }`}
  >
    <span>{label}</span>
    {shortcut && <span className="text-gray-400">{shortcut}</span>}
  </li>
);

const Separator = () => (
  <div className="border-t border-gray-600 mx-2 my-1"></div>
);

const AppMenu = ({
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
  activePanelSelections,
  panels,
  activePanel,
}) => {
  const [openMenu, setOpenMenu] = useState(null);
  const menuRef = useRef(null);

  const metaKey = isMac ? "CMD" : "Ctrl";

  const toggleMenu = (menu) => {
    setOpenMenu(openMenu === menu ? null : menu);
  };

  const handleMenuHover = (menu) => {
    if (openMenu) {
      setOpenMenu(menu);
    }
  };

  const handleItemClick = (action) => {
    if (action) {
      action();
    }
    setOpenMenu(null);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedNames = [...activePanelSelections];
  const selectedItemsDetails = selectedNames
    .map((name) => panels[activePanel].items.find((i) => i.name === name))
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
  const canRename =
    singleItemSelected &&
    firstSelectedItemDetails &&
    firstSelectedItemDetails.name !== "..";
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

  const onPlaceholder = () =>
    console.log("This feature will be implemented soon!");

  return (
    <nav
      ref={menuRef}
      className="relative flex items-center space-x-2 text-sm font-mono"
    >
      <div className="relative">
        <button
          onClick={() => toggleMenu("file")}
          onMouseEnter={() => handleMenuHover("file")}
          className={`px-3 py-1 rounded ${
            openMenu === "file" ? "bg-sky-700" : "hover:bg-gray-700"
          }`}
        >
          File
        </button>
        {openMenu === "file" && (
          <div className="absolute top-full left-0 mt-1 w-80 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-50 text-white">
            <ul className="py-1">
              <MenuItem
                label="Copy to other panel"
                shortcut="F5"
                onClick={() => handleItemClick(onCopyToOtherPanel)}
                disabled={!canCopyToOtherPanel}
              />
              <MenuItem
                label="Copy to clipboard"
                shortcut={`${metaKey}+C`}
                onClick={() => handleItemClick(onPlaceholder)}
                disabled
              />
              <MenuItem
                label="Copy to ..."
                onClick={() => handleItemClick(onPlaceholder)}
                disabled
              />
              <Separator />
              <MenuItem
                label="Move to other panel"
                shortcut="F6"
                onClick={() => handleItemClick(onPlaceholder)}
                disabled
              />
              <MenuItem
                label="Move (Cut) to clipboard"
                shortcut={`${metaKey}+X`}
                onClick={() => handleItemClick(onPlaceholder)}
                disabled
              />
              <MenuItem
                label="Move to ..."
                onClick={() => handleItemClick(onPlaceholder)}
                disabled
              />
              <Separator />
              <MenuItem
                label="Rename"
                shortcut="F2"
                onClick={() => handleItemClick(onRename)}
                disabled={!canRename}
              />
              <MenuItem
                label="Delete"
                shortcut="F8"
                onClick={() => handleItemClick(onDelete)}
                disabled={!canDelete}
              />
              <Separator />
              {activePanelSelections.size > 0 && !canPerformArchiveAction && (
                <>
                  <MenuItem
                    label="Compress in active panel"
                    onClick={() => handleItemClick(onCompressInActivePanel)}
                  />
                  <MenuItem
                    label="Compress to other panel"
                    onClick={() => handleItemClick(onCompressToOtherPanel)}
                  />
                  <Separator />
                </>
              )}
              {canPerformArchiveAction && (
                <>
                  <MenuItem
                    label="Decompress in active panel"
                    onClick={() => handleItemClick(onDecompressInActivePanel)}
                  />
                  <MenuItem
                    label="Decompress to other panel"
                    onClick={() => handleItemClick(onDecompressToOtherPanel)}
                  />
                  <MenuItem
                    label="Test Archive"
                    onClick={() => handleItemClick(onTestArchive)}
                  />
                  <Separator />
                </>
              )}
              <MenuItem
                label={calculateSizeLabel}
                onClick={() => handleItemClick(onCalculateSize)}
                disabled={!canCalculateSize}
              />
              {canSetOtherPanelPath && (
                <>
                  <Separator />
                  <MenuItem
                    label="Set as other panel's path"
                    onClick={() => handleItemClick(onSetOtherPanelPath)}
                  />
                </>
              )}
              <Separator />
              <MenuItem
                label="Refresh active panel"
                onClick={() => handleItemClick(onRefreshPanel)}
              />
              <MenuItem
                label="Refresh both panels"
                onClick={() => handleItemClick(onRefreshBothPanels)}
              />
            </ul>
          </div>
        )}
      </div>
      <div className="relative">
        <button
          onClick={() => toggleMenu("select")}
          onMouseEnter={() => handleMenuHover("select")}
          className={`px-3 py-1 rounded ${
            openMenu === "select" ? "bg-sky-700" : "hover:bg-gray-700"
          }`}
        >
          Select
        </button>
        {openMenu === "select" && (
          <div className="absolute top-full left-0 mt-1 w-60 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-50 text-white">
            <ul className="py-1">
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
              <Separator />
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
              <Separator />
              <MenuItem
                label="Quick Filter"
                shortcut="."
                onClick={() => handleItemClick(onQuickFilter)}
              />
            </ul>
          </div>
        )}
      </div>
    </nav>
  );
};

export default AppMenu;
