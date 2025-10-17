import { LoaderCircle } from "lucide-react";

const VideoPreview = ({
  item,
  fullPath,
  isFullscreen,
  videoRef,
  videoHasError,
  handleVideoError,
  fileUrl,
}) => {
  return (
    <div
      className={`flex justify-center items-center bg-black rounded-b-lg overflow-hidden ${
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
      <video
        key={item.name + (videoHasError ? "-transcoded" : "-native")}
        ref={videoRef}
        src={
          fileUrl ||
          (videoHasError
            ? `/api/video-transcode?path=${encodeURIComponent(fullPath)}`
            : `/api/media-stream?path=${encodeURIComponent(fullPath)}`)
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
  );
};

export default VideoPreview;
