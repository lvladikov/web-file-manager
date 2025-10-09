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
        overwritePrompt,
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
        handleStartQuickSelect,
        handleStartQuickUnselect,
        handleStartFilter,
        filterPanelId,
        handleCloseFilter,
        handleSelectAll,
      } = latestProps.current;

      if (overwritePrompt.isVisible) {
        e.stopPropagation();
        const yesButton = document.getElementById("overwrite-yes-button");
        const noButton = document.getElementById("overwrite-no-button");
        const overwriteAllButton = document.getElementById("overwrite-overwrite_all-button");
        const ifNewerButton = document.getElementById("overwrite-if_newer-button");
        const skipAllButton = document.getElementById("overwrite-skip_all-button");
        const noZeroLengthButton = document.getElementById("overwrite-no_zero_length-button");
        const sizeDiffersButton = document.getElementById("overwrite-size_differs-button");
        const smallerOnlyButton = document.getElementById("overwrite-smaller_only-button");
        const cancelButton = document.getElementById("overwrite-cancel-button");

        const focusableElements = [
          yesButton,
          noButton,
          overwriteAllButton,
          ifNewerButton,
          skipAllButton,
          noZeroLengthButton,
          sizeDiffersButton,
          smallerOnlyButton,
          cancelButton,
        ].filter(Boolean);

        if (e.key === "Escape") {
          e.preventDefault();
          handleCancelCopy();
        }
        if (e.key === "Tab") {
          e.preventDefault();
          const currentIndex = focusableElements.indexOf(document.activeElement);
          const nextIndex = e.shiftKey ? (currentIndex - 1 + focusableElements.length) % focusableElements.length : (currentIndex + 1) % focusableElements.length;
          focusableElements[nextIndex]?.focus();
        }
        return;
      }

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
          }
          else {
            handleCancelDelete();
          }
        } else if (e.key === "Tab") {
          e.preventDefault();
          if (e.shiftKey) {
            if (document.activeElement === deleteButton) cancelButton?.focus();
            else deleteButton?.focus();
          }
          else {
            if (document.activeElement === cancelButton) deleteButton?.focus();
            else deleteButton?.focus();
          }
        }
        return;
      }

      if (latestProps.current.quickSelectModal.isVisible) {
        e.stopPropagation();
        const patternInput = document.getElementById("pattern-input");
        const resetButton = document.getElementById("reset-selection");
        const regexButton = document.getElementById("use-regex");
        const caseButton = document.getElementById("case-sensitive");
        const cancelButton = document.getElementById("quick-select-cancel-button");
        const confirmButton = document.getElementById("quick-select-confirm-button");

        const focusableElements = [patternInput, resetButton, regexButton, caseButton, cancelButton, confirmButton];

        if (e.key === "Escape") {
          e.preventDefault();
          latestProps.current.setQuickSelectModal({ isVisible: false, mode: 'select' });
        }
        if (e.key === "Enter") {
          e.preventDefault();
          if (document.activeElement !== cancelButton) {
            confirmButton.click();
          }
          else {
            cancelButton.click();
          }
        }
        if (e.key === "Tab") {
            e.preventDefault();
            const currentIndex = focusableElements.indexOf(document.activeElement);
            const nextIndex = e.shiftKey ? (currentIndex - 1 + focusableElements.length) % focusableElements.length : (currentIndex + 1) % focusableElements.length;
            focusableElements[nextIndex]?.focus();
        }
        return;
      }

      if (filterPanelId) {
        const filterInput = document.getElementById("filter-input");
        if (e.key === "." && document.activeElement !== filterInput) {
          e.preventDefault();
          filterInput.focus();
          return;
        }

        const isModKey = isMac ? e.metaKey : e.ctrlKey;
        const isSelectAll = isModKey && e.key === "a";
        const isUnselectAll = isModKey && e.key === "d";
        const isInvertSelection = e.key === "*";
        const isQuickSelect = e.key === "+";
        const isQuickUnselect = e.key === "-";
        const allowedFKeys = ["F5", "F6", "F8"]; // F2 might be allowed in the future for multi-rename

        if (isSelectAll || isUnselectAll || isInvertSelection || isQuickSelect || isQuickUnselect || allowedFKeys.includes(e.key)) {
          // Allow event to propagate for these specific shortcuts
        } else {
          e.stopPropagation();
          const regexButton = document.getElementById("filter-regex-button");
          const caseButton = document.getElementById("filter-case-button");
          const closeButton = document.getElementById("filter-close-button");

          const focusableElements = [filterInput, regexButton, caseButton, closeButton];

          if (e.key === "Escape") {
            e.preventDefault();
            handleCloseFilter(filterPanelId);
          }
          if (e.key === "Tab") {
            e.preventDefault();
            const currentIndex = focusableElements.indexOf(document.activeElement);
            const nextIndex = e.shiftKey ? (currentIndex - 1 + focusableElements.length) % focusableElements.length : (currentIndex + 1) % focusableElements.length;
            focusableElements[nextIndex]?.focus();
          }
          return;
        }
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
      }
      else if (
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
        handleSelectAll();
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
      if (e.key === "+") {
        e.preventDefault();
        handleStartQuickSelect();
        return;
      }
      if (e.key === "-") {
        e.preventDefault();
        handleStartQuickUnselect();
        return;
      }
      if (e.key === ".") {
        e.preventDefault();
        latestProps.current.handleStartFilter();
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
