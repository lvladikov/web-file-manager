import express from "express";
import fse from "fs-extra";
import path from "path";
import { getFileType, matchZipPath } from "../lib/utils.js";

export default function createSearchRoutes() {
  const router = express.Router();

  router.post("/search", async (req, res) => {
    const { basePath, query, options = {} } = req.body || {};
    if (!basePath) {
      return res.status(400).json({ message: "Base path is required." });
    }

    const resolvedBasePath = path.resolve(basePath);
    if (matchZipPath(resolvedBasePath)) {
      return res
        .status(400)
        .json({ message: "Search inside archives is not supported." });
    }

    let stats;
    try {
      stats = await fse.stat(resolvedBasePath);
      if (!stats.isDirectory()) {
        return res
          .status(400)
          .json({ message: "Base path must be a directory." });
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        return res
          .status(404)
          .json({ message: `Path does not exist: ${resolvedBasePath}` });
      }
      console.error("Error inspecting base path for search:", error);
      return res.status(500).json({ message: "Error preparing search." });
    }

    const contentSearchOptions = options.contentSearch || {};
    const contentSearchEnabled = !!contentSearchOptions.enabled;
    const contentQuery = (contentSearchOptions.query || "").trim();
    if (contentSearchEnabled && !contentQuery) {
      return res
        .status(400)
        .json({ message: "Content query cannot be empty." });
    }
    const contentMatchCase = !!contentSearchOptions.matchCase;
    const contentUseRegex = !!contentSearchOptions.useRegex;
    const stopAtFirstMatch = !!contentSearchOptions.stopAtFirstMatch;
    const wholeWords = !!contentSearchOptions.wholeWords;
    const ignoreNonTextFiles =
      contentSearchOptions.ignoreNonTextFiles !== false;

    const includeHidden = !!options.includeHidden;
    const includeSubfolders =
      options.includeSubfolders === undefined
        ? true
        : !!options.includeSubfolders;
    const useRegex = !!options.useRegex;
    const caseSensitive = !!options.caseSensitive;

    const trimmedQuery = (query || "").trim();
    const hasFilenameQuery = trimmedQuery.length > 0;
    if (!hasFilenameQuery && !(contentSearchEnabled && contentQuery)) {
      return res.status(400).json({ message: "Search query cannot be empty." });
    }

    const effectiveFilenameQuery = hasFilenameQuery ? trimmedQuery : "*";
    const filenameUseRegex = hasFilenameQuery ? useRegex : false;

    const escapeSegment = (segment) =>
      segment.replace(/[-[\\]{}()+?.\\^$|]/g, "\\$&");

    const buildPattern = (value) =>
      value.split("*").map(escapeSegment).join(".*");

    let matcher;
    try {
      const flags = caseSensitive ? "" : "i";
      matcher = filenameUseRegex
        ? new RegExp(trimmedQuery, flags)
        : new RegExp(buildPattern(effectiveFilenameQuery), flags);
    } catch (error) {
      return res.status(400).json({ message: "Invalid regular expression." });
    }

    const textLikeTypes = new Set([
      "text",
      "code",
      "markdown",
      "config",
      "log",
      "xml",
      "json",
      "html",
      "css",
      "javascript",
      "typescript",
      "python",
      "shell",
      "sql",
      "yaml",
      "docker",
      "git",
      "properties",
      "editorconfig",
    ]);

    const isTextLike = (fileType) => textLikeTypes.has(fileType);

    let contentMatcher = null;
    if (contentSearchEnabled) {
      try {
        let pattern = contentUseRegex
          ? contentQuery
          : buildPattern(contentQuery);
        if (wholeWords) {
          pattern = contentUseRegex ? `(?:${pattern})` : pattern;
          pattern = `\\b${pattern}\\b`;
        }
        const flags = contentMatchCase ? "m" : "mi";
        contentMatcher = new RegExp(pattern, flags);
      } catch (error) {
        return res
          .status(400)
          .json({ message: "Invalid content regular expression." });
      }
    }

    const visitedDirs = new Set();
    const groups = new Map();
    let firstContentMatchFound = false;

    const addMatch = (folderPath, entry) => {
      const normalizedFolder = path.resolve(folderPath);
      if (!groups.has(normalizedFolder)) {
        groups.set(normalizedFolder, []);
      }
      groups.get(normalizedFolder).push(entry);
      if (stopAtFirstMatch && contentSearchEnabled && entry.type !== "folder") {
        firstContentMatchFound = true;
      }
    };

    const matchesContentSearch = async (entryPath, entryStats, entryType) => {
      if (!contentSearchEnabled) return true;
      if (!entryStats.isFile()) return false;
      if (ignoreNonTextFiles && !isTextLike(entryType)) return false;
      if (!contentMatcher) return true;
      try {
        const content = await fse.readFile(entryPath, "utf8");
        return contentMatcher.test(content);
      } catch (error) {
        return false;
      }
    };

    const traverseDirectory = async (directory) => {
      if (stopAtFirstMatch && firstContentMatchFound) return;
      let realDir;
      try {
        realDir = await fse.realpath(directory);
      } catch (error) {
        return;
      }
      if (visitedDirs.has(realDir)) return;
      visitedDirs.add(realDir);

      let entries;
      try {
        entries = await fse.readdir(directory, { withFileTypes: true });
      } catch (error) {
        console.error(
          `Failed to read directory during search: ${directory}`,
          error.message
        );
        return;
      }

      for (const entry of entries) {
        if (stopAtFirstMatch && firstContentMatchFound) break;
        if (entry.name === "." || entry.name === "..") continue;
        const entryPath = path.join(directory, entry.name);
        let entryStats;
        try {
          entryStats = await fse.stat(entryPath);
        } catch (error) {
          continue;
        }

        const isHidden = entry.name.startsWith(".");
        if (!includeHidden && isHidden) continue;

        const entryType = entryStats.isDirectory()
          ? "folder"
          : getFileType(entry.name, false);

        const nameMatches = matcher.test(entry.name);
        const contentMatches = await matchesContentSearch(
          entryPath,
          entryStats,
          entryType
        );
        if (nameMatches && contentMatches) {
          addMatch(directory, {
            name: entry.name,
            type: entryType,
            size: entryStats.isFile() ? entryStats.size : null,
            modified: entryStats.mtime.toISOString(),
            fullPath: entryPath,
          });
        }

        if (includeSubfolders && entryStats.isDirectory()) {
          await traverseDirectory(entryPath);
        }
      }
    };

    try {
      await traverseDirectory(resolvedBasePath);
    } catch (error) {
      console.error("Error during search traversal:", error);
      return res.status(500).json({ message: "Error executing search." });
    }

    const sortedGroups = Array.from(groups.entries())
      .map(([folder, items]) => ({
        folder,
        items: items.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.folder.localeCompare(b.folder));

    res.json({
      basePath: resolvedBasePath,
      groups: sortedGroups,
    });
  });

  return router;
}
