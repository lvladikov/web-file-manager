import React from "react";
import { X, Regex, CaseSensitive, Loader } from "lucide-react";

const FilterInput = ({
  panelId,
  filter,
  onFilterChange,
  onClose,
  isFiltering,
  isActiveFilter,
}) => {
  return (
    <div
      className="absolute bottom-0 left-0 right-0 bg-gray-800 bg-opacity-90 p-2 flex items-center border-t border-gray-700"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        id={`filter-input-${panelId}`}
        type="text"
        placeholder="Filter items..."
        value={filter.pattern}
        onChange={(e) => onFilterChange({ ...filter, pattern: e.target.value })}
        className="bg-gray-700 text-white rounded-l-md p-2 flex-grow focus:outline-none focus:ring-2 focus:ring-sky-500"
        autoFocus={isActiveFilter}
        title="Filter items by name. Use * as a wildcard (e.g., *.jpg). Special keywords: _FILES_ONLY_, _FOLDERS_ONLY_, _ZIP_FILES_ONLY_"
      />
      <button
        id={`filter-regex-button-${panelId}`}
        onClick={() =>
          onFilterChange({ ...filter, useRegex: !filter.useRegex })
        }
        className={`p-2 ${
          filter.useRegex ? "bg-sky-600" : "bg-gray-700"
        } hover:bg-sky-500`}
        title="Toggle Regular Expressions"
      >
        <Regex size={20} />
      </button>
      <button
        id={`filter-case-button-${panelId}`}
        onClick={() =>
          onFilterChange({ ...filter, caseSensitive: !filter.caseSensitive })
        }
        className={`p-2 ${
          filter.caseSensitive ? "bg-sky-600" : "bg-gray-700"
        } hover:bg-sky-500`}
        title="Toggle Case Sensitive"
      >
        <CaseSensitive size={20} />
      </button>
      <div className="w-8 h-8 flex items-center justify-center">
        {isFiltering ? (
          <Loader size={20} className="animate-spin" />
        ) : (
          <button
            id={`filter-close-button-${panelId}`}
            onClick={onClose}
            className="p-2 rounded-r-md hover:bg-red-500"
            title="Close Filter (Esc)"
          >
            <X size={20} />
          </button>
        )}
      </div>
    </div>
  );
};

export default FilterInput;
