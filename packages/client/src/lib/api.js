const createNewFile = async (newFilePath) => {
  const response = await fetch("/api/new-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newFilePath }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || "Failed to create file.");
  }
};

const createNewFolder = async (newFolderPath) => {
  const response = await fetch("/api/new-folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newFolderPath }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || "Failed to create folder.");
  }
};

const deleteItem = async (targetPath) => {
  const response = await fetch("/api/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: targetPath }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Failed to delete item.");
  }
  return response.json();
};

const fetchDeleteSummary = async (targetPath) => {
  const response = await fetch("/api/delete-summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: targetPath }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Failed to analyze folder.");
  }
  return response.json(); // Expected: { files: number, folders: number }
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

const fetchFileInfo = async (filePath) => {
  const response = await fetch(`/api/file-info?filePath=${encodeURIComponent(filePath)}`);
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || "An unknown server error occurred.");
  }
  return response.json();
};

const openFile = async (filePath, appName) => {
  const response = await fetch("/api/open-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filePath, appName }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to open file.");
  }
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

const renameItem = async (oldPath, newName) => {
  const response = await fetch("/api/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oldPath, newName }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || "Failed to rename item.");
  }
};

const startCopyItems = async (sources, destination) => {
  const response = await fetch("/api/copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sources, destination }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(
      data.message || "An unknown server error occurred during copy initiation."
    );
  }
  return response.json(); // Returns { jobId, totalSize }
};

const cancelCopy = async (jobId) => {
  const response = await fetch("/api/copy/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || "Failed to cancel copy.");
  }
  return response.json();
};

const startSizeCalculation = async (folderPath) => {
  const response = await fetch("/api/folder-size", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderPath }),
  });
  if (!response.ok) throw new Error("Failed to start size calculation.");
  return response.json(); // returns { jobId }
};

const cancelSizeCalculation = async (jobId) => {
  await fetch("/api/folder-size/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId }),
  });
};

const fetchFavourites = async () => {
  const response = await fetch("/api/favourites");
  if (!response.ok) throw new Error("Could not fetch favourites.");
  return response.json();
};

const addFavourite = async (path) => {
  const response = await fetch("/api/favourites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) throw new Error("Could not add favourite.");
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
  await fetch("/api/paths", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(paths),
  });
};

const fetchLayout = async () => {
  const response = await fetch("/api/layout");
  if (!response.ok) throw new Error("Could not fetch column widths.");
  return response.json();
};

const saveLayout = async (columnWidths) => {
  await fetch("/api/layout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ columnWidths }),
  });
};

const fetchAutoLoadLyrics = async () => {
  const response = await fetch("/api/config/auto-load-lyrics");
  if (!response.ok) throw new Error("Could not fetch auto-load setting.");
  return response.json();
};

const saveAutoLoadLyrics = async (autoLoadLyrics) => {
  const response = await fetch("/api/config/auto-load-lyrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ autoLoadLyrics }),
  });
  if (!response.ok) throw new Error("Could not save auto-load setting.");
};

const compressFiles = async (sources, destination, sourceDirectory) => {
  const response = await fetch("/api/compress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sources, destination, sourceDirectory }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || "Failed to compress items.");
  }
  return response.json();
};

const decompressFiles = async (source, destination) => {
  const response = await fetch("/api/decompress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, destination }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || "Failed to decompress archive.");
  }
  return response.json();
};

const cancelDecompress = async (jobId) => {
  const response = await fetch("/api/decompress/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || "Failed to cancel decompression.");
  }
  return response.json();
};

const testArchive = async (source) => {
  const response = await fetch("/api/archive-test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || "Failed to test archive.");
  }
  return response.json();
};

const cancelArchiveTest = async (jobId) => {
  const response = await fetch("/api/archive-test/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || "Failed to cancel archive test.");
  }
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

const saveFileContent = async (path, content) => {
  const response = await fetch("/api/save-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || "Failed to save file content.");
  }
  return response.json();
};

const cancelZipOperation = async (jobId) => {
  const response = await fetch("/api/zip/operation/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || "Failed to cancel zip operation.");
  }
  return response.json();
};

const startDuplicateItems = async (items) => {
  const response = await fetch("/api/duplicate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || "Failed to duplicate items.");
  }
  return response.json();
};

const cancelDuplicate = async (jobId) => {
  const response = await fetch("/api/duplicate/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || "Failed to cancel duplicate.");
  }
  return response.json();
};

export {
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
  addFavourite,
  removeFavourite,
  fetchPaths,
  savePaths,
  fetchLayout,
  saveLayout,
  fetchAutoLoadLyrics,
  saveAutoLoadLyrics,
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
};
