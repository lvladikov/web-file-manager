import React, { useState, useEffect, useRef } from "react";
import { LoaderCircle, FileAudio, XCircle, Search, Siren } from "lucide-react";

import { parseTrackInfo } from "../../../lib/api";
import { buildFullPath } from "../../../lib/utils";

const AudioPreview = ({
  coverArtUrl,
  audioRef,
  item,
  fullPath,
  autoLoadLyrics,
  onToggleAutoLoadLyrics,
  fileUrl,
  isVisible,
  setAllowContextMenu,
}) => {
  const [lyrics, setLyrics] = useState(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState(null);
  const [isAudioLoading, setIsAudioLoading] = useState(true);
  const [hasAudioError, setHasAudioError] = useState(false);

  const currentAudioSrc =
    fileUrl || `/api/media-stream?path=${encodeURIComponent(fullPath)}`;

  useEffect(() => {
    setIsAudioLoading(true);
    setHasAudioError(false);

    const audioEl = audioRef.current;
    if (!audioEl) return;

    const handleCanPlay = () => setIsAudioLoading(false);
    const handleWaiting = () => setIsAudioLoading(true);
    const handleError = () => {
      setHasAudioError(true);
      setIsAudioLoading(false);
    };

    audioEl.addEventListener("canplay", handleCanPlay);
    audioEl.addEventListener("waiting", handleWaiting);
    audioEl.addEventListener("error", handleError);

    // If the audio element already has a source and can play, set loading to false immediately
    if (audioEl.readyState >= 3) {
      // HAVE_FUTURE_DATA or HAVE_ENOUGH_DATA
      setIsAudioLoading(false);
    }

    return () => {
      audioEl.removeEventListener("canplay", handleCanPlay);
      audioEl.removeEventListener("waiting", handleWaiting);
      audioEl.removeEventListener("error", handleError);
    };
  }, [currentAudioSrc, audioRef]);

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    if (isVisible && !isAudioLoading && !hasAudioError) {
      audioEl.play().catch((e) => console.error("Autoplay was prevented.", e));
    } else {
      audioEl.pause();
    }
  }, [isVisible, isAudioLoading, hasAudioError, audioRef]);

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

  useEffect(() => {
    setLyrics(null);
    setLyricsError(null);
    setLyricsLoading(false);
  }, [item]);

  useEffect(() => {
    if (autoLoadLyrics) {
      handleFindLyrics();
    }
  }, [item, autoLoadLyrics]);

  return (
    <div className="flex flex-col p-6 bg-gray-800 h-full rounded-b-lg overflow-hidden">
      <div className="flex-shrink-0 flex items-center space-x-6 mb-4">
        {coverArtUrl ? (
          <img
            src={coverArtUrl}
            alt="Album Cover"
            className="w-28 h-28 object-cover rounded-md shadow-lg"
          />
        ) : (
          <FileAudio className="w-28 h-28 text-gray-600 flex-shrink-0" />
        )}
        <div className="flex-grow min-w-0 relative">
          <p
            className="font-mono text-gray-300 text-lg break-words"
            title={item.name}
          >
            {item.name}
          </p>
          {isAudioLoading && (
            <div className="absolute top-0 left-0 w-full h-full flex items-center justify-start bg-gray-800 bg-opacity-75 z-10">
              <div className="flex items-center translate-y-[10px] ml-[-10px]">
                <LoaderCircle className="w-10 h-10 animate-spin text-sky-400 mr-3" />
                <p className="text-gray-300">Loading audio...</p>
              </div>
            </div>
          )}
          {hasAudioError && !isAudioLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800 bg-opacity-75 z-10 text-red-400">
              <Siren className="w-12 h-12 mb-2" />
              <p>Failed to load audio.</p>
            </div>
          )}
          <audio
            ref={audioRef}
            src={currentAudioSrc}
            controls
            autoPlay
            className={`w-full mt-3 ${
              isAudioLoading || hasAudioError ? "invisible" : ""
            }`}
          />
        </div>
      </div>

      <div
        className={`flex-grow min-h-0 mt-3 flex flex-col border-t border-gray-700 pt-4 ${
          !lyrics ? "items-center justify-center" : ""
        }`}
      >
        {!lyrics && !lyricsLoading && !lyricsError && (
          <div className="flex flex-col items-center space-y-3">
            <button
              onClick={handleFindLyrics}
              className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded-lg flex items-center"
            >
              <Search className="w-5 h-5 mr-2" /> Find Lyrics
            </button>
            <label className="flex items-center space-x-2 text-sm text-gray-400 cursor-pointer hover:text-white">
              <input
                type="checkbox"
                checked={autoLoadLyrics}
                onChange={onToggleAutoLoadLyrics}
                className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-sky-500 focus:ring-sky-500 focus:ring-offset-gray-800"
              />
              <span>Auto-Load Lyrics</span>
            </label>
          </div>
        )}
        {lyricsLoading && (
          <div className="flex items-center justify-center text-gray-300">
            <LoaderCircle className="w-8 h-8 animate-spin text-sky-400 mr-2" />
            <p>Looking for lyrics...</p>
          </div>
        )}
        {lyricsError && (
          <div className="text-center">
            <p className="text-red-400 mb-3">{lyricsError}</p>
            <button
              onClick={handleFindLyrics}
              className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg"
            >
              Try Again
            </button>
          </div>
        )}
        {lyrics && (
          <>
            <div className="flex justify-between items-center mb-2 flex-shrink-0">
              <h4 className="text-lg font-bold text-gray-300">Lyrics</h4>
              <button
                onClick={() => {
                  setLyrics(null);
                  setLyricsError(null);
                }}
                title="Hide Lyrics"
                className="p-1 text-gray-400 hover:text-white"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <pre
              className="flex-grow min-h-0 overflow-y-auto text-gray-300 text-sm bg-gray-900/50 p-3 rounded-md"
              onContextMenu={(e) => e.stopPropagation()}
            >
              {lyrics}
            </pre>
          </>
        )}
      </div>
    </div>
  );
};

export default AudioPreview;
