import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import TruncatedText from "./TruncatedText";

const Breadcrumbs = ({ path, onNavigate }) => {
  const containerRef = useRef(null);
  const [segments, setSegments] = useState([]);
  const [segmentWidths, setSegmentWidths] = useState([]);
  const [displaySegments, setDisplaySegments] = useState([]);

  // Parse the path into structured data whenever it changes.
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

  // Measure the segments after they've been rendered invisibly.
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

  // Calculate the final visible segments once we have all measurements.
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

      // If we reach here, totalWidth > containerWidth, so we need truncation.

      const ellipsisWidth = 30; // Estimated width of "..."
      const separatorWidth = 10; // Estimated width of "/" or "\\"

      const finalSegments = [];
      let currentWidth = 0;

      // Always include the first segment
      finalSegments.push(segments[0]);
      currentWidth += segmentWidths[0];

      // If there's only one segment, TruncatedText will handle its internal truncation
      if (segments.length === 1) {
        setDisplaySegments(segments);
        return;
      }

      // Always include the last segment
      const lastSegment = segments[segments.length - 1];
      const lastSegmentWidth = segmentWidths[segments.length - 1];

      // Check if root + ellipsis + last fits
      // currentWidth already has rootWidth
      if (
        currentWidth +
          separatorWidth +
          ellipsisWidth +
          separatorWidth +
          lastSegmentWidth <=
        containerWidth
      ) {
        // If it fits, add ellipsis and last segment
        finalSegments.push({ type: "ellipsis" });
        finalSegments.push(lastSegment);
        currentWidth +=
          separatorWidth + ellipsisWidth + separatorWidth + lastSegmentWidth;

        // Now try to fill in segments from the end, before the last segment
        let availableSpaceForMiddle = containerWidth - currentWidth;
        const middleSegments = [];
        for (let i = segments.length - 2; i > 0; i--) {
          // Iterate from second to last to second
          const segment = segments[i];
          const segmentWidth = segmentWidths[i];
          if (availableSpaceForMiddle >= segmentWidth + separatorWidth) {
            middleSegments.unshift(segment);
            availableSpaceForMiddle -= segmentWidth + separatorWidth;
          } else {
            break;
          }
        }
        // Insert middle segments before the last segment (which is at finalSegments.length - 1)
        finalSegments.splice(finalSegments.length - 1, 0, ...middleSegments);
      } else {
        // If root + ellipsis + last doesn't fit, just show root and last.
        // TruncatedText will handle internal truncation of root and last.
        // We need to make sure the root and last are added with separators.
        finalSegments.length = 0; // Clear finalSegments
        finalSegments.push(segments[0]);
        if (segments.length > 1) {
          finalSegments.push({ type: "ellipsis" }); // Add ellipsis if there are more than 1 segment
          finalSegments.push(lastSegment);
        }
      }

      setDisplaySegments(finalSegments);
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
          <div
            key={segment.path}
            className="flex items-center flex-shrink-0 max-w-[200px]"
          >
            <TruncatedText text={segment.text} className="px-1" />
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
            <TruncatedText
              text={segment.text}
              className="cursor-pointer hover:text-sky-400 hover:underline px-1"
              onClick={() => onNavigate(segment.path)}
            />
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
