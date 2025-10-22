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

const writeConfig = async (config) => {
  await fse.writeFile(configPath, JSON.stringify(config, null, 2));
};

export { readConfig, writeConfig };
