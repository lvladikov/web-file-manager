import React, { useState, useEffect } from "react";
import { LoaderCircle, Siren, VideoOff } from "lucide-react";

const VideoPreview = ({
  item,
  fullPath,
  isFullscreen,
  videoRef,
  videoHasError,
  handleVideoError,
  fileUrl,
  isVisible,
}) => {
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [hasGeneralVideoError, setHasGeneralVideoError] = useState(false);

  const currentVideoSrc = fileUrl ||
    (videoHasError
      ? `/api/video-transcode?path=${encodeURIComponent(fullPath)}`
      : `/api/media-stream?path=${encodeURIComponent(fullPath)}`);

  useEffect(() => {
    setIsVideoLoading(true);
    setHasGeneralVideoError(false);

    const videoEl = videoRef.current;
    if (!videoEl) return;

    const handleCanPlay = () => setIsVideoLoading(false);
    const handleWaiting = () => setIsVideoLoading(true);
    const handleError = () => {
      setHasGeneralVideoError(true);
      setIsVideoLoading(false);
    };

    videoEl.addEventListener("canplay", handleCanPlay);
    videoEl.addEventListener("waiting", handleWaiting);
    videoEl.addEventListener("error", handleError);

    // If the video element already has a source and can play, set loading to false immediately
    if (videoEl.readyState >= 3) { // HAVE_FUTURE_DATA or HAVE_ENOUGH_DATA
      setIsVideoLoading(false);
    }

    return () => {
      videoEl.removeEventListener("canplay", handleCanPlay);
      videoEl.removeEventListener("waiting", handleWaiting);
      videoEl.removeEventListener("error", handleError);
    };
  }, [currentVideoSrc, videoRef]);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (isVisible && !isVideoLoading && !hasGeneralVideoError) {
      videoEl.play().catch((e) => console.error("Autoplay was prevented.", e));
    } else {
      videoEl.pause();
    }
  }, [isVisible, isVideoLoading, hasGeneralVideoError, videoRef]);

  return (
    <div
      className={`flex justify-center items-center bg-black rounded-b-lg overflow-hidden relative ${
        isFullscreen ? "w-full h-full" : ""
      }`}
      style={
        isFullscreen
          ? {}
          : {
              width: "100%",
              height: "calc(100vh - 14rem)",
              maxWidth: "90vw",
              margin: "auto",
            }
      }
    >
      {isVideoLoading && !hasGeneralVideoError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800 bg-opacity-75">
          <LoaderCircle className="w-10 h-10 animate-spin text-sky-400 mb-3" />
          <p className="text-gray-300">Loading video...</p>
        </div>
      )}

      {hasGeneralVideoError && !isVideoLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800 bg-opacity-75 z-10 text-red-400">
          <VideoOff className="w-12 h-12 mb-2" />
          <p>Failed to load video.</p>
        </div>
      )}

      <video
        key={item.name + (videoHasError ? "-transcoded" : "-native")}
        ref={videoRef}
        src={currentVideoSrc}
        controls
        autoPlay
        muted
        onError={handleVideoError}
        className={`object-contain w-full h-full ${isVideoLoading || hasGeneralVideoError ? 'invisible' : ''}`}
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
  );
};

export default VideoPreview;
