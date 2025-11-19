/**
 * Help system for FM (File Manager) console API
 * Generates and displays formatted help documentation for FM methods and properties
 */

import {
  detectBuildType,
  parseItemLine,
  expandBacktickNewlines,
} from "./utils.js";

/**
 * Creates the FM.help function that displays documentation
 * @param {Object} FM - The FM object to generate help for
 * @returns {Function} The help function
 */
function createHelpFunction(FM) {
  // FM.help
  // By default this method prints the help to the console and does not return the
  // help string (prevents the console from showing the return value as a cyan
  // result when called interactively). Pass `true` or `{ returnOutput: true }` to
  // receive the help text string as the return value.
  return function (opts, maxLineLengthInput) {
    // Support both a boolean shorthand (FM.help(true)) and an options object
    // Accepts:
    // - falsey -> prints help
    // - boolean -> { returnOutput }
    // - string -> context filter
    // - object -> { filter: string, returnOutput: boolean }
    let shouldReturnOutput = false;
    let filterWords = null;
    let maxLineLength = 72;
    if (typeof opts === "boolean") {
      shouldReturnOutput = opts;
    } else if (typeof opts === "string") {
      filterWords = opts
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 0);
    } else if (opts && typeof opts === "object") {
      shouldReturnOutput = !!opts.returnOutput;
      const fs = opts.filter ? String(opts.filter).toLowerCase() : null;
      filterWords = fs ? fs.split(/\s+/).filter((w) => w.length > 0) : null;
      if (opts.maxLineLength && Number.isInteger(opts.maxLineLength)) {
        // allow passing maxLineLength as part of the options object
        maxLineLength = opts.maxLineLength;
      }
    }

    // (keeping this assignment just in case) - already initialized above
    const isBrowser =
      typeof window !== "undefined" && typeof window.document !== "undefined";
    const lines = [];

    // If a second parameter was passed, treat it as desired max line length
    if (
      typeof maxLineLengthInput === "number" &&
      Number.isInteger(maxLineLengthInput) &&
      maxLineLengthInput > 0
    ) {
      maxLineLength = maxLineLengthInput;
    }

    // Helper function to wrap long text at maxLineLength
    function wrapText(text, indent) {
      if (text.length + indent.length <= maxLineLength) {
        return [indent + text];
      }

      const words = text.split(" ");
      const wrappedLines = [];
      let currentLine = indent;

      for (const word of words) {
        if (
          (currentLine + word).length > maxLineLength &&
          currentLine !== indent
        ) {
          wrappedLines.push(currentLine.trimEnd());
          currentLine = "    " + word + " ";
        } else {
          currentLine += word + " ";
        }
      }

      if (currentLine.trim() !== indent.trim()) {
        wrappedLines.push(currentLine.trimEnd());
      }

      return wrappedLines;
    }

    lines.push(
      "FM exposes convenience helpers (methods + properties) for interactive"
    );
    lines.push("exploration and debugging of the web-file-manager app.");
    lines.push(`Build: ${detectBuildType()}`);
    lines.push("---");
    lines.push("Methods:");
    lines.push(
      "  - Usage: FM.help() | FM.help('filter') | FM.help(opts, maxLineLength) or FM.help({ filter: 'filter', returnOutput: true, maxLineLength: 120 })"
    );

    // callable FM itself
    if (
      FM &&
      FM._meta &&
      FM._meta.methods &&
      FM._meta.methods.FM &&
      FM._meta.methods.FM.desc
    ) {
      lines.push("  FM()");
      const descLines = wrapText(FM._meta.methods.FM.desc, "  - ");
      lines.push(...descLines);
    } else {
      lines.push("  FM()");
      lines.push('  - returns "<package-name> - version <version>"');
    }

    // dynamically list methods on FM
    const methodNames = Object.getOwnPropertyNames(FM).filter(
      (k) => typeof FM[k] === "function"
    );

    for (const m of methodNames) {
      if (m === "help") continue; // we'll add help at the end
      let paramsStr = "";
      let desc = "";

      // Get parameter list from metadata if available
      let metaParams = [];
      if (
        FM &&
        FM._meta &&
        FM._meta.methods &&
        FM._meta.methods[m] &&
        FM._meta.methods[m].params
      ) {
        metaParams = FM._meta.methods[m].params;
        if (!Array.isArray(metaParams)) {
          metaParams = [];
        }
      }

      // Get description from metadata
      if (
        FM &&
        FM._meta &&
        FM._meta.methods &&
        FM._meta.methods[m] &&
        FM._meta.methods[m].desc
      ) {
        desc = FM._meta.methods[m].desc;
      } else {
        desc = "developer helper method";
      }

      // Get examples from metadata
      let metaExamples = [];
      if (
        FM &&
        FM._meta &&
        FM._meta.methods &&
        FM._meta.methods[m] &&
        FM._meta.methods[m].examples
      ) {
        metaExamples = FM._meta.methods[m].examples;
        if (!Array.isArray(metaExamples)) {
          metaExamples = [];
        }
      }

      // If filter provided, skip methods that don't match the filter (case-insensitive)
      if (filterWords && filterWords.length > 0) {
        const meta = FM && FM._meta && FM._meta.methods && FM._meta.methods[m];
        const nameLower = m.toLowerCase();
        const descLower = (meta && meta.desc && meta.desc.toLowerCase()) || "";
        const paramsLower =
          (meta && meta.params && meta.params.join(" ").toLowerCase()) || "";
        const examplesLower =
          (meta && meta.examples && meta.examples.join(" ").toLowerCase()) ||
          "";

        const matches = filterWords.every(
          (word) =>
            nameLower.includes(word) ||
            descLower.includes(word) ||
            paramsLower.includes(word) ||
            examplesLower.includes(word)
        );

        if (!matches) {
          continue; // Skip this method
        }
      }

      // Format: method name, then params line(s), then examples, then description with wrapping
      lines.push("");
      lines.push(`  FM.${m}()`);
      if (metaParams.length === 1) {
        lines.push(`  - parameter: ${metaParams[0]}`);
      } else if (metaParams.length > 1) {
        lines.push(`  - parameters:`);
        metaParams.forEach((param) => {
          lines.push(`      ${param}`);
        });
      }
      // No parameter line when metaParams.length === 0

      // Add examples if available
      if (metaExamples.length === 1) {
        const ex = expandBacktickNewlines(metaExamples[0]);
        // Split the example on actual newlines so console prints multiple lines
        const exParts = ex.split("\n");
        lines.push(`  - example: ${exParts.shift()}`);
        for (const p of exParts) lines.push(`      ${p}`);
      } else if (metaExamples.length > 1) {
        lines.push(`  - examples:`);
        metaExamples.forEach((example) => {
          const ex = expandBacktickNewlines(example);
          const exParts = ex.split("\n");
          lines.push(`      ${exParts.shift()}`);
          for (const p of exParts) lines.push(`      ${p}`);
        });
      }

      // Expand `\n` in descriptions (if someone wrote backticks there) and split by actual newlines
      desc = expandBacktickNewlines(desc);
      const descParts = desc.split("\n");
      const descLines = descParts.flatMap((part) => wrapText(part, "  - "));
      lines.push(...descLines);
    }

    lines.push("");
    lines.push("  FM.help()");
    lines.push("  - prints this help");

    lines.push("");
    lines.push("Properties:");

    const propNames = Object.getOwnPropertyNames(FM).filter(
      (k) => typeof FM[k] !== "function"
    );

    for (const p of propNames) {
      // skip prototype/name/length builtins
      if (["length", "prototype"].includes(p)) continue;
      // Short descriptions for known properties
      let desc = "";
      if (
        FM &&
        FM._meta &&
        FM._meta.properties &&
        FM._meta.properties[p] &&
        FM._meta.properties[p].desc
      ) {
        desc = FM._meta.properties[p].desc;
      } else {
        desc = "developer-visible property";
      }

      // If filter provided, skip properties that don't match the filter
      if (filterWords && filterWords.length > 0) {
        const meta =
          FM && FM._meta && FM._meta.properties && FM._meta.properties[p];
        const nameLower = p.toLowerCase();
        const descLower = (meta && meta.desc && meta.desc.toLowerCase()) || "";

        const matches = filterWords.every(
          (word) => nameLower.includes(word) || descLower.includes(word)
        );

        if (!matches) {
          continue; // Skip property
        }
      }
      // Format: property name, then description with wrapping
      lines.push("");
      lines.push(`  FM.${p}`);
      const descLines = wrapText(desc, "  - ");
      lines.push(...descLines);
    }

    const output = lines.join("\n");

    // Print with coloring where supported. Browsers support `%c` CSS styling in console.log,
    // while Node/Electron's terminal uses ANSI escape sequences.
    const methodColorCss = "color: #4B9DFF; font-weight: bold;";
    const paramsColorCss = "color: #EDCB3A; font-weight: normal;";
    const argsColorCss = "color: #E49260; font-weight: normal;";
    const propColorCss = "color: #4CAF50; font-weight: bold;";
    const descColorCss = "color: #D4D4D4;";
    const methodAnsi = "\x1b[36m"; // cyan
    const paramsAnsi = "\x1b[33m"; // yellow
    const argsAnsi = "\x1b[38;2;228;146;96m"; // #E49260
    const propAnsi = "\x1b[32m"; // green
    const descAnsi = "\x1b[37m"; // white/default
    const commentColorCss = "color: #6A9955;"; // green comment
    const commentAnsi = "\x1b[32m"; // green
    const resetAnsi = "\x1b[0m";

    let currentSection = null;
    let parseState = { inMultiline: false, depth: 0 };

    for (const l of lines) {
      // Check if this is a method signature line (starts with "  FM" and ends with "()")
      if (/^  FM(?:\.|\(|$)/.test(l) && /\(\)$/.test(l)) {
        const match = l.match(/^(\s*)(FM(?:\.[a-zA-Z0-9_]+)?)\(\)$/);
        if (match) {
          const [, indent, name] = match;
          if (isBrowser) {
            console.log(`${indent}%c${name}()`, methodColorCss);
          } else {
            console.log(indent + methodAnsi + name + "()" + resetAnsi);
          }
          currentSection = null;
          parseState = { inMultiline: false, depth: 0 };
          continue;
        }
      }
      // Check if this is a property line (starts with "  FM" but no parentheses)
      if (/^  FM\./.test(l) && !/\(\)$/.test(l)) {
        const match = l.match(/^(\s*)(FM\.[a-zA-Z0-9_]+)$/);
        if (match) {
          const [, indent, name] = match;
          if (isBrowser) {
            console.log(`${indent}%c${name}`, propColorCss);
          } else {
            console.log(indent + propAnsi + name + resetAnsi);
          }
          currentSection = null;
          parseState = { inMultiline: false, depth: 0 };
          continue;
        }
      }

      // Check if this is the Usage line
      const usageMatch = l.match(/^(\s*- Usage:)(.*)$/);
      if (usageMatch) {
        const [, label, content] = usageMatch;
        const { parts, newState } = parseItemLine(content, "usage", parseState);
        parseState = newState;

        if (isBrowser) {
          const cssArgs = ["color: #888;"]; // label color
          let formatStr = `%c${label}`;
          parts.forEach((p) => {
            formatStr += `%c${p.text}`;
            if (p.type === "highlight") cssArgs.push(argsColorCss);
            else if (p.type === "comment") cssArgs.push(commentColorCss);
            else cssArgs.push(paramsColorCss);
          });
          console.log(formatStr, ...cssArgs);
        } else {
          let str = "\x1b[90m" + label + resetAnsi;
          parts.forEach((p) => {
            if (p.type === "highlight") str += argsAnsi + p.text + resetAnsi;
            else if (p.type === "comment")
              str += commentAnsi + p.text + resetAnsi;
            else str += paramsAnsi + p.text + resetAnsi;
          });
          console.log(str);
        }
        continue;
      }

      // Check if this is a parameter(s) or example(s) line
      const sectionMatch = l.match(/^(  - (?:parameters?|examples?):)(.*)$/);
      if (sectionMatch) {
        const [, label, content] = sectionMatch;
        if (label.includes("parameter")) currentSection = "parameters";
        else if (label.includes("example")) currentSection = "examples";
        parseState = { inMultiline: false, depth: 0 };

        if (content.trim()) {
          const { parts, newState } = parseItemLine(
            content,
            currentSection,
            parseState
          );
          parseState = newState;

          if (isBrowser) {
            const cssArgs = ["color: #888;"]; // label color
            let formatStr = `%c${label}`;
            parts.forEach((p) => {
              formatStr += `%c${p.text}`;
              if (p.type === "highlight") cssArgs.push(argsColorCss);
              else if (p.type === "comment") cssArgs.push(commentColorCss);
              else cssArgs.push(paramsColorCss);
            });
            console.log(formatStr, ...cssArgs);
          } else {
            let str = "\x1b[90m" + label + resetAnsi;
            parts.forEach((p) => {
              if (p.type === "highlight") str += argsAnsi + p.text + resetAnsi;
              else if (p.type === "comment")
                str += commentAnsi + p.text + resetAnsi;
              else str += paramsAnsi + p.text + resetAnsi;
            });
            console.log(str);
          }
        } else {
          if (isBrowser) {
            console.log(`%c${label}`, "color: #888;");
          } else {
            console.log("\x1b[90m" + label + resetAnsi);
          }
        }
        continue;
      }

      // Check if this is a parameter/example item line (starts with "      " - 6 spaces)
      if (/^      [^ ]/.test(l)) {
        const { parts, newState } = parseItemLine(
          l,
          currentSection,
          parseState
        );
        parseState = newState;

        if (isBrowser) {
          let formatStr = "";
          const cssArgs = [];
          parts.forEach((p) => {
            formatStr += `%c${p.text}`;
            if (p.type === "highlight") cssArgs.push(argsColorCss);
            else if (p.type === "comment") cssArgs.push(commentColorCss);
            else cssArgs.push(paramsColorCss);
          });
          console.log(formatStr, ...cssArgs);
        } else {
          let str = "";
          parts.forEach((p) => {
            if (p.type === "highlight") str += argsAnsi + p.text + resetAnsi;
            else if (p.type === "comment")
              str += commentAnsi + p.text + resetAnsi;
            else str += paramsAnsi + p.text + resetAnsi;
          });
          console.log(str);
        }
        continue;
      }

      // Check if this is a regular description line (starts with "  - " but not "  - parameter(s)/example(s):")
      if (/^  - /.test(l) && !/^  - (parameters?|examples?):/.test(l)) {
        currentSection = null;
        parseState = { inMultiline: false, depth: 0 };
        if (isBrowser) {
          console.log(`%c${l}`, descColorCss);
        } else {
          console.log(descAnsi + l + resetAnsi);
        }
        continue;
      }
      // Check if this is a continuation line (starts with "    " - 4 spaces)
      if (/^    [^ ]/.test(l)) {
        if (isBrowser) {
          console.log(`%c${l}`, descColorCss);
        } else {
          console.log(descAnsi + l + resetAnsi);
        }
        continue;
      }
      console.log(l);
    }
    if (shouldReturnOutput) return output;
    // Otherwise return undefined implicitly so interactive consoles won't print
    // the help string as the function return value.
  };
}

export { createHelpFunction };
