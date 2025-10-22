import React, { useState } from "react";
import { LoaderCircle, XCircle } from "lucide-react";
import { formatBytes, formatSpeed } from "../../lib/utils";
import TruncatedText from "../ui/TruncatedText";

const CompressionProgressModal = ({
  isVisible,
  currentFile,
  totalBytes,
  processedBytes,
  currentFileTotalSize,
  currentFileBytesProcessed,
  instantaneousSpeed,
  onCancel,
  error,
}) => {
  const [modalOpacity, setModalOpacity] = useState(1);
  if (!isVisible) return null;

  const progressPercentage =
    typeof processedBytes === "number" &&
    typeof totalBytes === "number" &&
    totalBytes > 0
      ? (processedBytes / totalBytes) * 100
      : 0;
  const currentFileProgressPercentage =
    currentFileTotalSize > 0
      ? (currentFileBytesProcessed / currentFileTotalSize) * 100
      : 0;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
      style={{ opacity: modalOpacity }}
    >
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl border border-sky-500 text-white font-mono">
        <h2
          className="text-xl font-bold text-sky-400 mb-4 flex items-center cursor-pointer"
          onMouseDown={() => setModalOpacity(0.2)}
          onMouseUp={() => setModalOpacity(1)}
          onMouseLeave={() => setModalOpacity(1)} // Reset if mouse leaves while held down
          title="Click and hold here for this dialog to be almost fully transparent so you can see the panels behind. Release and it would restore full visibility."
        >
          {error ? (
            <XCircle className="w-6 h-6 mr-2 text-red-500" />
          ) : (
            <LoaderCircle className="w-6 h-6 mr-2 animate-spin text-sky-400" />
          )}
          {error ? "Compression Error" : "Compressing Items..."}
        </h2>

        {error ? (
          <p className="text-red-400 mb-4">{error}</p>
        ) : (
          <>
            <div className="text-gray-400 bg-gray-900 p-3 rounded-md mb-4 break-all">
              <p className="text-sm">Overall Progress:</p>
              <div className="w-full bg-gray-700 rounded-full h-2.5 mt-2">
                <div
                  className="bg-sky-500 h-2.5 rounded-full"
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center text-sm text-gray-400 mt-1">
                <span>{progressPercentage.toFixed(1)}%</span>
                <span>
                  {formatBytes(processedBytes)} / {formatBytes(totalBytes)}
                </span>
              </div>
            </div>

            {currentFileTotalSize > 0 && (
              <div className="text-gray-400 bg-gray-900 p-3 rounded-md mb-4 break-all">
                <p className="text-sm">Current File Progress:</p>
                <span title={currentFile}>
                  <TruncatedText
                    text={currentFile || "Scanning..."}
                    className="font-mono text-gray-300 mb-2"
                  />
                </span>
                <div className="w-full bg-gray-700 rounded-full h-2.5 mt-2">
                  <div
                    className="bg-blue-400 h-2.5 rounded-full"
                    style={{ width: `${currentFileProgressPercentage}%` }}
                  ></div>
                </div>
                <div className="flex justify-between items-center text-sm text-gray-400 mt-1">
                  <span>{currentFileProgressPercentage.toFixed(1)}%</span>
                  <span>
                    {formatBytes(currentFileBytesProcessed)} /{" "}
                    {formatBytes(currentFileTotalSize)} (
                    {formatSpeed(instantaneousSpeed)})
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end">
          <button
            onClick={onCancel}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg flex items-center"
          >
            {error ? <XCircle className="w-5 h-5 mr-2" /> : null}{" "}
            {error ? "Close" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompressionProgressModal;
