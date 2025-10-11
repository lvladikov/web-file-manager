import React, { useState } from "react";
import {
  LoaderCircle,
  XCircle,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

const ArchiveTestIntegrityProgressModal = ({
  isVisible,
  currentFile,
  totalFiles,
  testedFiles,
  report,
  error,
  onCancel,
  onClose,
}) => {
  const [modalOpacity, setModalOpacity] = useState(1);
  if (!isVisible) return null;

  const isFinished = !!report || !!error;
  const hasFailures = !!error;
  const progressPercentage =
    totalFiles > 0 ? (testedFiles / totalFiles) * 100 : 0;

  const renderTitle = () => {
    if (isFinished) {
      return hasFailures ? "Test Complete: Issues Found" : "Test Complete: OK";
    }
    return "Testing Archive Integrity...";
  };

  const renderIcon = () => {
    if (isFinished) {
      return hasFailures ? (
        <AlertTriangle className="w-6 h-6 mr-2 text-red-500" />
      ) : (
        <CheckCircle2 className="w-6 h-6 mr-2 text-green-500" />
      );
    }
    return <LoaderCircle className="w-6 h-6 mr-2 animate-spin text-sky-400" />;
  };

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
          onMouseLeave={() => setModalOpacity(1)}
          title="Click and hold here for this dialog to be almost fully transparent."
        >
          {renderIcon()}
          {renderTitle()}
        </h2>

        {!isFinished && (
          <div className="text-gray-400 bg-gray-900 p-3 rounded-md mb-4 break-all">
            <p className="text-sm">Testing File:</p>
            <p
              className="font-mono text-gray-300 mb-2 w-full truncate overflow-hidden whitespace-nowrap"
              title={currentFile}
            >
              {currentFile}
            </p>
            <div className="w-full bg-gray-700 rounded-full h-2.5 mt-2">
              <div
                className="bg-sky-500 h-2.5 rounded-full"
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
            <div className="flex justify-between items-center text-sm text-gray-400 mt-1">
              <span>{progressPercentage.toFixed(1)}%</span>
              <span>
                {testedFiles} / {totalFiles} Files
              </span>
            </div>
          </div>
        )}

        {isFinished && (
          <div className="text-gray-300 space-y-4 mb-6">
            {hasFailures ? (
              <div className="bg-red-900/50 border border-red-700 rounded-md p-3">
                <p className="text-red-300 font-bold mb-3">{error.title}</p>
                <div className="max-h-60 overflow-y-auto space-y-3">
                  {error.generalError && (
                    <div>
                      <h4 className="font-semibold text-gray-200 text-sm">
                        General Archive Error:
                      </h4>
                      <pre className="mt-1 text-sm text-gray-400 whitespace-pre-wrap font-mono bg-gray-900 p-2 rounded">
                        {error.generalError}
                      </pre>
                    </div>
                  )}
                  {error.fileErrors && error.fileErrors.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-gray-200 text-sm">
                        File-Specific Errors:
                      </h4>
                      <ul className="space-y-2 text-sm mt-1">
                        {error.fileErrors.map((failure, index) => (
                          <li key={index} className="bg-gray-900 p-2 rounded">
                            <p className="font-semibold text-gray-200">
                              {failure.fileName}
                            </p>
                            <pre className="text-xs text-gray-400 pl-2 border-l-2 border-gray-600 ml-2 mt-1 whitespace-pre-wrap font-mono">
                              {failure.message}
                            </pre>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-green-400 bg-green-900/50 border border-green-700 rounded-md p-3">
                All {report.totalFiles} files passed the integrity check.
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end">
          {isFinished ? (
            <button
              onClick={onClose}
              className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-6 rounded-lg flex items-center"
            >
              Close
            </button>
          ) : (
            <button
              onClick={onCancel}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg flex items-center"
            >
              <XCircle className="w-5 h-5 mr-2" /> Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ArchiveTestIntegrityProgressModal;
