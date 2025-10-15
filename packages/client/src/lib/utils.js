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

const metaKey = isMac ? "CMD" : "Ctrl";

const isModKey = (e) => (isMac ? e.metaKey : e.ctrlKey);

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

const isEditable = (item) => {
  if (!item) return false;
  return !["folder", "parent"].includes(item.type);
};

const isItemPreviewable = (item) => {
  if (!item || item.type === "folder") return false;
  if (item.type === "archive") return true; // Zip files are previewable
  return (
    isPreviewableImage(item.name) ||
    isPreviewableVideo(item.name) ||
    isPreviewableAudio(item.name) ||
    isPreviewableText(item.name) ||
    isPreviewablePdf(item.name)
  );
};

const getFileTypeInfo = (filename = "", type) => {
  if (type === "folder") return { id: "folder", displayName: "Folder" };
  if (type === "parent") return { id: "parent", displayName: "Parent" };

  if (!filename) return { id: "file", displayName: "File" };

  const lowerFilename = filename.toLowerCase();
  const extension = lowerFilename.split(".").pop();

  // Office Document Formats
  const officeMap = {
    doc: { id: "doc", displayName: "Word Document" },
    docx: { id: "doc", displayName: "Word Document" },
    ppt: { id: "powerpoint", displayName: "PowerPoint Presentation" },
    pptx: { id: "powerpoint", displayName: "PowerPoint Presentation" },
    xls: { id: "excel", displayName: "Excel Spreadsheet" },
    xlsx: { id: "excel", displayName: "Excel Spreadsheet" },
  };
  if (officeMap[extension]) return officeMap[extension];

  // Media Formats
  const mediaMap = {
    mp3: { id: "audio", displayName: "Audio: MP3" },
    flac: { id: "audio", displayName: "Audio: FLAC" },
    wav: { id: "audio", displayName: "Audio: WAV" },
    m4a: { id: "audio", displayName: "Audio: M4A" },
    aac: { id: "audio", displayName: "Audio: AAC" },
    ogg: { id: "audio", displayName: "Audio: OGG" },
    wma: { id: "audio", displayName: "Audio: WMA" },
    mp4: { id: "video", displayName: "Video: MP4" },
    mkv: { id: "video", displayName: "Video: MKV" },
    webm: { id: "video", displayName: "Video: WebM" },
    mov: { id: "video", displayName: "Video: MOV" },
    avi: { id: "video", displayName: "Video: AVI" },
    wmv: { id: "video", displayName: "Video: WMV" },
    flv: { id: "video", displayName: "Video: FLV" },
    qt: { id: "video", displayName: "Video: QuickTime" },
  };
  if (mediaMap[extension]) return mediaMap[extension];

  // Other specific document/file types with special casing
  if (extension === "pdf") return { id: "pdf", displayName: "PDF" };

  // RAW Image Formats
  const rawImageMap = {
    cr2: { id: "image", displayName: "Image: CR2 (Canon)" },
    nef: { id: "image", displayName: "Image: NEF (Nikon)" },
    arw: { id: "image", displayName: "Image: ARW (Sony)" },
  };
  if (rawImageMap[extension]) return rawImageMap[extension];

  // Image Formats
  const imageMap = {
    jpg: { id: "image", displayName: "Image: JPG" },
    jpeg: { id: "image", displayName: "Image: JPEG" },
    png: { id: "image", displayName: "Image: PNG" },
    gif: { id: "image", displayName: "Image: GIF" },
    bmp: { id: "image", displayName: "Image: BMP" },
    tiff: { id: "image", displayName: "Image: TIFF" },
    webp: { id: "image", displayName: "Image: WebP" },
  };
  if (imageMap[extension]) return imageMap[extension];

  if (extension === "zip") return { id: "archive", displayName: "Archive" };

  // Text-based and code formats
  const nameMap = {
    ".editorconfig": { id: "ini", displayName: "INI" },
    ".gitignore": { id: "ignore", displayName: "Ignore" },
    ".nvmrc": { id: "plaintext", displayName: "Plain Text" },
    ".prettierignore": { id: "ignore", displayName: "Ignore" },
    ".prettierrc": { id: "json", displayName: "JSON" },
    license: { id: "markdown", displayName: "Markdown" },
  };
  if (nameMap[lowerFilename]) return nameMap[lowerFilename];

  const langMap = {
    txt: { id: "plaintext", displayName: "Plain Text" },
    js: { id: "javascript", displayName: "JavaScript" },
    jsx: { id: "jsx", displayName: "JSX" },
    ts: { id: "typescript", displayName: "TypeScript" },
    tsx: { id: "tsx", displayName: "TSX" },
    py: { id: "python", displayName: "Python" },
    sh: { id: "bash", displayName: "Bash" },
    css: { id: "css", displayName: "CSS" },
    html: { id: "html", displayName: "HTML" },
    xml: { id: "xml", displayName: "XML" },
    json: { id: "json", displayName: "JSON" },
    md: { id: "markdown", displayName: "Markdown" },
    yaml: { id: "yaml", displayName: "YAML" },
    yml: { id: "yaml", displayName: "YAML" },
    ini: { id: "ini", displayName: "INI" },
    cfg: { id: "ini", displayName: "INI" },
    nfo: { id: "ini", displayName: "INI" },
    properties: { id: "properties", displayName: "Properties" },
    cue: { id: "ini", displayName: "INI" },
  };
  if (langMap[extension]) return langMap[extension];

  // Fallback for any other file type
  return { id: "file", displayName: "File" };
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
        jobWs = new WebSocket(
          `${wsProtocol}//${window.location.host}/ws?jobId=${jobId}&type=size`
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

const truncatePath = (fullPath, maxLength = 60) => {
  if (fullPath.length <= maxLength) {
    return fullPath;
  }

  const ellipsis = "...";
  const charsToShow = maxLength - ellipsis.length;

  if (charsToShow <= 0) {
    return ellipsis; // Not enough space even for ellipsis
  }

  const frontChars = Math.ceil(charsToShow / 2);
  const backChars = Math.floor(charsToShow / 2);

  return (
    fullPath.substring(0, frontChars) +
    ellipsis +
    fullPath.substring(fullPath.length - backChars)
  );
};

export {
  buildFullPath,
  formatBytes,
  isMac,
  isModKey,
  metaKey,
  isItemPreviewable,
  isPreviewableImage,
  isPreviewablePdf,
  isPreviewableVideo,
  isPreviewableAudio,
  isPreviewableText,
  isEditable,
  getFileTypeInfo,
  calculateFolderSize,
  basename,
  formatSpeed,
  truncatePath,
};
