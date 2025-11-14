import React, { useEffect, useRef, useState } from "react";
import TruncatedText from "./TruncatedText";

const FavouritesDropdown = ({
  favourites,
  recentPaths,
  isFavourite,
  currentPath,
  onSelect,
  onToggle,
  onClose,
}) => {
  const dropdownRef = useRef(null);
  const [isRecentSubmenuOpen, setIsRecentSubmenuOpen] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full right-0 mt-1 z-50 bg-gray-700 border border-gray-500 rounded-md shadow-lg text-white w-96 font-mono text-sm"
    >
      <div className="p-2 border-b border-gray-600 font-bold">Favourites</div>
      <ul className="py-1 max-h-64 overflow-y-auto">
        {favourites.length > 0 ? (
          favourites.map((fav) => (
            <li
              key={fav}
              onClick={() => onSelect(fav)}
              className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
            >
              <TruncatedText text={fav} />
            </li>
          ))
        ) : (
          <li className="px-4 py-2 text-gray-400">No favourites saved.</li>
        )}
      </ul>
      <div className="border-t border-gray-600" />
      <div
        className="relative"
        onMouseEnter={() => setIsRecentSubmenuOpen(true)}
        onMouseLeave={() => setIsRecentSubmenuOpen(false)}
      >
        <div className="px-4 py-2 hover:bg-sky-600 cursor-pointer flex justify-between">
          <span>Recent</span>
          <span className="text-gray-400">&gt;</span>
        </div>
        {isRecentSubmenuOpen && (
          <div className="absolute top-0 right-full mr-1 w-96 bg-gray-700 border border-gray-500 rounded-md shadow-lg">
            <div className="p-2 border-b border-gray-600 font-bold">
              Recent Paths
            </div>
            <ul className="py-1 max-h-64 overflow-y-auto">
              {recentPaths && recentPaths.length > 0 ? (
                recentPaths.map((path) => (
                  <li
                    key={path}
                    onClick={() => onSelect(path)}
                    className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
                  >
                    <TruncatedText text={path} />
                  </li>
                ))
              ) : (
                <li className="px-4 py-2 text-gray-400">No recent paths.</li>
              )}
            </ul>
          </div>
        )}
      </div>
      <div className="border-t border-gray-600" />
      <ul className="py-1">
        <li
          onClick={() => {
            onToggle(currentPath);
            onClose();
          }}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
        >
          {isFavourite ? "Remove from favourites" : "Add to favourites"}
        </li>
      </ul>
    </div>
  );
};

export default FavouritesDropdown;
