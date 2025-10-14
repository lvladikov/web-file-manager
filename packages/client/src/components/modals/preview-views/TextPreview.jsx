import React, { useEffect } from "react";

// syntax highlighting imports
import Prism from "prismjs";
import "prismjs/themes/prism-okaidia.css"; // Dark theme for highlighting

// Import specific languages you want to support
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

import EditableTextPreview from "./EditableTextPreview";

const TextPreview = ({
  codeLines,
  showLineNumbers,
  wordWrap,
  language,
  item,
  previewType,
  textContent,
  textError,
  searchTerm,
  matches,
  currentMatchIndex,
  setCodeLines,
  getPrismLanguage,
  isEditing,
  onSave,
  onCancelEdit,
}) => {
  useEffect(() => {
    if (!isEditing) {
      const language = getPrismLanguage(item?.name);
      const grammar = Prism.languages[language] || Prism.languages.plaintext;
      let fullHighlightedHtml;

      if (!searchTerm || matches.length === 0) {
        fullHighlightedHtml = Prism.highlight(textContent, grammar, language);
      } else {
        let lastIndex = 0;
        const parts = [];
        matches.forEach((match, index) => {
          const before = textContent.substring(lastIndex, match.index);
          parts.push(Prism.highlight(before, grammar, language));

          const matchedText = match[0];
          const highlightedMatch = Prism.highlight(
            matchedText,
            grammar,
            language
          );
          const markClass =
            index === currentMatchIndex
              ? "bg-yellow-400 text-black rounded-sm"
              : "bg-sky-600 bg-opacity-50 rounded-sm";
          parts.push(
            `<mark id="match-${index}" class="${markClass}">${highlightedMatch}</mark>`
          );
          lastIndex = match.index + matchedText.length;
        });
        const after = textContent.substring(lastIndex);
        parts.push(Prism.highlight(after, grammar, language));
        fullHighlightedHtml = parts.join("");
      }

      setCodeLines(fullHighlightedHtml.split("\n"));
    }
  }, [
    textContent,
    textError,
    searchTerm,
    matches,
    currentMatchIndex,
    item,
    previewType,
    isEditing,
    setCodeLines,
    getPrismLanguage,
  ]);

  if (isEditing) {
    return (
      <EditableTextPreview
        codeLines={codeLines}
        showLineNumbers={showLineNumbers}
        wordWrap={wordWrap}
        language={language}
        item={item}
        previewType={previewType}
        textContent={textContent}
        textError={textError}
        searchTerm={searchTerm}
        matches={matches}
        currentMatchIndex={currentMatchIndex}
        setCodeLines={setCodeLines}
        getPrismLanguage={getPrismLanguage}
        onSave={onSave}
        isEditing={isEditing}
        onCancelEdit={onCancelEdit}
      />
    );
  }

  return (
    <div className="bg-gray-800 text-gray-300 font-mono text-sm p-4 h-full overflow-auto">
      <table
        style={{
          tableLayout: "auto",
          width: "100%",
          borderCollapse: "collapse",
        }}
      >
        <tbody>
          {codeLines.map((line, index) => (
            <tr key={index}>
              {showLineNumbers && (
                <td
                  style={{
                    verticalAlign: "top",
                    textAlign: "right",
                    paddingRight: "1.25rem",
                    color: "#999",
                    userSelect: "none",
                    lineHeight: 1.5,
                  }}
                >
                  {index + 1}
                </td>
              )}
              <td
                style={{
                  verticalAlign: "top",
                  lineHeight: 1.5,
                  width: "100%",
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    padding: 0,
                    whiteSpace: wordWrap ? "pre-wrap" : "pre",
                    wordBreak: wordWrap ? "break-word" : "normal",
                    overflowWrap: wordWrap ? "break-word" : "normal",
                  }}
                >
                  <code
                    className={`language-${language}`}
                    style={{
                      display: "block",
                      whiteSpace: wordWrap ? "pre-wrap" : "pre",
                      wordBreak: wordWrap ? "break-word" : "normal",
                      overflowWrap: wordWrap ? "break-word" : "normal",
                    }}
                    dangerouslySetInnerHTML={{ __html: line || " " }}
                  />
                </pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TextPreview;
