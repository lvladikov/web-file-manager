import React, { useEffect, useRef } from "react";

const PathContextMenu = ({ x, y, onChooseFolder, onClose }) => {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={{ top: y, left: x }}
      className="absolute z-50 bg-gray-700 border border-gray-500 rounded-md shadow-lg text-white font-mono text-sm"
    >
      <ul className="py-1">
        <li
          onClick={(e) => {
            e.stopPropagation();
            onChooseFolder();
          }}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
        >
          Choose folder...
        </li>
      </ul>
    </div>
  );
};

export default PathContextMenu;
