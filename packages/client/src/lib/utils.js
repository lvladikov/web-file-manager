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

export { buildFullPath, formatBytes, isMac };
