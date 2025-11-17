const { contextBridge } = require("electron");

// Expose limited APIs to the renderer process
contextBridge.exposeInMainWorld("electron", {
  app: {
    getVersion: () => "1.1.7",
  },
});

// Inject a tiny page-context polyfill for URL.parse for PDF.js compatibility.
// Some pdf.js builds call `URL.parse(...)` (Node-style). In browsers the
// global `URL` doesn't have `parse`. We inject a small polyfill into the
// page context so inlined/bundled pdfjs code can call `URL.parse` safely.
// We inject as a script tag so it runs in the page's context (not the
// isolated preload context) and is visible to the app's bundles.
(function injectUrlParsePolyfill() {
  const code = `
  try {
    if (typeof URL !== 'undefined' && typeof URL.parse !== 'function') {
      URL.parse = function(input, parseQueryString) {
        try {
          const u = new URL(input, location && location.href ? location.href : undefined);
          const result = {
            href: u.href,
            protocol: u.protocol,
            host: u.host,
            hostname: u.hostname,
            port: u.port,
            pathname: u.pathname,
            search: u.search,
            hash: u.hash,
            origin: u.origin,
            path: u.pathname + (u.search || ''),
            query: parseQueryString ? Object.fromEntries(new URLSearchParams(u.search)) : u.search
          };
          return result;
        } catch (e) {
          return null;
        }
      };
    }
  } catch (e) {
    // Keep silent - polyfill isn't critical and errors here shouldn't block app.
  }
  `;

  try {
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.textContent = code;
    (document.head || document.documentElement).appendChild(script);
    script.parentNode && script.parentNode.removeChild(script);
  } catch (e) {
    // If the DOM isn't available yet, attach to DOMContentLoaded as a fallback.
    window.addEventListener(
      "DOMContentLoaded",
      function () {
        try {
          const script = document.createElement("script");
          script.type = "text/javascript";
          script.textContent = code;
          (document.head || document.documentElement).appendChild(script);
          script.parentNode && script.parentNode.removeChild(script);
        } catch (err) {}
      },
      { once: true }
    );
  }
})();

// Expose FM in the page (DevTools) context for Electron. The renderer code may
// run in an isolated context when `contextIsolation` is enabled. To make the
// FM helper visible in DevTools and the page console, inject a small module
// script that imports `misc/fm.js` from the repo root and calls
// `attachFMToWindow()` in the page context. We use a module script to avoid
// duplicating the FM implementation here (re-uses the same source).
(function injectFMIntoPage() {
  try {
    const fs = require("fs");
    const path = require("path");
    // Resolve to the repository root's misc/fm.js; packages/electron/src -> root: ../../..
    const fmPath = path.resolve(__dirname, "..", "..", "..", "misc", "fm.js");
    // If the file doesn't exist, bail out silently (silently ignoring prevents
    // issues in packaged builds where the module may be bundled differently).
    if (!fs.existsSync(fmPath)) return;

    const moduleUrl = "file://" + fmPath;
    const code = [
      'import FM, { attachFMToWindow } from "' + moduleUrl + '";',
      "try {",
      "  // attachFMToWindow adds FM to the page's global scope so it is",
      "  // visible from DevTools/console; the function no-ops if already set.",
      '  if (typeof attachFMToWindow === "function") {',
      "    attachFMToWindow();",
      '  } else if (typeof FM === "function" && typeof window !== "undefined") {',
      "    // Fallback: attach a simple reference",
      "    window.FM = FM;",
      "  }",
      "} catch (e) {",
      "  // Ignore failure — don't block the app.",
      "}",
    ].join("\n");

    // Inject as a module script so the ESM imports inside `misc/fm.js` are
    // respected and executed in the page's normal context (not the isolated
    // renderer context).
    const injector = function () {
      try {
        const script = document.createElement("script");
        script.type = "module";
        script.textContent = code;
        (document.head || document.documentElement).appendChild(script);
        script.parentNode && script.parentNode.removeChild(script);
      } catch (e) {}
    };

    if (typeof document !== "undefined" && document.readyState !== "loading") {
      injector();
    } else if (typeof window !== "undefined") {
      window.addEventListener("DOMContentLoaded", injector, { once: true });
    }
  } catch (e) {
    // Keep silent on error - this is a best-effort enhancement for DevTools
  }
})();
