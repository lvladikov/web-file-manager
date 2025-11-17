/**
 * Utility functions for FM (File Manager) console API
 * These helper functions support the main FM object but are not directly exposed as FM methods.
 */

/**
 * Detects the build/runtime environment
 * @returns {string} One of: "Node:Dev", "Electron:Dev", "Electron:Dist"
 */
function detectBuildType() {
  try {
    if (typeof window === "undefined") {
      // Not in the browser - treat as Node dev
      return "Node:Dev";
    }

    // If Electron renderer - presence of electron bridge or common Electron flags
    const ua =
      typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
    const hasElectronUA = ua.includes("Electron");
    const hasWindowElectron =
      typeof window !== "undefined" && !!window.electron;
    const hasProcessElectron =
      typeof process !== "undefined" &&
      process.versions &&
      !!process.versions.electron;

    const isElectron = hasWindowElectron || hasProcessElectron || hasElectronUA;

    if (isElectron) {
      // Packaged apps typically load via file:// protocol
      try {
        if (typeof location !== "undefined" && location.protocol === "file:") {
          return "Electron:Dist";
        }
      } catch (e) {}
      return "Electron:Dev";
    }

    // Fallback assume Node dev (web served in a dev server)
    return "Node:Dev";
  } catch (e) {
    return "Node:Dev";
  }
}

/**
 * Helper to access the global app state object
 * @returns {Object} The app state object with panels, selections, and handler functions
 * @throws {Error} If app state is not available
 */
function getAppState() {
  if (typeof window !== "undefined" && window.__APP_STATE__) {
    return window.__APP_STATE__;
  }
  throw new Error("App state not available. Make sure the app is loaded.");
}

/**
 * Helper function to build selection array with optional absolute paths
 * @param {string} panelSide - Either 'left' or 'right'
 * @param {boolean} relative - If true, returns relative paths; if false, returns absolute paths
 * @returns {Array<string>} Array of file/folder names or paths
 */
function buildSelection(panelSide, relative) {
  const state = getAppState();
  const panelPath = state.panels[panelSide].path;
  const selectionSet = state.selections[panelSide];

  // Convert Set to Array
  const selection =
    selectionSet instanceof Set
      ? Array.from(selectionSet)
      : Array.isArray(selectionSet)
      ? selectionSet
      : [];

  if (relative) {
    return selection;
  }

  // Return absolute paths - simple path joining
  return selection.map((item) => {
    // Handle path separator based on OS (panelPath will have the right separator)
    const separator = panelPath.includes("\\") ? "\\" : "/";
    const base = panelPath.endsWith(separator)
      ? panelPath
      : panelPath + separator;
    return base + item;
  });
}

export { detectBuildType, getAppState, buildSelection };
