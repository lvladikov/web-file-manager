// Simple date formatter to avoid dependency issues if date-fns is missing
function formatDate(date, formatStr) {
  const pad = (n) => n.toString().padStart(2, "0");
  const fullYear = date.getFullYear();
  const YYYY = fullYear.toString();
  const YY = YYYY.slice(-2).padStart(2, "0");
  const MM = pad(date.getMonth() + 1);
  const M = (date.getMonth() + 1).toString();
  const dd = pad(date.getDate());
  const D = date.getDate().toString();
  const HH = pad(date.getHours());
  // 12-hour hour (1..12) and zero-padded 2-digit form
  const hour12 = ((date.getHours() + 11) % 12) + 1;
  const hh = pad(hour12);
  const mm = pad(date.getMinutes());
  const m = date.getMinutes().toString();
  const ss = pad(date.getSeconds());
  const s = date.getSeconds().toString();

  // Basic replacement for common tokens
  let result = formatStr;
  // Year tokens: prefer full form before 2-digit
  result = result.replace(/YYYY/g, YYYY);
  result = result.replace(/yyyy/g, YYYY);
  result = result.replace(/YY/g, YY);
  result = result.replace(/yy/g, YY);

  // Month tokens
  result = result.replace(/MM/g, MM);
  result = result.replace(/M/g, M);

  // Day tokens
  result = result.replace(/DD/g, dd);
  result = result.replace(/dd/g, dd);
  result = result.replace(/D/g, D);
  result = result.replace(/HH/g, HH);
  // 24-hour non-padded form
  result = result.replace(/H/g, date.getHours().toString());
  // Replace 12-hour forms: hh (zero-padded) and h (no padding)
  result = result.replace(/hh/g, hh);
  result = result.replace(/h/g, hour12.toString());
  // Minutes / seconds: double-letter tokens are zero-padded; single-letter are not
  result = result.replace(/mm/g, mm);
  result = result.replace(/m/g, m);
  result = result.replace(/ss/g, ss);
  result = result.replace(/s/g, s);
  // am/pm token
  result = result.replace(/a/g, date.getHours() < 12 ? "am" : "pm");

  return result;
}

/**
 * Applies a list of rename operations to a filename.
 *
 * @param {string} originalName - The original filename (including extension).
 * @param {Array} operations - List of operations to apply.
 * @param {number} index - The index of the file in the selection (0-based).
 * @param {object} fileStats - File statistics (optional, for date/time operations).
 * @returns {string} - The new filename.
 */
export function applyRenameOperations(
  originalName,
  operations,
  index,
  fileStats = {}
) {
  let name = originalName;
  // Separate extension if needed, but most operations work on the name without extension or full name
  // For now, let's assume operations define if they affect extension or not.
  // Common practice: operate on base name by default, optionally on extension.

  // Simple parsing for now: split by last dot
  const lastDotIndex = name.lastIndexOf(".");
  let baseName = lastDotIndex !== -1 ? name.substring(0, lastDotIndex) : name;
  let extension = lastDotIndex !== -1 ? name.substring(lastDotIndex) : "";

  // Helper to reconstruct name
  const getFullName = (b, e) => `${b}${e}`;

  for (const op of operations) {
    if (!op.active) continue;

    try {
      switch (op.type) {
        case "add_text":
          baseName = applyAddText(baseName, op);
          break;
        case "find_replace":
          baseName = applyFindReplace(baseName, op);
          break;
        case "sequence":
          baseName = applySequence(baseName, index, op);
          break;
        case "date_time":
          baseName = applyDateTime(baseName, fileStats, op);
          break;
        case "case_change":
          baseName = applyCaseChange(baseName, op);
          break;
        case "trim":
          baseName = applyTrim(baseName, op);
          break;
        case "swap":
          baseName = applySwap(baseName, op);
          break;
        case "remove_text":
          baseName = applyRemoveText(baseName, op);
          break;
        case "extension": // Special case if we want to manipulate extension
          if (op.params.newExtension) {
            extension = op.params.newExtension.startsWith(".")
              ? op.params.newExtension
              : `.${op.params.newExtension}`;
          }
          break;
        default:
          break;
      }
    } catch (e) {
      console.error(`Error applying operation ${op.type}:`, e);
      // On error, skip this operation or return current state?
      // Skipping is safer to avoid crashing the whole preview
    }
  }

  return getFullName(baseName, extension);
}

