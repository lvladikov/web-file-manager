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

      const half = Math.floor(charsToFit / 2);
      const start = text.slice(0, half);
      const end = text.slice(-half);
      setDisplayedText(`${start}...${end}`);
    };

    calculateText();
    window.addEventListener("resize", calculateText);
    return () => window.removeEventListener("resize", calculateText);
  }, [text]);

  const hiddenMeasurer = (
    <span
      ref={textRef}
      className={`absolute invisible whitespace-nowrap ${className}`}
    >
      {text}
    </span>
  );

  return (
    <div ref={containerRef} className="relative w-full">
      {hiddenMeasurer}
      <span className={className} onClick={onClick}>{displayedText}</span>
    </div>
  );
};

export default TruncatedText;
