import React from "react";
import { LoaderCircle } from "lucide-react";
import { formatBytes } from "../../lib/utils";
import TruncatedText from "../ui/TruncatedText";

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
    tempZipSize,
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

        {(originalZipSize > 0 || tempZipSize > 0) && (
          <div className="text-gray-400 bg-gray-900 p-3 rounded-md mb-4 break-all">
            {/* Indeterminate Progress Bar */}
            <div className="w-full bg-gray-700 rounded-full h-2.5 mb-2 overflow-hidden relative">
              <div className="absolute inset-0 bg-sky-500 rounded-full animate-pulse-indeterminate"></div>
            </div>
            <div className="flex justify-between text-sm">
              <div>
                <p>Original Zip Size:</p>
                <p className="font-bold text-sky-300">
                  {formatBytes(originalZipSize)}
                </p>
              </div>
              <div className="text-right">
                <p>Updated Zip Size:</p>
                <p className="font-bold text-sky-300">
                  {formatBytes(tempZipSize)}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="text-gray-400 bg-gray-900 p-3 rounded-md mb-4 break-all">
          {filePathInZip && (
            <p className="text-gray-400 mb-2">
              {itemLabel}: <span className="text-sky-300">{filePathInZip}</span>
            </p>
          )}
          {operationDescription && (
            <p className="text-gray-400 mb-2">{operationDescription}</p>
          )}
          <div
            className="text-gray-400 mb-2 mt-4 flex items-center"
            title={zipFilePath}
          >
            <span className="inline-block whitespace-nowrap">Archive:</span>
            <TruncatedText text={zipFilePath} className="text-sky-300 ml-1" />
          </div>
          <p className="text-gray-400 text-sm [word-break:break-word] mt-4">
            Please wait while the zip file is being updated. The larger the
            original archive or the new items being added or updated, the longer
            this process may take.
          </p>
        </div>
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
