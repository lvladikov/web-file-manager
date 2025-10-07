import React, { useEffect, useRef } from "react";

const FavouritesDropdown = ({ favorites, onSelect, onRemove, onClose }) => {
  const dropdownRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (event) =>
      !dropdownRef.current?.contains(event.target) && onClose();
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={dropdownRef}
      className="absolute top-12 right-2 z-50 bg-gray-700 border-gray-500 rounded-md shadow-lg text-white w-96"
    >
      <div className="p-2 border-b border-gray-600 font-bold">Favorites</div>
      <ul className="py-1 max-h-64 overflow-y-auto">
        {favorites.length > 0 ? (
          favorites.map((fav) => (
            <li
              key={fav}
              className="flex items-center justify-between px-4 py-2 hover:bg-sky-600 cursor-pointer group"
            >
              <span
                onClick={() => onSelect(fav)}
                className="truncate flex-grow"
              >
                {fav}
              </span>
              <button
                onClick={() => onRemove(fav)}
                className="text-red-500 hover:text-red-400 opacity-0 group-hover:opacity-100 ml-4"
              >
                X
              </button>
            </li>
          ))
        ) : (
          <li className="px-4 py-2 text-gray-400">No favorites saved.</li>
        )}
      </ul>
    </div>
  );
};

export default FavouritesDropdown;
