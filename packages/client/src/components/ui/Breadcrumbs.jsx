import React, { useState, useEffect, useRef, useLayoutEffect } from "react";

const Breadcrumbs = ({ path, onNavigate }) => {
  const containerRef = useRef(null);
  const [segments, setSegments] = useState([]);
  const [segmentWidths, setSegmentWidths] = useState([]);
  const [displaySegments, setDisplaySegments] = useState([]);

  // 1. Parse the path into structured data whenever it changes.
  useEffect(() => {
    if (!path) {
      setSegments([]);
      return;
    }
    setSegmentWidths([]); // Reset widths to trigger a re-measure for the new path.

    const isWindows = path.includes("\\");
    const separator = isWindows ? "\\" : "/";
    const parts = path.split(separator);

    let currentPath = "";
    const newSegments = parts
      .map((part, index) => {
        const isUnixRootSegment = !isWindows && index === 0 && part === "";
        if (part === "" && !isUnixRootSegment) return null;

        if (isUnixRootSegment) {
          currentPath = "/";
        } else if (isWindows && index === 0) {
          currentPath = part + "\\";
        } else {
          currentPath = [currentPath, part].join(separator).replace("//", "/");
        }
        return { text: isUnixRootSegment ? "/" : part, path: currentPath };
      })
      .filter(Boolean);

    setSegments(newSegments);
  }, [path]);

  // 2. Measure the segments after they've been rendered invisibly.
  useLayoutEffect(() => {
    if (
      segments.length > 0 &&
      segmentWidths.length === 0 &&
      containerRef.current
    ) {
      const widths = Array.from(containerRef.current.children).map(
        (child) => child.offsetWidth
      );
      if (widths.length > 0 && widths.every((w) => w > 0)) {
        setSegmentWidths(widths);
      }
    }
  }, [segments, segmentWidths]);

  // 3. Calculate the final visible segments once we have all measurements.
  useLayoutEffect(() => {
    const calculateDisplaySegments = () => {
      if (
        !containerRef.current ||
        segments.length === 0 ||
        segmentWidths.length === 0
      ) {
        setDisplaySegments(segments.length ? segments : []);
        return;
      }

      const containerWidth = containerRef.current.offsetWidth;
      const totalWidth = segmentWidths.reduce((sum, w) => sum + w, 0);

      if (totalWidth <= containerWidth) {
        setDisplaySegments(segments);
        return;
      }

      const ellipsisWidth = 30;
      const rootSegment = segments[0];
      const rootWidth = segmentWidths[0];

      const finalSegments = [rootSegment, { type: "ellipsis" }];
      let requiredWidth = rootWidth + ellipsisWidth;
      const endSegments = [];

      for (let i = segments.length - 1; i > 0; i--) {
        const currentSegmentWidth = segmentWidths[i];
        if (requiredWidth + currentSegmentWidth > containerWidth) {
          break;
        }
        requiredWidth += currentSegmentWidth;
        endSegments.unshift(segments[i]);
      }

      setDisplaySegments([...finalSegments, ...endSegments]);
    };

    calculateDisplaySegments();

    window.addEventListener("resize", calculateDisplaySegments);
    return () => window.removeEventListener("resize", calculateDisplaySegments);
  }, [segments, segmentWidths]);

  const separator = path.includes("\\") ? "\\" : "/";

  // Helper to avoid duplicating logic in the map function
  const isLast = (index, arr) => index === arr.length - 1;

  // If we need to measure, render an invisible version first.
  if (segmentWidths.length === 0 && segments.length > 0) {
    return (
      <div
        ref={containerRef}
        className="font-bold whitespace-nowrap flex w-full opacity-0"
        aria-hidden="true"
      >
        {segments.map((segment, index) => (
          <div key={segment.path} className="flex items-center flex-shrink-0">
            <span className="px-1">{segment.text}</span>
            {!isLast(index, segments) && (
              <span className="select-none">{separator}</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Otherwise, render the final calculated (and possibly truncated) view.
  return (
    <div
      ref={containerRef}
      className="font-bold whitespace-nowrap flex items-center overflow-hidden w-full"
    >
      {displaySegments.map((segment, index) => {
        if (segment.type === "ellipsis") {
          return (
            <span key="ellipsis" className="flex items-center flex-shrink-0">
              <span className="text-gray-300 px-1">...</span>
              <span className="text-gray-500 select-none">{separator}</span>
            </span>
          );
        }
        return (
          <div key={segment.path} className="flex items-center flex-shrink-0">
            <span
              className="cursor-pointer hover:text-sky-400 hover:underline px-1"
              onClick={() => onNavigate(segment.path)}
            >
              {segment.text}
            </span>
            {!isLast(index, displaySegments) && (
              <span className="text-gray-500 select-none">{separator}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default Breadcrumbs;
