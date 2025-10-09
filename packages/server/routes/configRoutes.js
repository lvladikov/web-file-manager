import express from "express";
import { readConfig, writeConfig } from "../lib/config.js";

const router = express.Router();

router.post("/layout", async (req, res) => {
  const { columnWidths } = req.body;
  if (!columnWidths) {
    return res.status(400).json({ message: "Column widths are required." });
  }
  const config = await readConfig();
  config.columnWidths = columnWidths;
  await writeConfig(config);
  res.status(200).json({ message: "Layout saved successfully." });
});

router.get("/layout", async (req, res) => {
  const config = await readConfig();
  res.json(config.columnWidths);
});

router.get("/paths", async (req, res) => {
  const config = await readConfig();
  res.json(config.paths);
});

router.post("/paths", async (req, res) => {
  const { left, right } = req.body;
  if (!left || !right) {
    return res
      .status(400)
      .json({ message: "Both left and right paths are required." });
  }
  const config = await readConfig();
  config.paths = { left, right };
  await writeConfig(config);
  res.status(200).json({ message: "Paths saved successfully." });
});

router.get("/favourites", async (req, res) => {
  const config = await readConfig();
  res.json(config.favourites || []);
});

router.post("/favourites", async (req, res) => {
  const { path: newPath } = req.body;
  if (!newPath) return res.status(400).json({ message: "Path is required." });
  const config = await readConfig();
  if (!config.favourites.includes(newPath)) {
    config.favourites.push(newPath);
    await writeConfig(config);
  }
  res.json(config.favourites);
});

router.delete("/favourites", async (req, res) => {
  const { path: pathToRemove } = req.body;
  if (!pathToRemove)
    return res.status(400).json({ message: "Path is required." });
  const config = await readConfig();
  config.favourites = config.favourites.filter((p) => p !== pathToRemove);
  await writeConfig(config);
  res.json(config.favourites);
});

router.get("/config/auto-load-lyrics", async (req, res) => {
  const config = await readConfig();
  res.json({ autoLoadLyrics: config.autoLoadLyrics || false });
});

router.post("/config/auto-load-lyrics", async (req, res) => {
  const { autoLoadLyrics } = req.body;
  if (typeof autoLoadLyrics !== "boolean") {
    return res
      .status(400)
      .json({ message: "A boolean 'autoLoadLyrics' value is required." });
  }
  try {
    const config = await readConfig();
    config.autoLoadLyrics = autoLoadLyrics;
    await writeConfig(config);
    res.status(200).json({ message: "Setting saved." });
  } catch (error) {
    res.status(500).json({ message: "Failed to save setting." });
  }
});

export default router;
