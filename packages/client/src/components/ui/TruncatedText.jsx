import React, { useState, useRef, useLayoutEffect } from "react";

const TruncatedText = ({ text, className, onClick }) => {
  const [displayedText, setDisplayedText] = useState(text);
  const containerRef = useRef(null);
  const textRef = useRef(null);

  useLayoutEffect(() => {
    const calculateText = () => {
      if (!containerRef.current || !textRef.current) return;
      const containerWidth = containerRef.current.offsetWidth;
      const textWidth = textRef.current.offsetWidth;

      if (textWidth <= containerWidth) {
        setDisplayedText(text);
        return;
      }

      const avgCharWidth = textWidth / text.length;
      const charsToFit = Math.floor(containerWidth / avgCharWidth) - 3; // buffer for "..."
      if (charsToFit <= 2) {
        setDisplayedText("...");
        return;
      }

      // Use a 40%/60% split for available characters (charsToFit),
      // prioritizing the end but positioning the ellipsis more towards the middle.
      const startSliceLength = Math.max(
        1, // Ensure at least 1 character is visible at the start
        Math.floor(charsToFit * 0.4)
      );
      const endSliceLength = charsToFit - startSliceLength - 1; // extra 1 character safety clip at the end

      if (endSliceLength <= 0) {
        // Fallback for extremely narrow containers
        setDisplayedText("...");
        return;
      }

      const start = text.slice(0, startSliceLength);
      const end = text.slice(-endSliceLength);

      setDisplayedText(`${start}...${end}`);
    };

    calculateText();
    window.addEventListener("resize", calculateText);
    return () => window.removeEventListener("resize", calculateText);
  }, [text]);

  const hiddenMeasurer = (
    <span
      ref={textRef}
      className={`absolute invisible whitespace-nowrap ${className || ""}`}
    >
      {text}
    </span>
  );

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden">
      {hiddenMeasurer}
      <span
        className={`${className || ""} block whitespace-nowrap overflow-hidden`}
        onClick={onClick}
      >
        {displayedText}
      </span>
    </div>
  );
};

export default TruncatedText;
