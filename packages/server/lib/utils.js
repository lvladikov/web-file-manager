import * as zipUtils from "./zip-utils.js";
import * as fsUtils from "./fs-utils.js";
import * as fileUtils from "./file-utils.js";

export const {
  extractNestedZipToTemp,
  getFilesInZip,
  getFileContentFromZip,
  getZipFileStream,
  findCoverInZip,
  matchZipPath,
  updateFileInZip,
  insertFileIntoZip,
  createFileInZip,
  createFolderInZip,
  getSummaryFromZip,
  deleteFromZip,
  renameInZip,
  addFilesToZip,
  extractFilesFromZip,
  getDirTotalSizeInZip,
  getAllZipEntriesRecursive,
  duplicateInZip,
} = zipUtils;

export const {
  getDirSizeWithProgress,
  performCopyCancellation,
  getDirTotalSize,
  getDirSize,
  getDirSizeWithScanProgress,
  copyWithProgress,
  getAllFiles,
  getAllFilesAndDirsRecursive,
} = fsUtils;

export const { getFileType, getMimeType } = fileUtils;

export default { ...zipUtils, ...fsUtils, ...fileUtils };
