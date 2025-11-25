import { isVerboseLogging } from "./utils.js";

const post = async (
  url,
  data,
  errorMessage = "An unknown server error occurred."
) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})); // Catch JSON parsing error for non-JSON error responses
    throw new Error(errorData.message || errorMessage);
  }
  // If response is 204 No Content, return null
  if (response.status === 204) {
    return null;
  }
  // Return the response object directly, let the caller parse JSON if needed
  return response;
};

const exitApp = async () => {
  try {
    const response = await fetch("/api/exit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      console.error("[exitApp] Failed to exit application:", response.status);
      return { success: false, error: `Server returned ${response.status}` };
    }

    const result = await response.json();

    // Close the window after successful exit
    setTimeout(() => {
      try {
        if (typeof window !== "undefined" && window.close) {
          window.close();
        }
      } catch (e) {
        try {
          if (isVerboseLogging()) {
            console.log("[exitApp] Window close not allowed or failed");
          }
        } catch (e) {}
      }
    }, 100);

    return { success: true, cancelledJobs: result.cancelledJobs };
  } catch (error) {
    console.error("[exitApp] Error calling exit endpoint:", error);
    return { success: false, error: error.message };
  }
};

const createNewFile = async (newFilePath, content = null) => {
  const payload = { newFilePath };
  if (content !== null) payload.content = content;
  const response = await post(
    "/api/new-file",
    payload,
    "Failed to create file."
  );
  return response.json();
};

const createNewFolder = async (newFolderPath) => {
  const response = await post(
    "/api/new-folder",
    { newFolderPath },
    "Failed to create folder."
  );
  return response.json();
};

const deleteItem = async (targetPaths) => {
  const response = await post(
    "/api/delete",
    { paths: Array.isArray(targetPaths) ? targetPaths : [targetPaths] },
    "Failed to delete item(s)."
  );
  return response.json();
};

const fetchDeleteSummary = async (targetPath) => {
  const response = await post(
    "/api/delete-summary",
    { path: targetPath },
    "Failed to analyze folder."
  );
  return response.json();
};

const fetchDirectory = async (basePath, target = "") => {
  const response = await fetch(
    `/api/files?path=${encodeURIComponent(
      basePath
    )}&target=${encodeURIComponent(target)}`
  );
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || "An unknown server error occurred.");
  }
  return response.json();
};

const fetchDiskSpace = async (path) => {
  const response = await fetch(
    `/api/disk-space?path=${encodeURIComponent(path)}`
  );
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
};

const fetchFiles = async (path) => {
  const response = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || "An unknown server error occurred.");
  }
  return response.json();
};

const searchFiles = async (payload) => {
  const response = await post(
    "/api/search",
    payload,
    "Failed to perform search."
  );
  return response.json();
};

const fetchFileInfo = async (filePath) => {
  const response = await fetch(
    `/api/file-info?filePath=${encodeURIComponent(filePath)}`
  );
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || "An unknown server error occurred.");
  }
  return response.json();
};

const openFile = async (filePath, appName) => {
  // The post function returns a promise that resolves to JSON.
  // openFile doesn't return anything, so we just call post and don't return its result.
  await post("/api/open-file", { filePath, appName }, "Failed to open file.");
};

const parseTrackInfo = (filename = "") => {
  // Remove file extension
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  // Remove track numbers like "01." or "01 -"
  const cleanedName = nameWithoutExt.replace(/^\d+\s*[-.]\s*/, "");

  const separators = [" - ", " – ", " — "];
  for (const sep of separators) {
    const parts = cleanedName.split(sep);
    if (parts.length >= 2) {
      // Assuming the format is Artist - Title
      return {
        artist: parts[0].trim(),
        title: parts.slice(1).join(sep).trim(),
      };
    }
  }

  // If no separator is found, we can't determine the artist.
  return { artist: null, title: cleanedName.trim() };
};

