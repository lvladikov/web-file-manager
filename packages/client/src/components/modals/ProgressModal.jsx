import React, { useState } from "react";
import { Copy, XCircle, Search, Move, CopyCheck } from "lucide-react";
import { formatBytes, formatSpeed, matchZipPath } from "../../lib/utils";
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
  isZipDuplicate,
  sources,
  sourceCount,
}) => {
  const [modalOpacity, setModalOpacity] = useState(1);
  if (!isVisible) return null;

  const isScanning = status === "scanning";
  const isZipDuplicateOperation = isDuplicate && isZipDuplicate;
  const operation = isMove
    ? "Move"
    : isZipDuplicateOperation
    ? "Duplicate"
    : "Copy";
  const operationTitleVerb = isScanning
    ? "Preparing to"
    : isMove
    ? "Moving"
    : isZipDuplicateOperation
    ? "Duplicating"
    : "Copying";

  // Calculations for standard progress
  const percent = total > 0 ? Math.round((copied / total) * 100) : 0;
  const currentFileProgressPercentage =
    currentFileSize > 0
      ? (currentFileBytesProcessed / currentFileSize) * 100
      : 0;

  const calculateSpeed = () => {
    if (isScanning || !startTime || !lastUpdateTime || copied === 0)
      return "0 B/s"; // Don't calc speed during scan
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
          onMouseLeave={() => setModalOpacity(1)}
          title="Click and hold here for this dialog to be almost fully transparent..."
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
              : `${operationTitleVerb}${
                  isZipAdd || isZipDuplicateOperation ? " (inside zip)" : ""
                } in Progress...`}
          </h3>
        </div>

        {/* Zip Add or Zip Duplicate */}
        {(isZipAdd || isZipDuplicateOperation) && status === "copying" && (
          <>
            {/* Indeterminate Bar and Size Info */}
            {(tempZipSize > 0 || originalZipSize > 0) && (
              <div className="text-gray-400 bg-gray-900 p-3 rounded-md mb-4 break-all">
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

            <div className="text-gray-400 bg-gray-900 p-3 rounded-md mb-4 break-all space-y-3">
              {isZipDuplicateOperation && sourceCount > 0 && (
                <p className="text-gray-400">
                  Duplicating {sourceCount} item{sourceCount > 1 ? "s" : ""}...
                </p>
              )}
              {isZipAdd && sourceCount > 0 && (
                <p className="text-gray-400">
                  Adding {sourceCount} item{sourceCount > 1 ? "s" : ""} to
                  zip...
                </p>
              )}

              {currentFile && currentFile !== "Initializing..." && (
                <div className="flex items-center text-gray-400">
                  <span className="inline-block whitespace-nowrap mr-1 flex-shrink-0">
                    Processing:
                  </span>
                  <div className="text-sky-300 inline-block min-w-0 flex-1">
                    <TruncatedText
                      text={currentFile}
                      className="font-mono text-gray-300"
                    />
                  </div>
                </div>
              )}

              {sources && sources.length > 0 && matchZipPath(sources[0]) && (
                <div
                  className="text-gray-400 flex items-center"
                  title={matchZipPath(sources[0])[1]}
                >
                  <span className="inline-block whitespace-nowrap mr-1 flex-shrink-0">
                    Archive:
                  </span>
                  <div className="text-sky-300 inline-block min-w-0 flex-1">
                    <TruncatedText
                      text={matchZipPath(sources[0])[1]}
                      className="font-mono text-gray-300"
                    />
                  </div>
                </div>
              )}

              <p className="text-gray-400 [word-break:break-word] pt-3 border-t border-gray-700 mt-3">
                Please wait while the zip file is being updated. The larger the
                original archive or the items being added/duplicated, the longer
                this process may take.
              </p>
            </div>
          </>
        )}

        {/* Standard FS Copy/Move/Duplicate (or Scanning Phase) */}
        {!isZipAdd && !isZipDuplicateOperation && (
          <>
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
              {isScanning &&
                currentFile &&
                currentFile !== "Initializing..." && (
                  <div className="mt-2 pt-2 border-t border-gray-700 flex items-center text-sm">
                    <span className="mr-1 flex-shrink-0">Scanning:</span>
                    <div className="min-w-0 flex-1">
                      <TruncatedText
                        text={currentFile}
                        className="font-mono text-gray-300 inline-block"
                      />
                    </div>
                  </div>
                )}
            </div>

            {/* Current File Progress (only during copying, not scanning, not zip ops) */}
            {status === "copying" && currentFileSize > 0 && (
              <div className="text-gray-400 bg-gray-900 p-3 rounded-md mb-4 break-all">
                <div className="text-sm">Current File Progress:</div>
                <div>
                  <TruncatedText
                    text={currentFile}
                    className="font-mono text-gray-300 mb-2"
                  />
                </div>
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
              </div>
            )}
          </>
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
