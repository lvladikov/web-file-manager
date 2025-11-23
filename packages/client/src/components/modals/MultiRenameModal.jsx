import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  XCircle,
  Trash2,
  Maximize2,
  Minimize2,
  ArrowUp,
  ArrowDown,
  Type,
  Eraser,
  ArrowRightLeft,
  Shuffle,
  ListOrdered,
  Calendar,
  Lightbulb,
} from "lucide-react";
import { applyRenameOperations, generateDiff } from "../../lib/renameUtils";
import {
  fetchMultiRenameCombos,
  saveMultiRenameCombo,
  removeMultiRenameCombo,
} from "../../lib/api";
import { isVerboseLogging } from "../../lib/utils";

const OPERATION_TYPES = [
  { id: "add_text", label: "Add Text", icon: Type, description: "Insert text at the start, end, or a specific position in names" },
  { id: "remove_text", label: "Remove Characters", icon: Eraser, description: "Delete a specific number of characters from names" },
  { id: "find_replace", label: "Find & Replace", icon: ArrowRightLeft, description: "Find and replace text or patterns in names" },
  { id: "case_change", label: "Case Change", icon: Type, description: "Change the case of names (uppercase, lowercase, title case, etc.)" },
  { id: "swap", label: "Swap / Rearrange", icon: Shuffle, description: "Swap or rearrange parts of names separated by a delimiter" },
  { id: "sequence", label: "Sequence", icon: ListOrdered, description: "Add sequential numbers to names" },
  { id: "date_time", label: "Date & Time", icon: Calendar, description: "Add current or file/folder modification date/time to names" },
  { id: "trim", label: "Trim", icon: Eraser, description: "Remove whitespace from the start, end, or both sides of names" },
];

