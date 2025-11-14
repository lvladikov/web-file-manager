import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  forwardRef,
} from "react";

import { HardDrive, LoaderCircle } from "lucide-react";

import Icon from "../../components/ui/Icon.jsx";
import TruncatedText from "../ui/TruncatedText.jsx";

import { isModKey } from "../../lib/utils";
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
      isEmbedded,
      footer,
      onSelectionChange,
      onItemsLoad,
      overlayClassName,
      modalClassName,
    },
    ref
  ) => {
    const [currentPath, setCurrentPath] = useState(initialPath || "");
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [focusedItem, setFocusedItem] = useState(null);
    const [error, setError] = useState(null);
    const [selectedItems, setSelectedItems] = useState(new Set());
    const [selectionAnchor, setSelectionAnchor] = useState(null);

    const listRef = useRef(null);
    const confirmButtonRef = useRef(null);
    const cancelButtonRef = useRef(null);
    const pathRef = useRef(currentPath);

    useEffect(() => {
      pathRef.current = currentPath;
    }, [currentPath]);

    useEffect(() => {
      if (onSelectionChange) {
        onSelectionChange(selectedItems);
      }
    }, [selectedItems, onSelectionChange]);

    const focusedItemRef = useRef(focusedItem);
    useEffect(() => {
      focusedItemRef.current = focusedItem;
    }, [focusedItem]);

    const buildFullPath = (base, file) =>
      `${base}${base.includes("\\") ? "\\" : "/"}${file}`;

    const handleConfirm = useCallback(
      (itemOverride) => {
        const itemToConfirm = itemOverride || focusedItemRef.current;

        const isPathConfirmModal =
          confirmButtonText === "Select Folder" ||
          confirmButtonText === "Copy Here" ||
          confirmButtonText === "Move Here";

        if (!itemToConfirm) {
          if (isPathConfirmModal) {
            onConfirm(pathRef.current);
          }
          return;
        }

        if (
          itemToConfirm.type === "folder" &&
          itemToConfirm.fullPath === pathRef.current
        ) {
          onConfirm(pathRef.current);
          return;
        }

        const fullPath = buildFullPath(pathRef.current, itemToConfirm.name);
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
          if (onItemsLoad) {
            onItemsLoad(dirData.items);
          }
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      },
      [fetchItems, onItemsLoad]
    );

    const handleItemClick = (item, e) => {
      if (!filterItem(item)) return;

      setFocusedItem(item);

      const itemName = item.name;
      if (isModKey(e)) {
        const newSelection = new Set(selectedItems);
        if (newSelection.has(itemName)) newSelection.delete(itemName);
        else newSelection.add(itemName);
        setSelectedItems(newSelection);
        setSelectionAnchor(item);
      } else if (e.shiftKey && selectionAnchor) {
        const anchorIndex = items.findIndex(
          (i) => i.name === selectionAnchor.name
        );
        const clickedIndex = items.findIndex((i) => i.name === itemName);

        const start = Math.min(anchorIndex, clickedIndex);
        const end = Math.max(anchorIndex, clickedIndex);

        const newSelection = new Set(
          items
            .slice(start, end + 1)
            .filter((i) => filterItem(i))
            .map((i) => i.name)
        );
        setSelectedItems(newSelection);
      } else {
        setSelectedItems(new Set([itemName]));
        setSelectionAnchor(item);
      }
    };

    useEffect(() => {
      if (isVisible) {
        const initialLoadPath = initialPath || "";
        setCurrentPath(initialLoadPath);
        handleNavigate(initialLoadPath, "");
        setSelectedItems(new Set());
        setSelectionAnchor(null);
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
        if (isModKey(e) && e.key === "a") {
          e.preventDefault();
          const allSelectable = items
            .filter((i) => filterItem(i))
            .map((i) => i.name);
          setSelectedItems(new Set(allSelectable));
          return;
        }

        if (isModKey(e) && e.key === "d") {
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
            return;
          case "Backspace":
            const parentItem = items.find((item) => item.name === "..");
            if (parentItem) {
              handleNavigate(pathRef.current, "..");
            }
            return;
          default:
            preventDefault = false;
        }

        if (preventDefault) {
          e.preventDefault();
          const newFocusedItem = items[newIndex];
          if (newFocusedItem) {
            setFocusedItem(newFocusedItem);

            if (e.shiftKey && selectionAnchor) {
              const anchorIndex = items.findIndex(
                (i) => i.name === selectionAnchor.name
              );
              const start = Math.min(anchorIndex, newIndex);
              const end = Math.max(anchorIndex, newIndex);
              const newSelection = new Set(
                items
                  .slice(start, end + 1)
                  .filter(filterItem)
                  .map((i) => i.name)
              );
              setSelectedItems(newSelection);
            } else {
              setSelectedItems(new Set([newFocusedItem.name]));
              setSelectionAnchor(newFocusedItem);
            }
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
      onClose,
      selectionAnchor,
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

    const isPathConfirmModal =
      confirmButtonText === "Select Folder" ||
      confirmButtonText === "Copy Here" ||
      confirmButtonText === "Move Here";

    const isButtonDisabled =
      !confirmButtonText || (!isPathConfirmModal && !focusedItem);

    const baseModalClassName = `bg-gray-800 rounded-lg shadow-xl p-4 flex flex-col ${
      isEmbedded
        ? "w-full h-full border-none"
        : "w-full max-w-2xl h-3/4 border border-sky-500"
    }`;
    const modalClasses = modalClassName
      ? `${baseModalClassName} ${modalClassName}`
      : baseModalClassName;

    const modalContent = (
      <div className={modalClasses}>
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
        <div
          className="bg-gray-900 p-2 rounded-t-md mb-2 flex items-center text-sm"
          title={currentPath || ""}
        >
          <HardDrive className="w-5 h-5 mr-3 text-gray-400 flex-shrink-0" />
          <div className="font-bold overflow-hidden flex-1 pr-1">
            <TruncatedText text={currentPath || "Loading..."} />
          </div>
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
              const isSelected = selectedItems.has(item.name);
              return (
                <div
                  key={item.name}
                  data-name={item.name}
                  className={`flex items-center p-1.5 rounded select-none ${
                    !isSelectable ? "text-gray-500" : "cursor-pointer"
                  } ${
                    isSelected
                      ? "bg-blue-600"
                      : focusedItem?.name === item.name
                      ? "bg-gray-600"
                      : isSelectable
                      ? "hover:bg-gray-700"
                      : ""
                  }
                  ${
                    focusedItem?.name === item.name && !isSelected
                      ? "ring-2 ring-gray-400 ring-inset"
                      : ""
                  }
                  `}
                  onClick={(e) => handleItemClick(item, e)}
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
                  <div className="flex-grow min-w-0">
                    <TruncatedText text={item.name} />
                  </div>
                </div>
              );
            })}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-4 flex-shrink-0">
          {footer ? (
            footer
          ) : (
            <>
              <div className="hidden sm:block sm:flex-grow" />
              <button
                ref={cancelButtonRef}
                onClick={onClose}
                className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-6 rounded-lg w-full sm:w-auto text-center"
              >
                Cancel
              </button>
              {confirmButtonText && (
                <button
                  ref={confirmButtonRef}
                  onClick={() => handleConfirm()}
                  disabled={isButtonDisabled}
                  className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-6 rounded-lg disabled:bg-gray-500 w-full sm:w-auto text-center"
                >
                  {confirmButtonText}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );

    if (isEmbedded) {
      return modalContent;
    }

    if (isEmbedded) {
      return modalContent;
    }

    const overlayClasses =
      overlayClassName ||
      "fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50";

    return <div className={overlayClasses}>{modalContent}</div>;
  }
);
export default BrowserModal;
