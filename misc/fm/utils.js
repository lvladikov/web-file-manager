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

/**
 * Normalize a provided name/path using the panel path separator.
 * It converts both slashes/backslashes to the panel separator, trims leading separators,
 * and collapses multiple separators to a single one.
 * @param {string} name - The incoming name or path fragment
 * @param {string} panelPath - The base panel path used to determine separator style
 */
function normalizeNameToPanel(name, panelPath) {
  if (typeof name !== "string") return name;
  const sep = panelPath && panelPath.includes("\\") ? "\\" : "/";
  const escapeForRegExp = (s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const escapedSep = escapeForRegExp(sep);
  const trimmed = name.replace(/[\\/]/g, sep);
  const leadingSepRegex = new RegExp(`^${escapedSep}+`);
  const multipleSepRegex = new RegExp(`${escapedSep}+`, "g");
  return trimmed.replace(leadingSepRegex, "").replace(multipleSepRegex, sep);
}

/**
 * Helper to parse a line into colored segments
 * Returns { parts: [{ text, type }], newState }
 * type: 'default' (Yellow), 'highlight' (Orange), 'comment' (Green)
 */
function parseItemLine(text, section, state) {
  const parts = [];
  const newState = { ...state };
  let remainingText = text;

  if (section === "parameters") {
    // Find first ( and last )
    const firstParen = remainingText.indexOf("(");
    const lastParen = remainingText.lastIndexOf(")");

    if (firstParen !== -1 && lastParen > firstParen) {
      parts.push({
        text: remainingText.substring(0, firstParen + 1),
        type: "default",
      });
      parts.push({
        text: remainingText.substring(firstParen + 1, lastParen),
        type: "highlight",
      });
      parts.push({
        text: remainingText.substring(lastParen),
        type: "default",
      });
    } else {
      parts.push({ text: remainingText, type: "default" });
    }
    return { parts, newState };
  }

  if (section === "examples" || section === "usage") {
    while (remainingText.length > 0) {
      if (newState.inMultiline) {
        // Inside a function call, scan for closing parenthesis
        let scanIdx = 0;
        let foundEnd = false;

        while (scanIdx < remainingText.length) {
          if (remainingText[scanIdx] === "(") newState.depth++;
          else if (remainingText[scanIdx] === ")") {
            newState.depth--;
            if (newState.depth === 0) {
              // Found end of call
              parts.push({
                text: remainingText.substring(0, scanIdx),
                type: "highlight",
              });
              parts.push({ text: ")", type: "default" });
              remainingText = remainingText.substring(scanIdx + 1);
              newState.inMultiline = false;
              foundEnd = true;
              break;
            }
          }
          scanIdx++;
        }

        if (!foundEnd) {
          // End of line, still in multiline
          parts.push({ text: remainingText, type: "highlight" });
          remainingText = "";
        }
      } else {
        // Not in multiline, look for FM call OR comment
        const commentIdx = remainingText.indexOf("//");
        const match = remainingText.match(/(FM\.[a-zA-Z0-9_]+)(\()/);

        if (commentIdx !== -1 && (!match || commentIdx < match.index)) {
          // Comment starts before next call
          if (commentIdx > 0) {
            parts.push({
              text: remainingText.substring(0, commentIdx),
              type: "default",
            });
          }
          parts.push({
            text: remainingText.substring(commentIdx),
            type: "comment",
          });
          remainingText = "";
        } else if (match) {
          const startIdx = match.index;
          const openParenIdx = startIdx + match[1].length;

          parts.push({
            text: remainingText.substring(0, openParenIdx + 1),
            type: "default",
          });

          newState.inMultiline = true;
          newState.depth = 1;
          remainingText = remainingText.substring(openParenIdx + 1);
        } else {
          parts.push({ text: remainingText, type: "default" });
          remainingText = "";
        }
      }
    }
    return { parts, newState };
  }

  // Fallback
  parts.push({ text: remainingText, type: "default" });
  return { parts, newState };
}

/**
 * Detect whether a string looks like a wildcard/glob pattern
 * Supports * ? and character classes like [abc]
 */
function looksLikeWildcard(s) {
  return typeof s === "string" && /[*?\[\]]/.test(s);
}

/**
 * Detect whether a value looks like a regular expression.
 * Accepts RegExp objects, or strings that use JS literal regex notation: /pattern/flags
 */
function looksLikeRegex(s) {
  if (s instanceof RegExp) return true;
  if (typeof s !== "string") return false;
  // simple detection: starts and ends with / and contains at least one char between
  return /^\/.*\/[gimsuy]*$/.test(s);
}

/**
 * Parse a pattern into a RegExp instance.
 * - If p is a RegExp, returns it.
 * - If p is a string in /pattern/flags form, returns new RegExp(pattern, flags).
 * - If p is a wildcard-like pattern, returns globToRegExp(p).
 * - Otherwise returns null.
 */
function parsePatternToRegex(p) {
  if (p instanceof RegExp) return p;
  if (typeof p !== "string") return null;

  // Check for /pattern/flags syntax
  const match = p.match(/^\/(.*)\/([gimsuy]*)$/);
  if (match) {
    try {
      return new RegExp(match[1], match[2] || "");
    } catch (e) {
      return null;
    }
  }

  // If it's a wildcard-style pattern, translate to RegExp
  if (looksLikeWildcard(p)) return globToRegExp(p);

  // Not a regex/wildcard
  return null;
}

/**
 * Convert a simple glob pattern (supports * and ? and basic character classes) into a RegExp
 * Returns null if conversion failed.
 */
function globToRegExp(p) {
  if (typeof p !== "string") return null;
  const s = p.replace(/\\/g, "/");
  // Escape regex special chars but leave glob tokens (*, ?, [ and ]) intact
  // so they can be translated into proper regex equivalents below.
  // We escape: . + ^ $ ( ) { } | \ / - and other meta chars except glob ones.
  const escaped = s.replace(/([.+^$(){}|\\\\/\\-])/g, "\\$1");
  // Convert glob stars and question marks to regex tokens
  const reStr = "^" + escaped.replace(/\*/g, ".*").replace(/\?/g, ".") + "$";
  try {
    // Treat glob/wildcard patterns as case-insensitive by default. This
    // mirrors typical filesystem behavior on case-insensitive platforms
    // (e.g. macOS) and matches the behavior developers expect when they
    // write patterns like '*.jpg'. If callers need case-sensitive matching
    // they can pass a RegExp explicitly (e.g. /pattern/flags).
    return new RegExp(reStr, "i");
  } catch (e) {
    return null;
  }
}

/**
 * Expand literal backtick template examples that include escaped newline sequences
 * so they print as multi-line examples. For example: `` `Line 1\nLine 2` `` -> multi-line text
 */
function expandBacktickNewlines(s) {
  if (typeof s !== "string") return s;
  // Replace occurrences of backtick-delimited content's literal "\\n" with an actual newline
  return s.replace(/`([^`]*)`/g, (match, inner) => {
    const replaced = inner.replace(/\\n/g, "\n");
    return "`" + replaced + "`";
  });
}

/**
 * Detects whether a provided path refers to content inside a zip archive.
 * Mirrors the server side implementation in packages/server/lib/zip-utils.js
 * @param {string} p
 * @returns {RegExpMatchArray|null} Returns match array [fullZipPath, pathInsideZip] or null
 */
function matchZipPath(p) {
  if (!p) return null;
  return p.match(/^(.*?\.zip)(.*)$/);
}
/**
 * Apply selection anchor and focused item for a given panel in app state.
 * Sets the panel's selectionAnchor to the first selected item and the
 * focusedItem to the last selected item. If selectedBasenames is empty or
 * not provided, both anchor and focus will be set to null.
 *
 * @param {Object} state - app state (getAppState() return)
 * @param {string} panelSide - 'left' | 'right'
 * @param {Array<string>} selectedBasenames - array of basenames currently selected
 */
function applySelectionAnchorAndFocus(
  state,
  panelSide,
  selectedBasenames = []
) {
  try {
    const first = selectedBasenames.length > 0 ? selectedBasenames[0] : null;
    const last =
      selectedBasenames.length > 0
        ? selectedBasenames[selectedBasenames.length - 1]
        : null;
    if (typeof state.setSelectionAnchor === "function") {
      state.setSelectionAnchor((prev) => ({ ...prev, [panelSide]: first }));
    }
    if (typeof state.setFocusedItem === "function") {
      state.setFocusedItem((prev) => ({ ...prev, [panelSide]: last }));
    }
  } catch (e) {
    // Best-effort only
  }
}

/**
 * Waits for a zip job to complete by connecting to the server WebSocket for the jobId
 * Resolves when the job ends with 'complete', rejects on 'error' or 'cancelled' or timeout
 * @param {string} jobId
 * @param {string} jobType (e.g., 'create-file-in-zip', 'update-file-in-zip')
 * @param {Object} opts {timeoutMs, onProgress}
 * @returns {Promise}
 */
function waitForZipJobCompletion(jobId, jobType, opts = {}) {
  const {
    timeoutMs = 120000,
    onProgress = null,
    showModal = true,
    zipFilePath = null,
    filePathInZip = null,
    title = null,
    triggeredFromConsole = false,
  } = opts;
  return new Promise((resolve, reject) => {
    if (!jobId) return resolve();
    try {
      if (typeof window === "undefined" || typeof WebSocket === "undefined") {
        // Not in a browser environment; we cannot open the WebSocket easily here
        console.warn(
          `[waitForZipJobCompletion] No WebSocket available (not in browser). Returning immediately for job ${jobId}.`
        );
        return resolve();
      }

      // If the browser app is loaded and provides a connectZipUpdateWebSocket (UI integration), use it
      const appState = window.__APP_STATE__ || null;
      if (
        appState &&
        typeof appState.connectZipUpdateWebSocket === "function"
      ) {
        try {
          // If the app provides a startZipUpdate function, show the modal UI
          if (showModal && typeof appState.startZipUpdate === "function") {
            try {
              appState.startZipUpdate({
                jobId,
                zipFilePath,
                filePathInZip,
                title: title || "Updating Zip Archive...",
                triggeredFromConsole,
              });
            } catch (e) {
              // Ignore start errors - proceed to connect
              console.warn(
                "waitForZipJobCompletion: startZipUpdate failed:",
                e
              );
            }
          }

          // Connect to the UI's Zip update WebSocket; it will resolve via onComplete callback
          let completed = false;
          const timeoutHandle = timeoutMs
            ? setTimeout(() => {
                if (!completed) {
                  completed = true;
                  reject(
                    new Error("waitForZipJobCompletion timeout (UI websocket)")
                  );
                }
              }, timeoutMs)
            : null;

          appState.connectZipUpdateWebSocket(jobId, jobType, () => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            completed = true;
            resolve({ type: "complete" });
          });
          // We do not open a separate WS in this case to avoid overriding the server job.ws
          return;
        } catch (e) {
          console.warn(
            `[waitForZipJobCompletion] connectZipUpdateWebSocket failed, falling back to raw WebSocket: ${e}`
          );
        }
      }

      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${wsProtocol}//${window.location.host}/ws?jobId=${jobId}&type=${jobType}`
      );
      let timeoutHandle = null;
      let finished = false;
      if (timeoutMs && timeoutMs > 0) {
        timeoutHandle = setTimeout(() => {
          if (!finished) {
            try {
              ws.close(1000, "wait timeout");
            } catch (e) {}
            reject(new Error("waitForZipJobCompletion timeout"));
          }
        }, timeoutMs);
      }
      ws.onopen = () => {
        console.log(`[waitForZipJobCompletion] Connected for job ${jobId}`);
      };
      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (typeof onProgress === "function") onProgress(data);
          if (data.type === "progress") {
            if (!onProgress) {
              // Default console progress
              console.log(
                `Zip job ${jobId} progress: ${data.processed}/${data.total}`
              );
            }
            return;
          }
          if (data.type === "complete") {
            finished = true;
            if (timeoutHandle) clearTimeout(timeoutHandle);
            try {
              ws.close(1000, "job complete");
            } catch (e) {}
            return resolve(data);
          }
          if (data.type === "error" || data.type === "cancelled") {
            finished = true;
            if (timeoutHandle) clearTimeout(timeoutHandle);
            try {
              ws.close(1000, "job error");
            } catch (e) {}
            return reject(new Error(data.message || data.type));
          }
        } catch (e) {
          // ignore malformed messages
        }
      };
      ws.onerror = (err) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (!finished) {
          finished = true;
          reject(err);
        }
      };
      ws.onclose = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (!finished) {
          finished = true;
          // If closed without completion, resolve to allow UI to refresh; otherwise reject
          // choose resolve to avoid making operations brittle
          return resolve();
        }
      };
    } catch (e) {
      return reject(e);
    }
  });}

