/**
 * FM (File Manager) Console API
 * Main entry point - acts as an index/proxy to all FM modules
 */

import pkg from "../package.json";
import { createFMMethods } from "./fm/methods.js";
import { attachFMProperties } from "./fm/properties.js";
import { createHelpFunction } from "./fm/help.js";
import { attachFMToWindow as attachFn } from "./fm/attach.js";

// FM is a callable function that can be used as both a function and namespace.
function FM() {
  return `${pkg.name} - version ${pkg.version}`;
}

// Attach all methods to FM
const methods = createFMMethods(FM);
Object.assign(FM, methods);

// Attach properties (includes toString and Symbol.toPrimitive)
attachFMProperties(FM);

// Attach help function (must be after methods and properties are attached)
FM.help = createHelpFunction(FM);

export default FM;
// Export a wrapper that binds the FM object into the attach function so callers
// can just call `attachFMToWindow()` without worrying about passing `FM`.
export function attachFMToWindow() {
  try {
    attachFn(FM);
  } catch (e) {
    // noop - don't fail the app if console helper attach fails
  }
}
