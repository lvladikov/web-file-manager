import { app, BrowserWindow, Menu, nativeImage } from "electron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pathToFileURL } from "url";
import http from "http";
import express from "express";

// Electron main dynamically imports server routes and websocket from the
// workspace server package (node_modules/@web-file-manager/server) in dev,
// or from the packaged server dist (copied by build.js) in production.
// No local copies of server code are maintained in packages/electron/src.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set a friendly application name early so menu labels and OS UI show a
// human-readable name instead of the package identifier. `app.setName`
// is safe to call before 'ready'. We call it for all platforms — on macOS
// it controls the app menu label; on Linux/Windows it may influence
// environment-level names and we also use it below when building menus.
try {
  app.setName("Web File Manager");
} catch (e) {
  // Non-fatal; continue if setting the name fails for any reason
}

let mainWindow;
let server;

// In-memory stores for active jobs
const activeCopyJobs = new Map();
const activeSizeJobs = new Map();
const activeCompressJobs = new Map();
const activeDecompressJobs = new Map();
const activeArchiveTestJobs = new Map();
const activeDuplicateJobs = new Map();
const activeCopyPathsJobs = new Map();
const activeZipOperations = new Map();
const activeTerminalJobs = new Map();

async function initializeServer() {
  const expressApp = express();
  const httpServer = http.createServer(expressApp);

  // Dynamically load the websocket implementation from the workspace server
  // package (node_modules) or from the packaged server copy.
  const wsCandidates = [
    path.join(
      __dirname,
      "node_modules",
      "@web-file-manager",
      "server",
      "lib",
      "websocket.js"
    ),
    path.join(__dirname, "..", "server", "lib", "websocket.js"),
    path.join(__dirname, "..", "..", "server", "lib", "websocket.js"),
    // Packaged fallback: build.js copies server into dist/server
    path.join(__dirname, "server", "lib", "websocket.js"),
  ];

  let wsModulePath = null;
  for (const p of wsCandidates) {
    try {
      if (fs.existsSync(p)) {
        wsModulePath = p;
        break;
      }
    } catch (e) {}
  }

  if (!wsModulePath) {
    console.error("[electron] Could not locate server websocket module.");
    process.exit(1);
  }

  console.log(`[electron] using websocket module at: ${wsModulePath}`);
  const wsFileUrl = pathToFileURL(wsModulePath).href;
  const wsMod = await import(wsFileUrl);
  const initializeWebSocketServer =
    wsMod.initializeWebSocketServer || wsMod.default || wsMod;

  initializeWebSocketServer(
    httpServer,
    activeCopyJobs,
    activeSizeJobs,
    activeCompressJobs,
    activeDecompressJobs,
    activeArchiveTestJobs,
    activeDuplicateJobs,
    activeCopyPathsJobs,
    activeZipOperations,
    activeTerminalJobs
  );

  const port = 3001;
  expressApp.use(express.json());

  // Resolve client dist from several possible locations. Prefer the
  // workspace-installed package under node_modules (when using npm
  // workspaces) so electron can use the client package directly rather
  // than requiring a copy. Fall back to a copied 'client/dist' next to
  // the electron dist when packaging or when running from source.
  const candidates = [
    path.join(__dirname, "node_modules", "@web-file-manager", "client", "dist"),
    path.join(__dirname, "client", "dist"),
    path.join(__dirname, "..", "client", "dist"),
  ];

  let clientDistPath = null;
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        clientDistPath = p;
        break;
      }
    } catch (e) {}
  }

  if (!clientDistPath) {
    console.error(
      "Could not locate client dist. Ensure the client is built or present in node_modules."
    );
    process.exit(1);
  }

  console.log(`[electron] using client dist at: ${clientDistPath}`);

  expressApp.use(express.static(clientDistPath));

  // Dynamically resolve and import the server routes module from the workspace
  // server package or from the packaged server copy.
  const serverCandidates = [
    path.join(
      __dirname,
      "node_modules",
      "@web-file-manager",
      "server",
      "routes",
      "index.js"
    ),
    path.join(__dirname, "..", "server", "routes", "index.js"),
    path.join(__dirname, "..", "..", "server", "routes", "index.js"),
    // Packaged fallback: build.js copies server into dist/server
    path.join(__dirname, "server", "routes", "index.js"),
  ];

  let routesModulePath = null;
  for (const p of serverCandidates) {
    try {
      if (fs.existsSync(p)) {
        routesModulePath = p;
        break;
      }
    } catch (e) {}
  }

  if (!routesModulePath) {
    console.error("[electron] Could not locate server routes module.");
    process.exit(1);
  }

  console.log(`[electron] using server routes module at: ${routesModulePath}`);
  const routesFileUrl = pathToFileURL(routesModulePath).href;
  const mod = await import(routesFileUrl);
  const initializeRoutes = mod.default || mod.initializeRoutes || mod;

  // Initialize routes BEFORE starting server
  initializeRoutes(
    expressApp,
    activeCopyJobs,
    activeSizeJobs,
    activeCompressJobs,
    activeDecompressJobs,
    activeArchiveTestJobs,
    activeDuplicateJobs,
    activeCopyPathsJobs,
    activeZipOperations,
    activeTerminalJobs
  );

  // Serve index.html for SPA routing (only for non-API, non-ws routes)
  expressApp.get("*", (req, res) => {
    // Don't serve SPA for API or WebSocket requests
    if (req.path.startsWith("/api") || req.path.startsWith("/ws")) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.sendFile(path.join(clientDistPath, "index.html"));
  });

  httpServer.listen(port, "localhost", () => {
    console.log(`[electron] Server listening at http://localhost:${port}`);
  });

  return httpServer;
}

