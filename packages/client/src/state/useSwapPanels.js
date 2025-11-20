import { useCallback } from "react";
import { isVerboseLogging } from "../lib/utils";

const useSwapPanels = ({ panels, handleNavigate }) => {
  const handleSwapPanels = useCallback(() => {
    const leftPath = panels.left.path;
    const rightPath = panels.right.path;
    try {
      if (isVerboseLogging())
        console.log(
          `[useSwapPanels] swapping left='${leftPath}' right='${rightPath}'`
        );
    } catch (e) {}
    handleNavigate("left", rightPath, "");
    handleNavigate("right", leftPath, "");
  }, [panels.left.path, panels.right.path, handleNavigate]);

  return { handleSwapPanels };
};

export default useSwapPanels;
