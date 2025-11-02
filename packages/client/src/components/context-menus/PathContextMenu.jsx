import React from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";

import { metaKey } from "../../lib/utils.js";

const PathContextMenu = ({
  onChooseFolder,
  onSwapPanels,
  onTerminal,
  onTerminalOtherPanel,
  onCopyPathToClipboard,
  children,
}) => {
  const itemClassName =
    "px-4 py-2 hover:bg-sky-600 cursor-pointer flex justify-between";
  const separatorClassName = "border-t border-gray-600 mx-2 my-1";

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="z-50 bg-gray-700 border border-gray-500 rounded-md shadow-lg text-white font-mono text-sm overflow-hidden w-60"
          onClick={(e) => e.stopPropagation()}
        >
          <ContextMenu.Item onSelect={onChooseFolder} className={itemClassName}>
            Select a folder
          </ContextMenu.Item>
          <div className={separatorClassName}></div>
          <ContextMenu.Item
            onSelect={onCopyPathToClipboard}
            className={itemClassName}
          >
            Copy path to clipboard
          </ContextMenu.Item>
          <div className={separatorClassName}></div>
          <ContextMenu.Item onSelect={onTerminal} className={itemClassName}>
            <span>Terminal in active panel</span>
          </ContextMenu.Item>
          <ContextMenu.Item
            onSelect={onTerminalOtherPanel}
            className={itemClassName}
          >
            <span>Terminal in other panel</span>
          </ContextMenu.Item>
          <ContextMenu.Separator className={separatorClassName} />
          <ContextMenu.Item onSelect={onSwapPanels} className={itemClassName}>
            <span>Swap panels</span>
            <span className="text-gray-400">{metaKey}+U</span>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
};

export default PathContextMenu;
