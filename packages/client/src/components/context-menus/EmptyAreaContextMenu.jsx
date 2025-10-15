import React from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { metaKey } from "../../lib/utils.js";

const EmptyAreaContextMenu = ({
  onNewFolder,
  onRefreshPanel,
  onRefreshBothPanels,
  onSelectAll,
  onUnselectAll,
  onInvertSelection,
  onQuickSelect,
  onQuickUnselect,
  onQuickFilter,
  onSwapPanels,
  boundaryRef,
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
          collisionBoundary={boundaryRef.current}
          collisionPadding={80}
          className="z-50 bg-gray-700 border border-gray-500 rounded-md shadow-lg text-white font-mono text-sm overflow-hidden"
        >
          <ScrollArea.Root className="w-full h-full" type="auto">
            <ScrollArea.Viewport
              className="w-full h-full rounded"
              style={{ maxHeight: "80vh" }}
            >
              <ContextMenu.Item
                onSelect={onNewFolder}
                className={itemClassName}
              >
                New Folder
              </ContextMenu.Item>
              <div className={separatorClassName}></div>
              <ContextMenu.Item
                onSelect={onSelectAll}
                className={itemClassName}
              >
                <span>Select All</span>
                <span className="text-gray-400">{metaKey}+A</span>
              </ContextMenu.Item>
              <ContextMenu.Item
                onSelect={onUnselectAll}
                className={itemClassName}
              >
                <span>Unselect All</span>
                <span className="text-gray-400">{metaKey}+D</span>
              </ContextMenu.Item>
              <ContextMenu.Item
                onSelect={onInvertSelection}
                className={itemClassName}
              >
                <span>Invert Selection</span>
                <span className="text-gray-400">*</span>
              </ContextMenu.Item>
              <div className={separatorClassName}></div>
              <ContextMenu.Item
                onSelect={onQuickSelect}
                className={itemClassName}
              >
                <span>Quick Select</span>
                <span className="text-gray-400">+</span>
              </ContextMenu.Item>
              <ContextMenu.Item
                onSelect={onQuickUnselect}
                className={itemClassName}
              >
                <span>Quick Unselect</span>
                <span className="text-gray-400">-</span>
              </ContextMenu.Item>
              <div className={separatorClassName}></div>
              <ContextMenu.Item
                onSelect={onQuickFilter}
                className={itemClassName}
              >
                <span>Quick Filter</span>
                <span className="text-gray-400">.</span>
              </ContextMenu.Item>
              <div className={separatorClassName}></div>
              <ContextMenu.Item
                onSelect={onRefreshPanel}
                className={itemClassName}
              >
                Refresh active panel
              </ContextMenu.Item>
              <ContextMenu.Item
                onSelect={onRefreshBothPanels}
                className={itemClassName}
              >
                Refresh both panels
              </ContextMenu.Item>
              <div className={separatorClassName}></div>
              <ContextMenu.Item
                onSelect={onSwapPanels}
                className={itemClassName}
              >
                <span>Swap Panels</span>
                <span className="text-gray-400">{metaKey}+U</span>
              </ContextMenu.Item>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar
              className="flex select-none touch-none p-0.5 bg-gray-800 transition-colors duration-[160ms] ease-out hover:bg-gray-900 data-[orientation=vertical]:w-2.5 data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:h-2.5"
              orientation="vertical"
            >
              <ScrollArea.Thumb className="flex-1 bg-gray-500 rounded-[10px] relative before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:w-full before:h-full before:min-w-[44px] before:min-h-[44px]" />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
};

export default EmptyAreaContextMenu;
