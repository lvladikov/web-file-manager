import express from "express";
import fse from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import open from "open";
import os from "os";
import http from "http";
import { WebSocketServer } from "ws";
import crypto from "crypto";
import { pipeline } from "stream/promises";
import { spawn } from "child_process";
import { parseFile } from "music-metadata";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const port = 3001;
const configPath = path.join(__dirname, "config.json");

app.use(express.json());

//WILL BE UPDATED SOON
