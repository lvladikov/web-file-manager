import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import {
  FileText,
  Folder,
  HardDrive,
  ChevronsRight,
  FileArchive,
  Image as ImageIcon,
  LoaderCircle,
  ShieldAlert,
  Film,
  FileAudio,
  Star,
  Copy,
  XCircle,
  Expand,
  WrapText,
  Search,
  ChevronUp,
  ChevronDown,
  ListOrdered,
} from "lucide-react";

import { buildFullPath, isMac, isItemPreviewable } from "./lib/utils";
import {
  createNewFolder,
  deleteItem,
  fetchDeleteSummary,
  fetchDirectory,
  openFile,
  renameItem,
  startCopyItems,
  cancelCopy,
  startSizeCalculation,
  cancelSizeCalculation,
  fetchFavorites,
  addFavorite,
  removeFavorite,
  fetchPaths,
  savePaths,
  fetchLayout,
  saveLayout,
  fetchAutoLoadLyrics,
  saveAutoLoadLyrics,
} from "./lib/api";

// Components
import ActionBar from "./components/ui/ActionBar";
import FavouritesDropdown from "./components/ui/FavouritesDropdown";
import ContextMenu from "./components/context-menus/ContextMenu";
import EmptyAreaContextMenu from "./components/context-menus/EmptyAreaContextMenu";
import PathContextMenu from "./components/context-menus/PathContextMenu";
import FilePanel from "./components/panels/FilePanel";
import ApplicationBrowserModal from "./components/modals/ApplicationBrowserModal";
import CalculatingSizeModal from "./components/modals/CalculatingSizeModal";
import DeleteConfirmModal from "./components/modals/DeleteConfirmModal";
import ErrorModal from "./components/modals/ErrorModal";
import FolderBrowserModal from "./components/modals/FolderBrowserModal";
import HelpModal from "./components/modals/HelpModal";
import OverwriteConfirmModal from "./components/modals/OverwriteConfirmModal";
import ProgressModal from "./components/modals/ProgressModal";
import PreviewModal from "./components/modals/PreviewModal";

//WILL BE UPDATED SOON