export default function MultiRenameModal({
  isVisible,
  items = [], // Array of { name, ... }
  onClose,
  onApply,
}) {
  const [operations, setOperations] = useState([]);
  const [previewItems, setPreviewItems] = useState([]);
  const [savedCombos, setSavedCombos] = useState([]);
  const [selectedCombo, setSelectedCombo] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

  // Reset when opening
  useEffect(() => {
    if (isVisible) {
      setOperations([]);
      // load saved combos from config (server)
      (async () => {
        try {
          const combos = await fetchMultiRenameCombos();
          setSavedCombos(Array.isArray(combos) ? combos : []);
        } catch (err) {
          if (isVerboseLogging())
            console.warn("[MultiRename] failed to load saved combos", err);
        }
      })();
    }
  }, [isVisible]);

  // Update preview whenever operations or items change
  useEffect(() => {
    if (!items || items.length === 0) return;

    const newPreview = items.map((item, index) => {
      const newName = applyRenameOperations(
        item.name,
        operations,
        index,
        item // Pass full item as stats (modified, etc.)
      );

      const diff = generateDiff(item.name, newName);

      return {
        original: item.name,
        newName: newName,
        changed: item.name !== newName,
        diff,
      };
    });
    setPreviewItems(newPreview);
    if (isVerboseLogging()) {
      console.log("[MultiRename] Operations:", operations);
      console.log("[MultiRename] Preview Items:", newPreview);
    }
  }, [items, operations]);

  const addOperation = (type) => {
    const newOp = {
      id: Date.now().toString(),
      type,
      active: true,
      params: getDefaultParams(type),
    };
    setOperations([...operations, newOp]);
  };

  const removeOperation = (id) => {
    setOperations(operations.filter((op) => op.id !== id));
  };

  const moveOperation = (index, direction) => {
    if (direction === "up" && index > 0) {
      const newOps = [...operations];
      [newOps[index], newOps[index - 1]] = [newOps[index - 1], newOps[index]];
      setOperations(newOps);
    } else if (direction === "down" && index < operations.length - 1) {
      const newOps = [...operations];
      [newOps[index], newOps[index + 1]] = [newOps[index + 1], newOps[index]];
      setOperations(newOps);
    }
  };

  const updateOperation = (id, updates) => {
    setOperations(
      operations.map((op) => (op.id === id ? { ...op, ...updates } : op))
    );
  };

  const updateParam = (id, param, value) => {
    setOperations(
      operations.map((op) =>
        op.id === id ? { ...op, params: { ...op.params, [param]: value } } : op
      )
    );
  };

  const handleFullscreen = () => {
    const target = containerRef.current;
    if (target) {
      if (!document.fullscreenElement) {
        target.requestFullscreen().catch((err) => console.error(err));
      } else {
        document.exitFullscreen();
      }
    }
  };

  useEffect(() => {
    const onFullscreenChange = () =>
      setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // Focus Trap
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e) => {
      if (e.key === "Tab") {
        e.preventDefault(); // Prevent Tab from escaping the modal

        const modalElement = containerRef.current;
        if (!modalElement) return;

        const focusableElements = Array.from(
          modalElement.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );

        if (focusableElements.length === 0) return;

        const currentIndex = focusableElements.indexOf(document.activeElement);

        let nextIndex;
        if (e.shiftKey) {
          // Shift+Tab: go backwards
          nextIndex =
            currentIndex <= 0 ? focusableElements.length - 1 : currentIndex - 1;
        } else {
          // Tab: go forwards
          nextIndex =
            currentIndex >= focusableElements.length - 1 ? 0 : currentIndex + 1;
        }

        focusableElements[nextIndex]?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div
        ref={containerRef}
        className={`bg-gray-900 border border-gray-600 rounded-lg shadow-lg flex flex-col overflow-hidden ${
          isFullscreen
            ? "w-full h-full p-0 border-none rounded-none"
            : "w-[90vw] h-[85vh]"
        }`}
      >
        {/* Header */}
        <div className="w-full h-12 bg-black bg-opacity-60 flex-shrink-0 flex justify-between items-center px-3 rounded-t-lg z-20 border-b border-gray-700">
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Multi-Rename{" "}
              <span className="text-sm font-normal text-gray-400">
                ({items.length} items)
              </span>
            </h2>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleFullscreen}
              className="text-gray-400 hover:text-white transition-colors p-1"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <Minimize2 className="w-5 h-5" />
              ) : (
                <Maximize2 className="w-5 h-5" />
              )}
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors p-1"
              title="Close"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-grow flex overflow-hidden">
          {/* Left Column: Operations */}
          <div className="w-1/3 border-r border-gray-700 flex flex-col bg-gray-800/50">
            <div className="p-4 border-b border-gray-700">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {OPERATION_TYPES.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => addOperation(type.id)}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
                    title={type.description}
                  >
                    <type.icon className="w-4 h-4" />
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-grow overflow-y-auto p-4 space-y-4">
              {operations.length === 0 && (
                <div className="text-center text-gray-500 mt-10">
                  No operations added.
                  <br />
                  Click a button above to start.
                </div>
              )}
              {operations.map((op, index) => (
                <OperationCard
                  key={op.id}
                  op={op}
                  index={index}
                  total={operations.length}
                  onRemove={() => removeOperation(op.id)}
                  onMoveUp={() => moveOperation(index, "up")}
                  onMoveDown={() => moveOperation(index, "down")}
                  onUpdate={(updates) => updateOperation(op.id, updates)}
                  onParamChange={(param, value) =>
                    updateParam(op.id, param, value)
                  }
                  onAddOperation={addOperation}
                />
              ))}
            </div>
          </div>

          {/* Right Column: Preview */}
          <div className="w-2/3 flex flex-col bg-gray-900">
            <div className="flex-grow overflow-auto p-4">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-700">
                    <th className="py-2 px-4 font-medium w-1/2">
                      Original Name
                    </th>
                    <th className="py-2 px-4 font-medium w-1/2">New Name</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-mono">
                  {previewItems.map((item, idx) => (
                    <tr
                      key={idx}
                      className={`border-b border-gray-800 hover:bg-gray-800/50 transition-colors ${
                        item.changed ? "bg-sky-900/10" : ""
                      }`}
                    >
                      <td
                        className="py-2 px-4 text-gray-400 truncate max-w-[300px]"
                        title={item.original}
                      >
                        {/* Render Diff for Original (Removed parts in Red) */}
                        {item.diff.original.map((seg, i) => (
                          <span
                            key={i}
                            className={
                              seg.type === "removed"
                                ? "text-red-500 line-through bg-red-500/20 px-0.5 rounded"
                                : ""
                            }
                            dangerouslySetInnerHTML={{
                              __html: seg.text.replace(/ /g, "&nbsp;"),
                            }}
                          />
                        ))}
                      </td>
                      <td
                        className="py-2 px-4 text-gray-200 truncate max-w-[300px]"
                        title={item.newName}
                      >
                        {/* Render Diff for New (Added parts in Green) */}
                        {item.diff.new.map((seg, i) => (
                          <span
                            key={i}
                            className={
                              seg.type === "added"
                                ? "text-green-500 bg-green-500/20 px-0.5 rounded"
                                : "text-gray-500"
                            }
                            dangerouslySetInnerHTML={{
                              __html: seg.text.replace(/ /g, "&nbsp;"),
                            }}
                          />
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-800 flex flex-col gap-3">
          {/* Color Legend - only show if there are active operations */}
          {operations.some((op) => op.active) && (
            <div className="flex items-center gap-4 text-xs text-gray-400 pb-2 border-b border-gray-700">
              <span className="flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5" />
                <span className="font-semibold">Color Legend:</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="text-green-500">Green</span>: Added
              </span>
              <span className="flex items-center gap-1">
                <span className="text-red-500 line-through">
                  Red strikethrough
                </span>
                : Removed
              </span>
            </div>
          )}

          <div className="flex justify-between gap-3 items-center">
            {/* Left: saved combos / save control */}
            <div className="flex items-center gap-3">
              {savedCombos && savedCombos.length > 0 && (
                <select
                  value={selectedCombo || ""}
                  onChange={(e) => {
                    const name = e.target.value;
                    setSelectedCombo(name);
                  }}
                  className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
                >
                  <option value="">Please select</option>
                  {savedCombos.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}

              <div className="flex items-center gap-2">
                {/* Load / Remove controls - only active when a saved combo is selected */}
                {selectedCombo ? (
                  <>
                    <button
                      onClick={() => {
                        const combo = savedCombos.find(
                          (c) => c.name === selectedCombo
                        );
                        if (combo && Array.isArray(combo.operations)) {
                          const restored = combo.operations.map((op, idx) => ({
                            ...op,
                            id: `${Date.now()}-${idx}`,
                          }));
                          setOperations(restored);
                        }
                      }}
                      className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-sm transition-colors"
                      title="Load selected rename combination"
                    >
                      Load
                    </button>
                    <button
                      onClick={async () => {
                        const confirmed = window.confirm(
                          `Remove saved rename combination "${selectedCombo}"?`
                        );
                        if (!confirmed) return;
                        try {
                          const data = await removeMultiRenameCombo(
                            selectedCombo
                          );
                          // server returns updated combos
                          setSavedCombos(
                            Array.isArray(data.combos) ? data.combos : []
                          );
                          setSelectedCombo("");
                        } catch (err) {
                          console.error(
                            "[MultiRename] failed to remove rename combination",
                            err
                          );
                        }
                      }}
                      className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-sm transition-colors"
                      title="Remove selected rename combination"
                    >
                      Remove
                    </button>
                  </>
                ) : null}
                {isSaving ? (
                  <>
                    <input
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder="Rename combination name"
                      className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
                    />
                    <button
                      onClick={async () => {
                        if (!saveName || operations.length === 0) return;
                        try {
                          // Prepare operations for saving (strip id to avoid persistent ids)
                          const toSave = operations.map(
                            ({ id, ...rest }) => rest
                          );
                          await saveMultiRenameCombo(saveName, toSave);
                          // refresh saved combos
                          const combos = await fetchMultiRenameCombos();
                          setSavedCombos(Array.isArray(combos) ? combos : []);
                          setSelectedCombo(saveName);
                          setIsSaving(false);
                          setSaveName("");
                        } catch (err) {
                          console.error(
                            "[MultiRename] failed to save rename combination",
                            err
                          );
                        }
                      }}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setIsSaving(false);
                        setSaveName("");
                      }}
                      className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsSaving(true)}
                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
                  >
                    Save
                  </button>
                )}
              </div>
            </div>

            {/* Right: action buttons */}
            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => onApply(previewItems)}
                className="px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white font-medium rounded transition-colors"
              >
                Rename All
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getDefaultParams(type) {
  switch (type) {
    case "add_text":
      return { text: "", position: "start", atIndex: 0 };
    case "remove_text":
      return { count: 1, position: "start", atIndex: 0 };
    case "find_replace":
      return {
        find: "",
        replace: "",
        useRegex: false,
        caseSensitive: false,
        matchAll: true,
      };
    case "sequence":
      return {
        start: 1,
        step: 1,
        padding: 1,
        position: "start",
        atIndex: 0,
        prefix: "",
        suffix: "",
      };
    case "date_time":
      return {
        format: "YYYYMMDD",
        source: "current",
        position: "start",
        atIndex: 0,
        prefix: "",
        suffix: "",
      };
    case "case_change":
      return {
        mode: "uppercase",
      };
    case "trim":
      return {
        mode: "both", // start | end | both
        collapseSpaces: false,
      };
    case "swap":
      return {
        delimiter: "-",
        mode: "swap", // 'swap' or 'reorder'
        aIndex: 0,
        bIndex: 1,
        order: "",
      };
    default:
      return {};
  }
}

function OperationCard({
  op,
  index,
  total,
  onRemove,
  onMoveUp,
  onMoveDown,
  onUpdate,
  onParamChange,
  onAddOperation,
}) {
  const [showHelp, setShowHelp] = useState(false);

  const toggleHelp = () => setShowHelp((s) => !s);

  return (
    <div className="bg-gray-800 border border-gray-600 rounded p-3 relative group">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-2">
        <span className="font-medium text-sky-400 text-sm uppercase tracking-wider flex items-center gap-2 w-full md:w-auto">
          {(() => {
            const type = OPERATION_TYPES.find((t) => t.id === op.type);
            const Icon = type?.icon;
            return (
              <>
                {Icon && <Icon className="w-4 h-4" />}
                {type?.label}
              </>
            );
          })()}
        </span>
        <div className="flex items-center gap-2 justify-end w-full md:w-auto mt-2 md:mt-0">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="text-gray-500 hover:text-white disabled:opacity-30 disabled:hover:text-gray-500 transition-colors p-1"
            title="Move Up"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="text-gray-500 hover:text-white disabled:opacity-30 disabled:hover:text-gray-500 transition-colors p-1"
            title="Move Down"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
          <button
            onClick={onRemove}
            className="text-gray-500 hover:text-red-400 transition-colors p-1 ml-1"
            title="Remove"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <button
          onClick={toggleHelp}
          className="text-xs text-gray-400 hover:text-white underline flex items-center gap-1 w-full justify-start"
          title="How it works"
        >
          <Lightbulb className="w-3 h-3" />
          <span>{showHelp ? "Hide help" : "How it works?"}</span>
        </button>
        {op.type === "add_text" && (
          <>
            {showHelp && (
              <div className="mb-2 text-xs text-gray-400">
                <span className="text-sky-400">Add Text</span>: insert the
                provided text into the item name. <br />
                <span className="text-sky-400">Choose placement</span>:{" "}
                <code className="font-mono text-white ml-1">At Start</code>,{" "}
                <code className="font-mono text-white ml-1">At End</code>, or{" "}
                <code className="font-mono text-white ml-1">At Index</code>{" "}
                (0-based, negative indexes count from the end). Works for files
                and folders; for files the extension is preserved.
              </div>
            )}
            <input
              type="text"
              value={op.params.text}
              onChange={(e) => onParamChange("text", e.target.value)}
              placeholder="Text to add"
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
            />
            <div className="flex gap-2">
              <select
                value={op.params.position}
                onChange={(e) => onParamChange("position", e.target.value)}
                className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
              >
                <option value="start">At Start</option>
                <option value="end">At End</option>
                <option value="index">At Index</option>
              </select>
              {op.params.position === "index" && (
                <input
                  type="number"
                  value={op.params.atIndex}
                  onChange={(e) => onParamChange("atIndex", e.target.value)}
                  className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
                  placeholder="Idx"
                />
              )}
            </div>
          </>
        )}

        {op.type === "remove_text" && (
          <>
            {showHelp && (
              <div className="mb-2 text-xs text-gray-400">
                <span className="text-sky-400">Remove Characters</span>: delete
                a set number of characters from the item name. Specify how many
                characters to remove and whether to remove from
                <code className="font-mono text-white ml-1">From Start</code>,
                <code className="font-mono text-white ml-1">From End</code>, or
                <code className="font-mono text-white ml-1">
                  From Index
                </code>{" "}
                (0-based; negative indexes count from the end). Works for files
                and folders — for files the extension is preserved.
                <br />
                <span className="text-amber-400 mt-1 inline-block">💡 Tip:</span>{" "}
                To remove specific text (not just a count of characters), use the{" "}
                <button
                  onClick={() => onAddOperation?.("find_replace")}
                  className="text-sky-400 hover:text-sky-300 underline cursor-pointer bg-transparent border-none p-0"
                >
                  Find & Replace
                </button>{" "}
                tool and replace the text with nothing (leave replacement empty).
              </div>
            )}
            <div className="flex gap-2 items-center flex-nowrap">
              <span className="text-xs text-gray-400">Remove</span>
              <input
                type="number"
                value={op.params.count}
                onChange={(e) => onParamChange("count", e.target.value)}
                className="w-14 min-w-[3rem] bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none text-center"
                min="1"
              />
              <span className="text-xs text-gray-400">chars</span>
            </div>
            <div className="flex gap-2 items-center flex-nowrap mt-2">
              <select
                value={op.params.position}
                onChange={(e) => onParamChange("position", e.target.value)}
                className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
              >
                <option value="start">From Start</option>
                <option value="end">From End</option>
                <option value="index">From Index</option>
              </select>
              {op.params.position === "index" && (
                <input
                  type="number"
                  value={op.params.atIndex}
                  onChange={(e) => onParamChange("atIndex", e.target.value)}
                  className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
                  placeholder="Idx"
                />
              )}
            </div>
          </>
        )}

        {op.type === "find_replace" && (
          <>
            {showHelp && (
              <div className="mb-2 text-xs text-gray-400">
                <span className="text-sky-400">Find & Replace</span>: search the
                item name for a string or regular expression and replace
                matches.
                <br />
                <span className="text-sky-400">Additional options:</span>
                <code className="font-mono text-white ml-1">Regex</code> enables
                regular expressions,{" "}
                <code className="font-mono text-white ml-1">
                  Case Sensitive
                </code>{" "}
                controls whether matches respect casing, and
                <code className="font-mono text-white ml-1">
                  Match All
                </code>{" "}
                will replace multiple occurrences instead of only the first.
              </div>
            )}
            <input
              type="text"
              value={op.params.find}
              onChange={(e) => onParamChange("find", e.target.value)}
              placeholder="Find..."
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
            />
            <input
              type="text"
              value={op.params.replace}
              onChange={(e) => onParamChange("replace", e.target.value)}
              placeholder="Replace with..."
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
            />
            <div className="flex flex-wrap gap-2 text-xs text-gray-400">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={op.params.useRegex}
                  onChange={(e) => onParamChange("useRegex", e.target.checked)}
                />
                Regex
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={op.params.caseSensitive}
                  onChange={(e) =>
                    onParamChange("caseSensitive", e.target.checked)
                  }
                />
                Case Sensitive
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={op.params.matchAll}
                  onChange={(e) => onParamChange("matchAll", e.target.checked)}
                />
                Match All
              </label>
            </div>
          </>
        )}

        {op.type === "case_change" && (
          <>
            {showHelp && (
              <div className="mb-2 text-xs text-gray-400">
                <span className="text-sky-400">Case Change</span> transforms the
                item name using common casing styles. Select
                <code className="font-mono text-white ml-1">UPPERCASE</code>,
                <code className="font-mono text-white ml-1">lowercase</code>,
                <code className="font-mono text-white ml-1">Title Case</code>,
                <code className="font-mono text-white ml-1">Sentence case</code>
                ,<code className="font-mono text-white ml-1">camelCase</code>,
                <code className="font-mono text-white ml-1">PascalCase</code>,
                <code className="font-mono text-white ml-1">snake_case</code> or
                <code className="font-mono text-white ml-1">kebab-case</code>.
              </div>
            )}
            <label className="text-xs text-gray-500 block">Mode</label>
            <select
              value={op.params.mode}
              onChange={(e) => onParamChange("mode", e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
            >
              <option value="uppercase">UPPERCASE</option>
              <option value="lowercase">lowercase</option>
              <option value="title">Title Case</option>
              <option value="sentence">Sentence case</option>
              <option value="camel">camelCase</option>
              <option value="pascal">PascalCase</option>
              <option value="snake">snake_case</option>
              <option value="kebab">kebab-case</option>
            </select>
          </>
        )}

        {op.type === "swap" && (
          <>
            {showHelp && (
              <div className="mt-2 text-xs text-gray-400">
                <div className="text-sky-400">How it works</div>
                <div>
                  Split the item name (file name or folder name — base name
                  without extension for files) using the exact delimiter string
                  you provide. After splitting into segments you can either swap
                  two segments or provide a custom reorder.
                </div>
                <div className="mt-2">
                  <span className="text-sky-400">Examples:</span>
                  <br />
                  <code className="font-mono text-white">
                    Artist - Song.mp3
                  </code>
                  <span className="text-xs text-gray-400 ml-2">(original)</span>
                  <br />
                  <code className="font-mono">
                    <span className="text-green-400">Song</span>
                    <span className="text-white"> - Artist.mp3</span>
                  </code>
                  <div className="text-xs text-gray-400 mt-1">
                    or a folder like{" "}
                    <code className="font-mono text-white">Folder - New</code> →{" "}
                    <code className="font-mono">
                      <span className="text-green-400">New</span>
                      <span className="text-white"> - Folder</span>
                    </code>
                  </div>
                  <ul className="list-disc ml-4 mt-1">
                    <li>
                      With delimiter <code className="font-mono">" - "</code>{" "}
                      and swap indices 0 and 1 →
                      <code className="font-mono ml-2">
                        <span className="text-green-400">Song</span>
                        <span className="text-white"> - Artist.mp3</span>
                      </code>
                      <span className="text-xs text-gray-400 ml-2">
                        (result)
                      </span>
                    </li>
                    <li>
                      For{" "}
                      <code className="font-mono text-white">
                        A - B - C.txt
                      </code>
                      , reorder <code className="font-mono">2,0,1</code> →
                      <code className="font-mono ml-2">
                        <span className="text-green-400">C</span>
                        <span className="text-white"> - A - B.txt</span>
                      </code>
                    </li>
                  </ul>
                </div>
                <div className="mt-2 text-xs text-gray-400">
                  <span className="text-sky-400">Notes:</span> indices are
                  zero-based; negative indices are supported (e.g. -1 = last
                  segment). If delimiter is not found or indices are invalid,
                  the filename is unchanged.
                </div>
              </div>
            )}

            <label className="text-xs text-gray-500 block">Delimiter</label>
            <input
              type="text"
              value={op.params.delimiter || ""}
              onChange={(e) => onParamChange("delimiter", e.target.value)}
              placeholder="e.g.  -  or a single space"
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
              <div>
                <label className="text-xs text-gray-500 block">Mode</label>
                <select
                  value={op.params.mode}
                  onChange={(e) => onParamChange("mode", e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
                >
                  <option value="swap">Swap (two segments)</option>
                  <option value="reorder">Custom reorder (indices)</option>
                </select>
              </div>

              {/* right column intentionally left blank (help moved above) */}
            </div>

            {op.params.mode === "swap" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                <div>
                  <label className="text-xs text-gray-500 block">
                    Segment A (index)
                  </label>
                  <input
                    type="number"
                    value={op.params.aIndex}
                    onChange={(e) =>
                      onParamChange("aIndex", Number(e.target.value))
                    }
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
                    min={0}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block">
                    Segment B (index)
                  </label>
                  <input
                    type="number"
                    value={op.params.bIndex}
                    onChange={(e) =>
                      onParamChange("bIndex", Number(e.target.value))
                    }
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
                    min={0}
                  />
                </div>
              </div>
            )}

            {op.params.mode === "reorder" && (
              <div className="mt-2">
                <label className="text-xs text-gray-500 block">
                  Order (comma-separated indices)
                </label>
                <input
                  type="text"
                  value={op.params.order || ""}
                  onChange={(e) => onParamChange("order", e.target.value)}
                  placeholder="e.g. 1,0 or 2,1,0"
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
                />
              </div>
            )}
          </>
        )}

        {op.type === "trim" && (
          <>
            {showHelp && (
              <div className="mt-2 text-xs text-gray-400">
                <div className="text-sky-400">How it works</div>
                <div>
                  <span className="text-sky-400">Trim</span> removes whitespace
                  characters from the item name (file name or folder name). For
                  files the operation applies to the base name (extension
                  preserved). Choose whether to trim from the start, the end or
                  both. Enabling "
                  <span className="text-sky-400">Collapse spaces</span>"
                  converts multiple contiguous whitespace characters into a
                  single space.
                </div>
                <div className="mt-2">
                  <span className="text-sky-400">Examples:</span>
                  <br />
                  <code className="font-mono text-white">" My File .txt"</code>
                  <ul className="list-disc ml-4 mt-1">
                    <li>
                      Trim Both + Collapse Yes →
                      <code className="font-mono ml-2">
                        <span className="text-green-400">"My File"</span>
                        <span className="text-white">.txt</span>
                      </code>
                    </li>
                    <li>Trim Start → removes leading whitespace only.</li>
                  </ul>
                </div>
                <div className="mt-2 text-xs text-gray-400">
                  <span className="text-sky-400">Notes:</span> collapse affects
                  any whitespace (spaces, tabs). If there is nothing to trim the
                  name stays unchanged.
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 block">Mode</label>
                <select
                  value={op.params.mode}
                  onChange={(e) => onParamChange("mode", e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
                >
                  <option value="both">Trim Both</option>
                  <option value="start">Trim Start</option>
                  <option value="end">Trim End</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block">
                  Collapse spaces
                </label>
                <select
                  value={op.params.collapseSpaces ? "yes" : "no"}
                  onChange={(e) =>
                    onParamChange("collapseSpaces", e.target.value === "yes")
                  }
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
            </div>
          </>
        )}

        {/* sanitize operation removed */}

        {op.type === "sequence" && (
          <>
            {showHelp && (
              <div className="mb-2 text-xs text-gray-400">
                <span className="text-sky-400">Sequence</span> generates a
                numeric counter for each item using{" "}
                <span className="text-sky-400">Start</span>,{" "}
                <span className="text-sky-400">Step</span> and{" "}
                <span className="text-sky-400">Padding</span>. You can add a{" "}
                <span className="text-sky-400">Prefix</span>/
                <span className="text-sky-400">Suffix</span> and choose where
                the sequence is inserted (
                <code className="font-mono text-white ml-1">At Start</code>,{" "}
                <code className="font-mono text-white ml-1">At End</code>, or{" "}
                <code className="font-mono text-white ml-1">At Index</code>).
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 block">Start</label>
                <input
                  type="number"
                  value={op.params.start}
                  onChange={(e) => onParamChange("start", e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block">Step</label>
                <input
                  type="number"
                  value={op.params.step}
                  onChange={(e) => onParamChange("step", e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 block">Padding</label>
                <input
                  type="number"
                  value={op.params.padding}
                  onChange={(e) => onParamChange("padding", e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 block">Prefix</label>
                <input
                  type="text"
                  value={op.params.prefix || ""}
                  onChange={(e) => onParamChange("prefix", e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
                  placeholder="e.g. img_"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block">Suffix</label>
                <input
                  type="text"
                  value={op.params.suffix || ""}
                  onChange={(e) => onParamChange("suffix", e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
                  placeholder="e.g. _v1"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 block">Position</label>
                <select
                  value={op.params.position}
                  onChange={(e) => onParamChange("position", e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
                >
                  <option value="start">At Start</option>
                  <option value="end">At End</option>
                  <option value="index">At Index</option>
                </select>
              </div>
              {op.params.position === "index" && (
                <div>
                  <label className="text-xs text-gray-500 block">Index</label>
                  <input
                    type="number"
                    value={op.params.atIndex}
                    onChange={(e) => onParamChange("atIndex", e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
                    placeholder="Idx"
                  />
                </div>
              )}
            </div>
          </>
        )}

        {op.type === "date_time" && (
          <>
            {showHelp && (
              <div className="mb-2 text-xs text-gray-400">
                <span className="text-sky-400">Format tokens:</span>{" "}
                <code className="font-mono text-white">YYYY</code> (4-digit
                year), <code className="font-mono text-white">YY</code> (2-digit
                year), <code className="font-mono text-white">MM/M</code>{" "}
                (month), <code className="font-mono text-white">DD/D</code>{" "}
                (day), <code className="font-mono text-white">HH</code> /{" "}
                <code className="font-mono text-white">H</code> (24-hour),{" "}
                <code className="font-mono text-white">hh</code> /{" "}
                <code className="font-mono text-white">h</code> (12-hour),{" "}
                <code className="font-mono text-white">mm/m</code> (minutes),{" "}
                <code className="font-mono text-white">ss/s</code> (seconds),{" "}
                <code className="font-mono text-white">a</code> (am/pm).
                <br />
                <span className="text-sky-400">Double-letter tokens</span> (
                <code className="font-mono text-white">YY</code>,{" "}
                <code className="font-mono text-white">MM</code>,{" "}
                <code className="font-mono text-white">DD</code>,{" "}
                <code className="font-mono text-white">HH</code>,{" "}
                <code className="font-mono text-white">hh</code>,{" "}
                <code className="font-mono text-white">mm</code>,{" "}
                <code className="font-mono text-white">ss</code>) are
                zero-padded.{" "}
                <span className="text-sky-400">Single-letter tokens</span> (
                <code className="font-mono text-white">M</code>,{" "}
                <code className="font-mono text-white">D</code>,{" "}
                <code className="font-mono text-white">H</code>,{" "}
                <code className="font-mono text-white">h</code>,{" "}
                <code className="font-mono text-white">m</code>,{" "}
                <code className="font-mono text-white">s</code>) are non-padded
                values. <code className="font-mono text-white">YY</code>{" "}
                produces the two-digit year (e.g.{" "}
                <span className="font-mono text-green-400">25</span> for{" "}
                <span className="font-mono text-green-400">2025</span> and{" "}
                <span className="font-mono text-green-400">09</span> for{" "}
                <span className="font-mono text-green-400">2009</span>).
              </div>
            )}

            <input
              type="text"
              value={op.params.format}
              onChange={(e) => onParamChange("format", e.target.value)}
              placeholder="Format (e.g. YYYYMMDD)"
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
              <div>
                <label className="text-xs text-gray-500 block">Prefix</label>
                <input
                  type="text"
                  value={op.params.prefix || ""}
                  onChange={(e) => onParamChange("prefix", e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
                  placeholder="e.g. ("
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block">Suffix</label>
                <input
                  type="text"
                  value={op.params.suffix || ""}
                  onChange={(e) => onParamChange("suffix", e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
                  placeholder="e.g. ).txt"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 block">Source</label>
                <select
                  value={op.params.source}
                  onChange={(e) => onParamChange("source", e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
                >
                  <option value="current">Current Time</option>
                  <option value="modified">Modified Time</option>
                  <option value="created">Created Time</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 block">Position</label>
                <select
                  value={op.params.position}
                  onChange={(e) => onParamChange("position", e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none"
                >
                  <option value="start">At Start</option>
                  <option value="end">At End</option>
                  <option value="index">At Index</option>
                </select>

                {op.params.position === "index" && (
                  <div className="mt-2 flex flex-col items-end">
                    <label className="text-xs text-gray-500 block text-right">
                      Index
                    </label>
                    <input
                      type="number"
                      value={op.params.atIndex}
                      onChange={(e) => onParamChange("atIndex", e.target.value)}
                      className="w-20 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-sky-500 outline-none text-right"
                      placeholder="Idx"
                    />
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
