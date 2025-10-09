import { useState, useEffect, useRef } from "react";
import {
  fetchFavourites,
  addFavourite,
  removeFavourite,
  fetchPaths,
  fetchLayout,
  saveLayout,
  fetchAutoLoadLyrics,
  saveAutoLoadLyrics,
} from "../lib/api";

export default function useSettings({ setError }) {
  // --- Settings State ---
  const [favourites, setFavourites] = useState([]);
  const [showFavourites, setShowFavourites] = useState(false);
  const [columnWidths, setColumnWidths] = useState({
    left: { size: 96, modified: 160 },
    right: { size: 96, modified: 160 },
  });
  const [autoLoadLyrics, setAutoLoadLyrics] = useState(false);

  // --- Internal State for Initialization ---
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [initialPaths, setInitialPaths] = useState({ left: null, right: null });
  const isInitialMount = useRef(true);

  // Effect to load all initial settings data from the server
  useEffect(() => {
    const loadInitialSettings = async () => {
      try {
        const [favs, paths, layout, autoLoadConfig] = await Promise.all([
          fetchFavourites(),
          fetchPaths(),
          fetchLayout(),
          fetchAutoLoadLyrics(),
        ]);
        setFavourites(favs);
        setInitialPaths(paths);
        setColumnWidths(layout);
        setAutoLoadLyrics(autoLoadConfig.autoLoadLyrics);
      } catch (err) {
        setError(err.message);
      } finally {
        setSettingsLoading(false);
      }
    };
    loadInitialSettings();
  }, [setError]);

  // Effect to auto-save column layout changes
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const handler = setTimeout(() => {
      saveLayout(columnWidths).catch((err) =>
        console.error("Failed to save layout:", err)
      );
    }, 500);
    return () => clearTimeout(handler);
  }, [columnWidths]);

  // --- Handlers for Settings ---
  const handleToggleFavourite = async (path) => {
    try {
      setFavourites(
        await (favourites.includes(path)
          ? removeFavourite(path)
          : addFavourite(path))
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleAutoLoadLyrics = async () => {
    const newValue = !autoLoadLyrics;
    setAutoLoadLyrics(newValue);
    try {
      await saveAutoLoadLyrics(newValue);
    } catch (err) {
      setError("Failed to save auto-load setting. Please try again.");
      setAutoLoadLyrics(!newValue);
    }
  };

  return {
    favourites,
    showFavourites,
    columnWidths,
    autoLoadLyrics,
    settingsLoading,
    initialPaths,
    setFavourites,
    setShowFavourites,
    setColumnWidths,
    setAutoLoadLyrics,
    handleToggleFavourite,
    handleToggleAutoLoadLyrics,
  };
}