const renameItem = async (oldPath, newName, options = {}) => {
  const { overwrite = false } = options;
  const response = await post(
    "/api/rename",
    { oldPath, newName, overwrite },
    "Failed to rename item."
  );
  return response.json();
};

const startCopyItems = async (
  sources,
  destination,
  isMove = false,
  overwrite = undefined
) => {
  // include optional overwrite hint in the request so server can avoid prompting
  const response = await post(
    "/api/copy",
    { sources, destination, isMove, overwrite },
    "An unknown server error occurred during copy initiation."
  );
  return response.json();
};

const cancelCopy = async (jobId) => {
  const response = await post(
    "/api/copy/cancel",
    { jobId },
    "Failed to cancel copy."
  );
  return response.json();
};

const startSizeCalculation = async (folderPath) => {
  const response = await post(
    "/api/folder-size",
    { folderPath },
    "Failed to start size calculation."
  );
  return response.json();
};

const cancelSizeCalculation = async (jobId) => {
  await post(
    "/api/folder-size/cancel",
    { jobId },
    "Failed to cancel size calculation."
  );
};

const fetchFavourites = async () => {
  const response = await fetch("/api/favourites");
  if (!response.ok) throw new Error("Could not fetch favourites.");
  return response.json();
};

const addFavourite = async (path) => {
  const response = await post(
    "/api/favourites",
    { path },
    "Could not add favourite."
  );
  return response.json();
};

const removeFavourite = async (path) => {
  const response = await fetch("/api/favourites", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) throw new Error("Could not remove favourite.");
  return response.json();
};

const fetchPaths = async () => {
  const response = await fetch("/api/paths");
  if (!response.ok) throw new Error("Could not fetch last-used paths.");
  return response.json();
};

const savePaths = async (paths) => {
  await post("/api/paths", paths, "Could not save paths.");
};

const fetchLayout = async () => {
  const response = await fetch("/api/layout");
  if (!response.ok) throw new Error("Could not fetch column widths.");
  return response.json();
};

const saveLayout = async (columnWidths) => {
  await post("/api/layout", { columnWidths }, "Could not save layout.");
};

const fetchAutoLoadLyrics = async () => {
  const response = await fetch("/api/config/auto-load-lyrics");
  if (!response.ok) throw new Error("Could not fetch auto-load setting.");
  return response.json();
};

const saveAutoLoadLyrics = async (autoLoadLyrics) => {
  await post(
    "/api/config/auto-load-lyrics",
    { autoLoadLyrics },
    "Could not save auto-load setting."
  );
};

const fetchMultiRenameCombos = async () => {
  const response = await fetch("/api/config/multi-rename-combos");
  if (!response.ok) throw new Error("Could not fetch multi-rename combos.");
  return response.json();
};

const saveMultiRenameCombo = async (name, operations) => {
  const response = await post(
    "/api/config/multi-rename-combos",
    { name, operations },
    "Could not save multi-rename combo."
  );
  return response.json();
};

const removeMultiRenameCombo = async (name) => {
  // Use DELETE to remove by name
  const delResp = await fetch("/api/config/multi-rename-combos", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!delResp.ok) {
    const err = await delResp.json().catch(() => ({}));
    throw new Error(err.message || "Could not delete multi-rename combo.");
  }
  return delResp.json();
};

const compressFiles = async (sources, destination, sourceDirectory) => {
  const response = await post(
    "/api/zip/compress",
    { sources, destination, sourceDirectory },
    "Failed to compress items."
  );
  return response.json();
};

const decompressFiles = async (
  source,
  destination,
  itemsToExtract = null,
  verboseLogging = false,
  overwrite = undefined
) => {
  const response = await post(
    "/api/zip/decompress",
    { source, destination, itemsToExtract, verboseLogging, overwrite },
    "Failed to decompress archive."
  );
  return response.json();
};

const cancelDecompress = async (jobId) => {
  const response = await post(
    "/api/zip/decompress/cancel",
    { jobId },
    "Failed to cancel decompression."
  );
  return response.json();
};

