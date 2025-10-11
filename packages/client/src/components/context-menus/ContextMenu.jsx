import { isMac } from "../../lib/utils.js";
import { useEffect, useRef, useState } from "react";

const ContextMenu = ({
  x,
  y,
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
}) => {
  const menuRef = useRef(null);
  const [maxHeight, setMaxHeight] = useState("none");

  useEffect(() => {
    if (menuRef.current) {
      const menuHeight = menuRef.current.offsetHeight;
      const windowHeight = window.innerHeight;
      if (y + menuHeight > windowHeight) {
        setMaxHeight(`${windowHeight - y - 20}px`);
      }
    }
  }, [y]);

  if (!targetItems || targetItems.length === 0) return null;

  const count = targetItems.length;
  const isMultiSelect = count > 1;
  const firstItem = targetItems[0];

  // Analyze the selection
  const types = new Set(
    targetItems.map((item) => (item.type === "folder" ? "folder" : "file"))
  );
  const hasFolders = types.has("folder");
  const hasFiles = types.has("file");
  const isMixed = hasFolders && hasFiles;
  const isAllFolders = hasFolders && !hasFiles;

  // Count only the folders for folder-specific actions
  const folderCount = targetItems.filter(
    (item) => item.type === "folder"
  ).length;

  // Generate dynamic labels
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

  // Placeholder functions for future features
  const onPlaceholder = () => alert("This feature will be implemented soon!");

  const metaKey = isMac ? "CMD" : "Ctrl";

  return (
    <div
      ref={menuRef}
      style={{ top: y, left: x, maxHeight }}
      className="absolute z-50 bg-gray-700 border border-gray-500 rounded-md shadow-lg text-white font-mono text-sm overflow-y-auto"
    >
      <ul className="py-1">
        {!isMultiSelect && isPreviewable && (
          <li
            onClick={onPreview}
            className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
          >
            Preview (Space)
          </li>
        )}
        {!isMultiSelect && (
          <li
            onClick={onOpen}
            className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
          >
            Open (Enter)
          </li>
        )}
        {!isMultiSelect && firstItem.type !== "folder" && (
          <li
            onClick={onOpenWith}
            className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
          >
            Open with...
          </li>
        )}

        {!isMultiSelect && (
          <div className="border-t border-gray-600 mx-2 my-1"></div>
        )}

        <li
          onClick={onCopyToOtherPanel}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
        >
          Copy to other panel (F5)
        </li>
        <li
          onClick={onPlaceholder}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer text-gray-400"
        >
          Copy to clipboard ({metaKey}+C)
        </li>
        <li
          onClick={onPlaceholder}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer text-gray-400"
        >
          Move (Cut) to clipboard ({metaKey}+X)
        </li>
        <li
          onClick={onPlaceholder}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer text-gray-400"
        >
          Move to other panel (F6)
        </li>
        <li
          onClick={onPlaceholder}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer text-gray-400"
        >
          Move to...
        </li>

        <div className="border-t border-gray-600 mx-2 my-1"></div>

        {!isMultiSelect && (
          <li
            onClick={onRename}
            className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
          >
            Rename (F2)
          </li>
        )}
        <li
          onClick={onDelete}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer text-red-400 hover:text-red-300"
        >
          {deleteLabel} (F8)
        </li>

        <div className="border-t border-gray-600 mx-2 my-1"></div>

        {!isMultiSelect && firstItem.type === "archive" ? (
          <>
            <li
              onClick={onDecompressInActivePanel}
              className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
            >
              Decompress in active panel
            </li>
            <li
              onClick={onDecompressToOtherPanel}
              className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
            >
              Decompress to other panel
            </li>
            <li
              onClick={onTestArchive}
              className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
            >
              Test Archive
            </li>
          </>
        ) : count > 0 ? (
          <>
            <li
              onClick={onCompressInActivePanel}
              className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
            >
              Compress in active panel
            </li>
            <li
              onClick={onCompressToOtherPanel}
              className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
            >
              Compress to other panel
            </li>
          </>
        ) : null}

        {folderCount > 0 && (
          <>
            <div className="border-t border-gray-600 mx-2 my-1"></div>
            <li
              onClick={onCalculateSize}
              className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
            >
              {calculateSizeLabel}
            </li>
            {count === 1 && firstItem.type === "folder" && (
              <li
                onClick={onSetOtherPanelPath}
                className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
              >
                Set as other panel's path
              </li>
            )}
          </>
        )}

        <div className="border-t border-gray-600 mx-2 my-1"></div>

        <li
          onClick={onSelectAll}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer flex justify-between"
        >
          <span>Select All</span>
          <span className="text-gray-400">{metaKey}+A</span>
        </li>
        <li
          onClick={onUnselectAll}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer flex justify-between"
        >
          <span>Unselect All</span>
          <span className="text-gray-400">{metaKey}+D</span>
        </li>
        <li
          onClick={onInvertSelection}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer flex justify-between"
        >
          <span>Invert Selection</span>
          <span className="text-gray-400">*</span>
        </li>

        <div className="border-t border-gray-600 mx-2 my-1"></div>

        <li
          onClick={onQuickSelect}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer flex justify-between"
        >
          <span>Quick Select</span>
          <span className="text-gray-400">+</span>
        </li>
        <li
          onClick={onQuickUnselect}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer flex justify-between"
        >
          <span>Quick Unselect</span>
          <span className="text-gray-400">-</span>
        </li>

        <div className="border-t border-gray-600 mx-2 my-1"></div>

        <li
          onClick={onQuickFilter}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer flex justify-between"
        >
          <span>Quick Filter</span>
          <span className="text-gray-400">.</span>
        </li>

        <div className="border-t border-gray-600 mx-2 my-1"></div>

        <li
          onClick={onRefreshPanel}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
        >
          Refresh active panel
        </li>
        <li
          onClick={onRefreshBothPanels}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
        >
          Refresh both panels
        </li>
      </ul>
    </div>
  );
};

export default ContextMenu;
