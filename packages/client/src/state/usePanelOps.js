import { useCallback } from "react";
import { buildFullPath } from "../lib/utils";
import { fetchDirectory, openFile } from "../lib/api";

export default function usePanelOps({
  panels,
  setPanels,
  setLoading,
  setError,
  setAppBrowserModal,
  activePanel,
  focusedItem,
}) {
  const updateItemInPanel = useCallback(
    (panelId, itemName, newProps) => {
      setPanels((prev) => {
        const panel = prev[panelId];
        const newItems = panel.items.map((item) =>
          item.name === itemName ? { ...item, ...newProps } : item
        );
        return { ...prev, [panelId]: { ...panel, items: newItems } };
      });
    },
    [setPanels]
  );

  const handleOpenFile = useCallback(
    async (basePath, fileName, appName) => {
      try {
        await openFile(buildFullPath(basePath, fileName), appName);
      } catch (err) {
        setError(`Could not open file: ${err.message}`);
      }
    },
    [setError]
  );

  const handleNavigate = useCallback(
    async (panelId, currentPath, target) => {
      setLoading((prev) => ({ ...prev, [panelId]: true }));
      try {
        const data = await fetchDirectory(currentPath, target);
        setPanels((prev) => ({ ...prev, [panelId]: data }));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading((prev) => ({ ...prev, [panelId]: false }));
      }
    },
    [setLoading, setPanels, setError]
  );

  const handleRefreshPanel = (panelId) => {
    handleNavigate(panelId, panels[panelId].path, "");
  };

  const handleRefreshAllPanels = () => {
    handleNavigate("left", panels.left.path, "");
    handleNavigate("right", panels.right.path, "");
  };

  const handleContextOpen = useCallback(() => {
    const name = focusedItem[activePanel];
    if (name) {
      const item = panels[activePanel].items.find((i) => i.name === name);
      if (item) {
        if (item.type === "folder" || item.type === "parent") {
          handleNavigate(activePanel, panels[activePanel].path, item.name);
        } else {
          handleOpenFile(panels[activePanel].path, item.name);
        }
      }
    }
  }, [focusedItem, activePanel, panels, handleOpenFile, handleNavigate]);

  const handleContextOpenWith = useCallback(() => {
    const name = focusedItem[activePanel];
    if (name) {
      const item = panels[activePanel].items.find((i) => i.name === name);
      if (item && !["folder", "parent"].includes(item.type)) {
        setAppBrowserModal({
          isVisible: true,
          file: item,
          path: panels[activePanel].path,
        });
      }
    }
  }, [focusedItem, activePanel, panels, setAppBrowserModal]);

  const handleSetOtherPanelPath = useCallback(() => {
    if (focusedItem[activePanel]) {
      const itemToNavigate = panels[activePanel].items.find(
        (i) => i.name === focusedItem[activePanel]
      );

      if (itemToNavigate && itemToNavigate.type === "folder") {
        const otherPanelId = activePanel === "left" ? "right" : "left";
        const newPath = buildFullPath(
          panels[activePanel].path,
          itemToNavigate.name
        );
        handleNavigate(otherPanelId, newPath, "");
      }
    }
  }, [focusedItem, activePanel, panels, handleNavigate]);

  return {
    updateItemInPanel,
    handleOpenFile,
    handleNavigate,
    handleRefreshPanel,
    handleRefreshAllPanels,
    handleContextOpen,
    handleContextOpenWith,
    handleSetOtherPanelPath,
  };
}
