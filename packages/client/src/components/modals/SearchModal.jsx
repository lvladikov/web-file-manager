import React, { useState, useEffect, useRef, useMemo } from "react";
import { XCircle, Search as SearchIcon, Info } from "lucide-react";

import Icon from "../ui/Icon";
import TruncatedText from "../ui/TruncatedText";
import { formatBytes, formatDate } from "../../lib/utils";
import { searchFiles } from "../../lib/api";

const SearchModal = ({
  isVisible,
  basePath,
  panelId,
  onClose,
  onGoTo,
  activePanelPath,
  otherPanelPath,
  onChangeBasePath,
  onRequestPathSelection,
}) => {
  const [query, setQuery] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [matchCase, setMatchCase] = useState(false);
  const [includeSubfolders, setIncludeSubfolders] = useState(true);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedResult, setSelectedResult] = useState({
    groupIndex: 0,
    itemIndex: null,
  });

  const inputRef = useRef(null);
  const modalRef = useRef(null);

  const regexExamples = `Files: 
'^README\.md$' (exact)

Extensions: 
'\\.(jpg|png)$' (images)
'\\.(txt|md)$' (text/markdown)

Starts with: 
'^test'

Folders: 
'^node_modules$' (exact)
'^src/.*' (under src)`;

  const matchCaseTitle = "Match case: make the search case-sensitive.";
  const includeSubfoldersTitle =
    "Include subfolders: search recursively into subfolders.";
  const includeHiddenTitle =
    "Include hidden items: include dotfiles and hidden folders in results.";

  const sortItemsFoldersFirst = (a, b) => {
    const aIsFolder = a.type === "folder";
    const bIsFolder = b.type === "folder";
    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;
    // Both same kind: sort by name (case-insensitive)
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  };

  const canUseActivePath = Boolean(activePanelPath && onChangeBasePath);
  const canUseOtherPath = Boolean(otherPanelPath && onChangeBasePath);

  const handleUseActivePanelPath = () => {
    if (canUseActivePath) {
      onChangeBasePath(activePanelPath);
    }
  };

  const handleUseOtherPanelPath = () => {
    if (canUseOtherPath) {
      onChangeBasePath(otherPanelPath);
    }
  };

  const handleOpenPathSelector = () => {
    onRequestPathSelection?.();
  };

  useEffect(() => {
    if (isVisible) {
      setQuery("");
      setUseRegex(false);
      setMatchCase(false);
      setIncludeSubfolders(true);
      setIncludeHidden(false);
      setResults([]);
      setSelectedResult({ groupIndex: 0, itemIndex: null });
      setError("");
      setHasSearched(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isVisible]);

  const selectedGroup = results[selectedResult.groupIndex];
  const selectedItem =
    selectedGroup && selectedResult.itemIndex !== null
      ? selectedGroup.items[selectedResult.itemIndex]
      : null;
  const totalMatches = results.reduce(
    (sum, group) => sum + (group.items?.length || 0),
    0
  );
  const folderCount = results.filter(
    (group) => (group.items?.length || 0) > 0
  ).length;
  const matchesLabel = hasSearched
    ? `${totalMatches} match${
        totalMatches === 1 ? "" : "es"
      } in ${folderCount} folder${folderCount === 1 ? "" : "s"} found`
    : "";
  const flattenedResults = useMemo(() => {
    const entries = [];
    results.forEach((group, groupIndex) => {
      (group.items || []).forEach((item, itemIndex) => {
        entries.push({ groupIndex, itemIndex, fullPath: item.fullPath });
      });
    });
    return entries;
  }, [results]);

  const handleSearch = async () => {
    if (!basePath) {
      setError("No base path to search from.");
      return;
    }
    if (!query.trim()) {
      setError("Enter a search query.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const payload = {
        basePath,
        query,
        options: {
          useRegex,
          caseSensitive: matchCase,
          includeSubfolders,
          includeHidden,
        },
      };
      const data = await searchFiles(payload);
      const groups = (data.groups || []).map((g) => ({
        ...g,
        items: (g.items || []).slice().sort(sortItemsFoldersFirst),
      }));
      setResults(groups);
      setHasSearched(true);
      if (
        data.groups &&
        data.groups.length > 0 &&
        data.groups[0].items.length
      ) {
        setSelectedResult({ groupIndex: 0, itemIndex: 0 });
      } else {
        setSelectedResult({ groupIndex: 0, itemIndex: null });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectResult = (groupIndex, itemIndex) => {
    setSelectedResult({ groupIndex, itemIndex });
  };

  const handleGoToSelection = () => {
    if (!selectedGroup || !selectedItem) return;
    onGoTo(panelId, selectedGroup.folder, selectedItem.name);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (selectedItem) {
        handleGoToSelection();
      } else {
        handleSearch();
      }
    }
    if (event.key === "Escape") {
      onClose();
    }
  };

  const resultsContainerRef = useRef(null);
  const resultItemRefs = useRef({});

  useEffect(() => {
    if (hasSearched && flattenedResults.length > 0) {
      resultsContainerRef.current?.focus();
    }
  }, [hasSearched, flattenedResults.length]);

  useEffect(() => {
    if (selectedItem && resultItemRefs.current[selectedItem.fullPath]) {
      resultItemRefs.current[selectedItem.fullPath].scrollIntoView({
        block: "nearest",
      });
    }
  }, [selectedItem]);

  const getFlattenedIndex = () =>
    flattenedResults.findIndex(
      (entry) =>
        entry.groupIndex === selectedResult.groupIndex &&
        entry.itemIndex === selectedResult.itemIndex
    );

  const changeSelectionBy = (delta) => {
    if (flattenedResults.length === 0) return;
    const currentIndex = getFlattenedIndex();
    let nextIndex;
    if (currentIndex === -1) {
      nextIndex = delta >= 0 ? 0 : flattenedResults.length - 1;
    } else {
      nextIndex =
        (currentIndex + delta + flattenedResults.length) %
        flattenedResults.length;
    }
    const nextEntry = flattenedResults[nextIndex];
    setSelectedResult({
      groupIndex: nextEntry.groupIndex,
      itemIndex: nextEntry.itemIndex,
    });
  };

  const scrollResults = (direction) => {
    if (!resultsContainerRef.current) return;
    const { scrollTop, clientHeight, scrollHeight } =
      resultsContainerRef.current;
    if (direction === "pageDown") {
      resultsContainerRef.current.scrollTo({
        top: Math.min(scrollTop + clientHeight, scrollHeight),
        behavior: "smooth",
      });
    } else if (direction === "pageUp") {
      resultsContainerRef.current.scrollTo({
        top: Math.max(scrollTop - clientHeight, 0),
        behavior: "smooth",
      });
    } else if (direction === "home") {
      resultsContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    } else if (direction === "end") {
      resultsContainerRef.current.scrollTo({
        top: scrollHeight,
        behavior: "smooth",
      });
    }
  };

  const handleResultsKeyDown = (event) => {
    if (flattenedResults.length === 0) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        changeSelectionBy(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        changeSelectionBy(-1);
        break;
      case "Enter":
        event.preventDefault();
        event.stopPropagation();
        handleGoToSelection();
        break;
      case "PageDown":
        event.preventDefault();
        scrollResults("pageDown");
        break;
      case "PageUp":
        event.preventDefault();
        event.stopPropagation();
        scrollResults("pageUp");
        break;
      case "Home":
        event.preventDefault();
        scrollResults("home");
        break;
      case "End":
        event.preventDefault();
        scrollResults("end");
        break;
      default:
        break;
    }
  };

  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        onKeyDown={(event) => {
          if (event.key === "Tab") {
            if (!modalRef.current) return;
            const focusableSelectors =
              "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
            const focusableElements = Array.from(
              modalRef.current.querySelectorAll(focusableSelectors)
            ).filter((el) => el.offsetParent !== null);
            if (focusableElements.length === 0) return;
            event.preventDefault();
            event.stopPropagation();
            const currentIndex = focusableElements.indexOf(
              document.activeElement
            );
            let nextIndex;
            if (event.shiftKey) {
              nextIndex =
                currentIndex <= 0
                  ? focusableElements.length - 1
                  : currentIndex - 1;
            } else {
              nextIndex =
                currentIndex === -1 ||
                currentIndex === focusableElements.length - 1
                  ? 0
                  : currentIndex + 1;
            }
            focusableElements[nextIndex]?.focus();
          }
        }}
        className="bg-gray-900 border border-gray-600 rounded-lg shadow-lg flex flex-col w-full max-w-4xl max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-full h-12 bg-black bg-opacity-60 flex-shrink-0 flex justify-between items-center px-3 rounded-t-lg z-20">
          <div className="flex items-center space-x-4">
            <div className="flex items-center text-gray-400 text-sm">
              <div className="rounded-full bg-slate-800 border border-gray-700 p-1.5 text-sky-300 shadow-inner shadow-black/50 mr-3">
                <SearchIcon className="w-4 h-4" />
              </div>
              <span className="text-white text-base font-semibold">
                Search Files &amp; Folders
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="p-1 text-gray-300 hover:text-white"
              title="Close (Esc)"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>
        <div className="px-5 py-3 border-b border-gray-800 bg-[#0b1326]">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold text-sky-400 whitespace-nowrap">
              Search Path:
            </span>
            <div className="flex-1 min-w-0">
              <TruncatedText
                text={basePath || "(path not available)"}
                className="text-lg font-semibold text-sky-400"
                title={basePath || "(path not available)"}
              />
            </div>
          </div>
          <div className="mt-3 space-y-2 text-sm text-gray-400">
            <p className="text-sm font-semibold text-gray-300">
              Change search path to:
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleUseActivePanelPath}
                disabled={!canUseActivePath}
                title={
                  canUseActivePath
                    ? activePanelPath
                    : "Active panel path unavailable"
                }
                className={`rounded border px-4 py-2 text-sm font-semibold tracking-wide transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-50 ${
                  canUseActivePath
                    ? "border-gray-600 text-white hover:border-sky-400"
                    : "border-gray-700 text-gray-500"
                }`}
              >
                Active Panel Path
              </button>
              <button
                type="button"
                onClick={handleUseOtherPanelPath}
                disabled={!canUseOtherPath}
                title={
                  canUseOtherPath
                    ? otherPanelPath
                    : "Other panel path unavailable"
                }
                className={`rounded border px-4 py-2 text-sm font-semibold tracking-wide transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-50 ${
                  canUseOtherPath
                    ? "border-gray-600 text-white hover:border-sky-400"
                    : "border-gray-700 text-gray-500"
                }`}
              >
                Other Panel Path
              </button>
              <button
                type="button"
                onClick={handleOpenPathSelector}
                title="Change to a different path"
                className="rounded border border-gray-600 bg-gray-900 px-4 py-2 text-sm font-semibold tracking-wide text-white hover:border-sky-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                Different Path...
              </button>
            </div>
          </div>
        </div>

        <main className="p-5 space-y-4 overflow-hidden flex flex-col flex-1">
          <div className="space-y-2">
            <label
              htmlFor="search-query"
              className="text-sm font-medium text-gray-300"
            >
              Search Query
            </label>
            <input
              ref={inputRef}
              id="search-query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter query to match inside filename or folder name"
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm text-gray-300">
            <label className="flex items-center gap-2" title={matchCaseTitle}>
              <input
                type="checkbox"
                checked={matchCase}
                onChange={(e) => setMatchCase(e.target.checked)}
                className="w-4 h-4 text-sky-600 bg-gray-700 border-gray-600 rounded"
              />
              Match Case
            </label>
            <label className="flex items-center gap-2" title={regexExamples}>
              <input
                type="checkbox"
                checked={useRegex}
                onChange={(e) => setUseRegex(e.target.checked)}
                className="w-4 h-4 text-sky-600 bg-gray-700 border-gray-600 rounded"
                aria-label="Use Regular Expression"
              />
              <span>Use Regular Expression</span>
            </label>
            <label
              className="flex items-center gap-2"
              title={includeSubfoldersTitle}
            >
              <input
                type="checkbox"
                checked={includeSubfolders}
                onChange={(e) => setIncludeSubfolders(e.target.checked)}
                className="w-4 h-4 text-sky-600 bg-gray-700 border-gray-600 rounded"
              />
              Include Subfolders
            </label>
            <label
              className="flex items-center gap-2"
              title={includeHiddenTitle}
            >
              <input
                type="checkbox"
                checked={includeHidden}
                onChange={(e) => setIncludeHidden(e.target.checked)}
                className="w-4 h-4 text-sky-600 bg-gray-700 border-gray-600 rounded"
              />
              Include Hidden Items
            </label>
          </div>

          <div className="text-xs text-gray-500">
            Searches follow symlinks automatically and will return files or
            folders whose names match the criteria. Use{" "}
            <span className="text-sky-300">* </span>for wildcard matching when
            regex is disabled.
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-gray-700 rounded font-semibold text-white"
            >
              {loading ? "Searching…" : "Search"}
            </button>
            {error && <p className="text-red-400 text-sm">{error}</p>}
          </div>

          {hasSearched && totalMatches > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-gray-700 bg-gray-800 p-3 text-sm text-gray-400">
              <Info className="w-5 h-5 flex-shrink-0 text-sky-400" />
              <p className="leading-relaxed text-[0.85rem]">
                Find the {totalMatches} search result item
                {totalMatches === 1 ? "" : "s"} below. Use Page Up/Down and
                Home/End keys or mouse scroll to scroll up and down the results,
                and use arrow keys (up/down) or Tab (once the results are in
                focus) to navigate through the individual result items. Once a
                result item is selected (either with the arrow keys or with
                mouse), you can change the folder to the selected item&apos;s
                path by double clicking on the item, or pressing Enter key or
                clicking on the Go To button.
              </p>
            </div>
          )}

          <div
            ref={resultsContainerRef}
            tabIndex={0}
            onKeyDown={handleResultsKeyDown}
            className="overflow-y-auto flex-1 space-y-4 max-h-[40vh] lg:max-h-[45vh] focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            {results.length === 0 && !loading ? (
              <p className="text-sm text-gray-400">No results yet.</p>
            ) : (
              results.map((group, groupIndex) => (
                <div
                  key={group.folder}
                  className="border border-gray-700 rounded-lg p-3 bg-gray-900"
                >
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                    <span className="font-semibold">Folder</span>
                    <span>
                      {group.items.length} item
                      {group.items.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="text-sm font-mono text-gray-100 mb-2">
                    <TruncatedText text={group.folder} />
                  </div>
                  <div className="space-y-2">
                    {group.items.map((item, itemIndex) => {
                      const isSelected =
                        selectedResult.groupIndex === groupIndex &&
                        selectedResult.itemIndex === itemIndex;
                      return (
                        <button
                          ref={(el) => {
                            if (el) {
                              resultItemRefs.current[item.fullPath] = el;
                            } else {
                              delete resultItemRefs.current[item.fullPath];
                            }
                          }}
                          key={item.fullPath}
                          type="button"
                          onClick={() =>
                            handleSelectResult(groupIndex, itemIndex)
                          }
                          onDoubleClick={() => {
                            handleSelectResult(groupIndex, itemIndex);
                            handleGoToSelection();
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              event.stopPropagation();
                              handleSelectResult(groupIndex, itemIndex);
                              handleGoToSelection();
                            }
                          }}
                          className={`w-full rounded-lg p-2 flex items-center gap-3 transition-colors text-left ${
                            isSelected ? "bg-blue-600" : "hover:bg-gray-800"
                          }`}
                        >
                          <Icon type={item.type} />
                          <div className="flex-1 min-w-0">
                            <TruncatedText
                              text={item.name}
                              className="text-sm text-white"
                            />
                            <div className="flex items-center justify-between text-xs text-gray-400 mt-0.5">
                              <span>{item.type}</span>
                              <span>
                                {item.size != null
                                  ? formatBytes(item.size)
                                  : ""}
                                {item.size != null && item.modified
                                  ? " • "
                                  : ""}
                                {item.modified ? formatDate(item.modified) : ""}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </main>

        <footer className="flex items-center justify-between px-5 py-4 border-t border-gray-700">
          <div className="text-xs text-gray-400 min-w-[140px]">
            {matchesLabel || "\u00a0"}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleGoToSelection}
              disabled={!selectedItem}
              className="px-4 py-2 bg-lime-600 hover:bg-lime-500 disabled:bg-gray-600 rounded font-semibold text-black"
            >
              Go To
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default SearchModal;
