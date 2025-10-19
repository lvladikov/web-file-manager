import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useLayoutEffect,
} from "react";
import Prism from "prismjs";
import "prismjs/themes/prism-okaidia.css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-css";
import "prismjs/components/prism-json";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-ini";
import "prismjs/components/prism-python";
import "prismjs/components/prism-ignore";
import "prismjs/components/prism-properties";
import { LoaderCircle, FileWarning } from "lucide-react";

const EditableTextPreview = ({
  item,
  editedContent,
  onContentChange,
  wordWrap,
  getFileTypeInfo,
  isFindReplaceVisible,
  showLineNumbers,
  editSearchClearRef,
  textError,
}) => {
  const [highlightedCode, setHighlightedCode] = useState("");
  const editorRef = useRef(null);
  const preRef = useRef(null);
  const findInputRef = useRef(null);
  const lineNumbersRef = useRef(null);
  const [lineNumbersForRender, setLineNumbersForRender] = useState([]);
  const initialCursorSet = useRef(false);

  const fileTypeInfo = getFileTypeInfo(item?.name, item?.type);
  const language = fileTypeInfo?.id;

  // State for find and replace functionality
  const [findTerm, setFindTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [findMatches, setFindMatches] = useState([]);
  const [currentFindMatchIndex, setCurrentFindMatchIndex] = useState(-1);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [regexError, setRegexError] = useState("");

  // Search clearing function for Edit Mode
  const handleClearEditModeSearch = useCallback(() => {
    setFindTerm("");
    setReplaceTerm("");
    setFindMatches([]);
    setCurrentFindMatchIndex(-1);
    setRegexError("");
    // Note: Do not clear useRegex/caseSensitive flags
  }, []);

  // Expose the clear function via the ref passed from the parent
  useEffect(() => {
    if (editSearchClearRef) {
      editSearchClearRef.current = handleClearEditModeSearch;
    }
  }, [editSearchClearRef, handleClearEditModeSearch]);

  // Initial Focus on Mount (runs once)
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.focus();
      // Only set range on mount for an immediate focus, the second useEffect will fix the position after content loads
      editorRef.current.setSelectionRange(0, 0);
    }
    // Cleanup function to reset flag when component unmounts (closing modal)
    return () => {
      initialCursorSet.current = false;
    };
  }, []);

  // Effect to prioritize focus on the Find input when the bar is toggled.
  useEffect(() => {
    if (isFindReplaceVisible && findInputRef.current) {
      // Focus the Find input when the bar opens
      findInputRef.current.focus();
    } else if (!isFindReplaceVisible && editorRef.current) {
      // Return focus to the editor when the bar closes (for immediate typing)
      editorRef.current.focus();
    }
  }, [isFindReplaceVisible]);

  // Set Cursor/Scroll when editedContent is asynchronously loaded (runs after fetch)
  useEffect(() => {
    // Check if content is available (not initial "Loading...") AND we haven't done this yet
    if (
      editorRef.current &&
      editedContent.length > 0 &&
      !initialCursorSet.current
    ) {
      // Set cursor to the very start of the file
      editorRef.current.setSelectionRange(0, 0);
      // Explicitly scroll the textarea to the top
      editorRef.current.scrollTop = 0;
      initialCursorSet.current = true;
    }
  }, [editedContent]); // Dependency ensures it runs when the fetched content first arrives.

  useEffect(() => {
    const grammar = Prism.languages[language] || Prism.languages.plaintext;

    if (!findTerm || findMatches.length === 0) {
      // No search, just highlight the code
      const html = Prism.highlight(editedContent, grammar, language);
      setHighlightedCode(html);
      return;
    }

    // Search is active, highlight with <mark> tags
    let lastIndex = 0;
    const parts = [];
    findMatches.forEach((match, index) => {
      const before = editedContent.substring(lastIndex, match.index);
      parts.push(Prism.highlight(before, grammar, language));

      const matchedText = match[0];
      const highlightedMatch = Prism.highlight(matchedText, grammar, language);
      const markClass =
        index === currentFindMatchIndex
          ? "bg-yellow-400 text-black rounded-sm"
          : "bg-sky-600 bg-opacity-50 rounded-sm";
      parts.push(
        `<mark id="match-${index}" class="${markClass}">${highlightedMatch}</mark>`
      );
      lastIndex = match.index + matchedText.length;
    });
    const after = editedContent.substring(lastIndex);
    parts.push(Prism.highlight(after, grammar, language));

    setHighlightedCode(parts.join(""));
  }, [editedContent, language, findTerm, findMatches, currentFindMatchIndex]);

  useEffect(() => {
    if (currentFindMatchIndex > -1 && preRef.current) {
      const element = preRef.current.querySelector(
        `#match-${currentFindMatchIndex}`
      );
      if (element) {
        element.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
      }
    }
  }, [currentFindMatchIndex]);

  const syncScroll = () => {
    if (editorRef.current && preRef.current) {
      const top = editorRef.current.scrollTop;
      const left = editorRef.current.scrollLeft;
      preRef.current.scrollTop = top;
      preRef.current.scrollLeft = left;
      if (lineNumbersRef.current) {
        lineNumbersRef.current.scrollTop = top;
      }
    }
  };

  const performSearch = useCallback(() => {
    if (!findTerm) {
      setFindMatches([]);
      setCurrentFindMatchIndex(-1);
      setRegexError("");
      return;
    }
    try {
      const flags = caseSensitive ? "g" : "gi";
      const regex = useRegex
        ? new RegExp(findTerm, flags)
        : new RegExp(findTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
      const currentMatches = Array.from(editedContent.matchAll(regex));
      setFindMatches(currentMatches);
      setCurrentFindMatchIndex(currentMatches.length > 0 ? 0 : -1);
      setRegexError("");
    } catch (e) {
      setFindMatches([]);
      setCurrentFindMatchIndex(-1);
      setRegexError("Invalid regex");
    }
  }, [editedContent, findTerm, caseSensitive, useRegex]);

  useEffect(() => {
    performSearch();
  }, [performSearch]);

  const findNext = () => {
    if (findMatches.length === 0) return;
    setCurrentFindMatchIndex((prev) => (prev + 1) % findMatches.length);
  };

  const findPrevious = () => {
    if (findMatches.length === 0) return;
    setCurrentFindMatchIndex(
      (prev) => (prev - 1 + findMatches.length) % findMatches.length
    );
  };

  const replaceOne = () => {
    if (currentFindMatchIndex === -1 || findMatches.length === 0) return;
    const match = findMatches[currentFindMatchIndex];
    const start = match.index;
    const end = match.index + match[0].length;
    const newContent =
      editedContent.substring(0, start) +
      replaceTerm +
      editedContent.substring(end);
    onContentChange(newContent);

    // Defer the call to findNext using setTimeout(0).
    setTimeout(() => {
      findNext();
    }, 0);
  };

  const replaceAll = () => {
    if (findMatches.length === 0) return;
    const flags = caseSensitive ? "g" : "gi";
    const regex = useRegex
      ? new RegExp(findTerm, flags)
      : new RegExp(findTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
    const newContent = editedContent.replace(regex, replaceTerm);
    onContentChange(newContent);
    // After replace all, clear search to remove highlights
    handleClearEditModeSearch();
  };

  const FONT_STYLE = {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: "0.875rem",
    lineHeight: 1.5,
    tabSize: 4,
    MozTabSize: 4,
  };

  const recalculateLineNumbers = useCallback(() => {
    if (showLineNumbers && preRef.current) {
      const preStyles = window.getComputedStyle(preRef.current);
      const lineHeight = parseFloat(preStyles.lineHeight);
      if (!lineHeight) return;

      const lines = editedContent.split("\n");
      const newLineNumbers = [];

      const tempDiv = document.createElement("div");

      // Apply all relevant styles to the temporary div for accurate measurement
      Object.assign(tempDiv.style, FONT_STYLE, {
        whiteSpace: wordWrap ? "pre-wrap" : "pre",
        overflowWrap: "break-word",
        width: `${preRef.current.clientWidth}px`,
        visibility: "hidden",
        position: "absolute",
      });

      document.body.appendChild(tempDiv);

      lines.forEach((lineContent, index) => {
        tempDiv.textContent = lineContent || "\u00a0";
        const height = tempDiv.offsetHeight;
        const visualLines = Math.max(1, Math.round(height / lineHeight));

        newLineNumbers.push(index + 1);
        for (let i = 1; i < visualLines; i++) {
          newLineNumbers.push(null);
        }
      });

      document.body.removeChild(tempDiv);
      setLineNumbersForRender(newLineNumbers);
    } else if (showLineNumbers) {
      const simpleLines = editedContent.split("\n");
      setLineNumbersForRender(simpleLines.map((_, i) => i + 1));
    }
  }, [editedContent, wordWrap, showLineNumbers]);

  useLayoutEffect(() => {
    recalculateLineNumbers();
  }, [recalculateLineNumbers]);

  useEffect(() => {
    const editorEl = preRef.current;
    if (!editorEl) return;
    const resizeObserver = new ResizeObserver(recalculateLineNumbers);
    resizeObserver.observe(editorEl);
    return () => resizeObserver.unobserve(editorEl);
  }, [recalculateLineNumbers]);

  const editorContainerStyle = {
    display: "grid",
    gridTemplateColumns: showLineNumbers ? "auto 1fr" : "1fr",
    gridTemplateRows: "1fr",
    overflow: "hidden",
  };

  const sharedEditorStyles = {
    ...FONT_STYLE,
    gridArea: "1 / " + (showLineNumbers ? "2 / 3" : "1 / 2"),
    whiteSpace: wordWrap ? "pre-wrap" : "pre",
    overflowWrap: "break-word",
    margin: 0,
    padding: "1rem",
    boxSizing: "border-box",
    border: 0,
    outline: "none",
    overflow: "auto",
  };

  if (editedContent === "Loading...") {
    return (
      <div className="flex items-center justify-start h-full text-gray-300 p-4">
        <LoaderCircle className="w-10 h-10 animate-spin text-sky-400 mr-3" />
        <p>Loading text...</p>
      </div>
    );
  }

  if (textError) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-900 text-red-400">
        <FileWarning className="w-12 h-12 mb-3" />
        <p>Error loading file: {textError}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {isFindReplaceVisible && (
        <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4 p-2 bg-gray-700 border-b border-gray-600 flex-shrink-0">
          {/* Find Controls */}
          <div className="flex items-center space-x-2 flex-grow lg:flex-grow-0">
            <input
              ref={findInputRef}
              type="text"
              placeholder="Find..."
              value={findTerm}
              onChange={(e) => setFindTerm(e.target.value)}
              className="p-1 rounded bg-gray-800 text-white border border-gray-600 w-full lg:w-32"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (e.shiftKey) {
                    findPrevious();
                  } else {
                    findNext();
                  }
                }
              }}
            />
            <button
              onClick={findPrevious}
              disabled={findMatches.length === 0}
              className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-white disabled:opacity-50"
            >
              &lt;
            </button>
            <button
              onClick={findNext}
              disabled={findMatches.length === 0}
              className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-white disabled:opacity-50"
            >
              &gt;
            </button>
            <span className="text-gray-300 text-nowrap">
              {regexError ? (
                <span className="text-red-400" title={regexError}>
                  Error
                </span>
              ) : findMatches.length > 0 ? (
                `${currentFindMatchIndex + 1} / ${findMatches.length}`
              ) : (
                "0 / 0"
              )}
            </span>
            <label className="flex items-center text-gray-300">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                className="mr-1"
              />
              Case
            </label>
            <label className="flex items-center text-gray-300">
              <input
                type="checkbox"
                checked={useRegex}
                onChange={(e) => setUseRegex(e.target.checked)}
                className="mr-1"
              />
              Regex
            </label>
          </div>

          {/* Replace Controls */}
          <div className="flex items-center space-x-2 flex-grow lg:flex-grow-0">
            <input
              type="text"
              placeholder="Replace with..."
              value={replaceTerm}
              onChange={(e) => setReplaceTerm(e.target.value)}
              className="p-1 rounded bg-gray-800 text-white border border-gray-600 w-full lg:w-32"
            />
            <button
              onClick={replaceOne}
              disabled={findMatches.length === 0}
              className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 rounded text-white disabled:opacity-50"
            >
              Replace
            </button>
            <button
              onClick={replaceAll}
              disabled={findMatches.length === 0}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-white disabled:opacity-50"
            >
              Replace All
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0" style={editorContainerStyle}>
        {showLineNumbers && (
          <pre
            ref={lineNumbersRef}
            aria-hidden="true"
            className="text-right text-gray-500 select-none bg-gray-900 font-mono text-sm overflow-y-hidden"
            style={{
              ...FONT_STYLE,
              gridArea: "1 / 1 / 2 / 2",
              padding: "1rem",
              paddingRight: "1.25rem",
              margin: 0,
            }}
          >
            {lineNumbersForRender.map((num, i) => (
              <div key={i} style={{ height: `${FONT_STYLE.lineHeight}em` }}>
                {num !== null ? num : "\u00a0"}
              </div>
            ))}
          </pre>
        )}
        <textarea
          ref={editorRef}
          className="bg-transparent text-transparent caret-white resize-none"
          value={editedContent}
          onChange={(e) => onContentChange(e.target.value)}
          onScroll={syncScroll}
          spellCheck="false"
          wrap={wordWrap ? "soft" : "off"}
          style={{ ...sharedEditorStyles, zIndex: 1, overflow: "hidden" }}
        />
        <pre
          ref={preRef}
          className="text-gray-200 bg-gray-900 pointer-events-none"
          aria-hidden="true"
          style={sharedEditorStyles}
        >
          <code
            className={`language-${language}`}
            style={{ display: "block" }}
            dangerouslySetInnerHTML={{ __html: highlightedCode + "\n" }}
          />
        </pre>
      </div>
    </div>
  );
};

export default EditableTextPreview;
