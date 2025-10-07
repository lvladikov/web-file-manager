import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import path from "path";

// This is the standard ESM way to create a `require` function.
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Now we can use require.resolve to robustly find the package path.
const pdfjsDistPath = path.dirname(require.resolve("pdfjs-dist/package.json"));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          // This path is correct for the compatible version of pdfjs-dist (v3.11.174)
          src: path.join(pdfjsDistPath, "build", "pdf.worker.min.js"),
          // Copy it to the root of the output directory
          dest: ".",
        },
      ],
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
