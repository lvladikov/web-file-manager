import React, { useState, useEffect, useRef } from "react";
import {
  XCircle,
  Expand,
  WrapText,
  Search,
  ChevronUp,
  ChevronDown,
  ListOrdered,
  Info,
} from "lucide-react";

import {
  isPreviewableImage,
  isPreviewablePdf,
  isPreviewableVideo,
  isPreviewableAudio,
  isPreviewableText,
  getPrismLanguage,
  isMac,
} from "../../lib/utils";

import AudioPreview from "./preview-views/AudioPreview";
import PdfPreview from "./preview-views/PdfPreview";
import TextPreview from "./preview-views/TextPreview";
import UnsupportedPreview from "./preview-views/UnsupportedPreview";
import ImagePreview from "./preview-views/ImagePreview";
import VideoPreview from "./preview-views/VideoPreview";
import ZipPreview from "./preview-views/ZipPreview";
import { FilePenLine } from "lucide-react";
import EditableTextPreview from "./preview-views/EditableTextPreview";
import { saveFileContent } from "../../lib/api";

const PreviewInfo = ({ previewType }) => {
  if (
    previewType === "zip" ||
    previewType === "none" ||
    previewType === "unsupported"
  ) {
    return null;
  }

  return (
    <div className="flex items-start p-3 bg-gray-800 text-sm text-gray-400 border-b border-gray-700 flex-shrink-0">
      <Info className="w-5 h-5 mr-3 flex-shrink-0 text-sky-400" />
      <p
        className="min-w-0"
        title="This is perfect for browsing through images, videos, or text files."
      >
        Use navigation keys (Up/Down) to change the item being previewed.
      </p>
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
  onDecompressInActivePanel,
  onDecompressToOtherPanel,
  startInEditMode,
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

  const zipPreviewRef = useRef(null);

  const [codeLines, setCodeLines] = useState([]);
  const [showLineNumbers, setShowLineNumbers] = useState(false);

  const getPreviewType = (item) => {
    if (!item) return "none";
    if (item.type === "archive") return "zip";
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
  }, [item]);

  useEffect(() => {
    if (isVisible && previewType === "audio" && item) {
      const fetchCoverArt = async () => {
        const { fullPath } = item;
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
  }, [isVisible, item, previewType]);

  useEffect(() => {
    if (previewType !== "text" || !textContent || textError) {
      const errorLines = textError
        ? [`<span class="text-red-400">${textError}</span>`]
        : textContent.split("\n");
      setCodeLines(errorLines);
      return;
    }
  }, [textContent, textError, item, previewType]);

  useEffect(() => {
    if (searchTerm && textContent) {
      try {
        const flags = caseSensitive ? (useRegex ? "g" : "g") : "gi";
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
        const { fullPath } = item;
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
  }, [isVisible, item, previewType]);

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

  const [isEditing, setIsEditing] = useState(startInEditMode);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [saveError, setSaveError] = useState("");

  const handleSave = async (path, content) => {
    try {
      await saveFileContent(path, content);
      setShowSuccessMessage(true);
      setSaveError("");
      setTextContent(content); // Update textContent with the saved content
    } catch (error) {
      setSaveError(error.message);
    }
  };

  useEffect(() => {
    setIsEditing(startInEditMode);
  }, [startInEditMode]);

  useEffect(() => {
    if (showSuccessMessage) {
      const timer = setTimeout(() => {
        setShowSuccessMessage(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showSuccessMessage]);

  useEffect(() => {
    if (showSuccessMessage) {
      const timer = setTimeout(() => {
        setShowSuccessMessage(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showSuccessMessage]);

  if (!isVisible || !item) return null;
  const { fullPath } = item;
  const language = getPrismLanguage(item?.name);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        ref={previewContainerRef}
        className={`bg-gray-900 border border-gray-600 rounded-lg shadow-lg flex flex-col ${
          isFullscreen
            ? "w-full h-full p-0 border-none rounded-none"
            : previewType === "zip"
            ? "w-full max-w-4xl h-[80vh]"
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
                  isEditing
                    ? "bg-sky-600 text-white"
                    : "text-gray-300 hover:text-white"
                }`}
                onClick={() => setIsEditing((prev) => !prev)}
                title={isEditing ? "Cancel Edit" : "Edit File"}
              >
                <FilePenLine className="w-6 h-6" />
              </button>
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

        <PreviewInfo previewType={previewType} />

        <div className="flex-1 min-h-0 flex flex-col rounded-b-lg overflow-auto">
          <div className="flex-1 min-h-0 relative h-full">
            {previewType === "image" && (
              <ImagePreview
                item={item}
                fullPath={fullPath}
                isFullscreen={isFullscreen}
              />
            )}
            {previewType === "pdf" && (
              <PdfPreview
                fileUrl={`/api/media-stream?path=${encodeURIComponent(
                  fullPath
                )}`}
                isFullscreen={isFullscreen}
              />
            )}
            {previewType === "video" && (
              <VideoPreview
                item={item}
                fullPath={fullPath}
                isFullscreen={isFullscreen}
                videoRef={videoRef}
                videoHasError={videoHasError}
                handleVideoError={handleVideoError}
              />
            )}
            {previewType === "audio" && (
              <AudioPreview
                coverArtUrl={coverArtUrl}
                audioRef={audioRef}
                item={item}
                fullPath={fullPath}
                autoLoadLyrics={autoLoadLyrics}
                onToggleAutoLoadLyrics={onToggleAutoLoadLyrics}
              />
            )}
            {previewType === "text" &&
              (isEditing ? (
                <EditableTextPreview
                  item={item}
                  textContent={textContent}
                  onSave={handleSave}
                  onCancelEdit={() => setIsEditing(false)}
                  isEditing={isEditing}
                  wordWrap={wordWrap}
                  language={language}
                  textError={textError}
                  getPrismLanguage={getPrismLanguage}
                />
              ) : (
                <TextPreview
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
                />
              ))}
            {previewType === "unsupported" && (
              <UnsupportedPreview
                item={item}
                activePath={activePath}
                onStartSizeCalculation={onStartSizeCalculation}
                onOpenFile={onOpenFile}
                onClose={onClose}
              />
            )}
            {previewType === "zip" && (
              <ZipPreview
                ref={zipPreviewRef}
                filePath={fullPath}
                onClose={onClose}
                isVisible={isVisible}
                onDecompressInActivePanel={onDecompressInActivePanel}
                onDecompressToOtherPanel={onDecompressToOtherPanel}
              />
            )}
          </div>
        </div>
        {showSuccessMessage && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-md">
            File saved successfully!
          </div>
        )}
        {saveError && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-md">
            {saveError}
          </div>
        )}
      </div>
    </div>
  );
};

export default PreviewModal;
