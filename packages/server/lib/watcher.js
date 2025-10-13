import chokidar from "chokidar";
import { EventEmitter } from "events";

class Watcher extends EventEmitter {
  constructor() {
    super();
    this.watchers = new Map();
  }

  watch(path) {
    if (this.watchers.has(path)) {
      return;
    }

    const watcher = chokidar.watch(path, {
      depth: 0,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    watcher.on("all", (event, changedPath) => {
      this.emit("change", { path, event, changedPath });
    });

    this.watchers.set(path, watcher);
  }

  unwatch(path) {
    const watcher = this.watchers.get(path);
    if (watcher) {
      watcher.close();
      this.watchers.delete(path);
    }
  }
}

export default new Watcher();
