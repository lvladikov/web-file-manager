import { useCallback } from "react";
import { buildFullPath } from "../lib/utils";
import { fetchDirectory, openFile } from "../lib/api";

export default function usePanelOps({ setPanels, setLoading, setError }) {
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

  return {
    updateItemInPanel,
    handleOpenFile,
    handleNavigate,
  };
}
