import React, { useState, useEffect, useRef, useCallback } from "react";
import { pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { LoaderCircle, FileWarning } from "lucide-react";

// Point pdfjs to the worker we copy into / during the Vite build.
pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

import {
  renderPdfPageToCanvas,
  getPdfNumPages,
} from "../../../lib/pdfOffscreenRenderer";

import { isVerboseLogging } from "../../../lib/utils";

const PdfPreview = ({ fileUrl, isFullscreen }) => {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const containerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasPdfError, setHasPdfError] = useState(false);
  const [finalSrc, setFinalSrc] = useState(null);
  const [finalSize, setFinalSize] = useState(null);

  const renderController = useRef({ cancelled: false, running: false });

  // Reset state when file changes
  useEffect(() => {
    setIsLoading(true);
    setHasPdfError(false);
    setNumPages(null);
    setPageNumber(1);
    setFinalSrc(null);

    renderController.current.cancelled = true;
    renderController.current.running = false;

    return () => {
      renderController.current.cancelled = true;
      renderController.current.running = false;
    };
  }, [fileUrl]);

  // Offscreen final-render: run whenever fileUrl or pageNumber changes
  useEffect(() => {
    if (!fileUrl) return;
    if (renderController.current.running) return;

    const ctrl = renderController.current;
    ctrl.cancelled = false;
    ctrl.running = true;
    let mounted = true;

    (async () => {
      try {
        setIsLoading(true);
        setHasPdfError(false);

        // Try to get page count (best-effort)
        try {
          const pages = await getPdfNumPages(fileUrl);
          if (mounted) setNumPages(pages);
        } catch (e) {
          // ignore
        }

        // Determine a target width. Prefer the container width when available,
        // otherwise fall back to a reasonable default. Keep a cap to avoid huge
        // renders.
        let measuredWidth = 0;
        try {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect && rect.width) measuredWidth = Math.round(rect.width);
        } catch (e) {
          // ignore
        }

        const targetWidth = Math.min(
          measuredWidth > 0
            ? isFullscreen
              ? measuredWidth * 0.98
              : measuredWidth * 0.95
            : 1200,
          2400
        );

        const canvas = await renderPdfPageToCanvas(
          fileUrl,
          pageNumber,
          targetWidth
        );
        if (ctrl.cancelled || !mounted) return;

        let dataUrl = null;
        try {
          dataUrl = canvas.toDataURL("image/png");
        } catch (e) {
          try {
            if (isVerboseLogging()) {
              console.warn("Failed to convert canvas to data URL", e);
            }
          } catch (e) {}
        }

        if (dataUrl && mounted) {
          // Load the data URL into a temporary Image to get the actual
          // intrinsic pixel dimensions (naturalWidth/naturalHeight). Relying
          // on canvas._cssWidth can be inaccurate across DPRs or scaling.
          try {
            await new Promise((res, rej) => {
              const img = new Image();
              img.onload = () => {
                try {
                  // naturalWidth/naturalHeight are device pixels; use those as
                  // the intrinsic size for the <img> element.
                  setFinalSize({
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                  });
                } catch (e) {
                  setFinalSize(null);
                }
                res();
              };
              img.onerror = (err) => rej(err);
              img.src = dataUrl;
            });
          } catch (e) {
            // If loading fails, fall back to canvas-reported CSS sizes if present.
            try {
              if (canvas && canvas._cssWidth && canvas._cssHeight) {
                setFinalSize({
                  width: canvas._cssWidth,
                  height: canvas._cssHeight,
                });
              } else {
                setFinalSize(null);
              }
            } catch (err) {
              setFinalSize(null);
            }
          }

          setFinalSrc(dataUrl);
          setIsLoading(false);
        }
      } catch (err) {
        if (!ctrl.cancelled && mounted) {
          console.error("PDF offscreen render error", err);
          setHasPdfError(true);
          setIsLoading(false);
        }
      } finally {
        ctrl.running = false;
      }
    })();

    return () => {
      mounted = false;
      ctrl.cancelled = true;
      ctrl.running = false;
    };
  }, [fileUrl, pageNumber, isFullscreen]);

  const goToPrevPage = useCallback(
    () => setPageNumber((p) => Math.max(p - 1, 1)),
    []
  );
  const goToNextPage = useCallback(
    () => setPageNumber((p) => Math.min(p + 1, numPages)),
    [numPages]
  );

  // Keyboard navigation
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
    const el = containerRef.current;
    if (el) {
      el.focus();
      el.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      if (el) el.removeEventListener("keydown", handleKeyDown);
    };
  }, [goToPrevPage, goToNextPage]);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className={`flex flex-col bg-black rounded-b-lg transition-none duration-0 outline-none ${
        isFullscreen ? "w-full h-full" : ""
      }`}
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
        className="flex-grow flex justify-center items-center overflow-auto bg-gray-900 relative"
        style={{ padding: "1rem" }}
      >
        {!finalSrc && isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800 bg-opacity-75 z-10">
            <LoaderCircle className="w-10 h-10 animate-spin text-sky-400 mb-3" />
            <p className="text-gray-300">Loading PDF...</p>
          </div>
        )}

        {hasPdfError && !isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800 bg-opacity-75 z-10 text-red-400">
            <FileWarning className="w-12 h-12 mb-2" />
            <p>Failed to load PDF.</p>
          </div>
        )}

        {!hasPdfError && (
          <div className="flex justify-center items-center w-full h-full">
            {finalSrc ? (
              // Render the final image at 100% width inside the modal while
              // still supplying intrinsic width/height attributes to preserve
              // aspect ratio.
              <img
                src={finalSrc}
                alt="PDF page"
                width={finalSize?.width}
                height={finalSize?.height}
                className="object-contain rounded-b-lg"
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  width: "auto",
                  height: "auto",
                }}
              />
            ) : (
              <div style={{ width: "100%", minHeight: 240 }} />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfPreview;
