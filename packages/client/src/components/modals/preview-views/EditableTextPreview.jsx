import React, { useEffect, useState, useRef, useCallback } from "react";
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

const EditableTextPreview = ({
  item,
  editedContent,
  onContentChange,
  wordWrap,
  getPrismLanguage,
  isFindReplaceVisible,
  showLineNumbers,
}) => {
  const [highlightedCode, setHighlightedCode] = useState("");
  const editorRef = useRef(null);
  const preRef = useRef(null);
  const lineNumbersRef = useRef(null);

  const language = getPrismLanguage(item?.name);

  useEffect(() => {
    editorRef.current?.focus();
  }, []);

  useEffect(() => {
    const grammar = Prism.languages[language] || Prism.languages.plaintext;
    const html = Prism.highlight(editedContent, grammar, language);
    setHighlightedCode(html);
  }, [editedContent, language]);

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

  const [findTerm, setFindTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [findMatches, setFindMatches] = useState([]);
  const [currentFindMatchIndex, setCurrentFindMatchIndex] = useState(-1);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);

  const performSearch = useCallback(() => {
    if (!findTerm) {
      setFindMatches([]);
      setCurrentFindMatchIndex(-1);
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
    } catch (e) {
      setFindMatches([]);
      setCurrentFindMatchIndex(-1);
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
  };

  const replaceAll = () => {
    if (findMatches.length === 0) return;
    const flags = caseSensitive ? "g" : "gi";
    const regex = useRegex
      ? new RegExp(findTerm, flags)
      : new RegExp(findTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
    const newContent = editedContent.replace(regex, replaceTerm);
    onContentChange(newContent);
  };

  const commonEditorStyles = {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: "0.875rem",
    lineHeight: 1.5,
    tabSize: 4,
    MozTabSize: 4,
    whiteSpace: wordWrap ? "pre-wrap" : "pre",
    wordBreak: "break-all",
    overflowWrap: "break-word",
    margin: 0,
    padding: "1rem",
    boxSizing: "border-box",
    border: 0,
    outline: "none",
    verticalAlign: "top",
  };

  const lines = editedContent.split("\n");

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {isFindReplaceVisible && (
        <div className="flex items-center p-2 bg-gray-700 border-b border-gray-600 flex-shrink-0">
          <input
            type="text"
            placeholder="Find..."
            value={findTerm}
            onChange={(e) => setFindTerm(e.target.value)}
            className="p-1 rounded bg-gray-800 text-white border border-gray-600 mr-2"
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
            className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-white mr-2 disabled:opacity-50"
          >
            &gt;
          </button>
          <span className="text-gray-300 mr-2">
            {findMatches.length > 0
              ? `${currentFindMatchIndex + 1} / ${findMatches.length}`
              : "0 / 0"}
          </span>
          <label className="flex items-center text-gray-300 mr-2">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
              className="mr-1"
            />
            Case
          </label>
          <label className="flex items-center text-gray-300 mr-4">
            <input
              type="checkbox"
              checked={useRegex}
              onChange={(e) => setUseRegex(e.target.checked)}
              className="mr-1"
            />
            Regex
          </label>
          <input
            type="text"
            placeholder="Replace with..."
            value={replaceTerm}
            onChange={(e) => setReplaceTerm(e.target.value)}
            className="p-1 rounded bg-gray-800 text-white border border-gray-600 mr-2"
          />
          <button
            onClick={replaceOne}
            disabled={findMatches.length === 0}
            className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 rounded text-white mr-2 disabled:opacity-50"
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
      )}
      <div className="flex flex-1 min-h-0">
        {showLineNumbers && (
          <pre
            ref={lineNumbersRef}
            aria-hidden="true"
            className="text-right text-gray-500 select-none bg-gray-900 font-mono text-sm overflow-y-hidden"
            style={{
              padding: "1rem",
              paddingRight: "1rem",
              lineHeight: commonEditorStyles.lineHeight,
            }}
          >
            {lines.map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </pre>
        )}
        <div className="grid flex-1 min-h-0">
          <textarea
            ref={editorRef}
            className="col-start-1 row-start-1 w-full h-full bg-transparent text-transparent caret-white resize-none overflow-auto z-10"
            value={editedContent}
            onChange={(e) => onContentChange(e.target.value)}
            onScroll={syncScroll}
            spellCheck="false"
            wrap={wordWrap ? "soft" : "off"}
            style={commonEditorStyles}
          />
          <pre
            ref={preRef}
            className="col-start-1 row-start-1 w-full h-full text-gray-200 bg-gray-900 overflow-auto pointer-events-none"
            aria-hidden="true"
            style={commonEditorStyles}
          >
            <code
              className={`language-${language}`}
              dangerouslySetInnerHTML={{ __html: highlightedCode + "\n" }}
            />
          </pre>
        </div>
      </div>
    </div>
  );
};

export default EditableTextPreview;
