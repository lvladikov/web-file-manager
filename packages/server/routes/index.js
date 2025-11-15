import mediaRoutes from "./mediaRoutes.js";
import configRoutes from "./configRoutes.js";
import createZipRoutes from "./zipRoutes.js";
import createFileSystemRoutes from "./fileSystemRoutes.js";
import createCopyRoutes from "./copyRoutes.js";
import createSearchRoutes from "./searchRoutes.js";
import createSizeRoutes from "./sizeRoutes.js";
import terminalRoutes from "./terminalRoutes.js";

export default function initializeRoutes(
  app,
  activeCopyJobs,
  activeSizeJobs,
  activeCompressJobs,
  activeDecompressJobs,
  activeArchiveTestJobs,
  activeDuplicateJobs,
  activeCopyPathsJobs,
  activeZipOperations,
  activeTerminalJobs
) {
  // Create and mount the split routers (zip, filesystem, copy, search, compress, size)
  const zipRouter = createZipRoutes(
    activeZipOperations,
    activeCompressJobs,
    activeDecompressJobs,
    activeArchiveTestJobs
  );
  const fileSystemRouter = createFileSystemRoutes(
    activeCopyJobs,
    activeZipOperations,
    activeDuplicateJobs
  );
  const copyRouter = createCopyRoutes(
    activeCopyJobs,
    activeDuplicateJobs,
    activeCopyPathsJobs
  );
  const searchRouter = createSearchRoutes();
  const sizeRouter = createSizeRoutes(activeSizeJobs);

  const terminalRouter = terminalRoutes(activeTerminalJobs);

  app.use("/api", mediaRoutes);
  app.use("/api", configRoutes);
  app.use("/api", zipRouter);
  app.use("/api", fileSystemRouter);
  app.use("/api", copyRouter);
  app.use("/api", searchRouter);
  app.use("/api", sizeRouter);
  app.use("/api", terminalRouter);
}
