import React, { useState, useEffect, useRef, useCallback } from "react";

import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Configure the PDF.js worker to use the local file copied by our Vite plugin.
pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

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
              height: "calc(100vh - 14rem)",
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

export default PdfPreview;