/**
 * Helper function to perform multi-rename operations
 * @param {Object} state - App state
 * @param {string} panelId - Panel ID ('left' or 'right')
 * @param {Array|string|null} items - Items filter (string, array of strings, or null)
 * @param {Array} renameActions - Array of rename action objects 
 * @param {boolean} previewMode - If true, shows preview; if false, performs rename
 * @returns {Promise<Object>} Result object with success status and message
 */
async function performMultiRename(
  state,
  panelId,
  items,
  renameActions,
  previewMode
) {
  // Validate renameActions
  if (!Array.isArray(renameActions) || renameActions.length === 0) {
    const error = "renameActions must be a non-empty array";
    console.error(error);
    return { success: false, error };
  }

  // Get panel items and selection
  const panel = state.panels[panelId];
  if (!panel) {
    const error = `Panel ${panelId} not found`;
    console.error(error);
    return { success: false, error };
  }

  const selection = buildSelection(panelId, true) || [];
  const panelItems = panel.items || [];

  // Normalize items to array (accept string or array)
  let itemsFilter = null;
  if (items !== null && items !== undefined) {
    itemsFilter = Array.isArray(items) ? items : [items];
  }

  // Determine candidates based on selection and items filter
  let candidates;
  if (!selection || selection.length === 0) {
    if (itemsFilter && itemsFilter.length > 0) {
      // No selection made, but caller provided a filter: treat all panel items as candidates
      // This matches the behavior of moveToActivePanel
      candidates = panelItems;
    } else {
      const error = "No selection made and no items filter provided";
      console.error(error);
      return { success: false, error };
    }
  } else {
    // Filter candidate items by the current selection
    candidates = panelItems.filter((i) => selection.includes(i.name));
  }

  // Apply items filter if provided (supports names, wildcards, or regex)
  let filtered = candidates;
  if (itemsFilter && itemsFilter.length > 0) {
    const patterns = itemsFilter.map((p) => ({
      raw: p,
      re: parsePatternToRegex(p),
    }));
    filtered = candidates.filter((i) => {
      for (const pat of patterns) {
        try {
          if (pat.re) {
            if (pat.re.test(i.name)) return true;
          } else if (String(pat.raw) === i.name) {
            return true;
          }
        } catch (e) {}
      }
      return false;
    });
  }

  if (!filtered || filtered.length === 0) {
    const error = "No items matched the filter";
    console.error(error);
    return { success: false, error };
  }

  // Dynamic import required: renameUtils.js contains browser-only code (uses navigator, etc.)
  // This file (utils.js) is loaded by both server and client. Static imports would execute
  // immediately at module load time, causing the server to crash trying to access browser APIs.
  // Dynamic imports only execute when this function is called (runtime, in browser context).
  let applyRenameOperations, generateDiff;
  try {
    const renameUtilsModule = await import(
      "../../packages/client/src/lib/renameUtils.js"
    );
    applyRenameOperations = renameUtilsModule.applyRenameOperations;
    generateDiff = renameUtilsModule.generateDiff;
  } catch (err) {
    const error = "Failed to load rename utilities: " + err.message;
    console.error(error);
    return { success: false, error };
  }

  // Normalize renameActions to have id and active properties
  const operations = renameActions.map((action, idx) => ({
    id: `${Date.now()}-${idx}`,
    active: action.active !== false, // default to true if not specified
    type: action.type,
    params: action.params || {},
  }));

  // Apply rename operations to generate preview
  const previewItems = filtered.map((item, index) => {
    const newName = applyRenameOperations(
      item.name,
      operations,
      index,
      item // Pass full item as stats
    );
    const diff = generateDiff(item.name, newName);
    return {
      original: item.name,
      newName: newName,
      changed: item.name !== newName,
      diff,
    };
  });

  // Preview mode: show colored console output
  if (previewMode) {
    displayRenamePreview(previewItems);
    return {
      success: true,
      preview: previewItems,
      message: `Preview: ${previewItems.filter((p) => p.changed).length} of ${previewItems.length} items would be renamed`,
    };
  }

  // Actual rename mode
  const itemsToChange = previewItems.filter((i) => i.changed);
  if (itemsToChange.length === 0) {
    return {
      success: true,
      message: "No items to rename (no changes detected)",
    };
  }


  let successCount = 0;
  let failureCount = 0;
  const errors = [];

  // Dynamic import required: api.js contains browser-only code (uses navigator, etc.)
  // This file (utils.js) is loaded by both server and client. Static imports would execute
  // immediately at module load time, causing the server to crash trying to access browser APIs.
  // Dynamic imports only execute when this function is called (runtime, in browser context).
  let renameItem;
  try {
    const apiModule = await import("../../packages/client/src/lib/api.js");
    renameItem = apiModule.renameItem;
  } catch (err) {
    const error = "Failed to load API utilities: " + err.message;
    console.error(error);
    return { success: false, error };
  }

  // Helper to build full path
  const sep = panel.path.includes("\\") ? "\\" : "/";
  const base = panel.path.endsWith(sep) ? panel.path : panel.path + sep;

  // Helper to format diff segments with ANSI colors
  const formatDiff = (segments, isNew) => {
    return segments
      .map((seg) => {
        if (seg.type === "removed" && !isNew) {
          return `\x1b[31m\x1b[9m${seg.text}\x1b[0m`;
        } else if (seg.type === "added" && isNew) {
          return `\x1b[32m${seg.text}\x1b[0m`;
        } else if (seg.type === "unchanged") {
          return `\x1b[90m${seg.text}\x1b[0m`;
        }
        return seg.text;
      })
      .join("");
  };

  console.log(
    `\n\x1b[1m--- Renaming ${itemsToChange.length} items ---\x1b[0m\n`
  );

  for (let idx = 0; idx < itemsToChange.length; idx++) {
    const item = itemsToChange[idx];

    try {
      const oldPath = base + item.original;
      const response = await renameItem(oldPath, item.newName);

      // Handle zip-internal rename flows which return a jobId
      const zipMatch =
        oldPath &&
        typeof oldPath === "string" &&
        oldPath.match(/^(.*\.zip)(\/.*)?$/i);
      const isInnerZipPath =
        !!zipMatch && zipMatch[2] && zipMatch[2] !== "/";

      if (isInnerZipPath && response && response.jobId) {
        const zipFilePath = zipMatch[1];
        const oldFileInZip = zipMatch[2].startsWith("/")
          ? zipMatch[2].substring(1)
          : zipMatch[2];
        const lastSlash = oldFileInZip.lastIndexOf("/");
        const dir =
          lastSlash === -1 ? "" : oldFileInZip.substring(0, lastSlash);
        const newFileInZip = dir ? `${dir}/${item.newName}` : item.newName;

        if (typeof state.startZipUpdate === "function") {
          state.startZipUpdate({
            jobId: response.jobId,
            zipFilePath,
            filePathInZip: newFileInZip,
            originalZipSize: 0,
            itemType:
              (panelItems.find((i) => i.name === item.original)?.type ===
              "folder"
                ? "folder"
                : "file") || "file",
            title: "Renaming item in zip...",
          });
        }

        if (typeof state.connectZipUpdateWebSocket === "function") {
          await new Promise((resolve) => {
            state.connectZipUpdateWebSocket(response.jobId, "rename-in-zip", {
              onComplete: () => resolve(),
              onError: () => resolve(),
              onCancel: () => resolve(),
            });
          });
        }
      }

      successCount++;

      // Log success with colored diff
      const originalFormatted = formatDiff(item.diff.original, false);
      const newFormatted = formatDiff(item.diff.new, true);
      console.log(
        `\x1b[36m${idx + 1}/${itemsToChange.length}\x1b[0m \x1b[32m✓\x1b[0m Renamed`
      );
      console.log(`  Old: ${originalFormatted}`);
      console.log(`  New: ${newFormatted}`);
      if (idx < itemsToChange.length - 1) {
        console.log(""); // blank line between items
      }
    } catch (e) {
      console.error(
        `\x1b[36m${idx + 1}/${itemsToChange.length}\x1b[0m \x1b[31m✗\x1b[0m Failed:`
      );
      console.error(`  \x1b[90m${item.original}\x1b[0m → \x1b[90m${item.newName}\x1b[0m`);
      console.error(`  \x1b[31mError: ${e.message}\x1b[0m`);
      failureCount++;
      errors.push(`${item.original} → ${item.newName}: ${e.message}`);
    }
  }

  // Refresh panel
  try {
    if (typeof state.handleRefreshPanel === "function") {
      await state.handleRefreshPanel(panelId);
    }
  } catch (e) {
    console.error("[FM.multiRename] Failed to refresh panel:", e);
  }

  console.log(
    `\n\x1b[1m--- Complete: ${successCount} succeeded, ${failureCount} failed ---\x1b[0m\n`
  );

  return {
    success: failureCount === 0,
    successCount,
    failureCount,
    errors: failureCount > 0 ? errors : undefined,
    message: `Renamed ${successCount} of ${itemsToChange.length} items${failureCount > 0 ? ` (${failureCount} failed)` : ""}`,
  };
}

