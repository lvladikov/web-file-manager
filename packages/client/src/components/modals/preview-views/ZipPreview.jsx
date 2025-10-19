import React, { useCallback, useRef, forwardRef, useState } from "react";
import { Info } from "lucide-react";
import BrowserModal from "../BrowserModal";
import { fetchZipContents } from "../../../lib/api";
import { matchZipPath } from "../../../lib/utils";

const ZipPreview = forwardRef(
  (
    {
      filePath,
      onClose,
      isVisible,
      onDecompressInActivePanel,
      onDecompressToOtherPanel,
    },
    ref
  ) => {
    const zipFileName = filePath.split("/").pop();
    const browserModalRef = useRef(null);
    const [selection, setSelection] = useState(new Set());
    const [currentZipItems, setCurrentZipItems] = useState([]);

    const zipPathMatch = matchZipPath(filePath);
    const actualZipFilePath = zipPathMatch ? zipPathMatch[1] : filePath;
    const initialPathInZip = zipPathMatch
      ? zipPathMatch[2].startsWith("/")
        ? zipPathMatch[2]
        : `/${zipPathMatch[2]}`
      : "/";

    const fetchZipDirectory = useCallback(
      async (basePath, target) => {
        let currentPathInZip = basePath.replace(/\\/g, "/");
        let normalizedTarget = target.replace(/\\/g, "/");

        if (normalizedTarget === "..") {
          currentPathInZip = currentPathInZip.substring(
            0,
            currentPathInZip.lastIndexOf("/")
          );
          if (currentPathInZip === "") currentPathInZip = "/";
        } else if (normalizedTarget !== "") {
          currentPathInZip = `${
            currentPathInZip === "/" ? "" : currentPathInZip
          }/${normalizedTarget}`;
        }

        const contents = await fetchZipContents(
          actualZipFilePath,
          currentPathInZip
        );

        return { path: currentPathInZip, items: contents.items };
      },
      [actualZipFilePath]
    );

    const handleDecompressSelection = (target) => {
      if (selection.size === 0) return;

      const itemsToExtract = Array.from(selection)
        .map((name) => {
          const item = currentZipItems.find((i) => i.name === name);
          if (!item) return null;

          const pathInZip = item.fullPath.substring(
            actualZipFilePath.length + 1
          );
          return pathInZip.endsWith("/") ? pathInZip.slice(0, -1) : pathInZip;
        })
        .filter(Boolean);

      if (itemsToExtract.length === 0) return;

      if (target === "active") {
        onDecompressInActivePanel(itemsToExtract);
      } else {
        onDecompressToOtherPanel(itemsToExtract);
      }
      onClose();
    };

    const handleDecompressAll = (target) => {
      if (target === "active") {
        onDecompressInActivePanel(); // No args means all
      } else {
        onDecompressToOtherPanel(); // No args means all
      }
      onClose();
    };

    const CustomFooter = () => (
      <>
        <div className="grid grid-cols-2 gap-2 flex-grow">
          <button
            onClick={() => handleDecompressSelection("active")}
            disabled={selection.size === 0}
            className="bg-sky-600 hover:bg-sky-700 text-white py-2 px-4 rounded-lg disabled:bg-gray-500 disabled:cursor-not-allowed"
            title="Decompress only the selected items to the active panel"
          >
            Decompress Selection to Active
          </button>
          <button
            onClick={() => handleDecompressSelection("other")}
            disabled={selection.size === 0}
            className="bg-sky-600 hover:bg-sky-700 text-white py-2 px-4 rounded-lg disabled:bg-gray-500 disabled:cursor-not-allowed"
            title="Decompress only the selected items to the other panel"
          >
            Decompress Selection to Other
          </button>
          <button
            onClick={() => handleDecompressAll("active")}
            className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg"
            title="Decompress the entire archive to the active panel"
          >
            Decompress All to Active
          </button>
          <button
            onClick={() => handleDecompressAll("other")}
            className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg"
            title="Decompress the entire archive to the other panel"
          >
            Decompress All to Other
          </button>
        </div>
        <button
          onClick={onClose}
          className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-6 rounded-lg ml-4"
        >
          Cancel
        </button>
      </>
    );

    return (
      <BrowserModal
        ref={browserModalRef}
        isVisible={isVisible}
        onClose={onClose}
        onConfirm={() => {}}
        initialPath={initialPathInZip}
        title={`Zip Archive: ${zipFileName}`}
        confirmButtonText={null}
        filterItem={() => true}
        fetchItems={fetchZipDirectory}
        isEmbedded={true}
        onSelectionChange={setSelection}
        onItemsLoad={setCurrentZipItems}
        footer={<CustomFooter />}
      >
        <div className="flex items-start bg-gray-800 text-sm text-gray-400 flex-shrink-0">
          <Info className="w-5 h-5 mr-3 flex-shrink-0 text-sky-400" />
          <p className="min-w-0">
            Use navigation keys (Up/Down, Enter) to browse the archive contents.
            Use Shift + navigation keys (Up/Down) to change the item being
            previewed, i.e. change to another item from the background panel.
          </p>
        </div>
      </BrowserModal>
    );
  }
);

export default ZipPreview;
