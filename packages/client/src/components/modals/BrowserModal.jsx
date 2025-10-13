import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  forwardRef,
} from "react";

import { HardDrive, LoaderCircle } from "lucide-react";

import Icon from "../../components/ui/Icon.jsx";

import { isMac } from "../../lib/utils";
import { fetchDirectory } from "../../lib/api";

const BrowserModal = forwardRef(
  (
    {
      isVisible,
      onClose,
      onConfirm,
      initialPath,
      title,
      filterItem,
      confirmButtonText,
      children,
      fetchItems,
      onFileDoubleClick,
    },
    ref
  ) => {
    const [currentPath, setCurrentPath] = useState(initialPath || "");
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [focusedItem, setFocusedItem] = useState(null);
    const [error, setError] = useState(null);

    const listRef = useRef(null);
    const confirmButtonRef = useRef(null);
    const cancelButtonRef = useRef(null);
    const pathRef = useRef(currentPath);

    useEffect(() => {
      pathRef.current = currentPath;
    }, [currentPath]);

    const focusedItemRef = useRef(focusedItem);
    useEffect(() => {
      focusedItemRef.current = focusedItem;
    }, [focusedItem]);

    const buildFullPath = (base, file) =>
      `${base}${base.includes("\\") ? "\\" : "/"}${file}`;

    const handleConfirm = useCallback(
      (itemOverride) => {
        const itemToConfirm = itemOverride || focusedItemRef.current;

        // If there's no item, the only valid action is to confirm the current directory.
        if (!itemToConfirm) {
          if (confirmButtonText === "Select Folder") {
            onConfirm(pathRef.current);
          }
          return;
        }

        // If the item being confirmed is a folder that is the same as our current path,
        // then confirm the current path, don't build a new one.
        if (
          itemToConfirm.type === "folder" &&
          itemToConfirm.fullPath === pathRef.current
        ) {
          onConfirm(pathRef.current);
          return;
        }

        // For all other cases (like selecting a file or a valid subfolder), build the full path.
        const fullPath =
          itemToConfirm.name === ".."
            ? pathRef.current
            : buildFullPath(pathRef.current, itemToConfirm.name);
        onConfirm(fullPath);
      },
      [onConfirm, confirmButtonText, currentPath]
    );

    const handleNavigate = useCallback(
      async (basePath, target) => {
        try {
          setLoading(true);
          setError(null);
          setFocusedItem(null);
          const dirData = fetchItems
            ? await fetchItems(basePath, target)
            : await fetchDirectory(basePath, target);
          setCurrentPath(dirData.path);
          setItems(dirData.items);
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      },
      [fetchItems]
    );

    useEffect(() => {
      if (isVisible) {
        const initialLoadPath = initialPath || "";
        setCurrentPath(initialLoadPath);
        handleNavigate(initialLoadPath, "");
        listRef.current?.focus();
      } else {
        setLoading(true);
        setError(null);
        setFocusedItem(null);
      }
    }, [isVisible, initialPath, handleNavigate]);

    useEffect(() => {
      if (!isVisible) return;

      const handleKeyDown = (e) => {
        const isModKey = isMac ? e.metaKey : e.ctrlKey;

        // Prevent Cmd/Ctrl+A (select all) and Cmd/Ctrl+D (bookmark)
        if (isModKey && (e.key === "a" || e.key === "d")) {
          e.preventDefault();
          return;
        }

        if (e.key === "Enter" && document.activeElement?.tagName === "BUTTON") {
          return;
        }

        if (e.key === "Tab") {
          e.preventDefault();
          const focusableElements = [
            listRef.current,
            confirmButtonRef.current,
            cancelButtonRef.current,
          ].filter(Boolean);

          const currentIndex = focusableElements.indexOf(
            document.activeElement
          );
          const nextIndex = e.shiftKey
            ? (currentIndex - 1 + focusableElements.length) %
              focusableElements.length
            : (currentIndex + 1) % focusableElements.length;

          focusableElements[nextIndex]?.focus();
          return;
        }

        if (items.length === 0 && e.key !== "Backspace") return;

        const localFocusedItem = focusedItemRef.current;
        const currentIndex = localFocusedItem
          ? items.findIndex((i) => i.name === localFocusedItem.name)
          : -1;
        let newIndex = currentIndex;
        let preventDefault = true;

        switch (e.key) {
          case "ArrowDown":
          case "ArrowUp":
          case "Home":
          case "End":
          case "PageDown":
          case "PageUp":
            listRef.current?.focus();
            if (e.key === "ArrowDown")
              newIndex = Math.min(items.length - 1, currentIndex + 1);
            if (currentIndex === -1) newIndex = 0;
            if (e.key === "ArrowUp") newIndex = Math.max(0, currentIndex - 1);
            if (e.key === "Home") newIndex = 0;
            if (e.key === "End") newIndex = items.length - 1;
            if (e.key === "PageDown")
              newIndex = Math.min(items.length - 1, currentIndex + 10);
            if (e.key === "PageUp") newIndex = Math.max(0, currentIndex - 10);
            break;
          case "Enter":
            if (localFocusedItem) {
              const isFolder =
                localFocusedItem.type === "folder" ||
                localFocusedItem.type === "parent";

              if (isFolder) {
                // If the focused item's full path is the same as the current path,
                // we are already there. Treat as a confirmation instead of re-navigating.
                if (localFocusedItem.fullPath === pathRef.current) {
                  handleConfirm();
                } else {
                  handleNavigate(pathRef.current, localFocusedItem.name);
                }
              } else if (filterItem(localFocusedItem)) {
                handleConfirm();
              }
            } else {
              handleConfirm();
            }
            // Exit handler immediately. Prevents shared focus logic at the end of the function
            // from running on a navigation action.
            return;
          case "Backspace":
            const parentItem = items.find((item) => item.name === "..");
            if (parentItem) {
              handleNavigate(pathRef.current, "..");
            }
            // Exit handler immediately. Prevents shared focus logic at the end of the function
            // from running on a navigation action.
            return;
          default:
            preventDefault = false;
        }

        if (preventDefault) {
          e.preventDefault();
          const newFocusedItem = items[newIndex];
          if (newFocusedItem) {
            setFocusedItem(newFocusedItem);
          }
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [
      isVisible,
      items,
      handleNavigate,
      filterItem,
      handleConfirm,
      focusedItem,
    ]);

    useEffect(() => {
      if (focusedItem && listRef.current) {
        const element = listRef.current.querySelector(
          `[data-name="${CSS.escape(focusedItem.name)}"]`
        );
        if (element) {
          element.scrollIntoView({
            block: "nearest",
            inline: "nearest",
          });
        }
      }
    }, [focusedItem]);

    if (!isVisible) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg shadow-xl p-4 w-full max-w-2xl h-3/4 flex flex-col border border-sky-500">
          <h3 className="text-xl font-bold text-sky-400 flex-shrink-0 mb-4">
            {title}
          </h3>
          {children && (
            <div className="text-gray-400 mb-4 flex-shrink-0 whitespace-normal">
              {children}
            </div>
          )}
          {error && (
            <div className="text-red-400 bg-red-900/50 p-2 rounded mb-2 text-center">
              {error}
            </div>
          )}
          <div className="bg-gray-900 p-2 rounded-t-md mb-2 flex items-center text-sm">
            <HardDrive className="w-5 h-5 mr-3 text-gray-400" />
            <span className="font-bold truncate">
              {currentPath || "Loading..."}
            </span>
          </div>
          <div
            key={currentPath}
            ref={listRef}
            tabIndex={-1}
            className="flex-grow overflow-y-auto border border-gray-700 rounded-b-md p-1 relative outline-none focus:ring-2 focus:ring-sky-500"
          >
            {loading && (
              <div className="absolute inset-0 bg-gray-800 bg-opacity-50 flex items-center justify-center z-10">
                <LoaderCircle className="w-8 h-8 animate-spin text-sky-400" />
              </div>
            )}
            {!loading &&
              items.map((item) => {
                const isSelectable = filterItem(item);
                return (
                  <div
                    key={item.name}
                    data-name={item.name}
                    className={`flex items-center p-1.5 rounded select-none ${
                      !isSelectable ? "text-gray-500" : "cursor-pointer"
                    } ${
                      focusedItem?.name === item.name
                        ? "bg-blue-600"
                        : isSelectable
                        ? "hover:bg-gray-700"
                        : ""
                    }`}
                    onClick={() => isSelectable && setFocusedItem(item)}
                    onDoubleClick={() => {
                      const isFolder =
                        item.type === "folder" || item.type === "parent";
                      if (isFolder) {
                        handleNavigate(pathRef.current, item.name);
                      } else if (isSelectable) {
                        if (onFileDoubleClick) {
                          onFileDoubleClick(item);
                        } else {
                          handleConfirm(item);
                        }
                      }
                    }}
                  >
                    <Icon type={item.type} className="mr-1" />
                    <span className="flex-grow truncate">{item.name}</span>
                  </div>
                );
              })}
          </div>
          <div className="flex justify-end space-x-4 mt-4 flex-shrink-0">
            <button
              ref={cancelButtonRef}
              onClick={onClose}
              className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-6 rounded-lg"
            >
              Cancel
            </button>
            {confirmButtonText && (
              <button
                ref={confirmButtonRef}
                onClick={() => handleConfirm()}
                disabled={confirmButtonText !== "Select Folder" && !focusedItem}
                className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-6 rounded-lg disabled:bg-gray-500"
              >
                {confirmButtonText}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
);
export default BrowserModal;