function applyAddText(text, op) {
  const { text: addText, position, atIndex } = op.params;
  // Allow empty string and whitespace-only strings
  if (addText === undefined || addText === null) return text;

  if (position === "start") {
    return `${addText}${text}`;
  } else if (position === "end") {
    return `${text}${addText}`;
  } else if (position === "index") {
    let idx = parseInt(atIndex, 10) || 0;
    if (idx < 0) {
      idx = text.length + idx;
      if (idx < 0) idx = 0;
    }
    if (idx >= text.length) return `${text}${addText}`;
    return `${text.slice(0, idx)}${addText}${text.slice(idx)}`;
  }
  return text;
}

function applyRemoveText(text, op) {
  const { count, position, atIndex } = op.params;
  const numChars = parseInt(count, 10) || 0;
  if (numChars <= 0) return text;

  if (position === "start") {
    return text.slice(numChars);
  } else if (position === "end") {
    return text.slice(0, Math.max(0, text.length - numChars));
  } else if (position === "index") {
    let idx = parseInt(atIndex, 10) || 0;
    if (idx < 0) {
      idx = text.length + idx;
      if (idx < 0) idx = 0;
    }
    // Remove numChars starting at idx
    return text.slice(0, idx) + text.slice(idx + numChars);
  }
  return text;
}

function applyFindReplace(text, op) {
  const { find, replace, useRegex, caseSensitive, matchAll } = op.params;
  if (!find) return text;

  let flags = "";
  if (!caseSensitive) flags += "i";
  if (matchAll) flags += "g";

  if (useRegex) {
    try {
      const regex = new RegExp(find, flags);
      return text.replace(regex, replace || "");
    } catch (e) {
      return text; // Invalid regex
    }
  } else {
    // Simple string replace
    if (matchAll) {
      // Escape special regex chars for global replacement
      const escapedFind = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escapedFind, flags);
      return text.replace(regex, replace || "");
    } else {
      // First occurrence only
      if (!caseSensitive) {
        const regex = new RegExp(
          find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "i"
        );
        return text.replace(regex, replace || "");
      }
      return text.replace(find, replace || "");
    }
  }
}

function applySequence(text, index, op) {
  const {
    start,
    step,
    padding,
    position,
    atIndex,
    prefix = "",
    suffix = "",
  } = op.params;
  const startNum = parseInt(start, 10) || 1;
  const stepNum = parseInt(step, 10) || 1;
  const padNum = parseInt(padding, 10) || 1;

  const currentNum = startNum + index * stepNum;
  const numStr = currentNum.toString().padStart(padNum, "0");
  const sequenceStr = `${prefix}${numStr}${suffix}`;

  if (position === "start") {
    return `${sequenceStr}${text}`;
  } else if (position === "end") {
    return `${text}${sequenceStr}`;
  } else if (position === "index") {
    let idx = parseInt(atIndex, 10) || 0;
    if (idx < 0) {
      idx = text.length + idx;
      if (idx < 0) idx = 0;
    }
    if (idx >= text.length) return `${text}${sequenceStr}`;
    return `${text.slice(0, idx)}${sequenceStr}${text.slice(idx)}`;
  }
  return `${text}${sequenceStr}`;
}

