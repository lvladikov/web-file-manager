import { Copy, XCircle, Search } from "lucide-react";
import { formatBytes } from "../../lib/utils";

const ProgressModal = ({
  isVisible,
  status,
  copied,
  total,
  currentFile,
  onCancel,
}) => {
  if (!isVisible) return null;

  const percent = total > 0 ? Math.round((copied / total) * 100) : 0;
  const isScanning = status === "scanning";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl border border-sky-500">
        <div className="flex items-center mb-4">
          {isScanning ? (
            <Search className="w-8 h-8 text-sky-400 mr-3 animate-pulse" />
          ) : (
            <Copy className="w-8 h-8 text-sky-400 mr-3 animate-pulse" />
          )}
          <h3 className="text-xl font-bold text-sky-400">
            {isScanning ? "Preparing to Copy..." : "Copying in Progress..."}
          </h3>
        </div>

        <div className="text-gray-400 bg-gray-900 p-3 rounded-md mb-4 break-all">
          <p className="text-sm">{isScanning ? "Scanning:" : "Copying:"}</p>
          <p className="font-mono text-gray-300">{currentFile}</p>
        </div>

        {/* The progress bar is only shown during the copying phase */}
        {status === "copying" && (
          <div className="text-gray-300 space-y-2 mb-6">
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
