const { contextBridge } = require("electron");

// Expose limited APIs to the renderer process
contextBridge.exposeInMainWorld("electron", {
  app: {
    getVersion: () => "1.1.0",
  },
});