function applyCaseChange(text, op) {
  const mode = (op.params && op.params.mode) || "lowercase";

  // Helper to split into words (alphanumeric groups)
  const words = text.match(/[A-Za-z0-9]+/g) || [];

  const capitalize = (s) =>
    s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

  switch (mode) {
    case "uppercase":
      return text.toUpperCase();
    case "lowercase":
      return text.toLowerCase();
    case "title":
      // Capitalize each alpha-numeric word, leave separators in place
      return text.replace(/[A-Za-z0-9]+/g, (w) => capitalize(w));
    case "sentence": {
      const lowered = text.toLowerCase();
      return lowered.replace(/[A-Za-z0-9]/, (m) => m.toUpperCase());
    }
    case "camel":
      if (words.length === 0) return text;
      return (
        words[0].toLowerCase() +
        words
          .slice(1)
          .map((w) => capitalize(w))
          .join("")
      );
    case "pascal":
      return words.map((w) => capitalize(w)).join("");
    case "snake":
      return words.map((w) => w.toLowerCase()).join("_");
    case "kebab":
      return words.map((w) => w.toLowerCase()).join("-");
    default:
      return text;
  }
}

function applyTrim(text, op) {
  const { mode = "both", collapseSpaces = false } = op.params || {};
  let out = text;
  if (collapseSpaces) {
    out = out.replace(/\s+/g, " ");
  }

  if (mode === "both") return out.trim();
  if (mode === "start") return out.replace(/^\s+/, "");
  if (mode === "end") return out.replace(/\s+$/, "");
  return out;
}

function applySwap(text, op) {
  const delimiter = String(
    op.params && op.params.delimiter != null ? op.params.delimiter : " - "
  );
  const mode = (op.params && op.params.mode) || "swap";

  // If delimiter is empty, nothing to split on
  if (delimiter === "") return text;

  const parts = text.split(delimiter);
  if (parts.length <= 1) return text;

  const safeIndex = (i) => {
    let idx = parseInt(i, 10);
    if (isNaN(idx)) return null;
    if (idx < 0) idx = parts.length + idx; // support negative indices
    if (idx < 0 || idx >= parts.length) return null;
    return idx;
  };

  if (mode === "swap") {
    const a = safeIndex(op.params && op.params.aIndex);
    const b = safeIndex(op.params && op.params.bIndex);
    if (a === null || b === null) return text;
    const cp = parts.slice();
    const tmp = cp[a];
    cp[a] = cp[b];
    cp[b] = tmp;
    return cp.join(delimiter);
  }

  if (mode === "reorder") {
    const orderStr = String((op.params && op.params.order) || "").trim();
    if (!orderStr) return text;
    const order = orderStr
      .split(/[,\s]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => !isNaN(n));

    // If order is empty or contains invalid indices, fallback
    if (order.length === 0) return text;

    // Convert negative indices
    const normalized = order.map((i) => (i < 0 ? parts.length + i : i));

    // Compose new order: first push all requested indices that exist, then append missing parts in original order
    const out = [];
    const used = new Set();
    for (const idx of normalized) {
      if (idx >= 0 && idx < parts.length && !used.has(idx)) {
        out.push(parts[idx]);
        used.add(idx);
      }
    }
    for (let i = 0; i < parts.length; i++) {
      if (!used.has(i)) out.push(parts[i]);
    }

    return out.join(delimiter);
  }

  return text;
}

// sanitize operation removed

function applyDateTime(text, fileStats, op) {
  const {
    format: timeFormat,
    source,
    position,
    atIndex,
    prefix = "",
    suffix = "",
  } = op.params;
  // source: 'current', 'modified', 'created'
  // fileStats should have 'modified' (Date object or string)

  let date;
  if (source === "current") {
    date = new Date();
  } else if (source === "modified" && fileStats.modified) {
    date = new Date(fileStats.modified);
  } else if (source === "created" && fileStats.created) {
    date = new Date(fileStats.created);
  } else {
    date = new Date(); // Fallback
  }

  let dateStr = "";
  try {
    dateStr = formatDate(date, timeFormat || "yyyyMMdd");
  } catch (e) {
    dateStr = "";
  }

  const composed = `${prefix || ""}${dateStr}${suffix || ""}`;

  if (position === "start") {
    return `${composed}${text}`;
  } else if (position === "end") {
    return `${text}${composed}`;
  } else if (position === "index") {
    let idx = parseInt(atIndex, 10) || 0;
    // support negative indexing similar to add/remove
    if (idx < 0) {
      idx = text.length + idx;
      if (idx < 0) idx = 0;
    }
    if (idx >= text.length) return `${text}${composed}`;
    return `${text.slice(0, idx)}${composed}${text.slice(idx)}`;
  }
  return `${text}${dateStr}`;
}

