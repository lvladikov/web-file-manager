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
import { isVerboseLogging } from "../lib/utils";

export default function useSettings({ setError }) {
  // --- Settings State ---
  const [favourites, setFavourites] = useState([]);
  const [columnWidths, setColumnWidths] = useState({
    left: { size: 96, modified: 160 },
    right: { size: 96, modified: 160 },
  });
  const [autoLoadLyrics, setAutoLoadLyrics] = useState(false);

  // --- Internal State for Initialization ---
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [initialPaths, setInitialPaths] = useState({ left: null, right: null });
  const isInitialMount = useRef(true);
  const lastSettingsLogRef = useRef({ text: null, ts: 0 });
  const SETTINGS_LOG_DEDUP_MS = 1000;

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
        if (isVerboseLogging()) {
          try {
            const msg = `[useSettings] Loaded initial settings: favs=${
              favs?.length || 0
            } paths=${Object.keys(paths || {}).length}`;
            const now = Date.now();
            const last = lastSettingsLogRef.current || { text: null, ts: 0 };
            if (last.text !== msg || now - last.ts > SETTINGS_LOG_DEDUP_MS) {
              console.log(msg);
              lastSettingsLogRef.current = { text: msg, ts: now };
            }
          } catch (e) {}
        }
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

  const handleImportFavourites = async (importedFavourites) => {
    try {
      // Replace existing favourites with imported ones
      setFavourites(importedFavourites);
      
      // Save to server by removing all existing and adding all imported
      // First, remove all existing favourites
      for (const fav of favourites) {
        await removeFavourite(fav);
      }
      
      // Then add all imported favourites
      for (const fav of importedFavourites) {
        await addFavourite(fav);
      }
      
      // Fetch updated favourites from server to ensure sync
      const updatedFavourites = await fetchFavourites();
      setFavourites(updatedFavourites);
    } catch (err) {
      setError(`Failed to import favourites: ${err.message}`);
      // Reload favourites from server to restore state
      try {
        const currentFavourites = await fetchFavourites();
        setFavourites(currentFavourites);
      } catch (reloadErr) {
        console.error("Failed to reload favourites:", reloadErr);
      }
    }
  };

  return {
    favourites,
    columnWidths,
    autoLoadLyrics,
    settingsLoading,
    initialPaths,
    setFavourites,
    setColumnWidths,
    setAutoLoadLyrics,
    handleToggleFavourite,
    handleToggleAutoLoadLyrics,
    handleImportFavourites,
  };
}
