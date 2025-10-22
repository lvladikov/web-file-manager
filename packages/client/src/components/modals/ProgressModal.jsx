import React, { useState } from "react";

import { Copy, XCircle, Search, Move, CopyCheck } from "lucide-react";
import { formatBytes, formatSpeed } from "../../lib/utils";
import TruncatedText from "../ui/TruncatedText";

const ProgressModal = ({
  isVisible,
  status,
  copied,
  total,
  currentFile,
  currentFileBytesProcessed,
  currentFileSize,
  startTime,
  lastUpdateTime,
  onCancel,
  isMove,
  isDuplicate,
  isZipAdd,
  tempZipSize,
  originalZipSize,
}) => {
  const [modalOpacity, setModalOpacity] = useState(1);
  if (!isVisible) return null;

  const percent = total > 0 ? Math.round((copied / total) * 100) : 0;
  const currentFileProgressPercentage =
    currentFileSize > 0
      ? (currentFileBytesProcessed / currentFileSize) * 100
      : 0;
  const isScanning = status === "scanning";
  const operation = isMove ? "Move" : isDuplicate ? "Duplicate" : "Copy";

  const calculateSpeed = () => {
    if (!startTime || !lastUpdateTime || copied === 0) return "0 B/s";
    const elapsedTimeInSeconds = (lastUpdateTime - startTime) / 1000;
    if (elapsedTimeInSeconds <= 0) return "0 B/s";
    const speed = copied / elapsedTimeInSeconds;
    return formatSpeed(speed);
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      style={{ opacity: modalOpacity }}
    >
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl border border-sky-500">
        <div
          className="flex items-center mb-4 cursor-pointer"
          onMouseDown={() => setModalOpacity(0.2)}
          onMouseUp={() => setModalOpacity(1)}
          onMouseLeave={() => setModalOpacity(1)} // Reset if mouse leaves while held down
          title="Click and hold here for this dialog to be almost fully transparent so you can see the panels behind. Release and it would restore full visibility. This won't interrupt the ongoing operation"
        >
          {isScanning ? (
            <Search className="w-8 h-8 text-sky-400 mr-3 animate-pulse" />
          ) : isMove ? (
            <Move className="w-8 h-8 text-sky-400 mr-3 animate-pulse" />
          ) : isDuplicate ? (
            <CopyCheck className="w-8 h-8 text-sky-400 mr-3 animate-pulse" />
          ) : (
            <Copy className="w-8 h-8 text-sky-400 mr-3 animate-pulse" />
          )}
          <h3 className="text-xl font-bold text-sky-400">
            {isScanning
              ? `Preparing to ${operation}...`
              : `${
                  operation === "Move"
                    ? "Moving"
                    : operation === "Duplicate"
                    ? "Duplicating"
                    : "Copying"
                } in Progress...`}
          </h3>
        </div>

        {/* Display rebuilt ZIP size if it's a zip-add operation */}
        {isZipAdd &&
          status === "copying" &&
          (tempZipSize > 0 || originalZipSize > 0) && (
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
                </div>{" "}
              </div>{" "}
            </div>
          )}

        <div className="text-gray-400 bg-gray-900 p-3 rounded-md mb-4 break-all">
          <p className="text-sm">
            {isScanning ? "Scanning:" : "Overall Progress:"}
          </p>
          {status === "copying" && (
            <div className="text-gray-300 space-y-2 mt-2">
              <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
                <div
                  className="bg-sky-500 h-4 rounded-full"
                  style={{
                    width: `${percent}%`,
                    transition: "width 0.1s linear",
                  }}
                ></div>
              </div>
              <div className="flex justify-between items-center text-sm font-mono">
                <span>{percent}%</span>
                <span>
                  {formatBytes(copied)} / {formatBytes(total)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* The progress bar is only shown during the copying phase */}
        {status === "copying" && currentFileSize > 0 && (
          <div className="text-gray-400 bg-gray-900 p-3 rounded-md mb-4 break-all">
            <p className="text-sm">Current File Progress:</p>
            <span title={currentFile}>
              <TruncatedText
                text={currentFile}
                className="font-mono text-gray-300 mb-2"
              />
            </span>
            <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className="bg-blue-400 h-3 rounded-full"
                style={{
                  width: `${currentFileProgressPercentage}%`,
                  transition: "width 0.1s linear",
                }}
              ></div>
            </div>
            <p className="flex justify-between items-center text-sm text-gray-400 mt-1">
              <span>{currentFileProgressPercentage.toFixed(1)}%</span>
              <span>
                {formatBytes(currentFileBytesProcessed)} /{" "}
                {formatBytes(currentFileSize)} ({calculateSpeed()})
              </span>
            </p>

            {isZipAdd && (
              <p className="text-yellow-400 text-sm mb-4 mt-4">
                Note: Speed may appear slower because the ZIP file is being
                rebuilt in the background.
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={onCancel}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg flex items-center"
          >
            <XCircle className="w-5 h-5 mr-2" /> Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProgressModal;
