import React, { useEffect, useRef } from "react";

const FavouritesDropdown = ({
  favourites,
  isFavourite,
  currentPath,
  onSelect,
  onToggle,
  onClose,
}) => {
  const dropdownRef = useRef(null);
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
              className="px-4 py-2 hover:bg-sky-600 cursor-pointer truncate"
            >
              {fav}
            </li>
          ))
        ) : (
          <li className="px-4 py-2 text-gray-400">No favourites saved.</li>
        )}
      </ul>
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
