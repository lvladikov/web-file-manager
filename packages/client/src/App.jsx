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
// syntax highlighting imports
import Prism from "prismjs";
import "prismjs/themes/prism-okaidia.css"; // Dark theme for highlighting

// Import specific languages you want to support
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-css";
import "prismjs/components/prism-json";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-ini";
import "prismjs/components/prism-python";
import "prismjs/components/prism-ignore";
import "prismjs/components/prism-properties";

import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { buildFullPath, formatBytes, isMac } from "./lib/utils";
import {
  createNewFolder,
  deleteItem,
  fetchDeleteSummary,
  fetchDirectory,
  openFile,
  parseTrackInfo,
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
import FilePanel from "./components/panels/FilePanel";
import BrowserModal from "./components/modals/BrowserModal";
import CalculatingSizeModal from "./components/modals/CalculatingSizeModal";
import HelpModal from "./components/modals/HelpModal";

// Configure the PDF.js worker to use the local file copied by our Vite plugin.
pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.js`;

//WILL BE UPDATED SOON