function createWindow() {
  // Resolve icon from client package (prefer workspace client or copied client dist)
  const iconCandidates = [
    path.join(
      __dirname,
      "node_modules",
      "@web-file-manager",
      "client",
      "icons",
      "icon.png"
    ),
    path.join(__dirname, "..", "client", "icons", "icon.png"),
    path.join(__dirname, "..", "..", "client", "icons", "icon.png"),
    // Packaged fallback: icon copied during build
    path.join(__dirname, "client", "icons", "icon.png"),
  ];
  let iconImage = null;
  for (const p of iconCandidates) {
    try {
      if (fs.existsSync(p)) {
        iconImage = nativeImage.createFromPath(p);
        break;
      }
    } catch (e) {}
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    icon: iconImage || undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
    },
  });

  // Load from Express server instead of file
  mainWindow.loadURL("http://localhost:3001/");

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === "i") {
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    // When the main window is closed, fully quit the app and shut down
    // the internal server so the process doesn't remain running with only
    // the menu bar active.
    try {
      if (server) {
        server.close(() => {
          app.quit();
        });
      } else {
        app.quit();
      }
    } catch (e) {
      // If shutting down the server fails for any reason, force quit.
      try {
        app.quit();
      } catch (err) {}
    }
  });
}

app.on("ready", async () => {
  // Start the Express server (may dynamically import routes from the
  // workspace-installed server package)
  server = await initializeServer();

  // Wait a moment for server to be fully ready, then create window
  setTimeout(() => {
    createWindow();

    // Set dock icon on macOS if available (use client package icon)
    try {
      const dockIconCandidates = [
        path.join(
          __dirname,
          "node_modules",
          "@web-file-manager",
          "client",
          "icons",
          "icon.png"
        ),
        path.join(__dirname, "..", "client", "icons", "icon.png"),
        path.join(__dirname, "..", "..", "client", "icons", "icon.png"),
        path.join(__dirname, "client", "icons", "icon.png"),
      ];
      for (const p of dockIconCandidates) {
        if (fs.existsSync(p) && app.dock) {
          app.dock.setIcon(nativeImage.createFromPath(p));
          break;
        }
      }
    } catch (e) {}

    // Create application menu. For macOS we keep the standard `role: 'quit'`
    // so the item is placed in the app menu. For other platforms we create
    // a custom labeled quit item so it reads "Quit Web File Manager".
    const quitMenuItem =
      process.platform === "darwin"
        ? { role: "quit" }
        : {
            label: `Quit ${app.name || "Web File Manager"}`,
            accelerator: "CmdOrCtrl+Q",
            click: () => app.quit(),
          };

    const template = [
      {
        label: "File",
        submenu: [quitMenuItem],
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "forceReload" },
          { role: "toggleDevTools" },
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }, 500);
});

app.on("window-all-closed", () => {
  // Ensure the app fully quits when all windows are closed on any platform.
  // This also attempts a graceful server shutdown.
  try {
    if (server) {
      server.close(() => {
        app.quit();
      });
    } else {
      app.quit();
    }
  } catch (e) {
    try {
      app.quit();
    } catch (err) {}
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Graceful shutdown
process.on("SIGTERM", () => {
  if (server) {
    server.close(() => {
      app.quit();
    });
  } else {
    app.quit();
  }
});
