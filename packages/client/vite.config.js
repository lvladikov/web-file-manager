import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import path from "path";

// This is the standard ESM way to create a `require` function.
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Try to resolve the pdfjs-dist package that matches react-pdf first.
// react-pdf pins a specific pdfjs version; prefer copying the worker that
// corresponds to the version react-pdf will load to avoid API version mismatches.
let pdfjsDistPath;
try {
  // Try nested resolution under react-pdf
  const reactPdfPkg = require.resolve("react-pdf/package.json");
  const reactPdfDir = path.dirname(reactPdfPkg);
  // Attempt to resolve pdfjs-dist relative to react-pdf's directory
  pdfjsDistPath = path.dirname(
    require.resolve("pdfjs-dist/package.json", { paths: [reactPdfDir] })
  );
} catch (err) {
  // Fallback to the normal resolution
  pdfjsDistPath = path.dirname(require.resolve("pdfjs-dist/package.json"));
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          // This path is correct for the compatible version of pdfjs-dist (v5.4.296)
          src: path.join(pdfjsDistPath, "build", "pdf.worker.min.mjs"),
          // Copy it to the root of the output directory
          dest: ".",
        },
        {
          src: "icons",
          dest: ".",
        },
      ],
    }),
  ],
  // Ensure all imports of `pdfjs-dist` (including sub-paths like
  // 'pdfjs-dist/legacy/build/pdf') resolve to the exact package
  // directory we determined above (the version that matches react-pdf).
  resolve: {
    alias: [
      {
        find: /^pdfjs-dist(\/.*)?$/,
        replacement: path.join(pdfjsDistPath) + "$1",
      },
    ],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:3001",
        ws: true,
        rewrite: (path) => path.replace(/^\/ws/, ""),
      },
    },
  },
});
