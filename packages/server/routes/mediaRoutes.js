import express from "express";
import fse from "fs-extra";
import path from "path";
import { spawn } from "child_process";
import { parseFile } from "music-metadata";
import { getMimeType, getZipFileStream, matchZipPath } from "../lib/utils.js";
import os from "os";

const router = express.Router();

// Endpoint to stream an image file for preview
router.get("/image-preview", async (req, res) => {
  const { path: filePath } = req.query;
  if (!filePath) {
    return res.status(400).json({ error: "File path is required" });
  }
  try {
    if (!(await fse.pathExists(filePath))) {
      return res.status(404).json({ error: "Image not found" });
    }
    const stats = await fse.stat(filePath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: "Path is not a file" });
    }

    res.setHeader("Content-Type", `image/${path.extname(filePath).slice(1)}`);
    fse.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error("Image preview error:", error);
    res.status(500).json({ error: "Could not serve image" });
  }
});

// Endpoint to stream media files (video/audio) with support for Range requests
router.get("/media-stream", async (req, res) => {
  const { path: filePath } = req.query;
  if (!filePath) {
    return res.status(400).json({ error: "File path is required" });
  }

  try {
    const stats = await fse.stat(filePath);
    const fileSize = stats.size;
    const range = req.headers.range;
    const mimeType = getMimeType(filePath);

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fse.createReadStream(filePath, { start, end });
      const head = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": mimeType,
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        "Content-Length": fileSize,
        "Content-Type": mimeType,
      };
      res.writeHead(200, head);
      fse.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    console.error("Media stream error:", error);
    res.status(500).json({ error: "Could not serve media" });
  }
});

// Endpoint to find cover art for an audio file
router.get("/audio-cover", async (req, res) => {
  const { path: audioFilePath } = req.query;
  if (!audioFilePath) {
    return res.status(400).json({ error: "File path is required" });
  }

  try {
    const dir = path.dirname(audioFilePath);
    const coverNames = [
      "cover.jpg",
      "cover.jpeg",
      "cover.png",
      "cover.gif",
      "cover.webp",
    ];

    for (const name of coverNames) {
      const coverPath = path.join(dir, name);
      if (await fse.pathExists(coverPath)) {
        return res.json({ coverPath });
      }
    }

    return res.status(404).json({ message: "Cover art not found." });
  } catch (error) {
    console.error("Error finding cover art:", error);
    res
      .status(500)
      .json({ error: "Server error while searching for cover art." });
  }
});

// Endpoint to transcode and stream incompatible videos
router.get("/video-transcode", (req, res) => {
  const { path: filePath } = req.query;
  if (!filePath || !fse.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.contentType("video/mp4");

  const ffmpegArgs = [
    "-analyzeduration",
    "20M",
    "-probesize",
    "20M",
    "-i",
    filePath,
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-movflags",
    "frag_keyframe+empty_moov",
    "-f",
    "mp4",
    "pipe:1",
  ];

  const ffmpegProcess = spawn("ffmpeg", ffmpegArgs);
  ffmpegProcess.stdout.pipe(res);
  ffmpegProcess.stderr.on("data", (data) => {
    console.error(`FFmpeg stderr: ${data}`);
  });
  ffmpegProcess.on("close", (code) => {
    if (code !== 0) {
      console.log(`FFmpeg process exited with code ${code}`);
    }
    res.end();
  });
  res.on("close", () => {
    console.log("Client disconnected, killing ffmpeg process.");
    ffmpegProcess.kill();
  });
});

// Endpoint to safely get the content of a text file
router.get("/text-content", async (req, res) => {
  const { path: filePath } = req.query;
  if (!filePath) {
    return res.status(400).json({ error: "File path is required" });
  }
  try {
    const content = await fse.readFile(filePath, "utf-8");
    res.setHeader("Content-Type", "text/plain");
    res.send(content);
  } catch (error) {
    console.error("Text content error:", error);
    res.status(500).json({ error: "Could not read file" });
  }
});

// Endpoint to get track metadata
router.get("/track-info", async (req, res) => {
  const { path: filePath } = req.query;
  if (!filePath) {
    return res.status(400).json({ message: "File path is required." });
  }

  let actualFilePath = filePath;
  let tempFilePath = null;

  try {
    const zipPathMatch = matchZipPath(filePath);

    if (zipPathMatch) {
      const zipFilePath = zipPathMatch[1];
      const filePathInZip = zipPathMatch[2].startsWith("/")
        ? zipPathMatch[2].substring(1)
        : zipPathMatch[2];

      // Create a temporary file to extract the audio for metadata parsing
      tempFilePath = path.join(
        fse.mkdtempSync(path.join(os.tmpdir(), "zip-audio-")),
        path.basename(filePathInZip)
      );
      const writeStream = fse.createWriteStream(tempFilePath);
      const readStream = await getZipFileStream(zipFilePath, filePathInZip);
      await new Promise((resolve, reject) => {
        readStream.pipe(writeStream);
        readStream.on("end", resolve);
        readStream.on("error", reject);
        writeStream.on("error", reject);
      });
      actualFilePath = tempFilePath;
    }

    const metadata = await parseFile(actualFilePath);
    const { artist, title } = metadata.common;

    if (!artist || !title) {
      return res
        .status(404)
        .json({ message: "Artist or title metadata not found in file." });
    }

    res.json({ artist, title });
  } catch (error) {
    console.error(`Metadata parsing error for ${filePath}:`, error.message);
    res.status(500).json({ message: "Failed to read audio file metadata." });
  } finally {
    if (tempFilePath) {
      await fse.remove(path.dirname(tempFilePath)); // Remove the temporary directory
    }
  }
});

// Endpoint to fetch lyrics
router.get("/lyrics", async (req, res) => {
  const { artist, title } = req.query;

  if (!artist || !title) {
    return res.status(400).json({ message: "Artist and title are required." });
  }

  try {
    const apiUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(
      artist
    )}/${encodeURIComponent(title)}`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      if (response.status === 404) {
        return res
          .status(404)
          .json({ message: "Sorry, lyrics for this song could not be found." });
      }
      throw new Error(`Lyrics API responded with status: ${response.status}`);
    }

    const data = await response.json();
    if (!data.lyrics || data.lyrics.trim() === "") {
      return res
        .status(404)
        .json({ message: "Sorry, lyrics for this song could not be found." });
    }

    const formattedLyrics = data.lyrics.replace(/(?:\r\n?|\n)+/g, (match) => {
      return /^(\r\n?|\n)$/.test(match) ? "\r\n" : "\r\n\r\n";
    });

    res.json({ lyrics: formattedLyrics });
  } catch (error) {
    console.error("Error fetching lyrics:", error.message);
    res
      .status(500)
      .json({ message: "Failed to fetch lyrics from the provider." });
  }
});

export default router;
