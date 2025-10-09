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
}) => {
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

  return (
    <div
      style={{ top: y, left: x }}
      className="absolute z-50 bg-gray-700 border border-gray-500 rounded-md shadow-lg text-white font-mono text-sm divide-y divide-gray-600"
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
      </ul>
      <ul className="py-1">
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
          Copy (to clipboard)
        </li>
        <li
          onClick={onPlaceholder}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer text-gray-400"
        >
          Cut (to clipboard)
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
      </ul>
      <ul className="py-1">
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
      </ul>
      {/* Show Folder Tools section if at least one folder is selected */}
      {folderCount > 0 && (
        <ul className="py-1">
          <li
            onClick={onCalculateSize}
            className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
          >
            {calculateSizeLabel}
          </li>
          {/* "Set Path" only makes sense for a single selected folder */}
          {count === 1 && firstItem.type === "folder" && (
            <>
              <div className="border-t border-gray-600 mx-2 my-1"></div>
              <li
                onClick={onSetOtherPanelPath}
                className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
              >
                Set as other panel's path
              </li>
            </>
          )}
        </ul>
      )}
      <ul className="py-1">
        <li
          onClick={onRefreshPanel}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
        >
          Refresh this panel
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
