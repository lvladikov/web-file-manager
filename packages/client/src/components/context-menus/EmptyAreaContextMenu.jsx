import React, { useEffect, useRef } from "react";

const EmptyAreaContextMenu = ({
  x,
  y,
  onNewFolder,
  onClose,
  onRefreshPanel,
  onRefreshBothPanels,
}) => {
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
            onNewFolder();
          }}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
        >
          New Folder
        </li>
        <div className="border-t border-gray-600 mx-2 my-1"></div>
        <li
          onClick={(e) => {
            e.stopPropagation();
            onRefreshPanel();
          }}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
        >
          Refresh active panel
        </li>
        <li
          onClick={(e) => {
            e.stopPropagation();
            onRefreshBothPanels();
          }}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
        >
          Refresh both panels
        </li>
      </ul>
    </div>
  );
};

export default EmptyAreaContextMenu;
