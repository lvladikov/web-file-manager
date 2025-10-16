import React, { useEffect, useRef } from "react";
import { File } from "lucide-react";

const NewFileItem = ({ value, onChange, onSubmit, onCancel, style }) => {
  const inputRef = useRef(null);
  const justMounted = useRef(true);

  useEffect(() => {
    setTimeout(() => {
      justMounted.current = false;
    }, 200);

    if (inputRef.current) {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const point = value.lastIndexOf('.');
          if (point !== -1) {
            inputRef.current.setSelectionRange(0, point);
          } else {
            input_ref.current.select();
          }
        }
      }, 150);
    }
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      onSubmit();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  const handleBlur = () => {
    if (!justMounted.current) {
      onCancel();
    }
  };

  return (
    <div className="grid items-center p-1.5" style={style}>
      <div
        style={{ gridColumn: "1 / 2" }}
        className="flex justify-center items-center"
      >
        <File className="w-5 h-5 text-gray-400" />
      </div>
      <div style={{ gridColumn: "2 / 3" }} className="pr-4 min-w-0">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          autoFocus
          className="bg-sky-100 text-black w-full focus:outline-none focus:ring-2 focus:ring-sky-500 rounded px-1 -m-1"
        />
      </div>
    </div>
  );
};

export default NewFileItem;
