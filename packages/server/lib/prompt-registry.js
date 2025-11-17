const promptResolverRegistry = new Map();

// Helper to create an instrumented Map for overwrite resolvers on a job
function createInstrumentedResolversMap(job) {
  const internal = new Map();
  const proxy = new Proxy(internal, {
    get(target, prop) {
      if (prop === "set") {
        return function (key, value) {
          console.log(
            `[prompt-registry] [map] set ${key} for job ${job?.id} trace=${
              job?._traceId ?? "n/a"
            }`
          );
          const result = internal.set(key, value);
          try {
            registerPromptResolver(key, job?.id, value);
            // Also annotate metadata where available from the call site: job/trace may provide context
            try {
              registerPromptMeta(key, {
                jobId: job?.id,
                trace: job?._traceId ?? null,
              });
            } catch (e) {
              /* ignore */
            }
          } catch (e) {
            /* ignore */
          }
          return result;
        };
      }
      if (prop === "delete") {
        return function (key) {
          console.log(
            `[prompt-registry] [map] delete ${key} for job ${job?.id} trace=${
              job?._traceId ?? "n/a"
            }`
          );
          try {
            unregisterPromptResolver(key);
          } catch (e) {
            /* ignore */
          }
          return internal.delete(key);
        };
      }
      if (prop === "clear") {
        return function () {
          console.log(
            `[prompt-registry] [map] clear for job ${job?.id} trace=${
              job?._traceId ?? "n/a"
            }`
          );
          try {
            unregisterAllForJob(job?.id, job);
          } catch (e) {
            /* ignore */
          }
          return internal.clear();
        };
      }
      // Bind common Map methods to the internal map so that 'this' checks inside
      // Map.prototype methods operate on the real internal Map when called via proxy (eg. map.has(key)).
      const val = Reflect.get(target, prop);
      if (typeof val === "function") {
        // don't re-bind our wrapped methods for set, delete, clear
        if (prop === "set" || prop === "delete" || prop === "clear") return val;
        return val.bind(internal);
      }
      return Reflect.get(target, prop);
    },
  });
  // Mark proxy for detection
  proxy.__isInstrumented = true;
  return proxy;
}

function ensureInstrumentedResolversMap(job) {
  if (!job) return;
  if (
    !job.overwriteResolversMap ||
    !job.overwriteResolversMap.__isInstrumented
  ) {
    // If there's a plain Map with existing entries, wrap and copy
    const existing =
      job.overwriteResolversMap instanceof Map
        ? job.overwriteResolversMap
        : undefined;
    const wrapped = createInstrumentedResolversMap(job);
    if (existing) {
      for (const [k, v] of existing.entries()) {
        wrapped.set(k, v);
      }
    }
    job.overwriteResolversMap = wrapped;
    console.log(
      `[prompt-registry] Instrumented job.overwriteResolversMap for job ${
        job?.id
      } trace=${job?._traceId ?? "n/a"}`
    );
  }
}

function registerPromptResolver(promptId, jobId, resolver) {
  if (!promptId) return;
  if (promptResolverRegistry.has(promptId)) {
    console.log(
      `[prompt-registry] register called for existing prompt ${promptId}, skipping`
    );
    return;
  }
  promptResolverRegistry.set(promptId, {
    jobId,
    resolver,
    meta: undefined,
    createdAt: Date.now(),
  });
  console.log(
    `[prompt-registry] Registered prompt ${promptId} for job ${jobId}`
  );
}

function registerPromptMeta(promptId, meta) {
  if (!promptId || !meta) return;
  const entry = promptResolverRegistry.get(promptId);
  if (!entry) return;
  entry.meta = { ...entry.meta, ...meta };
  console.log(
    `[prompt-registry] register meta for ${promptId}: ${JSON.stringify(
      entry.meta
    )}`
  );
}

function unregisterPromptResolver(promptId) {
  if (!promptId) return;
  if (!promptResolverRegistry.has(promptId)) return;
  promptResolverRegistry.delete(promptId);
  console.log(`[prompt-registry] Unregistered prompt ${promptId}`);
}

function getAndRemovePromptResolver(promptId) {
  if (!promptId) return undefined;
  const entry = promptResolverRegistry.get(promptId);
  if (!entry) return undefined;
  promptResolverRegistry.delete(promptId);
  console.log(
    `[prompt-registry] getAndRemove for prompt ${promptId}, registeredJob=${
      entry.jobId
    }, createdAt=${new Date(entry.createdAt).toISOString()}, remaining count=${
      promptResolverRegistry.size
    }`
  );
  return entry;
}

function getPromptResolver(promptId) {
  if (!promptId) return undefined;
  return promptResolverRegistry.get(promptId);
}
function countRegistry() {
  return promptResolverRegistry.size;
}

function unregisterAllForJob(jobId, jobObj) {
  if (!jobId) return;
  const keysToDelete = [];
  for (const [k, v] of promptResolverRegistry.entries()) {
    if (v && v.jobId === jobId) keysToDelete.push(k);
  }
  keysToDelete.forEach((k) => {
    promptResolverRegistry.delete(k);
    console.log(
      `[prompt-registry] Unregistered prompt ${k} for job ${jobId} via unregisterAllForJob`
    );
  });
  // Also clear job timers if provided
  try {
    if (jobObj && jobObj._promptTimers) {
      for (const t of jobObj._promptTimers.values()) {
        try {
          clearTimeout(t);
        } catch (e) {}
      }
      jobObj._promptTimers.clear();
    }
  } catch (e) {}
}

export {
  registerPromptResolver,
  unregisterPromptResolver,
  getAndRemovePromptResolver,
  getPromptResolver,
  unregisterAllForJob,
  ensureInstrumentedResolversMap,
  countRegistry,
  registerPromptMeta,
};
