import React, { useState, useEffect } from "react";
import { LoaderCircle, XCircle } from "lucide-react";
import TruncatedText from "../ui/TruncatedText";
import { isVerboseLogging } from "../../lib/utils";

const CopyPathsProgressModal = ({
  isVisible,
  currentPath,
  count,
  onCancel,
  mode,
}) => {
  const [modalOpacity, setModalOpacity] = useState(1);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    if (isVisible) {
      document.addEventListener("keydown", handleEscape);
    } else {
      document.removeEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isVisible, onCancel]);

  useEffect(() => {
    try {
      if (isVisible && isVerboseLogging()) {
        console.log(
          `[CopyPathsProgressModal] mode=${mode} count=${count} currentPath=${currentPath}`
        );
      }
    } catch (e) {}
  }, [isVisible, currentPath, count, mode]);

  if (!isVisible) return null;
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
      style={{ opacity: modalOpacity }}
    >
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl border border-sky-500">
        <div
          className="flex items-center mb-4 cursor-pointer"
          onMouseDown={() => setModalOpacity(0.2)}
          onMouseUp={() => setModalOpacity(1)}
          onMouseLeave={() => setModalOpacity(1)} // Reset if mouse leaves while held down
          title="Click and hold here for this dialog to be almost fully transparent so you can see the panels behind. Release and it would restore full visibility."
        >
          <LoaderCircle className="w-8 h-8 text-sky-400 mr-3 animate-spin" />
          <h3 className="text-xl font-bold text-sky-400">
            {`Copying paths to ${mode}...`}
          </h3>
        </div>
        <div className="text-gray-400 bg-gray-900 p-3 rounded-md mb-6 break-all">
          <p className="text-sm">Processing:</p>
          <div className="font-mono text-gray-300 mb-2 w-full truncate overflow-hidden whitespace-nowrap">
            <TruncatedText text={currentPath} />
          </div>
          <p
            className="text-sm border-t border-gray-700 pt-2"
            title="Includes all folders, subfolders and files"
          >
            Items found:
          </p>
          <p className="font-mono text-gray-300">{count}</p>
        </div>
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

export default CopyPathsProgressModal;