const testArchive = async (source) => {
  const response = await post(
    "/api/zip/archive-test",
    { source },
    "Failed to test archive."
  );
  return response.json();
};

const cancelArchiveTest = async (jobId) => {
  const response = await post(
    "/api/zip/archive-test/cancel",
    { jobId },
    "Failed to cancel archive test."
  );
  return response.json();
};

const fetchZipContents = async (filePath, directoryPath = "/") => {
  const response = await fetch(
    `/api/zip/contents?filePath=${encodeURIComponent(
      filePath
    )}&directoryPath=${encodeURIComponent(directoryPath)}`
  );
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || "Failed to fetch zip contents.");
  }
  return response.json();
};

const fetchZipFileContent = async (zipFilePath, filePathInZip) => {
  const response = await fetch(
    `/api/zip/file-content?zipFilePath=${encodeURIComponent(
      zipFilePath
    )}&filePathInZip=${encodeURIComponent(filePathInZip)}`
  );
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || "Failed to fetch file content from zip.");
  }
  return response.text();
};

const fetchZipMediaStreamUrl = (zipFilePath, filePathInZip) => {
  return `/api/zip/media-stream?zipFilePath=${encodeURIComponent(
    zipFilePath
  )}&filePathInZip=${encodeURIComponent(filePathInZip)}`;
};

const saveFileContent = async (path, content, signal = null, jobId = null) => {
  const response = await post(
    "/api/save-file",
    { path, content, jobId },
    "Failed to save file content."
  );

  // Check if the response is 202 Accepted (for async zip operation)
  if (response.status === 202) {
    // Job started asynchronously, return the jobId
    const data = await response.json();
    return { jobId: data.jobId, async: true };
  }

  // For non-zip or synchronous completion (though zip is now always async)
  return response.json();
};

const cancelZipOperation = async (jobId) => {
  const response = await post(
    "/api/zip/operation/cancel",
    { jobId },
    "Failed to cancel zip operation."
  );
  return response.json();
};

const exportSettings = async () => {
  const response = await fetch("/api/config/export");
  if (!response.ok) throw new Error("Could not export settings.");
  return response.json();
};

const importSettings = async (config) => {
  const response = await post(
    "/api/config/import",
    config,
    "Could not import settings."
  );
  return response.json();
};

const startDuplicateItems = async (items, isZipDuplicate = false) => {
  const response = await post(
    "/api/duplicate",
    { items, isZipDuplicate },
    "Failed to duplicate items."
  );
  return response.json();
};

const cancelDuplicate = async (jobId) => {
  const response = await post(
    "/api/duplicate/cancel",
    { jobId },
    "Failed to cancel duplicate."
  );
  return response.json();
};

export {
  post,
  createNewFile,
  createNewFolder,
  deleteItem,
  fetchDeleteSummary,
  openFile,
  parseTrackInfo,
  renameItem,
  startCopyItems,
  cancelCopy,
  startSizeCalculation,
  cancelSizeCalculation,
  fetchFavourites,
  fetchDirectory,
  fetchDiskSpace,
  fetchFiles,
  searchFiles,
  addFavourite,
  removeFavourite,
  fetchPaths,
  savePaths,
  fetchLayout,
  saveLayout,
  fetchAutoLoadLyrics,
  saveAutoLoadLyrics,
  fetchMultiRenameCombos,
  saveMultiRenameCombo,
  removeMultiRenameCombo,
  compressFiles,
  decompressFiles,
  cancelDecompress,
  testArchive,
  cancelArchiveTest,
  fetchZipContents,
  fetchZipFileContent,
  fetchZipMediaStreamUrl,
  saveFileContent,
  startDuplicateItems,
  cancelDuplicate,
  fetchFileInfo,
  cancelZipOperation,
  exitApp,
  exportSettings,
  importSettings,
};
