import { useEffect, useRef } from "react";
import { isMac, isItemPreviewable } from "../lib/utils";

export default function useKeyboardShortcuts(props) {
  const latestProps = useRef(props);
  useEffect(() => {
    latestProps.current = props;
  });

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const {
        deleteModalVisible,
        handleCancelDelete,
        confirmDeletion,
        previewModal,
        setPreviewModal,
        copyProgress,
        handleCancelCopy,
        folderBrowserModal,
        setFolderBrowserModal,
        appBrowserModal,
        setAppBrowserModal,
        sizeCalcModal,
        helpModal,
        setHelpModal,
        error,
        setError,
        activePanel,
        panels,
        focusedItem,
        selectionAnchor,
        activePath,
        setActivePanel,
        setSelections,
        setFocusedItem,
        setSelectionAnchor,
        handleNavigate,
        handleOpenFile,
        handleStartRename,
        handleCopyAction,
        handleStartNewFolder,
        handleDeleteItem,
        handleStartSizeCalculation,
        handleInvertSelection,
      } = latestProps.current;

      if (deleteModalVisible) {
        e.stopPropagation();
        const cancelButton = document.getElementById("delete-cancel-button");
        const deleteButton = document.getElementById("delete-confirm-button");
        if (e.key === "Escape") {
          e.preventDefault();
          handleCancelDelete();
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (document.activeElement === deleteButton) {
            confirmDeletion();
          } else {
            handleCancelDelete();
          }
        } else if (e.key === "Tab") {
          e.preventDefault();
          if (e.shiftKey) {
            if (document.activeElement === deleteButton) cancelButton?.focus();
            else deleteButton?.focus();
          } else {
            if (document.activeElement === cancelButton) deleteButton?.focus();
            else cancelButton?.focus();
          }
        }
        return;
      }
      if (previewModal.isVisible) {
        const isNavKey = [
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
          "PageUp",
          "PageDown",
        ].includes(e.key);
        if (e.key === "Escape") {
          e.preventDefault();
          setPreviewModal({ isVisible: false, item: null });
          return;
        }
        if (!isNavKey) {
          return;
        }
      }
      if (copyProgress.isVisible) {
        if (e.key === "Escape") {
          e.preventDefault();
          handleCancelCopy();
        }
        return;
      } else if (
        folderBrowserModal.isVisible ||
        appBrowserModal.isVisible ||
        sizeCalcModal.isVisible ||
        helpModal.isVisible ||
        error
      ) {
        if (e.key === "Escape") {
          if (folderBrowserModal.isVisible)
            setFolderBrowserModal({
              isVisible: false,
              targetPanelId: null,
              initialPath: "",
            });
          if (appBrowserModal.isVisible)
            setAppBrowserModal((s) => ({ ...s, isVisible: false }));
          if (helpModal.isVisible) setHelpModal({ isVisible: false });
          if (error) setError(null);
        }
        return;
      }
      if (
        document.activeElement &&
        ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
      ) {
        if (e.key === "Escape") document.activeElement.blur();
        return;
      }
      const isModKey = isMac ? e.metaKey : e.ctrlKey;
      if (isModKey && e.key === "a") {
        e.preventDefault();
        const panelItems = panels[activePanel]?.items;
        if (!panelItems) return;
        const allSelectableItems = panelItems
          .filter((item) => item.name !== "..")
          .map((item) => item.name);
        setSelections((prev) => ({
          ...prev,
          [activePanel]: new Set(allSelectableItems),
        }));
        return;
      }
      if (isModKey && e.key === "d") {
        e.preventDefault();
        setSelections((prev) => ({ ...prev, [activePanel]: new Set() }));
        return;
      }
      if (e.key === "*") {
        e.preventDefault();
        handleInvertSelection();
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        setActivePanel((prev) => (prev === "left" ? "right" : "left"));
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        const focusedName = focusedItem[activePanel];
        if (focusedName) {
          const item = panels[activePanel].items.find(
            (i) => i.name === focusedName
          );
          if (!item) return;
          if (isItemPreviewable(item)) {
            setPreviewModal({ isVisible: true, item: item });
          } else if (item.type === "folder") {
            handleStartSizeCalculation(item);
          }
        }
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        const parentItem = panels[activePanel]?.items.find(
          (item) => item.name === ".."
        );
        if (parentItem) {
          handleNavigate(activePanel, panels[activePanel].path, "..");
        }
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const focusedName = focusedItem[activePanel];
        if (focusedName) {
          const item = panels[activePanel].items.find(
            (i) => i.name === focusedName
          );
          if (item) {
            if (item.type === "folder" || item.type === "parent") {
              handleNavigate(activePanel, panels[activePanel].path, item.name);
            } else {
              handleOpenFile(panels[activePanel].path, item.name);
            }
          }
        }
        return;
      }
      if (e.key === "F1") {
        e.preventDefault();
        setHelpModal({ isVisible: true });
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        const focusedName = focusedItem[activePanel];
        if (focusedName && focusedName !== "..") {
          handleStartRename(activePanel, focusedName);
        }
        return;
      }
      if (e.key === "F3") {
        e.preventDefault();
        const focusedName = focusedItem[activePanel];
        if (focusedName) {
          const item = panels[activePanel].items.find(
            (i) => i.name === focusedName
          );
          if (item && item.type !== "folder" && item.type !== "parent") {
            handleOpenFile(activePath, item.name);
          }
        }
        return;
      }
      if (e.key === "F5") {
        e.preventDefault();
        handleCopyAction();
        return;
      }
      if (e.key === "F7") {
        e.preventDefault();
        handleStartNewFolder(activePanel);
        return;
      }
      if (e.key === "F8") {
        e.preventDefault();
        handleDeleteItem();
        return;
      }

      const panelItems = panels[activePanel]?.items;
      if (!panelItems || panelItems.length === 0) return;
      const currentFocusedName = focusedItem[activePanel];
      const currentIndex = currentFocusedName
        ? panelItems.findIndex((i) => i.name === currentFocusedName)
        : -1;
      let newIndex = currentIndex;
      let preventDefault = true;

      switch (e.key) {
        case "ArrowDown":
          newIndex = Math.min(panelItems.length - 1, currentIndex + 1);
          if (currentIndex === -1) newIndex = 0;
          break;
        case "ArrowUp":
          newIndex = Math.max(0, currentIndex - 1);
          break;
        case "Home":
          newIndex = 0;
          break;
        case "End":
          newIndex = panelItems.length - 1;
          break;
        case "PageDown":
          newIndex = Math.min(panelItems.length - 1, currentIndex + 10);
          break;
        case "PageUp":
          newIndex = Math.max(0, currentIndex - 10);
          break;
        default:
          preventDefault = false;
      }

      if (preventDefault) {
        e.preventDefault();
        const newFocusedName = panelItems[newIndex]?.name;
        if (typeof newFocusedName === "undefined") return;
        setFocusedItem((prev) => ({ ...prev, [activePanel]: newFocusedName }));
        if (e.shiftKey) {
          const anchorName =
            selectionAnchor[activePanel] || panelItems[0]?.name;
          const anchorIndex = panelItems.findIndex(
            (i) => i.name === anchorName
          );
          const start = Math.min(anchorIndex, newIndex);
          const end = Math.max(anchorIndex, newIndex);
          const rangeItems = panelItems.slice(start, end + 1);
          const selectableRangeItems = rangeItems
            .filter((item) => item.name !== "..")
            .map((i) => i.name);
          const newSelection = new Set(selectableRangeItems);
          setSelections((prev) => ({ ...prev, [activePanel]: newSelection }));
        } else {
          setSelections((prev) => ({
            ...prev,
            [activePanel]: new Set([newFocusedName]),
          }));
          setSelectionAnchor((prev) => ({
            ...prev,
            [activePanel]: newFocusedName,
          }));
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);
}
