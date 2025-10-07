import { useEffect, useRef } from "react";
import { ShieldAlert } from "lucide-react";

const DeleteConfirmModal = ({
  isVisible,
  targetItems,
  summary,
  onConfirm,
  onCancel,
}) => {
  const cancelButtonRef = useRef(null);

  useEffect(() => {
    if (isVisible) {
      cancelButtonRef.current?.focus();
    }
  }, [isVisible]);

  if (!isVisible || !targetItems || targetItems.length === 0) {
    return null;
  }

  const isMultiSelect = targetItems.length > 1;
  const singleItem = isMultiSelect ? null : targetItems[0];

  // --- Logic to calculate top-level counts for improved summary ---
  const topLevelFileCount = targetItems.filter(
    (i) => i.type !== "folder"
  ).length;
  const topLevelFolderCount = targetItems.length - topLevelFileCount;
  const hasFoldersInSelection = topLevelFolderCount > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-red-600 rounded-lg shadow-xl p-6 w-full max-w-lg text-gray-200">
        <h3 className="text-xl font-bold text-red-400 mb-4 flex items-center">
          <ShieldAlert className="w-6 h-6 mr-2" /> Confirm Deletion
        </h3>

        {isMultiSelect ? (
          <p className="mb-3">
            Are you sure you want to delete these{" "}
            <span className="font-bold text-white">{targetItems.length}</span>{" "}
            selected items?
          </p>
        ) : (
          <p className="mb-3">
            Are you sure you want to delete
            <span className="font-mono text-white"> {singleItem.name}</span>?
          </p>
        )}

        {summary && (summary.folders > 0 || summary.files > 0) && (
          <div className="bg-gray-900 border border-gray-700 rounded-md p-3 mb-4">
            {hasFoldersInSelection ? (
              <>
                <p className="text-sm text-yellow-400 mb-2">
                  This will permanently delete the selected root items:
                </p>
                <ul className="list-disc list-inside text-sm text-gray-300">
                  {topLevelFolderCount > 0 && (
                    <li>
                      <span className="font-bold">{topLevelFolderCount}</span>{" "}
                      folder{topLevelFolderCount !== 1 ? "s" : ""}
                    </li>
                  )}
                  {topLevelFileCount > 0 && (
                    <li>
                      <span className="font-bold">{topLevelFileCount}</span>{" "}
                      file{topLevelFileCount !== 1 ? "s" : ""}
                    </li>
                  )}
                </ul>
                <p className="text-sm text-yellow-400 mt-3 mb-2 pt-2 border-t border-gray-600">
                  Including contents from all subfolders, for a total of:
                </p>
                <ul className="list-disc list-inside text-sm text-gray-300">
                  {summary.folders > 0 && (
                    <li>
                      <span className="font-bold">{summary.folders}</span>{" "}
                      folder{summary.folders !== 1 ? "s" : ""}
                    </li>
                  )}
                  {summary.files > 0 && (
                    <li>
                      <span className="font-bold">{summary.files}</span> file
                      {summary.files !== 1 ? "s" : ""}
                    </li>
                  )}
                </ul>
              </>
            ) : (
              <>
                {/* Fallback to the simpler summary for file-only selections */}
                <p className="text-sm text-yellow-400 mb-2">
                  This will permanently delete the following:
                </p>
                <ul className="list-disc list-inside text-sm text-gray-300">
                  {summary.files > 0 && (
                    <li>
                      <span className="font-bold">{summary.files}</span> file
                      {summary.files !== 1 ? "s" : ""}
                    </li>
                  )}
                </ul>
              </>
            )}
          </div>
        )}

        <div className="flex justify-end space-x-3 mt-4">
          <button
            ref={cancelButtonRef}
            id="delete-cancel-button"
            onClick={onCancel}
            className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            Cancel
          </button>
          <button
            id="delete-confirm-button"
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;
