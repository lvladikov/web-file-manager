import React, { useEffect, useRef, useState } from "react";
import { isMac } from "../../lib/utils.js";

const EmptyAreaContextMenu = ({
  x,
  y,
  onNewFolder,
  onClose,
  onRefreshPanel,
  onRefreshBothPanels,
  onSelectAll,
  onUnselectAll,
  onInvertSelection,
  onQuickSelect,
  onQuickUnselect,
  onQuickFilter,
  onSwapPanels,
}) => {
  const menuRef = useRef(null);
  const [maxHeight, setMaxHeight] = useState("none");
  const metaKey = isMac ? "CMD" : "Ctrl";

  useEffect(() => {
    if (menuRef.current) {
      const menuHeight = menuRef.current.offsetHeight;
      const windowHeight = window.innerHeight;
      if (y + menuHeight > windowHeight) {
        setMaxHeight(`${windowHeight - y - 20}px`);
      }
    }
  }, [y]);

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
      style={{ top: y, left: x, maxHeight }}
      className="absolute z-50 bg-gray-700 border border-gray-500 rounded-md shadow-lg text-white font-mono text-sm overflow-y-auto"
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
            onSelectAll();
          }}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer flex justify-between"
        >
          <span>Select All</span>
          <span className="text-gray-400">{metaKey}+A</span>
        </li>
        <li
          onClick={(e) => {
            e.stopPropagation();
            onUnselectAll();
          }}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer flex justify-between"
        >
          <span>Unselect All</span>
          <span className="text-gray-400">{metaKey}+D</span>
        </li>
        <li
          onClick={(e) => {
            e.stopPropagation();
            onInvertSelection();
          }}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer flex justify-between"
        >
          <span>Invert Selection</span>
          <span className="text-gray-400">*</span>
        </li>
        <div className="border-t border-gray-600 mx-2 my-1"></div>
        <li
          onClick={(e) => {
            e.stopPropagation();
            onQuickSelect();
          }}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer flex justify-between"
        >
          <span>Quick Select</span>
          <span className="text-gray-400">+</span>
        </li>
        <li
          onClick={(e) => {
            e.stopPropagation();
            onQuickUnselect();
          }}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer flex justify-between"
        >
          <span>Quick Unselect</span>
          <span className="text-gray-400">-</span>
        </li>
        <div className="border-t border-gray-600 mx-2 my-1"></div>
        <li
          onClick={(e) => {
            e.stopPropagation();
            onQuickFilter();
          }}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer flex justify-between"
        >
          <span>Quick Filter</span>
          <span className="text-gray-400">.</span>
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
        <div className="border-t border-gray-600 mx-2 my-1"></div>
        <li
          onClick={(e) => {
            e.stopPropagation();
            onSwapPanels();
          }}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
        >
          Swap Panels
        </li>
      </ul>
    </div>
  );
};

export default EmptyAreaContextMenu;
