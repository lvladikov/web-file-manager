import React, { useEffect, useRef } from "react";

import { formatBytes } from "../../lib/utils";

import Icon from "../ui/Icon";
import TruncatedText from "../ui/TruncatedText";

const FileItem = ({
  item,
  isSelected,
  isFocused,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onClick,
  onDoubleClick,
  onContextMenu,
  style,
}) => {
  const inputRef = useRef(null);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") onRenameSubmit();
    if (e.key === "Escape") onRenameCancel();
  };

  return (
    <div
      data-name={item.name}
      className={`grid items-center p-1.5 rounded select-none 
          ${
            isRenaming
              ? "bg-gray-700"
              : isSelected
              ? "bg-blue-600"
              : "hover:bg-gray-700"
          }
          ${isFocused && !isRenaming ? "ring-2 ring-gray-400 ring-inset" : ""}
        `}
      style={style}
      onClick={isRenaming ? (e) => e.stopPropagation() : onClick}
      onDoubleClick={isRenaming ? (e) => e.stopPropagation() : onDoubleClick}
      onContextMenu={(e) => {
        if (isRenaming || item.type === "parent") return;
        e.preventDefault();
        onContextMenu(e.pageX, e.pageY, item);
      }}
      title={
        isRenaming
          ? ""
          : `${item.name}${
              item.type !== "folder" && item.type !== "parent"
                ? " | Double-click to open"
                : ""
            }`
      }
    >
      <div
        style={{ gridColumn: "1 / 2" }}
        className="flex justify-center items-center"
      >
        <Icon type={item.type} />
      </div>
      <div style={{ gridColumn: "2 / 3" }} className="pr-4 min-w-0">
        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            value={renameValue}
            onChange={onRenameChange}
            onKeyDown={handleKeyDown}
            onBlur={onRenameCancel}
            autoFocus
            className="bg-sky-100 text-black w-full focus:outline-none focus:ring-2 focus:ring-sky-500 rounded px-1 -m-1"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <TruncatedText text={item.name} />
        )}
      </div>
      <span
        style={{ gridColumn: "4 / 5" }}
        className="text-right pr-4 flex-shrink-0 whitespace-nowrap"
      >
        {isRenaming ? "" : formatBytes(item.size)}
      </span>
      <span
        style={{ gridColumn: "6 / 7" }}
        className="text-right flex-shrink-0 whitespace-nowrap"
      >
        {isRenaming ? "" : item.modified}
      </span>
    </div>
  );
};

export default FileItem;
