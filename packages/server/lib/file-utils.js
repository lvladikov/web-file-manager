import path from "path";

const getFileType = (filename, isDirectory) => {
  if (isDirectory) return "folder";

  if (/\.zip$/i.test(filename)) return "archive";
  if (/\.(jpg|jpeg|png|gif|bmp|tiff|svg|webp|psd|cr2|nef|arw)$/i.test(filename))
    return "image";
  if (/\.(mp4|mkv|avi|mov|wmv|flv)$/i.test(filename)) return "video";
  if (/\.(mp3|m4a|aac|flac|wav|ogg|wma)$/i.test(filename)) return "audio";
  if (/\.pdf$/i.test(filename)) return "pdf";
  if (/\.(doc|docx)$/i.test(filename)) return "doc";
  if (/\.(ppt|pptx)$/i.test(filename)) return "powerpoint";
  if (/\.(xls|xlsx)$/i.test(filename)) return "excel";
  if (/\.html$/i.test(filename)) return "html";
  if (/\.css$/i.test(filename)) return "css";
  if (/\.(js|jsx)$/i.test(filename)) return "javascript";
  if (/\.(ts|tsx)$/i.test(filename)) return "typescript";
  if (/\.json$/i.test(filename)) return "json";
  if (/\.py$/i.test(filename)) return "python";
  if (/\.sh$/i.test(filename)) return "shell";
  if (/\.sql$/i.test(filename)) return "sql";
  if (/\.md$/i.test(filename)) return "markdown";
  if (/\.(yml|yaml)$/i.test(filename)) return "yaml";
  if (/\.xml$/i.test(filename)) return "xml";
  if (/\.log$/i.test(filename)) return "log";
  if (/\.(cfg|ini)$/i.test(filename)) return "config";
  if (/dockerfile/i.test(filename) || /docker-compose\.yml/i.test(filename))
    return "docker";
  if (/\.gitignore/i.test(filename)) return "git";
  if (
    /\.(c|h|cpp|hpp|cs|go|php|rb|rs|swift|kt|dart|pl|lua|scala|hs|erl|exs|clj|r|java|rb)$/i.test(
      filename
    )
  )
    return "code";
  if (
    /\.(txt|nfo|cue|properties|gitignore|editorconfig|nvmrc|prettierignore|prettierrc|license)$/i.test(
      filename
    )
  )
    return "text";

  return "file";
};

// Helper to get MIME type from file extension
const getMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    // Document
    ".pdf": "application/pdf",
    // Video
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".ogg": "video/ogg",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
    // Audio
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".wma": "audio/x-ms-wma",
  };
  return mimeTypes[ext] || "application/octet-stream";
};

export { getFileType, getMimeType };
