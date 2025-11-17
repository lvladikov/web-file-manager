/**
 * Help system for FM (File Manager) console API
 * Generates and displays formatted help documentation for FM methods and properties
 */

import { detectBuildType } from "./utils.js";

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
  return function (opts) {
    // Support both a boolean shorthand (FM.help(true)) and an options object
    const shouldReturnOutput =
      typeof opts === "boolean" ? opts : opts && opts.returnOutput;

    const MAX_LINE_LENGTH = 72;
    const isBrowser =
      typeof window !== "undefined" && typeof window.document !== "undefined";
    const lines = [];

    // Helper function to wrap long text at MAX_LINE_LENGTH
    function wrapText(text, indent) {
      if (text.length + indent.length <= MAX_LINE_LENGTH) {
        return [indent + text];
      }

      const words = text.split(" ");
      const wrappedLines = [];
      let currentLine = indent;

      for (const word of words) {
        if (
          (currentLine + word).length > MAX_LINE_LENGTH &&
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
        lines.push(`  - example: ${metaExamples[0]}`);
      } else if (metaExamples.length > 1) {
        lines.push(`  - examples:`);
        metaExamples.forEach((example) => {
          lines.push(`      ${example}`);
        });
      }

      const descLines = wrapText(desc, "  - ");
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
    const propColorCss = "color: #4CAF50; font-weight: bold;";
    const descColorCss = "color: #D4D4D4;";
    const methodAnsi = "\x1b[36m"; // cyan
    const paramsAnsi = "\x1b[33m"; // yellow
    const propAnsi = "\x1b[32m"; // green
    const descAnsi = "\x1b[37m"; // white/default
    const resetAnsi = "\x1b[0m";

    for (const l of lines) {
      if (isBrowser) {
        // Check if this is a method signature line (starts with "  FM" and ends with "()")
        if (/^  FM(?:\.|\(|$)/.test(l) && /\(\)$/.test(l)) {
          const match = l.match(/^(\s*)(FM(?:\.[a-zA-Z0-9_]+)?)\(\)$/);
          if (match) {
            const [, indent, name] = match;
            console.log(`${indent}%c${name}()`, methodColorCss);
            continue;
          }
        }
        // Check if this is a property line (starts with "  FM" but no parentheses)
        if (/^  FM\./.test(l) && !/\(\)$/.test(l)) {
          const match = l.match(/^(\s*)(FM\.[a-zA-Z0-9_]+)$/);
          if (match) {
            const [, indent, name] = match;
            console.log(`${indent}%c${name}`, propColorCss);
            continue;
          }
        }
        // Check if this is a parameter(s) or example(s) line
        if (/^  - (parameters?|examples?):/.test(l)) {
          const match = l.match(/^(  - (?:parameters?|examples?):)(.*)$/);
          if (match) {
            const [, label, content] = match;
            if (content.trim()) {
              // Single line: "  - parameter: xxx" or "  - example: xxx"
              console.log(
                `%c${label}%c${content}`,
                "color: #888;",
                paramsColorCss
              );
            } else {
              // Multi-line start: "  - parameters:" or "  - examples:"
              console.log(`%c${label}`, "color: #888;");
            }
            continue;
          }
        }
        // Check if this is a parameter/example item line (starts with "      " - 6 spaces)
        if (/^      [^ ]/.test(l)) {
          console.log(`%c${l}`, paramsColorCss);
          continue;
        }
        // Check if this is a regular description line (starts with "  - " but not "  - parameter(s)/example(s):")
        if (/^  - /.test(l) && !/^  - (parameters?|examples?):/.test(l)) {
          console.log(`%c${l}`, descColorCss);
          continue;
        }
        // Check if this is a continuation line (starts with "    " - 4 spaces)
        if (/^    [^ ]/.test(l)) {
          console.log(`%c${l}`, descColorCss);
          continue;
        }
        console.log(l);
      } else {
        // Node/Electron terminal: use ANSI coloring
        // Check if this is a method signature line (starts with "  FM" and ends with "()")
        if (/^  FM(?:\.|\(|$)/.test(l) && /\(\)$/.test(l)) {
          const match = l.match(/^(\s*)(FM(?:\.[a-zA-Z0-9_]+)?)\(\)$/);
          if (match) {
            const [, indent, name] = match;
            console.log(indent + methodAnsi + name + "()" + resetAnsi);
            continue;
          }
        }
        // Check if this is a property line (starts with "  FM" but no parentheses)
        if (/^  FM\./.test(l) && !/\(\)$/.test(l)) {
          const match = l.match(/^(\s*)(FM\.[a-zA-Z0-9_]+)$/);
          if (match) {
            const [, indent, name] = match;
            console.log(indent + propAnsi + name + resetAnsi);
            continue;
          }
        }
        // Check if this is a parameter(s) or example(s) line
        if (/^  - (parameters?|examples?):/.test(l)) {
          const match = l.match(/^(  - (?:parameters?|examples?):)(.*)$/);
          if (match) {
            const [, label, content] = match;
            const grayAnsi = "\x1b[90m"; // dark gray
            if (content.trim()) {
              // Single line: "  - parameter: xxx" or "  - example: xxx"
              console.log(
                grayAnsi + label + resetAnsi + paramsAnsi + content + resetAnsi
              );
            } else {
              // Multi-line start: "  - parameters:" or "  - examples:"
              console.log(grayAnsi + label + resetAnsi);
            }
            continue;
          }
        }
        // Check if this is a parameter/example item line (starts with "      " - 6 spaces)
        if (/^      [^ ]/.test(l)) {
          console.log(paramsAnsi + l + resetAnsi);
          continue;
        }
        // Check if this is a regular description line (starts with "  - " but not "  - parameter(s)/example(s):")
        if (/^  - /.test(l) && !/^  - (parameters?|examples?):/.test(l)) {
          console.log(descAnsi + l + resetAnsi);
          continue;
        }
        // Check if this is a continuation line (starts with "    " - 4 spaces)
        if (/^    [^ ]/.test(l)) {
          console.log(descAnsi + l + resetAnsi);
          continue;
        }
        console.log(l);
      }
    }
    if (shouldReturnOutput) return output;
    // Otherwise return undefined implicitly so interactive consoles won't print
    // the help string as the function return value.
  };
}

export { createHelpFunction };
