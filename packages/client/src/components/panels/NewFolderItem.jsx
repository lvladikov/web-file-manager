import React, { useEffect, useRef } from "react";

import { Folder } from "lucide-react";

const NewFolderItem = ({ value, onChange, onSubmit, onCancel, style }) => {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") onSubmit();
    if (e.key === "Escape") onCancel();
  };

  return (
    <div className="grid items-center p-1.5" style={style}>
      <div
        style={{ gridColumn: "1 / 2" }}
        className="flex justify-center items-center"
      >
        <Folder className="w-5 h-5 text-sky-500" />
      </div>
      <div style={{ gridColumn: "2 / 3" }} className="pr-4 min-w-0">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          onBlur={onCancel}
          autoFocus
          className="bg-sky-100 text-black w-full focus:outline-none focus:ring-2 focus:ring-sky-500 rounded px-1 -m-1"
        />
      </div>
    </div>
  );
};

export default NewFolderItem;
