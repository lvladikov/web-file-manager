import { startSizeCalculation } from "./api";

const buildFullPath = (basePath, fileName) =>
  `${basePath}${
    basePath.endsWith("\\") || basePath.endsWith("/")
      ? ""
      : basePath.includes("\\")
      ? "\\"
      : "/"
  }${fileName}`;

const formatBytes = (bytes, spaceBeforeUnit = true) => {
  if (bytes === null || typeof bytes === "undefined") return "";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))}${
    spaceBeforeUnit ? " " : ""
  }${units[i]}`;
};

const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

const isPreviewableImage = (itemName = "") =>
  /\.(jpe?g|png|gif|bmp|tiff|webp)$/i.test(itemName);

const isPreviewablePdf = (itemName = "") => /\.pdf$/i.test(itemName);

const isPreviewableVideo = (itemName = "") =>
  /\.(mp4|webm|ogg|mov|mkv|qt)$/i.test(itemName);

const isPreviewableAudio = (itemName = "") =>
  /\.(mp3|m4a|aac|flac|wav|ogg|wma)$/i.test(itemName);

const isPreviewableText = (itemName = "") => {
  const knownFiles = new Set([
    ".editorconfig",
    ".gitignore",
    ".nvmrc",
    ".prettierignore",
    ".prettierrc",
    "LICENSE",
  ]);
  if (knownFiles.has(itemName)) return true;

  return /\.(txt|md|js|jsx|ts|tsx|json|css|html|yml|yaml|py|sh|log|xml|cfg|ini|nfo|properties|cue)$/i.test(
    itemName
  );
};

const isItemPreviewable = (item) => {
  if (!item) return false;
  return (
    isPreviewableImage(item.name) ||
    isPreviewableVideo(item.name) ||
    isPreviewableAudio(item.name) ||
    isPreviewableText(item.name) ||
    isPreviewablePdf(item.name)
  );
};

const getPrismLanguage = (filename = "") => {
  const lowerFilename = filename.toLowerCase();

  // First, check for specific filenames
  const nameMap = {
    ".editorconfig": "ini",
    ".gitignore": "ignore",
    ".nvmrc": "plaintext",
    ".prettierignore": "ignore",
    ".prettierrc": "json",
    license: "markdown",
  };
  if (nameMap[lowerFilename]) {
    return nameMap[lowerFilename];
  }

  // If no match, fall back to checking the extension
  const extension = lowerFilename.split(".").pop();
  const langMap = {
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    py: "python",
    sh: "bash",
    css: "css",
    html: "html",
    xml: "xml",
    json: "json",
    md: "markdown",
    yaml: "yaml",
    yml: "yaml",
    ini: "ini",
    cfg: "ini",
    nfo: "ini",
    properties: "properties",
    cue: "ini",
  };
  return langMap[extension] || "plaintext";
};

const calculateFolderSize = (folder, wsRef, setSizeCalcModal) => {
  // This function returns a promise that will resolve with the final size or reject with an error.
  return new Promise((resolve, reject) => {
    let jobWs; // WebSocket instance

    // Using async IIFE to use await inside the promise constructor.
    (async () => {
      try {
        // Step 1: Start the size calculation job on the backend.
        // Assumes `startSizeCalculation` is an async function that returns { jobId }.
        const { jobId } = await startSizeCalculation(folder.fullPath);

        // Step 2: Show the progress modal to the user.
        setSizeCalcModal({
          isVisible: true,
          jobId,
          currentFile: `Starting for ${folder.name}...`,
          sizeSoFar: 0,
          folderName: folder.name,
        });

        // Step 3: Establish the WebSocket connection for real-time updates.
        const wsProtocol =
          window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsHost = window.location.host.replace(/:\d+$/, ":3001"); // Assumes WebSocket server is on port 3001
        jobWs = new WebSocket(
          `${wsProtocol}//${wsHost}?jobId=${jobId}&type=size`
        );

        // Store the WebSocket instance in the ref so it can be accessed from outside (e.g., for cancellation).
        wsRef.current = jobWs;

        // Step 4: Define WebSocket event handlers.
        jobWs.onmessage = (event) => {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case "progress":
              // Update the modal with the current file being scanned and size so far.
              setSizeCalcModal((prev) => ({
                ...prev,
                currentFile: data.file,
                sizeSoFar: data.sizeSoFar,
              }));
              break;
            case "complete":
              // The job is done. Resolve the promise with the final size.
              resolve(data.size);
              break;
            case "cancelled":
            case "error":
              // The job failed or was cancelled. Reject the promise.
              reject(new Error(data.message || "Job was cancelled or failed."));
              break;
          }
        };

        jobWs.onerror = () => {
          reject(new Error("WebSocket connection error."));
        };

        jobWs.onclose = () => {
          // Always hide the modal when the connection closes.
          setSizeCalcModal({ isVisible: false, jobId: null, currentFile: "" });
        };
      } catch (err) {
        // Catch errors from `startSizeCalculation` or WebSocket constructor.
        reject(err);
      }
    })();
  });
};

const basename = (path) => {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1];
};

const formatSpeed = (bytesPerSecond, spaceBeforeUnit = true) => {
  if (isNaN(bytesPerSecond) || bytesPerSecond === 0) {
    return `0${spaceBeforeUnit ? " " : ""}B/s`;
  }

  const formattedBytes = formatBytes(bytesPerSecond, spaceBeforeUnit);
  return `${formattedBytes}/s`;
};

export {
  buildFullPath,
  formatBytes,
  isMac,
  isItemPreviewable,
  isPreviewableImage,
  isPreviewablePdf,
  isPreviewableVideo,
  isPreviewableAudio,
  isPreviewableText,
  getPrismLanguage,
  calculateFolderSize,
  basename,
  formatSpeed,
};
