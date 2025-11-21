import express from "express";
import fse from "fs-extra";
import path from "path";
import os from "os";
import crypto from "crypto";
import archiver from "archiver";
import yauzl from "yauzl-promise";

import {
  getDirTotalSize,
  matchZipPath,
  getFilesInZip,
  getFileContentFromZip,
  getZipFileStream,
  getMimeType,
  findCoverInZip,
} from "../lib/utils.js";

import { unregisterAllForJob } from "../lib/prompt-registry.js";

export default function createZipRoutes(
  activeZipOperations,
  activeCompressJobs,
  activeDecompressJobs,
  activeArchiveTestJobs
) {
  const router = express.Router();

  // Endpoint to get contents of a zip file
  router.get("/zip/contents", async (req, res) => {
    const { filePath, directoryPath = "/" } = req.query;
    if (!filePath) {
      return res.status(400).json({ message: "Zip file path is required." });
    }

    try {
      const contents = await getFilesInZip(filePath, directoryPath);
      res.json({ path: directoryPath, items: contents });
    } catch (error) {
      console.error("Error reading zip file contents:", error);
      res.status(500).json({ message: "Error reading zip file contents." });
    }
  });

  // Endpoint to get content of a specific file within a zip
  router.get("/zip/file-content", async (req, res) => {
    const { zipFilePath, filePathInZip } = req.query;
    if (!zipFilePath || !filePathInZip) {
      return res
        .status(400)
        .json({ message: "Zip file path and file path in zip are required." });
    }

    try {
      const content = await getFileContentFromZip(zipFilePath, filePathInZip);
      res.set("Content-Type", "text/plain");
      res.send(content);
    } catch (error) {
      console.error("Error reading file from zip:", error);
      if (error.message.includes("File not found")) {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: "Error reading file from zip." });
    }
  });

  // Endpoint to stream media content from a zip file
  router.get("/zip/media-stream", async (req, res) => {
    const { zipFilePath, filePathInZip } = req.query;
    if (!zipFilePath || !filePathInZip) {
      return res
        .status(400)
        .json({ message: "Zip file path and file path in zip are required." });
    }

    try {
      const stream = await getZipFileStream(zipFilePath, filePathInZip);
      const mimeType = getMimeType(filePathInZip);
      res.set("Content-Type", mimeType);
      stream.pipe(res);
    } catch (error) {
      console.error("Error streaming media from zip:", error);
      if (error.message.includes("File not found")) {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: "Error streaming media from zip." });
    }
  });

  router.get("/zip/audio-cover", async (req, res) => {
    const { zipFilePath, audioFilePathInZip } = req.query;
    if (!zipFilePath || !audioFilePathInZip) {
      return res
        .status(400)
        .json({ message: "Zip file path and audio file path are required." });
    }

    try {
      const coverPathInZip = await findCoverInZip(
        zipFilePath,
        audioFilePathInZip
      );
      if (coverPathInZip) {
        res.json({ coverPathInZip });
      } else {
        res.status(404).json({ message: "Cover art not found in zip." });
      }
    } catch (error) {
      console.error("Error finding cover art in zip:", error);
      res.status(500).json({ message: "Error finding cover art in zip." });
    }
  });

  // Endpoint to cancel a zip operation or any zip-related job (compress, decompress, archive-test)
  router.post("/zip/operation/cancel", async (req, res) => {
    const { jobId } = req.body;
    if (!jobId) {
      return res.status(400).json({ message: "jobId is required." });
    }

    // 1) Look in generic activeZipOperations (delete/modify operations inside zips)
    if (activeZipOperations.has(jobId)) {
      const job = activeZipOperations.get(jobId);
      if (job && job.controller) {
        console.log("[zipRoutes] Aborting zip operation job:", jobId);
        job.controller.abort();
      }
      try {
        unregisterAllForJob(jobId, job);
      } catch (e) {}
      activeZipOperations.delete(jobId);
      return res
        .status(200)
        .json({ message: "Zip operation cancellation request received." });
    }

    // 2) Compress jobs
    if (activeCompressJobs.has(jobId)) {
      const job = activeCompressJobs.get(jobId);
      try {
        console.log("[zipRoutes] Cancelling compress job:", jobId);
        if (job.status === "pending" || job.status === "running") {
          job.status = "cancelled";
          if (job.archive && typeof job.archive.destroy === "function") {
            try {
              job.archive.destroy();
            } catch (ee) {}
          }
          if (await fse.pathExists(job.outputPath)) {
            console.log(
              `[zipRoutes] Compression job ${jobId} cancelled. Deleting partial archive: ${job.outputPath}`
            );
            await fse.remove(job.outputPath);
          }
        }
      } catch (e) {
        console.warn("[zipRoutes] Error while cancelling compress job:", e);
      }
      try {
        unregisterAllForJob(jobId, job);
      } catch (e) {}
      activeCompressJobs.delete(jobId);
      return res
        .status(200)
        .json({ message: "Compression cancellation request received." });
    }

    // 3) Decompress jobs
    if (activeDecompressJobs.has(jobId)) {
      const job = activeDecompressJobs.get(jobId);
      try {
        console.log("[zipRoutes] Cancelling decompress job:", jobId);
        if (job.status === "pending" || job.status === "running") {
          job.status = "cancelled";
          if (job.controller) job.controller.abort();
        }
      } catch (e) {
        console.warn("[zipRoutes] Error while cancelling decompress job:", e);
      }
      try {
        unregisterAllForJob(jobId, job);
      } catch (e) {}
      activeDecompressJobs.delete(jobId);
      return res
        .status(200)
        .json({ message: "Decompression cancellation request received." });
    }

    // 4) Archive test jobs
    if (activeArchiveTestJobs.has(jobId)) {
      const job = activeArchiveTestJobs.get(jobId);
      try {
        console.log("[zipRoutes] Cancelling archive test job:", jobId);
        if (job.status === "pending" || job.status === "running") {
          job.status = "cancelled";
          if (job.controller) job.controller.abort();
        }
      } catch (e) {
        console.warn("[zipRoutes] Error while cancelling archive-test job:", e);
      }
      try {
        unregisterAllForJob(jobId, job);
      } catch (e) {}
      activeArchiveTestJobs.delete(jobId);
      return res
        .status(200)
        .json({ message: "Archive test cancellation request received." });
    }

    return res.status(404).json({ message: "Zip operation job not found." });
  });

  // Endpoint to compress files/folders (moved from compressRoutes)
  router.post("/zip/compress", async (req, res) => {
    const { sources, destination, sourceDirectory } = req.body;

    if (!sources || sources.length === 0 || !destination) {
      return res
        .status(400)
        .json({ message: "Sources and destination are required." });
    }

    const jobId = crypto.randomUUID();

    const folderName = path.basename(destination);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const dateTimeStamp = `${year}${month}${day}-${hours}${minutes}${seconds}`;

    const archiveName = `${folderName}_${dateTimeStamp}.zip`;
    const outputPath = path.join(destination, archiveName);
    const output = fse.createWriteStream(outputPath);
    const archive = archiver("zip", {
      zlib: { level: 9 },
      forceZip64: true,
    });

    let totalSize = 0;
    for (const source of sources) {
      totalSize += await getDirTotalSize(source);
    }

    const job = {
      id: jobId,
      _traceId: crypto.randomUUID(),
      status: "pending",
      sources,
      destination,
      sourceDirectory,
      outputPath,
      output,
      archive,
      totalBytes: totalSize,
      compressedBytes: 0,
      currentFile: "",
      ws: null,
      controller: new AbortController(),
    };

    activeCompressJobs.set(jobId, job);

    // Send jobId immediately so client can connect WebSocket
    res.status(202).json({ jobId });
  });

  // Endpoint to cancel a compress job
  router.post("/zip/compress/cancel", async (req, res) => {
    const { jobId } = req.body;
    if (!jobId || !activeCompressJobs.has(jobId)) {
      return res.status(404).json({ message: "Compression job not found." });
    }
    const job = activeCompressJobs.get(jobId);
    if (job.status === "pending" || job.status === "running") {
      job.status = "cancelled";
      if (job.archive) {
        job.archive.destroy();
      }
      if (await fse.pathExists(job.outputPath)) {
        console.log(
          `Compression job ${jobId} was cancelled. Deleting partial archive: ${job.outputPath}`
        );
        await fse.remove(job.outputPath);
      }
    }
    try {
      unregisterAllForJob(jobId, job);
    } catch (e) {}
    activeCompressJobs.delete(jobId);
    res
      .status(200)
      .json({ message: "Compression cancellation request received." });
  });

  // Endpoint to decompress an archive
  router.post("/zip/decompress", async (req, res) => {
    const { source, destination, itemsToExtract } = req.body;
    if (!source || !destination) {
      return res
        .status(400)
        .json({ message: "Source archive and destination path are required." });
    }

    let sourcePath;
    let zipFilePath = null;
    let filePathInZip = null;
    let isNestedZip = false;

    let fullSourcePath;

    if (typeof source === "string") {
      fullSourcePath = source;
    } else if (typeof source === "object" && source.path && source.name) {
      fullSourcePath = path.join(source.path, source.name);
    } else {
      return res
        .status(400)
        .json({ message: "Invalid source archive path provided." });
    }

    const zipPathMatch = matchZipPath(fullSourcePath);

    if (zipPathMatch) {
      zipFilePath = zipPathMatch[1];
      filePathInZip = zipPathMatch[2].startsWith("/")
        ? zipPathMatch[2].substring(1)
        : zipPathMatch[2];
      isNestedZip = filePathInZip !== "";
      sourcePath = fullSourcePath;
    } else {
      sourcePath = fullSourcePath;
    }

    const jobId = crypto.randomUUID();

    // If the client requested selective extraction, expand their hints into
    // exact zip entry names by scanning the archive. This allows callers to
    // pass basenames like "file.txt" or folder names and have the server
    // resolve the actual entry paths inside the zip.
    let filenamesToExtract = undefined;
    let preserveBasePath = false;

    if (Array.isArray(itemsToExtract) && itemsToExtract.length > 0) {
      preserveBasePath = true;
      // Determine a local file to scan: if this is a nested zip, extract the inner
      // zip to a temp file first, otherwise scan the zip file directly.
      let zipToScan = zipFilePath || sourcePath;
      const tempDirs = [];
      try {
        if (isNestedZip && zipFilePath && filePathInZip) {
          const tmpDir = fse.mkdtempSync(path.join(os.tmpdir(), "nested-zip-"));
          tempDirs.push(tmpDir);
          const tmpInnerZipPath = path.join(
            tmpDir,
            path.basename(filePathInZip)
          );
          const parentZip = await yauzl.open(zipFilePath);
          try {
            let entryFound = null;
            for await (const entry of parentZip) {
              if (entry.filename === filePathInZip) {
                entryFound = entry;
                break;
              }
            }
            if (!entryFound) {
              await parentZip.close();
              throw new Error(`Nested zip not found: ${filePathInZip}`);
            }
            const rs = await parentZip.openReadStream(entryFound);
            const ws = fse.createWriteStream(tmpInnerZipPath);
            await new Promise((resolve, reject) => {
              rs.pipe(ws);
              rs.on("end", resolve);
              rs.on("error", reject);
              ws.on("error", reject);
            });
            await parentZip.close();
            zipToScan = tmpInnerZipPath;
          } catch (e) {
            try {
              await parentZip.close();
            } catch (ee) {}
            for (const d of tempDirs) await fse.remove(d).catch(() => {});
            throw e;
          }
        }

        // Open the zip and collect all entry names
        const zipfileToScan = await yauzl.open(zipToScan);
        const allEntries = [];
        for await (const entry of zipfileToScan) {
          allEntries.push(entry.filename);
        }
        await zipfileToScan.close();

        const entrySet = new Set(allEntries);
        const expanded = new Set();

        for (const raw of itemsToExtract) {
          const hint = String(raw).replace(/\\/g, "/").replace(/^\//, "");

          // Exact entry match
          if (entrySet.has(hint)) {
            expanded.add(hint);
            continue;
          }

          // If the hint looks like a folder, match entries that start with it
          const folderHint = hint.endsWith("/") ? hint : `${hint}/`;
          for (const e of allEntries) {
            if (e.startsWith(folderHint)) {
              expanded.add(e);
            }
          }

          // Match by basename (e.g. user passed "file.txt" and entry is "some/path/file.txt")
          for (const e of allEntries) {
            if (path.posix.basename(e) === hint) {
              expanded.add(e);
            }
            // Also support entries that end with '/'+hint (same as basename but safer)
            if (e.endsWith(`/${hint}`)) {
              expanded.add(e);
            }
          }
        }

        filenamesToExtract = Array.from(expanded);
      } finally {
        // cleanup any temp dirs created for nested zip extraction
        try {
          for (const d of tempDirs || []) await fse.remove(d).catch(() => {});
        } catch (e) {}
      }
    }
    // Normalize overwrite preference from client and attach to job so websocket
    // handler can avoid prompting when an initial override is requested.
    // Accepts:
    //  - boolean: true -> overwrite_all, false -> skip_all
    //  - short strings: 'overwrite' | 'skip' (mapped to internal _all tokens)
    //  - server canonical tokens: 'if_newer', 'smaller_only', 'no_zero_length', 'size_differs', 'cancel'
    // Any other string will be passed through as-is so custom tokens remain possible.
    let initialOverwrite = undefined;
    if (typeof req.body.overwrite !== "undefined") {
      const ov = req.body.overwrite;
      if (typeof ov === "boolean") {
        initialOverwrite = ov ? "overwrite_all" : "skip_all";
      } else if (typeof ov === "string") {
        const s = ov.trim().toLowerCase();
        // Only map the clear short shorthands to their internal global forms.
        if (["overwrite", "true"].includes(s)) {
          initialOverwrite = "overwrite_all";
        } else if (["skip", "false"].includes(s)) {
          initialOverwrite = "skip_all";
        } else {
          // Pass through canonical server tokens (if provided) or unknown strings
          // The server's downstream logic already understands canonical names like
          // 'if_newer', 'smaller_only', 'no_zero_length', 'size_differs', 'cancel'.
          initialOverwrite = s;
        }
      }
    }

    const job = {
      id: jobId,
      _traceId: crypto.randomUUID(),
      status: "pending",
      source: sourcePath,
      destination,
      ws: null,
      zipfile: null,
      controller: new AbortController(),
      overwriteResolvers: [],
      isNestedZip,
      zipFilePath,
      filePathInZip,
      // allow client to enable server-side verbose logging for debugging
      verboseLogging: !!req.body.verboseLogging,
      filenamesToExtract:
        Array.isArray(filenamesToExtract) && filenamesToExtract.length > 0
          ? filenamesToExtract
          : undefined,
      // Also set `itemsToExtract` for compatibility with the websocket
      // decompress handler which checks `job.itemsToExtract`.
      itemsToExtract:
        Array.isArray(filenamesToExtract) && filenamesToExtract.length > 0
          ? filenamesToExtract
          : undefined,
      preserveBasePath:
        Array.isArray(filenamesToExtract) && filenamesToExtract.length > 0
          ? true
          : false,
      // If the client asked for an initial overwrite decision, store it here
      // so the websocket flow can honor it and skip prompting when possible.
      overwriteDecision:
        initialOverwrite !== undefined ? initialOverwrite : undefined,
    };
    activeDecompressJobs.set(jobId, job);
    res.status(202).json({ jobId });
  });

  // Endpoint to cancel a decompression
  router.post("/zip/decompress/cancel", (req, res) => {
    const { jobId } = req.body;
    if (!jobId || !activeDecompressJobs.has(jobId)) {
      // Return 200 for idempotent cancellation; job may already be finished
      return res
        .status(200)
        .json({ message: "Decompression job not found or already finished." });
    }
    const job = activeDecompressJobs.get(jobId);
    if (job.status === "pending" || job.status === "running") {
      job.status = "cancelled";
      job.controller.abort();
    }
    try {
      unregisterAllForJob(jobId, job);
    } catch (e) {}
    activeDecompressJobs.delete(jobId);
    res.status(200).json({ message: "Cancellation request received." });
  });

  // Endpoint to test an archive
  router.post("/zip/archive-test", (req, res) => {
    const { source } = req.body;
    if (!source) {
      return res.status(400).json({ message: "Source archive is required." });
    }

    let sourcePath;
    if (typeof source === "string") {
      sourcePath = source;
    } else if (typeof source === "object" && source.path && source.name) {
      sourcePath = path.join(source.path, source.name);
    } else {
      return res
        .status(400)
        .json({ message: "Invalid source archive path provided." });
    }

    const jobId = crypto.randomUUID();
    const job = {
      id: jobId,
      _traceId: crypto.randomUUID(),
      status: "pending",
      source: sourcePath,
      ws: null,
      zipfile: null,
      controller: new AbortController(),
      overwriteResolvers: [],
    };
    activeArchiveTestJobs.set(jobId, job);
    res.status(202).json({ jobId });
  });

  // Endpoint to cancel an archive test
  router.post("/zip/archive-test/cancel", (req, res) => {
    const { jobId } = req.body;
    if (!jobId || !activeArchiveTestJobs.has(jobId)) {
      return res.status(404).json({ message: "Archive test job not found." });
    }
    const job = activeArchiveTestJobs.get(jobId);
    if (job.status === "pending" || job.status === "running") {
      job.status = "cancelled";
      if (job.zipfile) {
        job.zipfile.close();
      }
    }
    try {
      unregisterAllForJob(jobId, job);
    } catch (e) {}
    activeArchiveTestJobs.delete(jobId);
    res.status(200).json({ message: "Cancellation request received." });
  });

  return router;
}