/**
 * Helper function to perform single-rename operations
 * @param {Object} state - App state
 * @param {string} panelId - Panel ID ('left' or 'right')
 * @param {string} newValue - New name for the item
 * @param {boolean} previewMode - If true, shows preview; if false, performs rename
 * @returns {Promise<Object>} Result object with success status and message
 */
async function performSingleRename(state, panelId, newValue, previewMode) {
  if (!newValue || typeof newValue !== "string") {
    const error = "newValue must be a non-empty string";
    console.error(error);
    return { success: false, error };
  }

  // Get panel and selection
  const panel = state.panels[panelId];
  if (!panel) {
    const error = `Panel ${panelId} not found`;
    console.error(error);
    return { success: false, error };
  }

  const selection = buildSelection(panelId, true) || [];
  if (selection.length === 0) {
    const error = "No item selected in the panel";
    console.error(error);
    return { success: false, error };
  }

  if (selection.length > 1) {
    const error = `Multiple items selected (${selection.length}). Please select only one item for single rename.`;
    console.error(error);
    return { success: false, error };
  }

  const itemName = selection[0];
  const item = panel.items.find((i) => i.name === itemName);
  if (!item) {
    const error = `Selected item "${itemName}" not found in panel`;
    console.error(error);
    return { success: false, error };
  }

  // Preview mode: show colored console output
  if (previewMode) {
    // Dynamic import required: renameUtils.js contains browser-only code (uses navigator, etc.)
    // This file (utils.js) is loaded by both server and client. Static imports would execute
    // immediately at module load time, causing the server to crash trying to access browser APIs.
    // Dynamic imports only execute when this function is called (runtime, in browser context).
    let generateDiff;
    try {
      const renameUtilsModule = await import(
        "../../packages/client/src/lib/renameUtils.js"
      );
      generateDiff = renameUtilsModule.generateDiff;
    } catch (err) {
      const error = "Failed to load rename utilities: " + err.message;
      console.error(error);
      return { success: false, error };
    }

    const diff = generateDiff(itemName, newValue);
    const previewItem = {
      original: itemName,
      newName: newValue,
      changed: itemName !== newValue,
      diff,
    };

    displayRenamePreview([previewItem]);

    return {
      success: true,
      preview: previewItem,
      message:
        itemName !== newValue
          ? `Preview: "${itemName}" would be renamed to "${newValue}"`
          : "No change (same name)",
    };
  }

  // Actual rename mode
  if (itemName === newValue) {
    return {
      success: true,
      message: "No change (item already has this name)",
    };
  }


  // Dynamic import required: api.js contains browser-only code (uses navigator, etc.)
  // This file (utils.js) is loaded by both server and client. Static imports would execute
  // immediately at module load time, causing the server to crash trying to access browser APIs.
  // Dynamic imports only execute when this function is called (runtime, in browser context).
  let renameItem;
  try {
    const apiModule = await import("../../packages/client/src/lib/api.js");
    renameItem = apiModule.renameItem;
  } catch (err) {
    const error = "Failed to load API utilities: " + err.message;
    console.error(error);
    return { success: false, error };
  }

  try {
    const sep = panel.path.includes("\\") ? "\\" : "/";
    const base = panel.path.endsWith(sep) ? panel.path : panel.path + sep;
    const oldPath = base + itemName;

    const response = await renameItem(oldPath, newValue);

    // Handle zip-internal rename flows
    const zipMatch =
      oldPath &&
      typeof oldPath === "string" &&
      oldPath.match(/^(.*\.zip)(\/.*)?$/i);
    const isInnerZipPath =
      !!zipMatch && zipMatch[2] && zipMatch[2] !== "/";

    if (isInnerZipPath && response && response.jobId) {
      const zipFilePath = zipMatch[1];
      const oldFileInZip = zipMatch[2].startsWith("/")
        ? zipMatch[2].substring(1)
        : zipMatch[2];
      const lastSlash = oldFileInZip.lastIndexOf("/");
      const dir = lastSlash === -1 ? "" : oldFileInZip.substring(0, lastSlash);
      const newFileInZip = dir ? `${dir}/${newValue}` : newValue;

      if (typeof state.startZipUpdate === "function") {
        state.startZipUpdate({
          jobId: response.jobId,
          zipFilePath,
          filePathInZip: newFileInZip,
          originalZipSize: 0,
          itemType: item.type === "folder" ? "folder" : "file",
          title: "Renaming item in zip...",
        });
      }

      if (typeof state.connectZipUpdateWebSocket === "function") {
        await new Promise((resolve) => {
          state.connectZipUpdateWebSocket(response.jobId, "rename-in-zip", {
            onComplete: () => resolve(),
            onError: () => resolve(),
            onCancel: () => resolve(),
          });
        });
      }
    }

    // Refresh panel
    if (typeof state.handleRefreshPanel === "function") {
      await state.handleRefreshPanel(panelId);
    }

    // Update selection to the new name
    if (typeof state.setFocusedItem === "function") {
      state.setFocusedItem((prev) => ({ ...prev, [panelId]: newValue }));
    }
    if (typeof state.setSelectionAnchor === "function") {
      state.setSelectionAnchor((prev) => ({ ...prev, [panelId]: newValue }));
    }
    if (typeof state.setSelections === "function") {
      state.setSelections((prev) => ({
        ...prev,
        [panelId]: new Set([newValue]),
      }));
    }

    return {
      success: true,
      message: `Renamed "${itemName}" to "${newValue}"`,
    };
  } catch (e) {
    console.error(
      `[FM.singleRename] Failed to rename ${itemName} to ${newValue}:`,
      e
    );
    return {
      success: false,
      error: e.message,
    };
  }
}

