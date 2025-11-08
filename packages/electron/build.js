import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageDir = __dirname;
const clientDir = path.join(packageDir, "../client");
const clientDistDir = path.join(clientDir, "dist");
const electronSrcDir = path.join(packageDir, "src");
const electronDistDir = path.join(packageDir, "dist");

console.log("Building Electron app...");

// Ensure dist directory exists
await fs.ensureDir(electronDistDir);

// Copy main.js to dist
console.log("Copying main.js to dist...");
await fs.copy(
  path.join(electronSrcDir, "main.js"),
  path.join(electronDistDir, "main.js")
);

// Copy preload.js to dist
console.log("Copying preload.js to dist...");
await fs.copy(
  path.join(electronSrcDir, "preload.js"),
  path.join(electronDistDir, "preload.js")
);

// Copy client dist to electron dist
console.log("Copying built client to dist...");
if (fs.existsSync(clientDistDir)) {
  // Create a separate client/dist directory structure
  const clientOutputDir = path.join(electronDistDir, "client", "dist");
  await fs.ensureDir(clientOutputDir);
  await fs.copy(clientDistDir, clientOutputDir);

  // Copy client icons (for electron window/dock icon)
  const clientIconsDir = path.join(clientDir, "icons");
  if (fs.existsSync(clientIconsDir)) {
    const iconsOutputDir = path.join(electronDistDir, "client", "icons");
    await fs.ensureDir(iconsOutputDir);
    await fs.copy(clientIconsDir, iconsOutputDir);
  }
} else {
  console.error("Client dist not found. Run 'npm run build:client' first.");
  process.exit(1);
}

// Copy entire server package (routes + lib) into electron dist for packaged builds
const serverDir = path.join(packageDir, "..", "server");
if (fs.existsSync(serverDir)) {
  console.log(
    "Copying server package into electron dist for packaged builds..."
  );
  const serverOutputDir = path.join(electronDistDir, "server");
  await fs.ensureDir(serverOutputDir);
  // Copy routes and lib directories
  await fs.copy(
    path.join(serverDir, "routes"),
    path.join(serverOutputDir, "routes")
  );
  await fs.copy(path.join(serverDir, "lib"), path.join(serverOutputDir, "lib"));
  // Copy package.json and config if they exist
  if (fs.existsSync(path.join(serverDir, "package.json"))) {
    await fs.copy(
      path.join(serverDir, "package.json"),
      path.join(serverOutputDir, "package.json")
    );
  }
  if (fs.existsSync(path.join(serverDir, "config.json"))) {
    await fs.copy(
      path.join(serverDir, "config.json"),
      path.join(serverOutputDir, "config.json")
    );
  }
} else {
  console.error("Server package not found. Ensure packages/server exists.");
  process.exit(1);
}

console.log("Electron app built successfully!");
