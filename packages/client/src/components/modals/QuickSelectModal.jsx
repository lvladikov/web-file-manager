import React, { useState, useEffect } from "react";
import { XCircle } from "lucide-react";

const QuickSelectModal = ({ isVisible, mode, onClose, onConfirm }) => {
  const [pattern, setPattern] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [resetSelection, setResetSelection] = useState(true);

  useEffect(() => {
    if (isVisible) {
      setPattern("");
      setUseRegex(false);
      setCaseSensitive(false);
      setResetSelection(true);
    }
  }, [isVisible]);

  if (!isVisible) return null;

  const handleConfirm = () => {
    onConfirm(pattern, useRegex, caseSensitive, resetSelection);
    onClose();
  };

  const title = mode === "select" ? "Quick Select" : "Quick Unselect";
  const confirmText = mode === "select" ? "Select" : "Unselect";
  const addOrRemoveText = mode === "select" ? "add to" : "remove from";

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center p-4 border-b border-gray-600">
          <h1 className="text-2xl font-bold text-sky-300">{title}</h1>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-700"
            title="Close (Esc)"
          >
            <XCircle className="w-8 h-8" />
          </button>
        </header>
        <main className="p-6 space-y-4">
          <div>
            <label
              htmlFor="pattern-input"
              className="block mb-2 text-sm font-medium text-gray-300"
            >
              Filename Pattern
            </label>
            <input
              type="text"
              id="pattern-input"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-sky-500 focus:border-sky-500 block w-full p-2.5"
              placeholder="e.g., *.jpg, /\.png$/i, _FILES_ONLY_, _FOLDERS_ONLY_"
              title="Use wildcards (*.jpg), regex, or special keywords: _FILES_ONLY_, _FOLDERS_ONLY_, _ZIP_FILES_ONLY_"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleConfirm();
                }
              }}
            />
          </div>
          <div className="space-y-2 pt-2">
            <div className="flex items-center">
              <input
                id="reset-selection"
                type="checkbox"
                checked={resetSelection}
                onChange={(e) => setResetSelection(e.target.checked)}
                className="w-4 h-4 text-sky-600 bg-gray-700 border-gray-600 rounded focus:ring-sky-500"
              />
              <label
                htmlFor="reset-selection"
                className="ml-2 text-sm font-medium text-gray-300"
              >
                Reset current selection
              </label>
            </div>
            <div className="flex items-center">
              <input
                id="use-regex"
                type="checkbox"
                checked={useRegex}
                onChange={(e) => setUseRegex(e.target.checked)}
                className="w-4 h-4 text-sky-600 bg-gray-700 border-gray-600 rounded focus:ring-sky-500"
              />
              <label
                htmlFor="use-regex"
                className="ml-2 text-sm font-medium text-gray-300"
              >
                Use Regular Expressions
              </label>
            </div>
            <div className="flex items-center">
              <input
                id="case-sensitive"
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                className="w-4 h-4 text-sky-600 bg-gray-700 border-gray-600 rounded focus:ring-sky-500"
              />
              <label
                htmlFor="case-sensitive"
                className="ml-2 text-sm font-medium text-gray-300"
              >
                Case Sensitive
              </label>
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded-md p-3 mt-4 text-sm text-gray-300 space-y-2">
            <p>
              The pattern is matched against folder names, filenames, and
              extensions. Use * as a wildcard (e.g., *.jpg).
            </p>
            <p>
              <span className="font-semibold text-sky-300">
                Special keywords:
              </span>{" "}
              Use <code className="bg-gray-800 px-1 rounded">_FILES_ONLY_</code>
              , <code className="bg-gray-800 px-1 rounded">_FOLDERS_ONLY_</code>
              , or{" "}
              <code className="bg-gray-800 px-1 rounded">_ZIP_FILES_ONLY_</code>{" "}
              to filter by type.
            </p>
            <p>
              <span className="font-semibold text-sky-300">
                Reset current selection:
              </span>{" "}
              If checked, any existing selection will be cleared before the new
              selection is applied, otherwise it will {addOrRemoveText} the
              current selection.
            </p>
            <p>
              <span className="font-semibold text-sky-300">
                Use Regular Expressions:
              </span>{" "}
              If checked, the pattern will be treated as a{" "}
              <a
                href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 hover:underline"
              >
                JavaScript regular expression
              </a>
              .
            </p>
            <p>
              <span className="font-semibold text-sky-300">
                Case Sensitive:
              </span>{" "}
              If checked, the pattern matching will be case-sensitive.
            </p>
          </div>
        </main>
        <footer className="flex justify-end items-center p-4 border-t border-gray-600 space-x-4">
          <button
            id="quick-select-cancel-button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-white font-semibold"
          >
            Cancel
          </button>
          <button
            id="quick-select-confirm-button"
            onClick={handleConfirm}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-md text-white font-semibold"
          >
            {confirmText}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default QuickSelectModal;
