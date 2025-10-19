import mediaRoutes from "./mediaRoutes.js";
import configRoutes from "./configRoutes.js";
import createFileRoutes from "./fileRoutes.js";

export default function initializeRoutes(
  app,
  activeCopyJobs,
  activeSizeJobs,
  activeCompressJobs,
  activeDecompressJobs,
  activeArchiveTestJobs,
  activeDuplicateJobs,
  activeCopyPathsJobs,
  activeZipOperations
) {
  // File routes need access to the in-memory job stores
  const fileRouter = createFileRoutes(
    activeCopyJobs,
    activeSizeJobs,
    activeCompressJobs,
    activeDecompressJobs,
    activeArchiveTestJobs,
    activeDuplicateJobs,
    activeCopyPathsJobs,
    activeZipOperations
  );

  app.use("/api", mediaRoutes);
  app.use("/api", configRoutes);
  app.use("/api", fileRouter);
}