/**
 * Generates a detailed diff showing additions and removals using Myers diff algorithm.
 * Returns an object with 'original' and 'new' arrays of segments.
 * Each segment has { text, type: 'unchanged' | 'removed' | 'added' }
 */
export function generateDiff(original, modified) {
  if (original === modified) {
    return {
      original: [{ text: original, type: "unchanged" }],
      new: [{ text: modified, type: "unchanged" }],
    };
  }

  // Use Myers diff algorithm for accurate character-level diff
  const diff = myersDiff(original, modified);
  
  const originalSegments = [];
  const newSegments = [];
  
  for (const segment of diff) {
    if (segment.type === 'unchanged') {
      originalSegments.push({ text: segment.text, type: 'unchanged' });
      newSegments.push({ text: segment.text, type: 'unchanged' });
    } else if (segment.type === 'removed') {
      originalSegments.push({ text: segment.text, type: 'removed' });
    } else if (segment.type === 'added') {
      newSegments.push({ text: segment.text, type: 'added' });
    }
  }
  
  return { original: originalSegments, new: newSegments };
}

/**
 * Myers diff algorithm for character-level comparison.
 * Returns an array of segments with type: 'unchanged' | 'removed' | 'added'
 */
function myersDiff(original, modified) {
  const n = original.length;
  const m = modified.length;
  const max = n + m;
  
  // V array for tracking furthest reaching D-paths
  const v = {};
  v[1] = 0;
  
  // Trace array to reconstruct the path
  const trace = [];
  
  // Find the shortest edit script
  for (let d = 0; d <= max; d++) {
    trace.push({ ...v });
    
    for (let k = -d; k <= d; k += 2) {
      let x;
      
      // Determine if we should move down or right
      if (k === -d || (k !== d && v[k - 1] < v[k + 1])) {
        x = v[k + 1]; // Move down (insert)
      } else {
        x = v[k - 1] + 1; // Move right (delete)
      }
      
      let y = x - k;
      
      // Follow diagonal (matching characters)
      while (x < n && y < m && original[x] === modified[y]) {
        x++;
        y++;
      }
      
      v[k] = x;
      
      // Check if we've reached the end
      if (x >= n && y >= m) {
        return backtrack(original, modified, trace, d);
      }
    }
  }
  
  // Fallback: shouldn't reach here
  return [{ text: original, type: 'removed' }, { text: modified, type: 'added' }];
}

/**
 * Backtrack through the trace to build the diff segments
 */
function backtrack(original, modified, trace, d) {
  const segments = [];
  let x = original.length;
  let y = modified.length;
  
  for (let depth = d; depth >= 0; depth--) {
    const v = trace[depth];
    const k = x - y;
    
    let prevK;
    if (k === -depth || (k !== depth && v[k - 1] < v[k + 1])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    
    const prevX = v[prevK];
    const prevY = prevX - prevK;
    
    // Collect diagonal (unchanged) characters
    while (x > prevX && y > prevY) {
      segments.unshift({ text: original[x - 1], type: 'unchanged' });
      x--;
      y--;
    }
    
    if (depth === 0) break;
    
    // Collect the edit operation
    if (x === prevX) {
      // Insertion
      segments.unshift({ text: modified[y - 1], type: 'added' });
      y--;
    } else {
      // Deletion
      segments.unshift({ text: original[x - 1], type: 'removed' });
      x--;
    }
  }
  
  // Merge consecutive segments of the same type
  const merged = [];
  for (const segment of segments) {
    if (merged.length > 0 && merged[merged.length - 1].type === segment.type) {
      merged[merged.length - 1].text += segment.text;
    } else {
      merged.push({ ...segment });
    }
  }
  
  return merged;
}

