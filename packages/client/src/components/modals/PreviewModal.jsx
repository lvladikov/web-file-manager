import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText,
  LoaderCircle,
  FileAudio,
  XCircle,
  Expand,
  WrapText,
  Search,
  ChevronUp,
  ChevronDown,
  ListOrdered,
} from "lucide-react";

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

import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Configure the PDF.js worker to use the local file copied by our Vite plugin.
pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.js`;

import {
  buildFullPath,
  isPreviewableImage,
  isPreviewablePdf,
  isPreviewableVideo,
  isPreviewableAudio,
  isPreviewableText,
  getPrismLanguage,
  isMac,
} from "../../lib/utils";
import { parseTrackInfo } from "../../lib/api";

import AudioPreview from "./preview-views/AudioPreview";

const PdfPreview = ({ fileUrl, isFullscreen }) => {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef(null);

  const onDocumentLoadSuccess = ({ numPages: nextNumPages }) => {
    setNumPages(nextNumPages);
  };

  const goToPrevPage = useCallback(
    () => setPageNumber((prev) => Math.max(prev - 1, 1)),
    []
  );

  const goToNextPage = useCallback(
    () => setPageNumber((prev) => Math.min(prev + 1, numPages)),
    [numPages]
  );

  // Use a ResizeObserver to dynamically set the PDF page width to fit the container.
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        clearTimeout(observer._timeout);
        observer._timeout = setTimeout(() => {
          setContainerWidth(entries[0].contentRect.width);
        }, 150);
      }
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Effect for handling keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToPrevPage();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goToNextPage();
      }
    };

    const currentContainer = containerRef.current;
    if (currentContainer) {
      // Focus the container to receive key events immediately
      currentContainer.focus();
      currentContainer.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      if (currentContainer) {
        currentContainer.removeEventListener("keydown", handleKeyDown);
      }
    };
  }, [goToPrevPage, goToNextPage]);

  return (
    <div
      ref={containerRef}
      tabIndex="-1" // Make it focusable
      className={`flex flex-col bg-black rounded-b-lg transition-none duration-0 outline-none ${
        isFullscreen ? "w-full h-full" : ""
      }`}
      style={
        isFullscreen
          ? { width: "100%", height: "100%", transition: "none" }
          : {
              height: "calc(100vh - 8rem)",
              maxWidth: "90vw",
              margin: "auto",
              transition: "none",
            }
      }
    >
      {/* Controls */}
      <div className="flex-shrink-0 bg-gray-800 p-2 flex items-center justify-center space-x-4 text-white shadow-md z-10 w-full">
        <button
          onClick={goToPrevPage}
          disabled={pageNumber <= 1}
          className="px-3 py-1 bg-gray-600 rounded disabled:opacity-50 hover:bg-gray-500"
        >
          Previous
        </button>
        <span>
          Page {pageNumber} of {numPages || "..."}
        </span>
        <button
          onClick={goToNextPage}
          disabled={pageNumber >= numPages}
          className="px-3 py-1 bg-gray-600 rounded disabled:opacity-50 hover:bg-gray-500"
        >
          Next
        </button>
      </div>

      {/* PDF display */}
      <div
        className="flex-grow flex justify-center items-center overflow-auto bg-gray-900"
        style={{ padding: "1rem" }}
      >
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={console.error}
          loading={<p className="text-gray-400 p-4">Loading PDF...</p>}
          className="flex justify-center"
        >
          {numPages && (
            <Page
              pageNumber={pageNumber}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              width={
                containerWidth
                  ? Math.min(
                      isFullscreen
                        ? containerWidth * 0.98
                        : containerWidth * 0.95,
                      2400
                    )
                  : undefined
              }
            />
          )}
        </Document>
      </div>
    </div>
  );
};

const PreviewModal = ({
  isVisible,
  item,
  activePath,
  onOpenFile,
  onClose,
  onStartSizeCalculation,
  autoLoadLyrics,
  onToggleAutoLoadLyrics,
}) => {
  const previewContainerRef = useRef(null);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [textContent, setTextContent] = useState("");
  const [textError, setTextError] = useState("");
  const [wordWrap, setWordWrap] = useState(true);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [matches, setMatches] = useState([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regexError, setRegexError] = useState("");
  const [videoHasError, setVideoHasError] = useState(false);
  const [coverArtUrl, setCoverArtUrl] = useState(null);
  const [lyrics, setLyrics] = useState(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState(null);
  const [codeLines, setCodeLines] = useState([]);
  const [showLineNumbers, setShowLineNumbers] = useState(false);

  const handleFindLyrics = async () => {
    if (!item) return;

    setLyricsLoading(true);
    setLyricsError(null);
    setLyrics(null);

    const infoFromFilename = parseTrackInfo(item.name);
    if (infoFromFilename.artist && infoFromFilename.title) {
      try {
        const res = await fetch(
          `/api/lyrics?artist=${encodeURIComponent(
            infoFromFilename.artist
          )}&title=${encodeURIComponent(infoFromFilename.title)}`
        );

        if (res.ok) {
          const data = await res.json();
          setLyrics(data.lyrics);
          setLyricsLoading(false);
          return;
        }

        if (res.status !== 404) {
          const data = await res.json();
          throw new Error(data.message || "An API error occurred.");
        }
      } catch (err) {
        setLyricsError(err.message);
        setLyricsLoading(false);
        return;
      }
    }

    try {
      const fullPath = buildFullPath(activePath, item.name);
      const metaRes = await fetch(
        `/api/track-info?path=${encodeURIComponent(fullPath)}`
      );
      const metaData = await metaRes.json();
      if (!metaRes.ok) throw new Error(metaData.message);

      const lyricsRes = await fetch(
        `/api/lyrics?artist=${encodeURIComponent(
          metaData.artist
        )}&title=${encodeURIComponent(metaData.title)}`
      );
      const lyricsData = await lyricsRes.json();
      if (!lyricsRes.ok) throw new Error(lyricsData.message);

      setLyrics(lyricsData.lyrics);
    } catch (err) {
      setLyricsError(
        err.message || "Couldn't find lyrics using filename or metadata."
      );
    } finally {
      setLyricsLoading(false);
    }
  };

  const getPreviewType = (item) => {
    if (!item) return "none";
    if (isPreviewablePdf(item.name)) return "pdf";
    if (isPreviewableImage(item.name)) return "image";
    if (isPreviewableVideo(item.name)) return "video";
    if (isPreviewableAudio(item.name)) return "audio";
    if (isPreviewableText(item.name)) return "text";
    return "unsupported";
  };

  const previewType = getPreviewType(item);

  useEffect(() => {
    setIsSearchVisible(false);
    setSearchTerm("");
    setVideoHasError(false);
    setCoverArtUrl(null);
    setLyrics(null);
    setLyricsError(null);
    setLyricsLoading(false);
  }, [item]);

  useEffect(() => {
    if (isVisible && previewType === "audio" && autoLoadLyrics) {
      handleFindLyrics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, item, previewType, autoLoadLyrics]);

  useEffect(() => {
    if (isVisible && previewType === "audio" && item) {
      const fetchCoverArt = async () => {
        const fullPath = buildFullPath(activePath, item.name);
        try {
          const res = await fetch(
            `/api/audio-cover?path=${encodeURIComponent(fullPath)}`
          );
          if (res.ok) {
            const data = await res.json();
            if (data.coverPath) {
              const imageUrl = `/api/image-preview?path=${encodeURIComponent(
                data.coverPath
              )}`;
              setCoverArtUrl(imageUrl);
            }
          }
        } catch (err) {
          console.error("Failed to fetch cover art:", err);
        }
      };
      fetchCoverArt();
    }
  }, [isVisible, item, activePath, previewType]);

  useEffect(() => {
    if (previewType !== "text" || !textContent || textError) {
      const errorLines = textError
        ? [`<span class="text-red-400">${textError}</span>`]
        : textContent.split("\n");
      setCodeLines(errorLines);
      return;
    }

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
  }, [
    textContent,
    textError,
    searchTerm,
    matches,
    currentMatchIndex,
    item,
    previewType,
  ]);

  useEffect(() => {
    if (searchTerm && textContent) {
      try {
        // Build flags dynamically
        const flags = caseSensitive ? (useRegex ? "g" : "g") : "gi";

        // Create regex safely
        const regex = useRegex
          ? new RegExp(searchTerm, flags)
          : new RegExp(
              searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
              flags
            );

        const newMatches = [...textContent.matchAll(regex)];
        setMatches(newMatches);
        setCurrentMatchIndex(newMatches.length > 0 ? 0 : -1);
        setRegexError("");
      } catch {
        setRegexError("Invalid regular expression");
        setMatches([]);
        setCurrentMatchIndex(-1);
      }
    } else {
      setMatches([]);
      setCurrentMatchIndex(-1);
      setRegexError("");
    }
  }, [searchTerm, textContent, useRegex, caseSensitive]);

  useEffect(() => {
    if (currentMatchIndex > -1) {
      const element = document.getElementById(`match-${currentMatchIndex}`);
      if (element) {
        element.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }, [currentMatchIndex]);

  const goToNextMatch = () => {
    if (matches.length > 0) {
      setCurrentMatchIndex((prev) => (prev + 1) % matches.length);
    }
  };
  const goToPrevMatch = () => {
    if (matches.length > 0) {
      setCurrentMatchIndex(
        (prev) => (prev - 1 + matches.length) % matches.length
      );
    }
  };

  useEffect(() => {
    if (!isVisible) return;
    const handleKeyDown = (e) => {
      const isModKey = isMac ? e.metaKey : e.ctrlKey;
      if (isModKey && e.key === "f") {
        if (previewType === "text") {
          e.preventDefault();
          setIsSearchVisible((prev) => !prev);
          return;
        }
      }
      if (e.key === "Escape" && !document.fullscreenElement) {
        e.preventDefault();
        onClose();
      }
      if (e.key === " ") {
        if (
          e.target.tagName !== "VIDEO" &&
          e.target.tagName !== "AUDIO" &&
          e.target.tagName !== "INPUT"
        ) {
          e.preventDefault();
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVisible, onClose, previewType]);

  useEffect(() => {
    const onFullscreenChange = () =>
      setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (isVisible && previewType === "text" && item) {
      const fetchText = async () => {
        setTextContent("Loading...");
        setTextError("");
        const fullPath = buildFullPath(activePath, item.name);
        try {
          const res = await fetch(
            `/api/text-content?path=${encodeURIComponent(fullPath)}`
          );
          if (!res.ok)
            throw new Error(`Failed to load file content (${res.status})`);
          const text = await res.text();
          setTextContent(text);
        } catch (err) {
          setTextError(err.message);
        }
      };
      fetchText();
    }
  }, [isVisible, item, activePath, previewType]);

  useEffect(() => {
    const activeMediaElement =
      previewType === "video"
        ? videoRef.current
        : previewType === "audio"
        ? audioRef.current
        : null;

    if (activeMediaElement) {
      if (isVisible && !videoHasError) {
        activeMediaElement
          .play()
          .catch((e) => console.error("Autoplay was prevented.", e));
      } else {
        activeMediaElement.pause();
      }
    }
  }, [isVisible, item, previewType, videoHasError]);

  const handleFullscreen = () => {
    const target = previewContainerRef.current;
    if (target) {
      if (!document.fullscreenElement) target.requestFullscreen();
      else document.exitFullscreen();
    }
  };

  const handleVideoError = () => {
    if (!videoHasError) {
      setVideoHasError(true);
    }
  };

  if (!isVisible || !item) return null;
  const fullPath = buildFullPath(activePath, item.name);
  const language = getPrismLanguage(item?.name);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        ref={previewContainerRef}
        className={`bg-gray-900 border border-gray-600 rounded-lg shadow-lg flex flex-col
                    ${
                      isFullscreen
                        ? "w-full h-full p-0 border-none rounded-none"
                        : "max-w-[90vw] max-h-[90vh]"
                    }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`w-full h-12 bg-black bg-opacity-60 flex-shrink-0 flex justify-end items-center px-3 space-x-3 rounded-t-lg z-20 ${
            isFullscreen || previewType === "unsupported" ? "hidden" : ""
          }`}
        >
          {previewType === "text" && (
            <>
              <button
                className={`p-1 rounded-full ${
                  isSearchVisible
                    ? "bg-sky-600 text-white"
                    : "text-gray-300 hover:text-white"
                }`}
                onClick={() => setIsSearchVisible((prev) => !prev)}
                title="Search (Cmd/Ctrl+F)"
              >
                <Search className="w-6 h-6" />
              </button>
              <button
                className={`p-1 rounded-full ${
                  showLineNumbers
                    ? "bg-sky-600 text-white"
                    : "text-gray-300 hover:text-white"
                }`}
                onClick={() => setShowLineNumbers((prev) => !prev)}
                title="Toggle Line Numbers"
              >
                <ListOrdered className="w-6 h-6" />
              </button>
              <button
                className={`p-1 rounded-full ${
                  wordWrap
                    ? "bg-sky-600 text-white"
                    : "text-gray-300 hover:text-white"
                }`}
                onClick={() => setWordWrap((prev) => !prev)}
                title="Toggle Word Wrap"
              >
                <WrapText className="w-6 h-6" />
              </button>
            </>
          )}
          {(previewType === "image" || previewType === "video") && (
            <button
              className="p-1 text-gray-300 hover:text-white"
              onClick={handleFullscreen}
              title="Toggle Fullscreen"
            >
              <Expand className="w-6 h-6" />
            </button>
          )}
          <button
            className="p-1 text-gray-300 hover:text-white"
            onClick={onClose}
            title="Close (Esc)"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {isSearchVisible && previewType === "text" && (
          <div className="w-full h-12 bg-gray-800 flex-shrink-0 flex justify-between items-center px-3 z-10 border-y border-gray-700">
            <input
              type="text"
              placeholder="Find in file..."
              className="bg-gray-700 text-white rounded px-2 py-1 w-1/2 focus:outline-none focus:ring-2 focus:ring-sky-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (e.shiftKey) {
                    goToPrevMatch();
                  } else {
                    goToNextMatch();
                  }
                }
              }}
              autoFocus
            />
            <div className="flex items-center space-x-4 text-gray-400 text-sm">
              <label className="flex items-center space-x-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useRegex}
                  onChange={(e) => setUseRegex(e.target.checked)}
                  className="h-4 w-4 text-sky-500 bg-gray-700 border-gray-600 rounded focus:ring-sky-500 focus:ring-offset-gray-800"
                />
                <span>Regex</span>
              </label>

              <label className="flex items-center space-x-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={caseSensitive}
                  onChange={(e) => setCaseSensitive(e.target.checked)}
                  className="h-4 w-4 text-sky-500 bg-gray-700 border-gray-600 rounded focus:ring-sky-500 focus:ring-offset-gray-800"
                />
                <span>Case</span>
              </label>

              {regexError ? (
                <span className="text-red-400 text-xs">{regexError}</span>
              ) : matches.length > 0 ? (
                <span>
                  {currentMatchIndex + 1} / {matches.length}
                </span>
              ) : (
                <span className="w-20 text-center">
                  {searchTerm ? "Not found" : ""}
                </span>
              )}

              <button
                onClick={goToPrevMatch}
                disabled={matches.length === 0}
                className="p-1 rounded hover:bg-gray-700 disabled:opacity-50"
              >
                <ChevronUp className="w-6 h-6" />
              </button>
              <button
                onClick={goToNextMatch}
                disabled={matches.length === 0}
                className="p-1 rounded hover:bg-gray-700 disabled:opacity-50"
              >
                <ChevronDown className="w-6 h-6" />
              </button>
              <button
                onClick={() => setIsSearchVisible(false)}
                className="p-1 rounded hover:bg-gray-700"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 rounded-b-lg flex flex-col">
          {previewType === "image" && (
            <div
              className={`flex justify-center items-center bg-black rounded-b-lg overflow-hidden ${
                isFullscreen ? "w-full h-full" : ""
              }`}
              style={
                isFullscreen
                  ? {}
                  : {
                      width: "100%",
                      height: "calc(100vh - 8rem)",
                      maxWidth: "90vw",
                      margin: "auto",
                    }
              }
            >
              <img
                src={`/api/image-preview?path=${encodeURIComponent(fullPath)}`}
                alt={item.name}
                className="object-contain rounded-b-lg"
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  width: "auto",
                  height: "auto",
                }}
              />
            </div>
          )}

          {previewType === "pdf" && (
            <PdfPreview
              fileUrl={`/api/media-stream?path=${encodeURIComponent(fullPath)}`}
              isFullscreen={isFullscreen}
            />
          )}

          {previewType === "video" && (
            <div
              className={`flex justify-center items-center bg-black rounded-b-lg overflow-hidden ${
                isFullscreen ? "w-full h-full" : ""
              }`}
              style={
                isFullscreen
                  ? {}
                  : {
                      width: "100%",
                      height: "calc(100vh - 8rem)",
                      maxWidth: "90vw",
                      margin: "auto",
                    }
              }
            >
              <video
                key={item.name + (videoHasError ? "-transcoded" : "-native")}
                ref={videoRef}
                src={
                  videoHasError
                    ? `/api/video-transcode?path=${encodeURIComponent(
                        fullPath
                      )}`
                    : `/api/media-stream?path=${encodeURIComponent(fullPath)}`
                }
                controls
                autoPlay
                muted
                onError={handleVideoError}
                className="object-contain w-full h-full"
              />
              {videoHasError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-75 pointer-events-none">
                  <LoaderCircle className="w-8 h-8 animate-spin text-white mb-4" />
                  <p className="text-white text-center">
                    Unsupported format.
                    <br />
                    Converting for playback...
                  </p>
                </div>
              )}
            </div>
          )}

          {previewType === "audio" && (
            <AudioPreview
              coverArtUrl={coverArtUrl}
              audioRef={audioRef}
              item={item}
              fullPath={fullPath}
              lyrics={lyrics}
              lyricsLoading={lyricsLoading}
              lyricsError={lyricsError}
              autoLoadLyrics={autoLoadLyrics}
              onToggleAutoLoadLyrics={onToggleAutoLoadLyrics}
              handleFindLyrics={handleFindLyrics}
              setLyrics={setLyrics}
              setLyricsError={setLyricsError}
            />
          )}

          {previewType === "text" && (
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
          )}

          {previewType === "unsupported" && (
            <div className="flex flex-col items-center justify-center text-center p-8 h-full relative">
              <button
                className="absolute top-2 right-2 p-1 text-gray-300 hover:text-white"
                onClick={onClose}
                title="Close (Esc)"
              >
                <XCircle className="w-7 h-7" />
              </button>
              <FileText className="w-24 h-24 text-gray-500 mb-4" />
              <p className="text-xl text-gray-300 mb-2">Cannot Preview File</p>
              <p className="font-mono text-gray-400 mb-6 break-all">
                {item.name}
              </p>
              {item.type === "folder" ? (
                <button
                  onClick={() => {
                    onStartSizeCalculation(item);
                    onClose();
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg"
                >
                  Calculate Size
                </button>
              ) : (
                <button
                  onClick={() => {
                    onOpenFile(activePath, item.name);
                    onClose();
                  }}
                  className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded-lg"
                >
                  Open with System
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PreviewModal;
