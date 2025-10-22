import React from "react";
import { LoaderCircle } from "lucide-react";
import { formatBytes } from "../../lib/utils";

const ZipUpdateProgressModal = (zipUpdateProgressModal) => {
  const {
    isVisible,
    filePathInZip,
    zipFilePath,
    originalZipSize,
    onCancel,
    itemType = "file",
    title = "Updating Zip Archive...",
    operationDescription,
  } = zipUpdateProgressModal;
  if (!isVisible) return null;

  const itemLabel = itemType === "folder" ? "Folder" : "File";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl border border-sky-500 text-white font-mono">
        <h2 className="text-xl font-bold text-sky-400 mb-4 flex items-center">
          <LoaderCircle className="w-6 h-6 mr-2 animate-spin text-sky-400" />
          {title}
        </h2>
        {filePathInZip && (
          <p className="text-gray-400 mb-2">
            {itemLabel}: <span className="text-sky-300">{filePathInZip}</span>
          </p>
        )}
        {operationDescription && (
          <p className="text-gray-400 mb-2">{operationDescription}</p>
        )}
        <p className="text-gray-400 mb-2">
          Archive: <span className="text-sky-300">{zipFilePath}</span>
        </p>
        {originalZipSize > 0 && (
          <p className="text-gray-400 mb-4">
            Original Size:{" "}
            <span className="text-sky-300">{formatBytes(originalZipSize)}</span>
          </p>
        )}
        <p className="text-gray-400">
          Please wait while the zip file is being updated. The larger the
          original archive, the longer this process may take.
        </p>
        <div className="flex justify-end mt-4">
          <button
            onClick={onCancel}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg flex items-center"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ZipUpdateProgressModal;
