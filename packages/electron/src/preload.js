const { contextBridge } = require("electron");

// Expose limited APIs to the renderer process
contextBridge.exposeInMainWorld("electron", {
  app: {
    getVersion: () => "1.1.5",
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
