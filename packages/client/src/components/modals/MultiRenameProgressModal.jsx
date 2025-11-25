import React from "react";
import { LoaderCircle, XCircle } from "lucide-react";
import TruncatedText from "../ui/TruncatedText";
import { generateDiff } from "../../lib/renameUtils";

const MultiRenameProgressModal = ({
  isVisible,
  total = 0,
  processed = 0,
  currentOld,
  currentNew,
  successCount = 0,
  failureCount = 0,
  errors = [],
  finished = false,
  onCancel,
}) => {
  const [modalOpacity, setModalOpacity] = React.useState(1);

  React.useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        if (typeof onCancel === "function") onCancel();
      }
    };
    if (isVisible) window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isVisible, onCancel]);

  if (!isVisible) return null;

  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

  // Build diff segments for rendering like the MultiRename modal
  const diff = generateDiff(currentOld || "", currentNew || "");

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
      style={{ opacity: modalOpacity }}
    >
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-3xl border border-sky-500">
        <div
          className="flex items-center mb-4 cursor-pointer"
          onMouseDown={() => setModalOpacity(0.2)}
          onMouseUp={() => setModalOpacity(1)}
          onMouseLeave={() => setModalOpacity(1)}
          title="Click and hold here for this dialog to be almost fully transparent..."
        >
          <LoaderCircle className="w-8 h-8 text-sky-400 mr-3 animate-spin" />
          <h3 className="text-xl font-bold text-sky-400">Renaming items...</h3>
        </div>

        <div className="text-gray-400 bg-gray-900 p-3 rounded-md mb-4">
          <p className="text-sm">Overall Progress:</p>
          <div className="text-gray-300 space-y-2 mt-2">
            <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
              <div
                className="bg-sky-500 h-4 rounded-full"
                style={{
                  width: `${percent}%`,
                  transition: "width 0.1s linear",
                }}
              />
            </div>
            <div className="flex justify-between items-center text-sm font-mono">
              <span>{percent}%</span>
              <span>
                {processed} / {total}
              </span>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <div className="text-xs text-gray-400 bg-gray-900 p-3 rounded-md">
            <div className="mb-3">
              <div className="text-sm text-gray-300">Old Name</div>
              <div className="font-mono text-gray-200 mt-2 break-words bg-gray-800 p-2 rounded">
                {diff.original.map((seg, i) => (
                  <span
                    key={i}
                    className={
                      seg.type === "removed"
                        ? "text-red-500 line-through bg-red-500/10 px-0.5 rounded"
                        : "text-gray-200"
                    }
                    dangerouslySetInnerHTML={{
                      __html: seg.text.replace(/ /g, "&nbsp;"),
                    }}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="text-sm text-gray-300">New Name</div>
              <div className="font-mono text-gray-200 mt-2 break-words bg-gray-800 p-2 rounded">
                {diff.new.map((seg, i) => (
                  <span
                    key={i}
                    className={
                      seg.type === "added"
                        ? "text-green-400 bg-green-400/10 px-0.5 rounded"
                        : "text-gray-200"
                    }
                    dangerouslySetInnerHTML={{
                      __html: seg.text.replace(/ /g, "&nbsp;"),
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="text-sm text-gray-400 bg-gray-900 p-3 rounded-md mb-4 space-y-2">
          <div>
            <strong className="text-gray-200">Success:</strong>
            <span className="ml-2 text-green-400 font-semibold">
              {successCount}
            </span>
          </div>
          <div>
            <strong className="text-gray-200">Failed:</strong>
            <span className="ml-2 text-red-400 font-semibold">
              {failureCount}
            </span>
          </div>
          {errors && errors.length > 0 && (
            <div className="bg-gray-800 p-3 rounded-md">
              <div className="text-xs text-amber-400 mb-2">Errors</div>
              <div className="space-y-1">
                {errors.slice(0, 5).map((e, i) => (
                  <div
                    key={i}
                    className="font-mono text-xs text-gray-300 whitespace-pre-wrap break-words"
                  >
                    {e}
                  </div>
                ))}
                {errors.length > 5 && (
                  <div className="text-xs text-gray-500">
                    and {errors.length - 5} more...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            onClick={onCancel}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg flex items-center"
          >
            <XCircle className="w-5 h-5 mr-2" />{" "}
            {finished && failureCount > 0 ? "Close" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MultiRenameProgressModal;
