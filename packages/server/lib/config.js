import path from "path";
import fse from "fs-extra";
import os from "os";

import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(__dirname, "..", "config.json");

const readConfig = async () => {
  const defaultConfig = {
    favourites: [],
    paths: { left: os.homedir(), right: os.homedir() },
    columnWidths: {
      left: { size: 96, modified: 160 }, // Default widths (px)
      right: { size: 96, modified: 160 },
    },
    autoLoadLyrics: false,
    // Saved multi-rename operation combos
    multiRenameCombos: [],
  };
  try {
    await fse.access(configPath);
    const data = await fse.readFile(configPath, "utf-8");
    const config = JSON.parse(data);
    // Merge saved config with defaults to ensure all keys exist
    return {
      ...defaultConfig,
      ...config,
      paths: { ...defaultConfig.paths, ...config.paths },
      columnWidths: { ...defaultConfig.columnWidths, ...config.columnWidths },
    };
  } catch (error) {
    return defaultConfig;
  }
};

const writeConfig = async (config, options = {}) => {
  const { bypassProtection = false } = options;

  // Safety check: prevent overwriting existing config with empty/default values
  // unless explicitly bypassed (e.g., when intentionally removing all favourites)
  if (!bypassProtection) {
    try {
      await fse.access(configPath);
      const existingData = await fse.readFile(configPath, "utf-8");
      const existingConfig = JSON.parse(existingData);

      // If existing config has favourites but new config doesn't, warn and prevent overwrite
      if (
        existingConfig.favourites &&
        existingConfig.favourites.length > 0 &&
        (!config.favourites || config.favourites.length === 0)
      ) {
        console.warn(
          "[Config] Prevented overwriting existing favourites with empty array"
        );
        console.warn(
          "[Config] Existing favourites count:",
          existingConfig.favourites.length
        );
        console.warn("[Config] Merging favourites from existing config");
        // Preserve existing favourites
        config.favourites = existingConfig.favourites;
      }
    } catch (error) {
      // File doesn't exist yet, safe to write
    }
  }

  await fse.writeFile(configPath, JSON.stringify(config, null, 2));
};

export { readConfig, writeConfig };
