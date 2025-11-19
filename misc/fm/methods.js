/**
 * FM (File Manager) console API methods
 * All the functional methods that provide the core FM API functionality
 */

import pkg from "../../package.json";
import {
  detectBuildType,
  getAppState,
  buildSelection,
  normalizeNameToPanel,
  waitForZipJobCompletion,
  matchZipPath,
} from "./utils.js";

/**
 * Creates and returns an object with all FM methods
 * @param {Object} FM - The FM object to attach methods to
 * @returns {Object} Object containing all method functions
 */
function createFMMethods(FM) {
  const methods = {};

  methods.getInfo = function () {
    return FM();
  };

  // FM.createActivePanelNewFile
  // Creates a new file in the active panel using the built-in UI handlers
  methods.createActivePanelNewFile = async function (name, content = "") {
    const state = getAppState();
    if (typeof state.handleStartNewFile !== "function") {
      const error = "handleStartNewFile not available in app state.";
      console.error(error);
      return { success: false, error };
    }
    if (typeof state.handleConfirmNewFile !== "function") {
      const error = "handleConfirmNewFile not available in app state.";
      console.error(error);
      return { success: false, error };
    }

    try {
      const started = state.handleStartNewFile(state.activePanel, name);
      const startedName =
        typeof started === "string"
          ? started
          : (started && started.name) || name;
      const startedPanel =
        typeof started === "string"
          ? state.activePanel
          : (started && started.panelId) || state.activePanel;
      const result = await state.handleConfirmNewFile(
        startedPanel,
        startedName,
        content
      );
      // Compute created path for convenience when not working with zip paths
      const panelPath = state.panels[startedPanel].path;
      const sep = panelPath.includes("\\") ? "\\" : "/";
      const base = panelPath.endsWith(sep) ? panelPath : panelPath + sep;
      // Normalize startedName to panel sep, strip leading seps
      const sanitizedStartedName = normalizeNameToPanel(startedName, panelPath);
      const createdPath = base + sanitizedStartedName;
      // If confirm returned a standardized object, check for zip job and wait for completion
      if (result && typeof result === "object" && "success" in result) {
        if (!("createdPath" in result)) result.createdPath = createdPath;
        // If this operation initiated a zip job, wait until it completes so FM's await is in sync
        const jobId =
          (result.result && result.result.jobId) || result.jobId || null;
        const createdPathCheck = result.createdPath || createdPath;
        const isZip = matchZipPath(createdPathCheck);
        if (jobId && isZip) {
          try {
            const zipParts = matchZipPath(createdPathCheck) || [];
            await waitForZipJobCompletion(jobId, "create-file-in-zip", {
              onProgress: (d) => console.log("zip progress:", d),
              showModal: true,
              zipFilePath: zipParts[1] || createdPathCheck,
              filePathInZip:
                zipParts[2] && zipParts[2].startsWith("/")
                  ? zipParts[2].substring(1)
                  : zipParts[2],
            });
          } catch (e) {
            console.error("Zip job wait finished with error", e && e.message);
            return {
              success: false,
              error: (e && e.message) || "Zip job failed",
            };
          }
        }
        return result;
      }
      // Otherwise wrap the raw response
      return { success: true, result, createdPath };
    } catch (err) {
      console.error("createActivePanelNewFile error:", err);
      return {
        success: false,
        error: err && err.message ? err.message : String(err),
      };
    }
  };

  // FM.createOtherPanelNewFile
  // Creates a new file in the other (inactive) panel
  methods.createOtherPanelNewFile = async function (name, content = "") {
    const state = getAppState();
    const otherPanel = methods.getOtherPanelSide();
    if (typeof state.handleStartNewFile !== "function") {
      const error = "handleStartNewFile not available in app state.";
      console.error(error);
      return { success: false, error };
    }
    if (typeof state.handleConfirmNewFile !== "function") {
      const error = "handleConfirmNewFile not available in app state.";
      console.error(error);
      return { success: false, error };
    }

    try {
      const started = state.handleStartNewFile(otherPanel, name);
      const startedName =
        typeof started === "string"
          ? started
          : (started && started.name) || name;
      const startedPanel =
        typeof started === "string"
          ? otherPanel
          : (started && started.panelId) || otherPanel;
      const result = await state.handleConfirmNewFile(
        startedPanel,
        startedName,
        content
      );
      const panelPath = state.panels[otherPanel].path;
      const sep = panelPath.includes("\\") ? "\\" : "/";
      const base = panelPath.endsWith(sep) ? panelPath : panelPath + sep;
      const sanitizedStartedName = normalizeNameToPanel(startedName, panelPath);
      const createdPath = base + sanitizedStartedName;
      if (result && typeof result === "object" && "success" in result) {
        if (!("createdPath" in result)) result.createdPath = createdPath;
        const jobId =
          (result.result && result.result.jobId) || result.jobId || null;
        const createdPathCheck = result.createdPath || createdPath;
        const isZip = matchZipPath(createdPathCheck);
        if (jobId && isZip) {
          try {
            const zipParts = matchZipPath(createdPathCheck) || [];
            await waitForZipJobCompletion(jobId, "create-file-in-zip", {
              onProgress: (d) => console.log("zip progress:", d),
              showModal: true,
              zipFilePath: zipParts[1] || createdPathCheck,
              filePathInZip:
                zipParts[2] && zipParts[2].startsWith("/")
                  ? zipParts[2].substring(1)
                  : zipParts[2],
            });
          } catch (e) {
            console.error("Zip job wait finished with error", e && e.message);
            return {
              success: false,
              error: (e && e.message) || "Zip job failed",
            };
          }
        }
        return result;
      }
      return { success: true, result, createdPath };
    } catch (err) {
      console.error("createOtherPanelNewFile error:", err);
      return {
        success: false,
        error: err && err.message ? err.message : String(err),
      };
    }
  };

  // FM.createActivePanelNewFolder
  // Creates a new folder in the active panel using the built-in UI handlers
  methods.createActivePanelNewFolder = async function (name) {
    const state = getAppState();
    if (typeof state.handleStartNewFolder !== "function") {
      const error = "handleStartNewFolder not available in app state.";
      console.error(error);
      return { success: false, error };
    }
    if (typeof state.handleConfirmNewFolder !== "function") {
      const error = "handleConfirmNewFolder not available in app state.";
      console.error(error);
      return { success: false, error };
    }

    try {
      const started = state.handleStartNewFolder(state.activePanel, name);
      const startedName =
        typeof started === "string"
          ? started
          : (started && started.name) || name;
      const startedPanel =
        typeof started === "string"
          ? state.activePanel
          : (started && started.panelId) || state.activePanel;
      const result = await state.handleConfirmNewFolder(
        startedPanel,
        startedName
      );
      const panelPath = state.panels[startedPanel].path;
      const sep = panelPath.includes("\\") ? "\\" : "/";
      const base = panelPath.endsWith(sep) ? panelPath : panelPath + sep;
      const sanitizedStartedName = normalizeNameToPanel(startedName, panelPath);
      const createdPath = base + sanitizedStartedName;
      if (result && typeof result === "object" && "success" in result) {
        if (!("createdPath" in result)) result.createdPath = createdPath;
        const jobId =
          (result.result && result.result.jobId) || result.jobId || null;
        const createdPathCheck = result.createdPath || createdPath;
        const isZip = matchZipPath(createdPathCheck);
        if (jobId && isZip) {
          try {
            const zipParts = matchZipPath(createdPathCheck) || [];
            await waitForZipJobCompletion(jobId, "create-folder-in-zip", {
              onProgress: (d) => console.log("zip progress:", d),
              showModal: true,
              zipFilePath: zipParts[1] || createdPathCheck,
              filePathInZip:
                zipParts[2] && zipParts[2].startsWith("/")
                  ? zipParts[2].substring(1)
                  : zipParts[2],
            });
          } catch (e) {
            console.error("Zip job wait finished with error", e && e.message);
            return {
              success: false,
              error: (e && e.message) || "Zip job failed",
            };
          }
        }
        return result;
      }
      return { success: true, result, createdPath };
    } catch (err) {
      console.error("createActivePanelNewFolder error:", err);
      return {
        success: false,
        error: err && err.message ? err.message : String(err),
      };
    }
  };

  // FM.createOtherPanelNewFolder
  // Creates a new folder in the other (inactive) panel
  methods.createOtherPanelNewFolder = async function (name) {
    const state = getAppState();
    const otherPanel = methods.getOtherPanelSide();
    if (typeof state.handleStartNewFolder !== "function") {
      const error = "handleStartNewFolder not available in app state.";
      console.error(error);
      return { success: false, error };
    }
    if (typeof state.handleConfirmNewFolder !== "function") {
      const error = "handleConfirmNewFolder not available in app state.";
      console.error(error);
      return { success: false, error };
    }

    try {
      const started = state.handleStartNewFolder(otherPanel, name);
      const startedName =
        typeof started === "string"
          ? started
          : (started && started.name) || name;
      const startedPanel =
        typeof started === "string"
          ? otherPanel
          : (started && started.panelId) || otherPanel;
      const result = await state.handleConfirmNewFolder(
        startedPanel,
        startedName
      );
      const panelPath = state.panels[otherPanel].path;
      const sep = panelPath.includes("\\") ? "\\" : "/";
      const base = panelPath.endsWith(sep) ? panelPath : panelPath + sep;
      const sanitizedStartedName = normalizeNameToPanel(startedName, panelPath);
      const createdPath = base + sanitizedStartedName;
      if (result && typeof result === "object" && "success" in result) {
        if (!("createdPath" in result)) result.createdPath = createdPath;
        const jobId =
          (result.result && result.result.jobId) || result.jobId || null;
        const createdPathCheck = result.createdPath || createdPath;
        const isZip = matchZipPath(createdPathCheck);
        if (jobId && isZip) {
          try {
            const zipParts = matchZipPath(createdPathCheck) || [];
            await waitForZipJobCompletion(jobId, "create-folder-in-zip", {
              onProgress: (d) => console.log("zip progress:", d),
              showModal: true,
              zipFilePath: zipParts[1] || createdPathCheck,
              filePathInZip:
                zipParts[2] && zipParts[2].startsWith("/")
                  ? zipParts[2].substring(1)
                  : zipParts[2],
            });
          } catch (e) {
            console.error("Zip job wait finished with error", e && e.message);
            return {
              success: false,
              error: (e && e.message) || "Zip job failed",
            };
          }
        }
        return result;
      }
      return { success: true, result, createdPath };
    } catch (err) {
      console.error("createOtherPanelNewFolder error:", err);
      return {
        success: false,
        error: err && err.message ? err.message : String(err),
      };
    }
  };

  // FM.editActivePanelFile
  // Edits (writes) content to a file in the active panel. If `filePath` is a relative name
  // it will be resolved relative to the active panel path. Returns an object with { success, result, createdPath }
  methods.editActivePanelFile = async function (filePath, content = "") {
    const state = getAppState();
    const panel = state.panels[state.activePanel];
    if (!filePath) {
      const error = "filePath is required";
      console.error(error);
      return { success: false, error };
    }
    if (!panel) {
      const error = "Active panel not available.";
      console.error(error);
      return { success: false, error };
    }

    try {
      // If filePath looks absolute (starts with '/' or a drive letter like 'C:\\'), don't prefix
      const looksAbsolute =
        typeof filePath === "string" &&
        (filePath.startsWith("/") || /^[a-zA-Z]:\\/.test(filePath));
      const panelPath = panel.path;
      const sep = panelPath.includes("\\") ? "\\" : "/";
      const sanitizedPath = looksAbsolute
        ? filePath
        : normalizeNameToPanel(filePath, panelPath);
      const fullPath = looksAbsolute
        ? filePath
        : panelPath.endsWith(sep)
        ? panelPath + sanitizedPath
        : panelPath + sep + sanitizedPath;

      const response = await fetch("/api/save-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: fullPath, content }),
      });

      // If the operation started async (zip), server returns 202
      if (response.status === 202) {
        const data = await response.json();
        // If a zip job started, wait for its completion so FM await is in sync
        if (data && data.jobId && matchZipPath(fullPath)) {
          try {
            const zipParts = matchZipPath(fullPath) || [];
            await waitForZipJobCompletion(data.jobId, "update-file-in-zip", {
              onProgress: (d) => console.log("zip progress:", d),
              showModal: true,
              zipFilePath: zipParts[1] || fullPath,
              filePathInZip:
                zipParts[2] && zipParts[2].startsWith("/")
                  ? zipParts[2].substring(1)
                  : zipParts[2],
              title: "Updating file in zip...",
            });
          } catch (e) {
            console.error("Zip job wait finished with error", e && e.message);
            return {
              success: false,
              error: (e && e.message) || "Zip update failed",
            };
          }
        }
        return { success: true, result: data, createdPath: fullPath };
      }
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return {
          success: false,
          error: err.message || `HTTP ${response.status}`,
        };
      }
      const data = await response.json();
      return { success: true, result: data, createdPath: fullPath };
    } catch (err) {
      console.error("editActivePanelFile error:", err);
      return {
        success: false,
        error: err && err.message ? err.message : String(err),
      };
    }
  };

  // FM.editOtherPanelFile
  // Edits (writes) content to a file in the other (inactive) panel. If `filePath` is a relative name
  // it will be resolved relative to the other panel path. Returns an object with { success, result, createdPath }
  methods.editOtherPanelFile = async function (filePath, content = "") {
    const state = getAppState();
    const otherPanel = methods.getOtherPanelSide();
    const panel = state.panels[otherPanel];
    if (!filePath) {
      const error = "filePath is required";
      console.error(error);
      return { success: false, error };
    }
    if (!panel) {
      const error = "Other panel not available.";
      console.error(error);
      return { success: false, error };
    }

    try {
      const looksAbsolute =
        typeof filePath === "string" &&
        (filePath.startsWith("/") || /^[a-zA-Z]:\\/.test(filePath));
      const panelPath = panel.path;
      const sep = panelPath.includes("\\") ? "\\" : "/";
      const sanitizedPath = looksAbsolute
        ? filePath
        : normalizeNameToPanel(filePath, panelPath);
      const fullPath = looksAbsolute
        ? filePath
        : panelPath.endsWith(sep)
        ? panelPath + sanitizedPath
        : panelPath + sep + sanitizedPath;

      const response = await fetch("/api/save-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: fullPath, content }),
      });

      if (response.status === 202) {
        const data = await response.json();
        if (data && data.jobId) {
          try {
            if (matchZipPath(fullPath)) {
              const zipParts = matchZipPath(fullPath) || [];
              await waitForZipJobCompletion(data.jobId, "update-file-in-zip", {
                onProgress: (d) => console.log("zip progress:", d),
                showModal: true,
                zipFilePath: zipParts[1] || fullPath,
                filePathInZip:
                  zipParts[2] && zipParts[2].startsWith("/")
                    ? zipParts[2].substring(1)
                    : zipParts[2],
                title: "Updating file in zip...",
              });
            }
          } catch (e) {
            console.error("Zip job wait finished with error", e && e.message);
            return {
              success: false,
              error: (e && e.message) || "Zip update failed",
            };
          }
        }
        return { success: true, result: data, createdPath: fullPath };
      }
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return {
          success: false,
          error: err.message || `HTTP ${response.status}`,
        };
      }
      const data = await response.json();
      return { success: true, result: data, createdPath: fullPath };
    } catch (err) {
      console.error("editOtherPanelFile error:", err);
      return {
        success: false,
        error: err && err.message ? err.message : String(err),
      };
    }
  };

  methods.getName = function () {
    return pkg.name;
  };

  methods.getVersion = function () {
    return pkg.version;
  };

  methods.getBuildType = function () {
    return detectBuildType();
  };

  // FM.getActivePanelSide
  // Returns 'left' or 'right' indicating which panel is currently active.
  methods.getActivePanelSide = function () {
    const state = getAppState();
    return state.activePanel;
  };

  // FM.setActivePanelSide
  // Sets which panel should be active.
  // @param {string} side - Either 'left' or 'right' (defaults to 'left')
  methods.setActivePanelSide = function (side = "left") {
    if (side !== "left" && side !== "right") {
      throw new Error("Panel side must be either 'left' or 'right'");
    }
    const state = getAppState();
    if (typeof state.setActivePanel !== "function") {
      throw new Error("setActivePanel function not available in app state.");
    }
    state.setActivePanel(side);
  };

  // FM.toggleActivePanelSide
  // Toggles the active panel between left and right.
  methods.toggleActivePanelSide = function () {
    const state = getAppState();
    const newSide = state.activePanel === "left" ? "right" : "left";
    if (typeof state.setActivePanel !== "function") {
      throw new Error("setActivePanel function not available in app state.");
    }
    state.setActivePanel(newSide);
  };

  // FM.getOtherPanelSide
  // Returns 'left' or 'right' indicating which panel is currently inactive.
  methods.getOtherPanelSide = function () {
    const state = getAppState();
    return state.activePanel === "left" ? "right" : "left";
  };

  // FM.getActivePanelPath
  // Returns the absolute path of the currently active panel.
  methods.getActivePanelPath = function () {
    const state = getAppState();
    return state.panels[state.activePanel].path;
  };

  // FM.getOtherPanelPath
  // Returns the absolute path of the currently inactive panel.
  methods.getOtherPanelPath = function () {
    const state = getAppState();
    const otherPanel = methods.getOtherPanelSide();
    return state.panels[otherPanel].path;
  };

  // FM.getActivePanel
  // Returns an object with side, path, and selection for the active panel.
  // @param {boolean} relativeSelection - If true (default), selection contains paths relative to panel path; if false, returns absolute paths.
  methods.getActivePanel = function (relativeSelection = true) {
    return {
      side: methods.getActivePanelSide(),
      path: methods.getActivePanelPath(),
      selection: methods.getActivePanelSelection(relativeSelection),
    };
  };

  // FM.getOtherPanel
  // Returns an object with side, path, and selection for the inactive panel.
  // @param {boolean} relativeSelection - If true (default), selection contains paths relative to panel path; if false, returns absolute paths.
  methods.getOtherPanel = function (relativeSelection = true) {
    return {
      side: methods.getOtherPanelSide(),
      path: methods.getOtherPanelPath(),
      selection: methods.getOtherPanelSelection(relativeSelection),
    };
  };

  // FM.getPanels
  // Returns an object with both active and other panels and their properties.
  // @param {boolean} relativeSelection - If true (default), selection contains paths relative to panel path; if false, returns absolute paths.
  methods.getPanels = function (relativeSelection = true) {
    return {
      active: methods.getActivePanel(relativeSelection),
      other: methods.getOtherPanel(relativeSelection),
    };
  };

  // FM.getActivePanelSelection
  // Returns an array of paths for selected items in the active panel.
  // @param {boolean} relative - If true (default), returns paths relative to panel path; if false, returns absolute paths.
  methods.getActivePanelSelection = function (relative = true) {
    return buildSelection(methods.getActivePanelSide(), relative);
  };

  // FM.getOtherPanelSelection
  // Returns an array of paths for selected items in the inactive panel.
  // @param {boolean} relative - If true (default), returns paths relative to panel path; if false, returns absolute paths.
  methods.getOtherPanelSelection = function (relative = true) {
    return buildSelection(methods.getOtherPanelSide(), relative);
  };

  // FM.exit
  // Exits the application by calling the /api/exit endpoint
  methods.exit = async function () {
    try {
      const response = await fetch("/api/exit", { method: "POST" });
      if (!response.ok) {
        console.error("Failed to exit application:", response.statusText);
      }
    } catch (error) {
      console.error("Error calling exit API:", error);
    }
    // Give the server a moment to process the exit before closing the window
    setTimeout(() => {
      if (typeof window !== "undefined") {
        window.close();
      }
    }, 100);
  };

  // FM.swapPanels
  // Swaps the paths of the left and right panels
  methods.swapPanels = function () {
    const state = getAppState();
    if (typeof state.handleSwapPanels !== "function") {
      throw new Error("handleSwapPanels function not available in app state.");
    }
    state.handleSwapPanels();
  };

  // FM.refreshActivePanel
  // Refreshes the file list of the active panel
  methods.refreshActivePanel = function () {
    const state = getAppState();
    if (typeof state.handleRefreshPanel !== "function") {
      throw new Error(
        "handleRefreshPanel function not available in app state."
      );
    }
    state.handleRefreshPanel(state.activePanel);
  };

  // FM.refreshOtherPanel
  // Refreshes the file list of the inactive panel
  methods.refreshOtherPanel = function () {
    const state = getAppState();
    if (typeof state.handleRefreshPanel !== "function") {
      throw new Error(
        "handleRefreshPanel function not available in app state."
      );
    }
    const otherPanel = methods.getOtherPanelSide();
    state.handleRefreshPanel(otherPanel);
  };

  // FM.refreshBothPanels
  // Refreshes the file list of both left and right panels
  methods.refreshBothPanels = function () {
    const state = getAppState();
    if (typeof state.handleRefreshAllPanels !== "function") {
      throw new Error(
        "handleRefreshAllPanels function not available in app state."
      );
    }
    state.handleRefreshAllPanels();
  };

  // FM.setActivePanelPath
  // Sets the path of the active panel
  // @param {string} path - The absolute path to navigate to
  // @returns {Promise<{success: boolean, error?: string}>}
  methods.setActivePanelPath = async function (path) {
    if (typeof path !== "string" || !path) {
      const error = "Path must be a non-empty string";
      console.error(error);
      return { success: false, error };
    }
    const state = getAppState();
    if (typeof state.handleNavigate !== "function") {
      const error = "handleNavigate function not available in app state.";
      console.error(error);
      return { success: false, error };
    }

    const previousPath = state.panels[state.activePanel].path;

    // Call handleNavigate and wait for it to complete
    await state.handleNavigate(state.activePanel, path, "");

    // Add a small delay to ensure state has updated
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Check if navigation succeeded by comparing paths
    const newPath = state.panels[state.activePanel].path;
    if (newPath === path) {
      return { success: true };
    } else {
      const error = `Failed to navigate to "${path}"`;
      console.error(error);
      // Clear the error modal since we're handling it in the console
      if (typeof state.setError === "function") {
        state.setError(null);
      }
      return { success: false, error };
    }
  };

  // FM.setActivePanelSelection
  // Sets the selection for the active panel
  // @param {Array<string>} items - Array of file/folder names (relative or absolute paths)
  // @param {boolean} ignoreCase - If true, performs case-insensitive matching (defaults to false)
  // @param {boolean} reset - If true, clears selection before applying new selection; if false, adds to current selection (defaults to true)
  // @returns {Object} {selected: Array<string>, notFound: Array<string>}
  methods.setActivePanelSelection = function (
    items,
    ignoreCase = false,
    reset = true
  ) {
    if (!Array.isArray(items)) {
      const error = "Items must be an array";
      console.error(error);
      return { selected: [], notFound: items ? [items] : [] };
    }

    const state = getAppState();
    if (typeof state.setSelections !== "function") {
      const error = "setSelections function not available in app state.";
      console.error(error);
      return { selected: [], notFound: items };
    }

    const panelSide = state.activePanel;
    const panelPath = state.panels[panelSide].path;
    const panelItems = state.panels[panelSide].items || [];
    const itemNames = panelItems.map((item) => item.name);

    const selected = [];
    const notFound = [];

    // Detect path separator from panel path
    const separator = panelPath.includes("\\") ? "\\" : "/";
    const normalizedPanelPath = panelPath.endsWith(separator)
      ? panelPath
      : panelPath + separator;

    for (const item of items) {
      let matched = false;
      let actualName = null;
      let isAbsolutePath = false;

      // Check if this is an absolute path
      const lastSeparatorIndex = Math.max(
        item.lastIndexOf("/"),
        item.lastIndexOf("\\")
      );
      isAbsolutePath = lastSeparatorIndex !== -1;

      // Try as relative path first
      if (ignoreCase) {
        const lowerItem = item.toLowerCase();
        actualName = itemNames.find((name) => name.toLowerCase() === lowerItem);
        if (actualName) {
          // If absolute path was used, return it with actual filename
          if (isAbsolutePath) {
            const itemDir = item.substring(0, lastSeparatorIndex + 1);
            selected.push(itemDir + actualName);
          } else {
            selected.push(actualName);
          }
          matched = true;
        }
      } else {
        if (itemNames.includes(item)) {
          selected.push(item);
          matched = true;
        }
      }

      if (!matched && isAbsolutePath) {
        // Try as absolute path
        const basename = item.substring(lastSeparatorIndex + 1);
        const itemDir = item.substring(0, lastSeparatorIndex + 1);

        // Check if the directory matches the panel path and the basename exists
        if (itemDir === normalizedPanelPath) {
          if (ignoreCase) {
            const lowerBasename = basename.toLowerCase();
            actualName = itemNames.find(
              (name) => name.toLowerCase() === lowerBasename
            );
            if (actualName) {
              selected.push(itemDir + actualName);
              matched = true;
            }
          } else {
            if (itemNames.includes(basename)) {
              selected.push(item);
              matched = true;
            }
          }
        }
      }

      if (!matched) {
        notFound.push(item);
      }
    }

    // Update selections - use only basenames for the actual selection state
    const selectedBasenames = selected.map((item) => {
      const idx = Math.max(item.lastIndexOf("/"), item.lastIndexOf("\\"));
      return idx !== -1 ? item.substring(idx + 1) : item;
    });

    state.setSelections((prev) => {
      if (reset) {
        // Replace selection
        return {
          ...prev,
          [panelSide]: new Set(selectedBasenames),
        };
      } else {
        // Add to existing selection
        const existing = prev[panelSide] || new Set();
        const merged = new Set([...existing, ...selectedBasenames]);
        return {
          ...prev,
          [panelSide]: merged,
        };
      }
    });

    return { selected, notFound };
  };

  // FM.setOtherPanelSelection
  // Sets the selection for the inactive panel
  // @param {Array<string>} items - Array of file/folder names (relative or absolute paths)
  // @param {boolean} ignoreCase - If true, performs case-insensitive matching (defaults to false)
  // @param {boolean} reset - If true, clears selection before applying new selection; if false, adds to current selection (defaults to true)
  // @returns {Object} {selected: Array<string>, notFound: Array<string>}
  methods.setOtherPanelSelection = function (
    items,
    ignoreCase = false,
    reset = true
  ) {
    if (!Array.isArray(items)) {
      const error = "Items must be an array";
      console.error(error);
      return { selected: [], notFound: items ? [items] : [] };
    }

    const state = getAppState();
    if (typeof state.setSelections !== "function") {
      const error = "setSelections function not available in app state.";
      console.error(error);
      return { selected: [], notFound: items };
    }

    const panelSide = methods.getOtherPanelSide();
    const panelPath = state.panels[panelSide].path;
    const panelItems = state.panels[panelSide].items || [];
    const itemNames = panelItems.map((item) => item.name);

    const selected = [];
    const notFound = [];

    // Detect path separator from panel path
    const separator = panelPath.includes("\\") ? "\\" : "/";
    const normalizedPanelPath = panelPath.endsWith(separator)
      ? panelPath
      : panelPath + separator;

    for (const item of items) {
      let matched = false;
      let actualName = null;
      let isAbsolutePath = false;

      // Check if this is an absolute path
      const lastSeparatorIndex = Math.max(
        item.lastIndexOf("/"),
        item.lastIndexOf("\\")
      );
      isAbsolutePath = lastSeparatorIndex !== -1;

      // Try as relative path first
      if (ignoreCase) {
        const lowerItem = item.toLowerCase();
        actualName = itemNames.find((name) => name.toLowerCase() === lowerItem);
        if (actualName) {
          // If absolute path was used, return it with actual filename
          if (isAbsolutePath) {
            const itemDir = item.substring(0, lastSeparatorIndex + 1);
            selected.push(itemDir + actualName);
          } else {
            selected.push(actualName);
          }
          matched = true;
        }
      } else {
        if (itemNames.includes(item)) {
          selected.push(item);
          matched = true;
        }
      }

      if (!matched && isAbsolutePath) {
        // Try as absolute path
        const basename = item.substring(lastSeparatorIndex + 1);
        const itemDir = item.substring(0, lastSeparatorIndex + 1);

        // Check if the directory matches the panel path and the basename exists
        if (itemDir === normalizedPanelPath) {
          if (ignoreCase) {
            const lowerBasename = basename.toLowerCase();
            actualName = itemNames.find(
              (name) => name.toLowerCase() === lowerBasename
            );
            if (actualName) {
              selected.push(itemDir + actualName);
              matched = true;
            }
          } else {
            if (itemNames.includes(basename)) {
              selected.push(item);
              matched = true;
            }
          }
        }
      }

      if (!matched) {
        notFound.push(item);
      }
    }

    // Update selections - use only basenames for the actual selection state
    const selectedBasenames = selected.map((item) => {
      const idx = Math.max(item.lastIndexOf("/"), item.lastIndexOf("\\"));
      return idx !== -1 ? item.substring(idx + 1) : item;
    });

    state.setSelections((prev) => {
      if (reset) {
        // Replace selection
        return {
          ...prev,
          [panelSide]: new Set(selectedBasenames),
        };
      } else {
        // Add to existing selection
        const existing = prev[panelSide] || new Set();
        const merged = new Set([...existing, ...selectedBasenames]);
        return {
          ...prev,
          [panelSide]: merged,
        };
      }
    });

    return { selected, notFound };
  };

  // FM.resetActivePanelSelection
  // Clears the selection for the active panel (unselects all items)
  methods.resetActivePanelSelection = function () {
    const state = getAppState();
    if (typeof state.handleUnselectAll === "function") {
      state.handleUnselectAll(state.activePanel);
    }
  };

  // FM.resetOtherPanelSelection
  // Clears the selection for the inactive panel (unselects all items)
  methods.resetOtherPanelSelection = function () {
    const state = getAppState();
    const otherPanel = methods.getOtherPanelSide();
    if (typeof state.handleUnselectAll === "function") {
      state.handleUnselectAll(otherPanel);
    }
  };

  // FM.resetBothPanelsSelections
  // Clears the selection for both panels (unselects all items in both panels)
  methods.resetBothPanelsSelections = function () {
    const state = getAppState();
    if (typeof state.handleUnselectAll === "function") {
      state.handleUnselectAll("left");
      state.handleUnselectAll("right");
    }
  };

  // FM.invertActivePanelSelection
  // Inverts the selection for the active panel (selects unselected items, unselects selected items)
  methods.invertActivePanelSelection = function () {
    const state = getAppState();
    if (typeof state.handleInvertSelection === "function") {
      state.handleInvertSelection(state.activePanel);
    }
  };

  // FM.invertOtherPanelSelection
  // Inverts the selection for the inactive panel (selects unselected items, unselects selected items)
  methods.invertOtherPanelSelection = function () {
    const state = getAppState();
    const otherPanel = methods.getOtherPanelSide();
    if (typeof state.handleInvertSelection === "function") {
      state.handleInvertSelection(otherPanel);
    }
  };

  // FM.setActivePanelQuickSelect
  // Performs quick select on the active panel using a pattern
  // @param {string} pattern - The pattern to match (wildcards or regex)
  // @param {boolean} useRegex - If true, treats pattern as regex (defaults to false)
  // @param {boolean} caseSensitive - If true, matching is case-sensitive (defaults to false)
  // @param {boolean} resetSelection - If true, clears existing selection first (defaults to true)
  // @returns {number} Number of items selected
  methods.setActivePanelQuickSelect = function (
    pattern,
    useRegex = false,
    caseSensitive = false,
    resetSelection = true
  ) {
    const state = getAppState();
    if (typeof state.handleQuickSelect === "function") {
      return state.handleQuickSelect(
        state.activePanel,
        pattern,
        useRegex,
        caseSensitive,
        resetSelection
      );
    }
    return 0;
  };

  // FM.setOtherPanelQuickSelect
  // Performs quick select on the inactive panel using a pattern
  // @param {string} pattern - The pattern to match (wildcards or regex)
  // @param {boolean} useRegex - If true, treats pattern as regex (defaults to false)
  // @param {boolean} caseSensitive - If true, matching is case-sensitive (defaults to false)
  // @param {boolean} resetSelection - If true, clears existing selection first (defaults to true)
  // @returns {number} Number of items selected
  methods.setOtherPanelQuickSelect = function (
    pattern,
    useRegex = false,
    caseSensitive = false,
    resetSelection = true
  ) {
    const state = getAppState();
    const otherPanel = methods.getOtherPanelSide();
    if (typeof state.handleQuickSelect === "function") {
      return state.handleQuickSelect(
        otherPanel,
        pattern,
        useRegex,
        caseSensitive,
        resetSelection
      );
    }
    return 0;
  };

  // FM.setActivePanelQuickUnselect
  // Performs quick unselect on the active panel using a pattern
  // @param {string} pattern - The pattern to match (wildcards or regex)
  // @param {boolean} useRegex - If true, treats pattern as regex (defaults to false)
  // @param {boolean} caseSensitive - If true, matching is case-sensitive (defaults to false)
  // @param {boolean} resetSelection - If true, clears all selection first (defaults to true)
  // @returns {number} Number of items unselected
  methods.setActivePanelQuickUnselect = function (
    pattern,
    useRegex = false,
    caseSensitive = false,
    resetSelection = true
  ) {
    const state = getAppState();
    if (typeof state.handleQuickUnselect === "function") {
      return state.handleQuickUnselect(
        state.activePanel,
        pattern,
        useRegex,
        caseSensitive,
        resetSelection
      );
    }
    return 0;
  };

  // FM.setOtherPanelQuickUnselect
  // Performs quick unselect on the inactive panel using a pattern
  // @param {string} pattern - The pattern to match (wildcards or regex)
  // @param {boolean} useRegex - If true, treats pattern as regex (defaults to false)
  // @param {boolean} caseSensitive - If true, matching is case-sensitive (defaults to false)
  // @param {boolean} resetSelection - If true, clears all selection first (defaults to true)
  // @returns {number} Number of items unselected
  methods.setOtherPanelQuickUnselect = function (
    pattern,
    useRegex = false,
    caseSensitive = false,
    resetSelection = true
  ) {
    const state = getAppState();
    const otherPanel = methods.getOtherPanelSide();
    if (typeof state.handleQuickUnselect === "function") {
      return state.handleQuickUnselect(
        otherPanel,
        pattern,
        useRegex,
        caseSensitive,
        resetSelection
      );
    }
    return 0;
  };

  // FM.setActivePanelQuickFilter
  // Sets a filter pattern for the active panel to show only matching items
  // @param {string} pattern - The pattern to match (wildcards or regex)
  // @param {boolean} useRegex - If true, treats pattern as regex (defaults to false)
  // @param {boolean} caseSensitive - If true, matching is case-sensitive (defaults to false)
  // @returns {number} Number of items matching the filter
  methods.setActivePanelQuickFilter = function (
    pattern,
    useRegex = false,
    caseSensitive = false
  ) {
    if (typeof pattern !== "string") {
      const error = "Pattern must be a string";
      console.error(error);
      return 0;
    }

    const state = getAppState();
    const panelSide = state.activePanel;
    const items = state.panels[panelSide]?.items;
    if (!items) return 0;

    // Handle special keywords by delegating to the appropriate handler
    if (pattern === "_FILES_ONLY_") {
      if (typeof state.handleQuickFilterFiles === "function") {
        state.handleQuickFilterFiles(panelSide);
        return items.filter(
          (item) =>
            item.name !== ".." &&
            item.type !== "folder" &&
            item.type !== "parent"
        ).length;
      }
    } else if (pattern === "_FOLDERS_ONLY_") {
      if (typeof state.handleQuickFilterFolders === "function") {
        state.handleQuickFilterFolders(panelSide);
        return items.filter(
          (item) => item.name !== ".." && item.type === "folder"
        ).length;
      }
    } else if (pattern === "_ZIP_FILES_ONLY_") {
      if (typeof state.handleQuickFilterZipFiles === "function") {
        state.handleQuickFilterZipFiles(panelSide);
        return items.filter(
          (item) => item.name !== ".." && item.type === "archive"
        ).length;
      }
    }

    // For regular patterns, use handleStartFilter + handleFilterChange
    if (typeof state.handleStartFilter === "function") {
      state.handleStartFilter(panelSide);
    }
    if (typeof state.handleFilterChange === "function") {
      state.handleFilterChange(panelSide, { pattern, useRegex, caseSensitive });
    }

    // Count matching items (simplified - let the app handle filtering logic)
    if (!pattern) {
      return items.filter((item) => item.name !== "..").length;
    }

    const flags = caseSensitive ? "" : "i";
    const regex = useRegex
      ? new RegExp(pattern, flags)
      : new RegExp(pattern.replace(/\./g, "\\.").replace(/\*/g, ".*"), flags);

    let count = 0;
    items.forEach((item) => {
      if (item.name === ".." || regex.test(item.name)) {
        count++;
      }
    });

    return count;
  };

  // FM.setOtherPanelQuickFilter
  // Sets a filter pattern for the inactive panel to show only matching items
  // @param {string} pattern - The pattern to match (wildcards or regex)
  // @param {boolean} useRegex - If true, treats pattern as regex (defaults to false)
  // @param {boolean} caseSensitive - If true, matching is case-sensitive (defaults to false)
  // @returns {number} Number of items matching the filter
  methods.setOtherPanelQuickFilter = function (
    pattern,
    useRegex = false,
    caseSensitive = false
  ) {
    if (typeof pattern !== "string") {
      const error = "Pattern must be a string";
      console.error(error);
      return 0;
    }

    const state = getAppState();
    const panelSide = methods.getOtherPanelSide();
    const items = state.panels[panelSide]?.items;
    if (!items) return 0;

    // Handle special keywords by delegating to the appropriate handler
    if (pattern === "_FILES_ONLY_") {
      if (typeof state.handleQuickFilterFiles === "function") {
        state.handleQuickFilterFiles(panelSide);
        return items.filter(
          (item) =>
            item.name !== ".." &&
            item.type !== "folder" &&
            item.type !== "parent"
        ).length;
      }
    } else if (pattern === "_FOLDERS_ONLY_") {
      if (typeof state.handleQuickFilterFolders === "function") {
        state.handleQuickFilterFolders(panelSide);
        return items.filter(
          (item) => item.name !== ".." && item.type === "folder"
        ).length;
      }
    } else if (pattern === "_ZIP_FILES_ONLY_") {
      if (typeof state.handleQuickFilterZipFiles === "function") {
        state.handleQuickFilterZipFiles(panelSide);
        return items.filter(
          (item) => item.name !== ".." && item.type === "archive"
        ).length;
      }
    }

    // For regular patterns, use handleStartFilter + handleFilterChange
    if (typeof state.handleStartFilter === "function") {
      state.handleStartFilter(panelSide);
    }
    if (typeof state.handleFilterChange === "function") {
      state.handleFilterChange(panelSide, { pattern, useRegex, caseSensitive });
    }

    // Count matching items (simplified - let the app handle filtering logic)
    if (!pattern) {
      return items.filter((item) => item.name !== "..").length;
    }

    const flags = caseSensitive ? "" : "i";
    const regex = useRegex
      ? new RegExp(pattern, flags)
      : new RegExp(pattern.replace(/\./g, "\\.").replace(/\*/g, ".*"), flags);

    let count = 0;
    items.forEach((item) => {
      if (item.name === ".." || regex.test(item.name)) {
        count++;
      }
    });

    return count;
  };

  // FM.resetActivePanelQuickFilter
  // Clears the filter for the active panel (shows all items)
  // @returns {number} Number of items in the panel
  methods.resetActivePanelQuickFilter = function () {
    const state = getAppState();
    const panelSide = state.activePanel;
    const items = state.panels[panelSide]?.items;
    if (!items) return 0;

    if (typeof state.handleResetQuickFilter === "function") {
      state.handleResetQuickFilter(panelSide);
    }

    return items.filter((item) => item.name !== "..").length;
  };

  // FM.resetOtherPanelQuickFilter
  // Clears the filter for the inactive panel (shows all items)
  // @returns {number} Number of items in the panel
  methods.resetOtherPanelQuickFilter = function () {
    const state = getAppState();
    const panelSide = methods.getOtherPanelSide();
    const items = state.panels[panelSide]?.items;
    if (!items) return 0;

    if (typeof state.handleResetQuickFilter === "function") {
      state.handleResetQuickFilter(panelSide);
    }

    return items.filter((item) => item.name !== "..").length;
  };

  // FM.resetBothPanelQuickFilter
  // Clears the filter for both panels (shows all items)
  // @returns {number} Total number of items in both panels
  methods.resetBothPanelQuickFilter = function () {
    const state = getAppState();
    if (typeof state.handleResetQuickFilter === "function") {
      state.handleResetQuickFilter("left");
      state.handleResetQuickFilter("right");
    }

    const leftItems = state.panels.left?.items;
    const rightItems = state.panels.right?.items;
    const leftCount = leftItems
      ? leftItems.filter((item) => item.name !== "..").length
      : 0;
    const rightCount = rightItems
      ? rightItems.filter((item) => item.name !== "..").length
      : 0;
    return leftCount + rightCount;
  };

  // FM.selectActivePanelFiles
  // Selects only files (non-folder, non-parent items) in the active panel
  // @returns {number} Number of files selected
  methods.selectActivePanelFiles = function () {
    const state = getAppState();
    if (typeof state.handleSelectFiles !== "function") {
      const error = "handleSelectFiles function not available in app state.";
      console.error(error);
      return 0;
    }

    const panelSide = state.activePanel;
    const items = state.panels[panelSide]?.items;
    if (!items) return 0;

    state.handleSelectFiles(panelSide);

    const fileCount = items.filter(
      (item) =>
        item.name !== ".." && item.type !== "folder" && item.type !== "parent"
    ).length;

    return fileCount;
  };

  // FM.selectOtherPanelFiles
  // Selects only files (non-folder, non-parent items) in the inactive panel
  // @returns {number} Number of files selected
  methods.selectOtherPanelFiles = function () {
    const state = getAppState();
    if (typeof state.handleSelectFiles !== "function") {
      const error = "handleSelectFiles function not available in app state.";
      console.error(error);
      return 0;
    }

    const panelSide = methods.getOtherPanelSide();
    const items = state.panels[panelSide]?.items;
    if (!items) return 0;

    state.handleSelectFiles(panelSide);

    const fileCount = items.filter(
      (item) =>
        item.name !== ".." && item.type !== "folder" && item.type !== "parent"
    ).length;

    return fileCount;
  };

  // FM.selectActivePanelFolders
  // Selects only folders in the active panel
  // @returns {number} Number of folders selected
  methods.selectActivePanelFolders = function () {
    const state = getAppState();
    if (typeof state.handleSelectFolders !== "function") {
      const error = "handleSelectFolders function not available in app state.";
      console.error(error);
      return 0;
    }

    const panelSide = state.activePanel;
    const items = state.panels[panelSide]?.items;
    if (!items) return 0;

    state.handleSelectFolders(panelSide);

    const folderCount = items.filter(
      (item) => item.name !== ".." && item.type === "folder"
    ).length;

    return folderCount;
  };

  // FM.selectOtherPanelFolders
  // Selects only folders in the inactive panel
  // @returns {number} Number of folders selected
  methods.selectOtherPanelFolders = function () {
    const state = getAppState();
    if (typeof state.handleSelectFolders !== "function") {
      const error = "handleSelectFolders function not available in app state.";
      console.error(error);
      return 0;
    }

    const panelSide = methods.getOtherPanelSide();
    const items = state.panels[panelSide]?.items;
    if (!items) return 0;

    state.handleSelectFolders(panelSide);

    const folderCount = items.filter(
      (item) => item.name !== ".." && item.type === "folder"
    ).length;

    return folderCount;
  };

  // FM.selectActivePanelZipFiles
  // Selects only zip/archive files in the active panel
  // @returns {number} Number of zip files selected
  methods.selectActivePanelZipFiles = function () {
    const state = getAppState();
    if (typeof state.handleSelectZipFiles !== "function") {
      const error = "handleSelectZipFiles function not available in app state.";
      console.error(error);
      return 0;
    }

    const panelSide = state.activePanel;
    const items = state.panels[panelSide]?.items;
    if (!items) return 0;

    state.handleSelectZipFiles(panelSide);

    const zipCount = items.filter(
      (item) => item.name !== ".." && item.type === "archive"
    ).length;

    return zipCount;
  };

  // FM.selectOtherPanelZipFiles
  // Selects only zip/archive files in the inactive panel
  // @returns {number} Number of zip files selected
  methods.selectOtherPanelZipFiles = function () {
    const state = getAppState();
    if (typeof state.handleSelectZipFiles !== "function") {
      const error = "handleSelectZipFiles function not available in app state.";
      console.error(error);
      return 0;
    }

    const panelSide = methods.getOtherPanelSide();
    const items = state.panels[panelSide]?.items;
    if (!items) return 0;

    state.handleSelectZipFiles(panelSide);

    const zipCount = items.filter(
      (item) => item.name !== ".." && item.type === "archive"
    ).length;

    return zipCount;
  };

  // FM.unselectActivePanelFiles
  // Unselects only files in the active panel
  // @returns {number} Number of items remaining in selection
  methods.unselectActivePanelFiles = function () {
    const state = getAppState();
    if (typeof state.handleUnselectFiles !== "function") {
      const error = "handleUnselectFiles function not available in app state.";
      console.error(error);
      return 0;
    }

    const panelSide = state.activePanel;
    state.handleUnselectFiles(panelSide);

    // Return remaining selection count
    return state.selections[panelSide]?.size || 0;
  };

  // FM.unselectOtherPanelFiles
  // Unselects only files in the inactive panel
  // @returns {number} Number of items remaining in selection
  methods.unselectOtherPanelFiles = function () {
    const state = getAppState();
    if (typeof state.handleUnselectFiles !== "function") {
      const error = "handleUnselectFiles function not available in app state.";
      console.error(error);
      return 0;
    }

    const panelSide = methods.getOtherPanelSide();
    state.handleUnselectFiles(panelSide);

    // Return remaining selection count
    return state.selections[panelSide]?.size || 0;
  };

  // FM.unselectActivePanelFolders
  // Unselects only folders in the active panel
  // @returns {number} Number of items remaining in selection
  methods.unselectActivePanelFolders = function () {
    const state = getAppState();
    if (typeof state.handleUnselectFolders !== "function") {
      const error =
        "handleUnselectFolders function not available in app state.";
      console.error(error);
      return 0;
    }

    const panelSide = state.activePanel;
    state.handleUnselectFolders(panelSide);

    // Return remaining selection count
    return state.selections[panelSide]?.size || 0;
  };

  // FM.unselectOtherPanelFolders
  // Unselects only folders in the inactive panel
  // @returns {number} Number of items remaining in selection
  methods.unselectOtherPanelFolders = function () {
    const state = getAppState();
    if (typeof state.handleUnselectFolders !== "function") {
      const error =
        "handleUnselectFolders function not available in app state.";
      console.error(error);
      return 0;
    }

    const panelSide = methods.getOtherPanelSide();
    state.handleUnselectFolders(panelSide);

    // Return remaining selection count
    return state.selections[panelSide]?.size || 0;
  };

  // FM.unselectActivePanelZipFiles
  // Unselects only zip/archive files in the active panel
  // @returns {number} Number of items remaining in selection
  methods.unselectActivePanelZipFiles = function () {
    const state = getAppState();
    if (typeof state.handleUnselectZipFiles !== "function") {
      const error =
        "handleUnselectZipFiles function not available in app state.";
      console.error(error);
      return 0;
    }

    const panelSide = state.activePanel;
    state.handleUnselectZipFiles(panelSide);

    // Return remaining selection count
    return state.selections[panelSide]?.size || 0;
  };

  // FM.unselectOtherPanelZipFiles
  // Unselects only zip/archive files in the inactive panel
  // @returns {number} Number of items remaining in selection
  methods.unselectOtherPanelZipFiles = function () {
    const state = getAppState();
    if (typeof state.handleUnselectZipFiles !== "function") {
      const error =
        "handleUnselectZipFiles function not available in app state.";
      console.error(error);
      return 0;
    }

    const panelSide = methods.getOtherPanelSide();
    state.handleUnselectZipFiles(panelSide);

    // Return remaining selection count
    return state.selections[panelSide]?.size || 0;
  };

  // FM.setActivePanelQuickFilterFiles
  // Filters the active panel to show only files
  // @returns {number} Number of files matching the filter
  methods.setActivePanelQuickFilterFiles = function () {
    return methods.setActivePanelQuickFilter("_FILES_ONLY_");
  };

  // FM.setOtherPanelQuickFilterFiles
  // Filters the inactive panel to show only files
  // @returns {number} Number of files matching the filter
  methods.setOtherPanelQuickFilterFiles = function () {
    return methods.setOtherPanelQuickFilter("_FILES_ONLY_");
  };

  // FM.setActivePanelQuickFilterFolders
  // Filters the active panel to show only folders
  // @returns {number} Number of folders matching the filter
  methods.setActivePanelQuickFilterFolders = function () {
    return methods.setActivePanelQuickFilter("_FOLDERS_ONLY_");
  };

  // FM.setOtherPanelQuickFilterFolders
  // Filters the inactive panel to show only folders
  // @returns {number} Number of folders matching the filter
  methods.setOtherPanelQuickFilterFolders = function () {
    return methods.setOtherPanelQuickFilter("_FOLDERS_ONLY_");
  };

  // FM.setActivePanelQuickFilterZipFiles
  // Filters the active panel to show only zip/archive files
  // @returns {number} Number of zip files matching the filter
  methods.setActivePanelQuickFilterZipFiles = function () {
    return methods.setActivePanelQuickFilter("_ZIP_FILES_ONLY_");
  };

  // FM.setOtherPanelQuickFilterZipFiles
  // Filters the inactive panel to show only zip/archive files
  // @returns {number} Number of zip files matching the filter
  methods.setOtherPanelQuickFilterZipFiles = function () {
    return methods.setOtherPanelQuickFilter("_ZIP_FILES_ONLY_");
  };

  // FM.setOtherPanelPath
  // Sets the path of the inactive panel
  // @param {string} path - The absolute path to navigate to
  // @returns {Promise<{success: boolean, error?: string}>}
  methods.setOtherPanelPath = async function (path) {
    if (typeof path !== "string" || !path) {
      const error = "Path must be a non-empty string";
      console.error(error);
      return { success: false, error };
    }
    const state = getAppState();
    if (typeof state.handleNavigate !== "function") {
      const error = "handleNavigate function not available in app state.";
      console.error(error);
      return { success: false, error };
    }

    const otherPanel = methods.getOtherPanelSide();
    const previousPath = state.panels[otherPanel].path;

    // Call handleNavigate and wait for it to complete
    await state.handleNavigate(otherPanel, path, "");

    // Add a small delay to ensure state has updated
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Check if navigation succeeded by comparing paths
    const newPath = state.panels[otherPanel].path;
    if (newPath === path) {
      return { success: true };
    } else {
      const error = `Failed to navigate to "${path}"`;
      console.error(error);
      // Clear the error modal since we're handling it in the console
      if (typeof state.setError === "function") {
        state.setError(null);
      }
      return { success: false, error };
    }
  };

  return methods;
}

export { createFMMethods };
