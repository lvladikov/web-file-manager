import { useCallback } from "react";

const useSwapPanels = ({ panels, handleNavigate }) => {
  const handleSwapPanels = useCallback(() => {
    const leftPath = panels.left.path;
    const rightPath = panels.right.path;
    handleNavigate("left", rightPath, "");
    handleNavigate("right", leftPath, "");
  }, [panels.left.path, panels.right.path, handleNavigate]);

  return { handleSwapPanels };
};

export default useSwapPanels;
