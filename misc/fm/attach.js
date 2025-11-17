/**
 * Window attachment for FM (File Manager) console API
 * Attaches the FM object to the global scope for interactive console use
 */

/**
 * Attaches FM to the global scope (window/globalThis)
 * Shows a one-time console message when first attached
 * @param {Object} FM - The FM object to attach
 */
function attachFMToWindow(FM) {
  try {
    if (typeof globalThis !== "undefined") {
      Object.defineProperty(globalThis, "FM", {
        configurable: true,
        enumerable: true,
        get() {
          return FM;
        },
        set(v) {
          // allow override if someone wants to
          Object.defineProperty(globalThis, "FM", {
            value: v,
            writable: true,
            configurable: true,
            enumerable: true,
          });
        },
      });
      // Show a one-time console hint about FM when the window first gets FM attached.
      try {
        // globalThis may be window in a browser or global in Node/Electron renderer.
        if (!globalThis.__FM_CONSOLE_INTRO_SHOWN__) {
          globalThis.__FM_CONSOLE_INTRO_SHOWN__ = true;
          // Construct message and print with CSS in browser or ANSI in terminal
          const introMain = "FM — interactive console helpers available. Run ";
          const introCallout = "FM.help()";
          const introSuffix = " for details.";
          const isBrowser =
            typeof window !== "undefined" &&
            typeof window.document !== "undefined";
          if (isBrowser) {
            const calloutStyle = "color: #4B9DFF; font-weight: bold;";
            console.log(
              introMain + "%c" + introCallout + "%c" + introSuffix,
              calloutStyle,
              ""
            );
          } else {
            const cyan = "\x1b[36m";
            const reset = "\x1b[0m";
            console.log(introMain + cyan + introCallout + reset + introSuffix);
          }
        }
      } catch (e) {
        // don't break if console printing fails
      }
    }
  } catch (e) {
    // noop - attaching FM isn't critical
  }
}

export { attachFMToWindow };
