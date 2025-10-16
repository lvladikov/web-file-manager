import express from "express";
import http from "http";

import { initializeWebSocketServer } from "./lib/websocket.js";
import initializeRoutes from "./routes/index.js";

const app = express();
const server = http.createServer(app);

// --- In-memory store for active copy jobs ---
const activeCopyJobs = new Map();

// In-memory store for active size calculation jobs
const activeSizeJobs = new Map();

// In-memory store for active compression jobs
const activeCompressJobs = new Map();

// In-memory store for active decompression jobs
const activeDecompressJobs = new Map();

// In-memory store for active archive test jobs
const activeArchiveTestJobs = new Map();

// In-memory store for active duplicate jobs
const activeDuplicateJobs = new Map();

// Initialize the WebSocket server
initializeWebSocketServer(
  server,
  activeCopyJobs,
  activeSizeJobs,
  activeCompressJobs,
  activeDecompressJobs,
  activeArchiveTestJobs,
  activeDuplicateJobs
);

const port = 3001;

app.use(express.json());

// --- Initialize API Endpoints ---
initializeRoutes(
  app,
  activeCopyJobs,
  activeSizeJobs,
  activeCompressJobs,
  activeDecompressJobs,
  activeArchiveTestJobs,
  activeDuplicateJobs
);

server.listen(port, () => {
  console.log(`[dev:server] Server listening at http://localhost:${port}`);
});
