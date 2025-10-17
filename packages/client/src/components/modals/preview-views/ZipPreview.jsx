import React, { useCallback, useRef, forwardRef } from "react";
import { Info } from "lucide-react";
import BrowserModal from "../BrowserModal";
import { fetchZipContents } from "../../../lib/api";

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

    const zipPathMatch = filePath.match(/^(.*?\.zip)(.*)$/);
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

    return (
      <BrowserModal
        ref={browserModalRef}
        isVisible={isVisible}
        onClose={onClose} // For a preview, confirming just closes it
        onConfirm={() => {}}
        initialPath={initialPathInZip} // Start at the root of the zip archive
        title={`Zip Archive: ${zipFileName}`}
        confirmButtonText={null} // Remove the redundant 'Close Preview' button
        filterItem={() => true} // All items are selectable for preview
        fetchItems={fetchZipDirectory}
        onDecompressInActivePanel={onDecompressInActivePanel}
        onDecompressToOtherPanel={onDecompressToOtherPanel}
        isEmbedded={true}
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
