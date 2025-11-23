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
  onImportFavourites,
}) => {
  const dropdownRef = useRef(null);
  const fileInputRef = useRef(null);
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

  const handleExportFavourites = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    const filename = `${year}${month}${day}-${hours}${minutes}${seconds}-favourites-backup.json`;
    
    const dataStr = JSON.stringify(favourites, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    onClose();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importedFavourites = JSON.parse(text);
      
      if (!Array.isArray(importedFavourites)) {
        alert('Invalid favourites file format. Expected a JSON array.');
        return;
      }
      
      onImportFavourites(importedFavourites);
      onClose();
    } catch (error) {
      alert(`Failed to import favourites: ${error.message}`);
    }
    
    // Reset file input
    event.target.value = '';
  };

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
      <div className="border-t border-gray-600" />
      <ul className="py-1">
        <li
          onClick={handleExportFavourites}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
        >
          Export Favourites
        </li>
        <li
          onClick={handleImportClick}
          className="px-4 py-2 hover:bg-sky-600 cursor-pointer"
        >
          Import Favourites
        </li>
      </ul>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  );
};

export default FavouritesDropdown;
