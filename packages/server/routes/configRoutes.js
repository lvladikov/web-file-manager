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
  // Bypass protection to allow intentional removal of all favourites
  await writeConfig(config, { bypassProtection: true });
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

// Multi-rename combos
router.get("/config/multi-rename-combos", async (req, res) => {
  const config = await readConfig();
  res.json(config.multiRenameCombos || []);
});

router.post("/config/multi-rename-combos", async (req, res) => {
  const { name, operations } = req.body;
  if (!name || !Array.isArray(operations)) {
    return res
      .status(400)
      .json({ message: "Both 'name' and 'operations' array are required." });
  }
  try {
    const config = await readConfig();
    config.multiRenameCombos = config.multiRenameCombos || [];

    // If a combo with the same name exists, replace it; otherwise append
    const existingIndex = config.multiRenameCombos.findIndex(
      (c) => c.name === name
    );
    const newCombo = { name, operations };
    if (existingIndex !== -1) {
      config.multiRenameCombos[existingIndex] = newCombo;
    } else {
      config.multiRenameCombos.push(newCombo);
    }

    await writeConfig(config);
    res
      .status(200)
      .json({
        message: "Saved multi-rename combo.",
        combos: config.multiRenameCombos,
      });
  } catch (error) {
    console.error("[config] Failed to save multi-rename combo:", error);
    res.status(500).json({ message: "Failed to save combo." });
  }
});

router.delete("/config/multi-rename-combos", async (req, res) => {
  // Expect { name } in body to remove a saved combo
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: "Name is required." });

  try {
    const config = await readConfig();
    config.multiRenameCombos = (config.multiRenameCombos || []).filter(
      (c) => c.name !== name
    );
    await writeConfig(config, { bypassProtection: true });
    res
      .status(200)
      .json({ message: "Removed combo.", combos: config.multiRenameCombos });
  } catch (err) {
    console.error("[config] Failed to remove multi-rename combo:", err);
    res.status(500).json({ message: "Failed to remove combo." });
  }
});

// Export full settings
router.get("/config/export", async (req, res) => {
  try {
    const config = await readConfig();
    res.json(config);
  } catch (error) {
    console.error("[config] Failed to export settings:", error);
    res.status(500).json({ message: "Failed to export settings." });
  }
});

// Import full settings
router.post("/config/import", async (req, res) => {
  const importedConfig = req.body;
  
  if (!importedConfig || typeof importedConfig !== "object") {
    return res.status(400).json({ message: "Valid config object is required." });
  }
  
  try {
    // Validate that the imported config has the expected structure
    const validatedConfig = {
      favourites: Array.isArray(importedConfig.favourites) ? importedConfig.favourites : [],
      paths: importedConfig.paths || { left: "", right: "" },
      columnWidths: importedConfig.columnWidths || {
        left: { size: 96, modified: 160 },
        right: { size: 96, modified: 160 },
      },
      autoLoadLyrics: typeof importedConfig.autoLoadLyrics === "boolean" ? importedConfig.autoLoadLyrics : false,
      multiRenameCombos: Array.isArray(importedConfig.multiRenameCombos) ? importedConfig.multiRenameCombos : [],
    };
    
    // Write the validated config, bypassing protection since this is an intentional full replacement
    await writeConfig(validatedConfig, { bypassProtection: true });
    
    res.status(200).json({ 
      message: "Settings imported successfully.",
      config: validatedConfig
    });
  } catch (error) {
    console.error("[config] Failed to import settings:", error);
    res.status(500).json({ message: "Failed to import settings." });
  }
});

export default router;
