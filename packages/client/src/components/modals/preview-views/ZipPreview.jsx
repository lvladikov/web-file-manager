import React, { useCallback, useRef, useImperativeHandle, forwardRef } from "react";
import BrowserModal from "../BrowserModal";
import { fetchZipContents } from "../../../lib/api";
import { formatBytes } from "../../../lib/utils";

const ZipPreview = forwardRef(({ filePath, onClose, isVisible }, ref) => {
  const zipFileName = filePath.split('/').pop();
  const browserModalRef = useRef(null);

  useImperativeHandle(ref, () => ({
    handleKeyDown: (e) => {
      if (browserModalRef.current) {
        browserModalRef.current.handleKeyDown(e);
      }
    },
  }));

  const fetchZipDirectory = useCallback(async (basePath, target) => {

    // Normalize basePath and target to use '/' as separator

      let normalizedBasePath = basePath.replace(/\\/g, '/');

      let normalizedTarget = target.replace(/\\/g, '/');

  

      const allZipContents = await fetchZipContents(filePath);

  

      let currentZipPath = normalizedBasePath;

      if (normalizedTarget === "..") {

        currentZipPath = currentZipPath.substring(0, currentZipPath.lastIndexOf('/'));

        if (currentZipPath === "") currentZipPath = "/";

      } else if (normalizedTarget !== "") {

        currentZipPath = `${currentZipPath === "/" ? "" : currentZipPath}/${normalizedTarget}`;

      }

  

      const items = [];

      const seenFolders = new Set();

  

      // Add ".." for navigating up

      if (currentZipPath !== "/") {

        items.push({

          name: "..",

          type: "parent",

          fullPath: currentZipPath.substring(0, currentZipPath.lastIndexOf('/')) || "/",

        });

      }

  

      allZipContents.forEach((item) => {

        const itemPath = item.name;

        const isFolder = item.type === "folder";

  

        // Determine if the item is a direct child of the currentZipPath

        const effectiveCurrentZipPathForComparison = currentZipPath === "/"

          ? ""

          : currentZipPath.startsWith('/') ? currentZipPath.substring(1) : currentZipPath;

  

        if (itemPath.startsWith(effectiveCurrentZipPathForComparison)) {

          let relativePath = itemPath.substring(effectiveCurrentZipPathForComparison.length);

          if (relativePath.startsWith('/')) relativePath = relativePath.substring(1);

  

          const pathParts = relativePath.split('/').filter(Boolean);

  

          if (pathParts.length === 1) {

            // Direct child file or folder

            if (isFolder) {

              if (!seenFolders.has(pathParts[0])) {

                items.push({

                  name: pathParts[0],

                  type: "folder",

                  fullPath: `${currentZipPath === "/" ? "" : currentZipPath}/${pathParts[0]}`, // Correct fullPath for folders

                });

                seenFolders.add(pathParts[0]);

              }

                      } else {

                        items.push({

                          name: pathParts[0],

                          type: item.type, // Use the specific type from allZipContents

                          uncompressedSize: item.uncompressedSize,

                          fullPath: `${currentZipPath === "/" ? "" : currentZipPath}/${pathParts[0]}`, // Correct fullPath for files

                        });

                      }

                    } else if (pathParts.length > 1) {

                      // Nested item, so its top-level part is a folder

                      const topLevelFolder = pathParts[0];

                      if (!seenFolders.has(topLevelFolder)) {

                        items.push({

                          name: topLevelFolder,

                          type: "folder",

                          fullPath: `${currentZipPath === "/" ? "" : currentZipPath}/${topLevelFolder}`,

                        });

                        seenFolders.add(topLevelFolder);

                      }

                    }

                  }

                });

    // Sort items: folders first, then files, all alphabetically.
    items.sort((a, b) => {
      if (a.name === "..") return -1;
      if (b.name === "..") return 1;

      if (a.type === "folder" && b.type !== "folder") return -1;
      if (a.type !== "folder" && b.type === "folder") return 1;
      return a.name.localeCompare(b.name);
    });

    return { path: currentZipPath, items };
  }, [filePath]);

  return (
    <BrowserModal
      ref={browserModalRef}
      isVisible={isVisible}
      onClose={onClose} // For a preview, confirming just closes it
      initialPath="/" // Start at the root of the zip archive
      title={`Zip Archive: ${zipFileName}`}
      confirmButtonText={null} // Remove the redundant 'Close Preview' button
      filterItem={() => true} // All items are selectable for preview
      fetchItems={fetchZipDirectory}
    />
  );
});

export default ZipPreview;