/**
 * Helper function to display rename preview in console with colors
 * @param {Array} previewItems - Array of preview items with diff data
 */
function displayRenamePreview(previewItems) {
  console.log("\n\x1b[1m--- Rename Preview ---\x1b[0m");
  
  previewItems.forEach((item, idx) => {
    // Helper to format diff segments with ANSI colors
    const formatDiff = (segments, isNew) => {
      return segments
        .map((seg) => {
          if (seg.type === "removed" && !isNew) {
            // Red with strikethrough
            return `\x1b[31m\x1b[9m${seg.text}\x1b[0m`;
          } else if (seg.type === "added" && isNew) {
            // Green
            return `\x1b[32m${seg.text}\x1b[0m`;
          } else if (seg.type === "unchanged") {
            // Gray for unchanged parts
            return `\x1b[90m${seg.text}\x1b[0m`;
          }
          return seg.text;
        })
        .join("");
    };

    const originalFormatted = formatDiff(item.diff.original, false);
    const newFormatted = formatDiff(item.diff.new, true);
    const statusIcon = item.changed ? "\x1b[32m✓\x1b[0m" : "\x1b[90m-\x1b[0m";
    const statusText = item.changed ? "Changed" : "No change";

    console.log(`\x1b[36m${idx}\x1b[0m ${statusIcon} ${statusText}`);
    console.log(`  Old: ${originalFormatted}`);
    console.log(`  New: ${newFormatted}`);
    if (idx < previewItems.length - 1) {
      console.log(""); // blank line between items
    }
  });

  console.log(
    `\n\x1b[90mLegend: \x1b[32mGreen\x1b[90m = Added, \x1b[31m\x1b[9mRed strikethrough\x1b[0m\x1b[90m = Removed, \x1b[90mGray\x1b[0m\x1b[90m = Unchanged\x1b[0m\n`
  );
}

export {
  detectBuildType,
  getAppState,
  buildSelection,
  normalizeNameToPanel,
  parseItemLine,
  looksLikeWildcard,
  looksLikeRegex,
  globToRegExp,
  parsePatternToRegex,
  expandBacktickNewlines,
  matchZipPath,
  waitForZipJobCompletion,
  applySelectionAnchorAndFocus,
  performMultiRename,
  performSingleRename,
};
