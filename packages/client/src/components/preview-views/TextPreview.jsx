const TextPreview = ({ codeLines, showLineNumbers, wordWrap, language }) => {
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
