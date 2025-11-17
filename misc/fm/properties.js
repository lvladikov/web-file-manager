/**
 * FM (File Manager) console API properties
 * Defines read-only properties for the FM object
 */

import pkg from "../../package.json";
import FM_META from "./meta.json";
import { detectBuildType } from "./utils.js";

/**
 * Attaches properties to the FM object
 * @param {Object} FM - The FM object to attach properties to
 */
function attachFMProperties(FM) {
  // Attach metadata for introspection / help
  try {
    Object.defineProperty(FM, "_meta", {
      value: FM_META,
      enumerable: false,
      configurable: true,
      writable: false,
    });
  } catch (e) {
    FM._meta = FM_META;
  }

  // Attempt to expose read-only properties
  try {
    Object.defineProperty(FM, "name", {
      value: pkg.name,
      enumerable: true,
      configurable: true,
      writable: false,
    });
  } catch (e) {
    try {
      Object.defineProperty(FM, "packageName", {
        value: pkg.name,
        enumerable: true,
      });
    } catch (err) {}
  }

  try {
    Object.defineProperty(FM, "version", {
      value: pkg.version,
      enumerable: true,
      configurable: true,
      writable: false,
    });
  } catch (e) {
    try {
      Object.defineProperty(FM, "pkgVersion", {
        value: pkg.version,
        enumerable: true,
      });
    } catch (err) {}
  }

  try {
    Object.defineProperty(FM, "buildType", {
      value: detectBuildType(),
      enumerable: true,
      configurable: true,
      writable: false,
    });
  } catch (e) {
    try {
      Object.defineProperty(FM, "build", {
        value: detectBuildType(),
        enumerable: true,
      });
    } catch (err) {}
  }

  // Add toString and toPrimitive methods
  FM.toString = function () {
    return FM();
  };

  FM[Symbol.toPrimitive] = function () {
    return FM();
  };
}

export { attachFMProperties };
