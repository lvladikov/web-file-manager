import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  XCircle,
  Expand,
  WrapText,
  Search,
  ChevronUp,
  ChevronDown,
  ListOrdered,
  Info,
  Save,
  Undo2 as Undo,
  Redo2 as Redo,
  FilePenLine,
} from "lucide-react";

import {
  isPreviewableImage,
  isPreviewablePdf,
  isPreviewableVideo,
  isPreviewableAudio,
  isPreviewableText,
  getFileTypeInfo,
  isMac,
} from "../../lib/utils";

import AudioPreview from "./preview-views/AudioPreview";
import PdfPreview from "./preview-views/PdfPreview";
import TextPreview from "./preview-views/TextPreview";
import UnsupportedPreview from "./preview-views/UnsupportedPreview";
import ImagePreview from "./preview-views/ImagePreview";
import VideoPreview from "./preview-views/VideoPreview";
import ZipPreview from "./preview-views/ZipPreview";
import EditableTextPreview from "./preview-views/EditableTextPreview";
import UnsavedChangesModal from "./UnsavedChangesModal";
import { saveFileContent } from "../../lib/api";
import Icon from "../ui/Icon";

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
  const [isFindReplaceVisible, setIsFindReplaceVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [matches, setMatches] = useState([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regexError, setRegexError] = useState("");
  const [videoHasError, setVideoHasError] = useState(false);
  const [coverArtUrl, setCoverArtUrl] = useState(null);
  const [unsavedChangesModalVisible, setUnsavedChangesModalVisible] =
    useState(false);

  const zipPreviewRef = useRef(null);

  const [codeLines, setCodeLines] = useState([]);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [isEditing, setIsEditing] = useState(startInEditMode);

  const [editedContent, setEditedContent] = useState(textContent);
  const [undoStack, setUndoStack] = useState([textContent]);
  const [redoStack, setRedoStack] = useState([]);

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
    setIsEditing(startInEditMode);
  }, [startInEditMode]);

  useEffect(() => {
    // Reset transient state when item changes or modal becomes visible
    setIsSearchVisible(false);
    setIsFindReplaceVisible(false);
    setSearchTerm("");
    setVideoHasError(false);
    setCoverArtUrl(null);
  }, [item]);

  const handleCloseRequest = useCallback(() => {
    const isDirty = isEditing && editedContent !== textContent;
    if (isDirty) {
      setUnsavedChangesModalVisible(true);
    } else {
      onClose();
    }
  }, [isEditing, editedContent, textContent, onClose]);

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
      if (unsavedChangesModalVisible) {
        if (e.key === "Escape") {
          e.preventDefault();
          setUnsavedChangesModalVisible(false);
        }
        return;
      }

      const isModKey = isMac ? e.metaKey : e.ctrlKey;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleCloseRequest();
        return;
      }

      if (isModKey && e.key === "s" && isEditing) {
        e.preventDefault();
        handleSave();
      }

      if (isModKey && e.key === "f") {
        if (previewType === "text") {
          e.preventDefault();
          if (isEditing) {
            setIsFindReplaceVisible((prev) => !prev);
          } else {
            setIsSearchVisible((prev) => !prev);
          }
          return;
        }
      }

      if (e.key === " ") {
        if (
          e.target.tagName !== "VIDEO" &&
          e.target.tagName !== "AUDIO" &&
          e.target.tagName !== "INPUT" &&
          e.target.tagName !== "TEXTAREA"
        ) {
          e.preventDefault();
          handleCloseRequest();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isVisible,
    previewType,
    isEditing,
    editedContent,
    handleCloseRequest,
    unsavedChangesModalVisible,
  ]);

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
          setEditedContent(text);
          setUndoStack([text]);
          setRedoStack([]);
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

  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [saveError, setSaveError] = useState("");

  const handleContentChange = useCallback((newContent) => {
    setEditedContent(newContent);
    setUndoStack((prev) => [...prev, newContent]);
    setRedoStack([]);
  }, []);

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

  const handleSave = async () => {
    try {
      await saveFileContent(item.fullPath, editedContent);
      setShowSuccessMessage(true);
      setSaveError("");
      setTextContent(editedContent);
      setUndoStack([editedContent]);
      setRedoStack([]);
    } catch (error) {
      setSaveError(error.message);
    }
  };

  const handleSaveAndClose = async () => {
    await handleSave();
    setUnsavedChangesModalVisible(false);
    onClose();
  };

  const handleDiscardAndClose = () => {
    setEditedContent(textContent);
    setUndoStack([textContent]);
    setRedoStack([]);
    setUnsavedChangesModalVisible(false);
    onClose();
  };

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
  const fileTypeInfo = getFileTypeInfo(item?.name, item?.type);
  const language = fileTypeInfo?.id;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
      onClick={handleCloseRequest}
    >
      <UnsavedChangesModal
        isVisible={unsavedChangesModalVisible}
        onSave={handleSaveAndClose}
        onDiscard={handleDiscardAndClose}
        onCancel={() => setUnsavedChangesModalVisible(false)}
      />
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
          className={`w-full h-12 bg-black bg-opacity-60 flex-shrink-0 flex justify-between items-center px-3 rounded-t-lg z-20`}
        >
          <div className="flex items-center space-x-4">
            {isEditing && previewType === "text" && (
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleSave}
                  disabled={editedContent === textContent}
                  className="p-1 text-gray-300 hover:text-white disabled:opacity-50"
                  title={
                    editedContent === textContent
                      ? "No changes to save"
                      : `Save (${isMac ? "Cmd+S" : "Ctrl+S"})`
                  }
                >
                  <Save className="w-6 h-6" />
                </button>
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length <= 1}
                  className="p-1 text-gray-300 hover:text-white disabled:opacity-50"
                  title={`Undo (${isMac ? "Cmd+Z" : "Ctrl+Z"})`}
                >
                  <Undo className="w-6 h-6" />
                </button>
                <button
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  className="p-1 text-gray-300 hover:text-white disabled:opacity-50"
                  title={`Redo (${isMac ? "Cmd+Shift+Z" : "Ctrl+Y"})`}
                >
                  <Redo className="w-6 h-6" />
                </button>
              </div>
            )}
            {fileTypeInfo && (
              <div className="flex items-center text-gray-400 text-sm">
                <Icon type={fileTypeInfo.id} className="w-4 h-4 mr-1.5" />
                <span>{fileTypeInfo.displayName}</span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {previewType === "text" && (
              <>
                <button
                  className={`p-1 rounded-full ${
                    isEditing
                      ? "bg-sky-600 text-white"
                      : "text-gray-300 hover:text-white"
                  }`}
                  onClick={() => setIsEditing((prev) => !prev)}
                  title={isEditing ? "View Mode" : "Edit File"}
                >
                  <FilePenLine className="w-6 h-6" />
                </button>
                <button
                  className={`p-1 rounded-full ${
                    isSearchVisible || isFindReplaceVisible
                      ? "bg-sky-600 text-white"
                      : "text-gray-300 hover:text-white"
                  }`}
                  onClick={() =>
                    isEditing
                      ? setIsFindReplaceVisible((prev) => !prev)
                      : setIsSearchVisible((prev) => !prev)
                  }
                  title={
                    isEditing
                      ? "Find & Replace (Cmd/Ctrl+F)"
                      : "Search (Cmd/Ctrl+F)"
                  }
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
            {(previewType === "image" ||
              previewType === "video" ||
              previewType === "text") && (
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
              onClick={handleCloseRequest}
              title="Close (Esc)"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        {isEditing && isFindReplaceVisible && previewType === "text" && (
          <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4 p-2 bg-gray-700 border-b border-gray-600 flex-shrink-0">
            {/* Find Controls */}
            <div className="flex items-center space-x-2 flex-grow lg:flex-grow-0">
              <input
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
                {findMatches.length > 0
                  ? `${currentMatchIndex + 1} / ${findMatches.length}`
                  : "0 / 0"}
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

        {!isEditing && isSearchVisible && previewType === "text" && (
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

        {!isEditing && <PreviewInfo previewType={previewType} />}

        <div className="flex-1 min-h-0 flex flex-col rounded-b-lg overflow-auto">
          {previewType === "image" && (
            <ImagePreview
              item={item}
              fullPath={fullPath}
              isFullscreen={isFullscreen}
            />
          )}
          {previewType === "pdf" && (
            <PdfPreview
              fileUrl={`/api/media-stream?path=${encodeURIComponent(fullPath)}`}
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
                editedContent={editedContent}
                onContentChange={handleContentChange}
                wordWrap={wordWrap}
                getFileTypeInfo={getFileTypeInfo}
                isFindReplaceVisible={isFindReplaceVisible}
                showLineNumbers={showLineNumbers}
              />
            ) : (
              <TextPreview
                codeLines={codeLines}
                showLineNumbers={showLineNumbers}
                wordWrap={wordWrap}
                language={language}
                item={item}
                textContent={textContent}
                textError={textError}
                searchTerm={searchTerm}
                matches={matches}
                currentMatchIndex={currentMatchIndex}
                setCodeLines={setCodeLines}
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
