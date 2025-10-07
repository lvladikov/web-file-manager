const buildFullPath = (basePath, fileName) =>
  `${basePath}${
    basePath.endsWith("\\") || basePath.endsWith("/")
      ? ""
      : basePath.includes("\\")
      ? "\\"
      : "/"
  }${fileName}`;

const formatBytes = (bytes) => {
  if (bytes === null || typeof bytes === "undefined") return "";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${units[i]}`;
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
};
