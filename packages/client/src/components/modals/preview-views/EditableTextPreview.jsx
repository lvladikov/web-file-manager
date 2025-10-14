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
  textContent,
  onSave,
  wordWrap,
  getPrismLanguage,
}) => {
  const [editedContent, setEditedContent] = useState(textContent);
  const [highlightedCode, setHighlightedCode] = useState("");
  const [undoStack, setUndoStack] = useState([textContent]);
  const [redoStack, setRedoStack] = useState([]);
  const editorRef = useRef(null);
  const preRef = useRef(null);

  const language = getPrismLanguage(item?.name);

  useEffect(() => {
    setEditedContent(textContent);
    setUndoStack([textContent]);
    setRedoStack([]);
  }, [textContent]);

  useEffect(() => {
    const grammar = Prism.languages[language] || Prism.languages.plaintext;
    const html = Prism.highlight(editedContent, grammar, language);
    setHighlightedCode(html);
  }, [editedContent, language]);

  const syncScroll = () => {
    if (preRef.current && editorRef.current) {
      preRef.current.scrollTop = editorRef.current.scrollTop;
      preRef.current.scrollLeft = editorRef.current.scrollLeft;
    }
  };

  const handleChange = (e) => {
    const newContent = e.target.value;
    setEditedContent(newContent);
    setUndoStack((prev) => [...prev, newContent]);
    setRedoStack([]);
  };

  const handleUndo = useCallback(() => {
    if (undoStack.length > 1) {
      const prevContent = undoStack[undoStack.length - 2];
      const lastContent = undoStack[undoStack.length - 1];
      setRedoStack((prev) => [lastContent, ...prev]);
      setUndoStack((prev) => prev.slice(0, prev.length - 1));
      setEditedContent(prevContent);
    }
  }, [undoStack]);

  const handleRedo = useCallback(() => {
    if (redoStack.length > 0) {
      const nextContent = redoStack[0];
      setUndoStack((prev) => [...prev, nextContent]);
      setRedoStack((prev) => prev.slice(1));
      setEditedContent(nextContent);
    }
  }, [redoStack]);

  const handleSave = () => {
    onSave(item.fullPath, editedContent);
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
    setEditedContent(newContent);
    setUndoStack((prev) => [...prev, newContent]);
    setRedoStack([]);
  };

  const replaceAll = () => {
    if (findMatches.length === 0) return;
    const flags = caseSensitive ? "g" : "gi";
    const regex = useRegex
      ? new RegExp(findTerm, flags)
      : new RegExp(findTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
    const newContent = editedContent.replace(regex, replaceTerm);
    setEditedContent(newContent);
    setUndoStack((prev) => [...prev, newContent]);
    setRedoStack([]);
  };

  const commonEditorStyles = {
    whiteSpace: wordWrap ? "pre-wrap" : "pre",
    wordBreak: wordWrap ? "break-word" : "normal",
    overflowWrap: wordWrap ? "break-word" : "normal",
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center p-2 bg-gray-700 border-b border-gray-600 flex-shrink-0">
        <button
          onClick={handleSave}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-white mr-2"
        >
          Save
        </button>
        <button
          onClick={handleUndo}
          disabled={undoStack.length <= 1}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white mr-2 disabled:opacity-50"
        >
          Undo
        </button>
        <button
          onClick={handleRedo}
          disabled={redoStack.length === 0}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white mr-4 disabled:opacity-50"
        >
          Redo
        </button>

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

      <div className="grid flex-1 min-h-0 font-mono text-sm">
        <textarea
          ref={editorRef}
          className="col-start-1 row-start-1 w-full h-full bg-transparent text-transparent caret-white p-4 resize-none outline-none overflow-auto z-10"
          value={editedContent}
          onChange={handleChange}
          onScroll={syncScroll}
          spellCheck="false"
          wrap={wordWrap ? "soft" : "off"}
          style={commonEditorStyles}
        />
        <pre
          ref={preRef}
          className="col-start-1 row-start-1 w-full h-full bg-gray-900 text-gray-200 p-4 overflow-auto pointer-events-none"
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
  );
};

export default EditableTextPreview;
