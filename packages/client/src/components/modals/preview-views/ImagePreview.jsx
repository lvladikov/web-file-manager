import React, { useState, useEffect } from "react";
import { Loader2, ImageOff } from "lucide-react";

const ImagePreview = ({ item, fullPath, isFullscreen, fileUrl, previewType, setAllowContextMenu }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [imageSrc, setImageSrc] = useState(null);

  useEffect(() => {
    let srcToLoad = null;

    if (previewType === "zipImage") {
      if (fileUrl) {
        srcToLoad = fileUrl;
      } else {
        setIsLoading(true);
        setImageSrc(null);
        return;
      }
    } else { // Regular image (not from zip)
      srcToLoad = `/api/image-preview?path=${encodeURIComponent(fullPath)}`;
    }

    if (!srcToLoad) return; // No source to load yet

    setIsLoading(true);
    setHasError(false);
    setImageSrc(null);

    const img = new Image();

    img.onload = () => {
      setImageSrc(srcToLoad);
      setIsLoading(false);
    };

    img.onerror = () => {
      setHasError(true);
      setIsLoading(false);
    };

    img.src = srcToLoad;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [fileUrl, fullPath, previewType]);

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
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800 bg-opacity-75">
          <Loader2 className="w-10 h-10 animate-spin text-sky-400 mb-3" />
          <p className="text-gray-300">Loading image...</p>
        </div>
      )}

      {hasError && !isLoading && (
        <div className="flex flex-col items-center text-gray-400">
          <ImageOff className="w-12 h-12 mb-2" />
          <p>Failed to load image.</p>
        </div>
      )}

      {!isLoading && !hasError && imageSrc && (
        <img
          src={imageSrc}
          alt={item.name}
          className="object-contain rounded-b-lg"
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            width: "auto",
            height: "auto",
          }}
          onContextMenu={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
};
export default ImagePreview;
