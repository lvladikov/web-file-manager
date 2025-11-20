import { useState, useCallback } from "react";
import { testArchive, cancelArchiveTest } from "../lib/api";
import { truncatePath, isVerboseLogging } from "../lib/utils";

const useArchiveIntegrityTest = ({
  activePanel,
  panels,
  selections,
  setError,
  wsRef,
  filter,
  filteredItems,
}) => {
  const [archiveTestProgress, setArchiveTestProgress] = useState({
    isVisible: false,
    jobId: null,
    currentFile: "",
    totalFiles: 0,
    testedFiles: 0,
    totalArchives: 0,
    testedArchives: 0,
    reports: [], // Array to store reports for each archive
    errors: [], // Array to store errors for each archive
    currentArchiveName: "",
  });

  const handleCancelArchiveTest = () => {
    if (archiveTestProgress.jobId) {
      cancelArchiveTest(archiveTestProgress.jobId);
    }
    // Reset the modal state completely on cancellation
    setArchiveTestProgress({
      isVisible: false,
      jobId: null,
      currentFile: "",
      totalFiles: 0,
      testedFiles: 0,
      totalArchives: 0,
      testedArchives: 0,
      reports: [],
      errors: [],
      currentArchiveName: "",
    });
  };

  const closeArchiveTestModal = () => {
    setArchiveTestProgress((prev) => ({ ...prev, isVisible: false }));
  };

  const handleTestArchive = useCallback(async () => {
    try {
      if (isVerboseLogging())
        console.log(
          "[useArchiveIntegrityTest] Starting archive integrity tests"
        );
    } catch (e) {}
    const sourcePanelId = activePanel;

    const itemsToConsider = filter[sourcePanelId].pattern
      ? filteredItems[sourcePanelId]
      : panels[sourcePanelId].items;

    const itemsToTest = [...selections[sourcePanelId]]
      .map((itemName) => itemsToConsider.find((item) => item.name === itemName))
      .filter(Boolean)
      .filter((item) => item.type === "archive"); // Only consider archive files

    if (itemsToTest.length === 0) {
      setError("No archive files selected for testing.");
      return;
    }

    setArchiveTestProgress((prev) => ({
      ...prev,
      isVisible: true,
      totalArchives: itemsToTest.length,
      testedArchives: 0,
      reports: [],
      errors: [],
      currentArchiveName: "",
      jobId: null, // Clear jobId at the start of a new batch
    }));

    for (let i = 0; i < itemsToTest.length; i++) {
      const archiveItem = itemsToTest[i];
      const isLastArchive = i === itemsToTest.length - 1;

      // Update modal to show current archive being processed
      setArchiveTestProgress((prev) => ({
        ...prev,
        currentArchiveName: archiveItem.name,
        currentFile: `Preparing to test ${archiveItem.name}...`,
        totalFiles: 0,
        testedFiles: 0,
        // Clear report/error for the current archive's display, but not the accumulated ones
        report: null,
        error: null,
      }));

      let currentArchiveReport = null;
      let currentArchiveError = null;
      let currentJobId = null;

      try {
        if (isVerboseLogging())
          console.log(
            `[useArchiveIntegrityTest] Testing archive ${archiveItem.name} (${
              i + 1
            }/${itemsToTest.length})`
          );
        const source = {
          path: panels[sourcePanelId].path,
          name: archiveItem.name,
        };

        const { jobId } = await testArchive(source);
        currentJobId = jobId;
        setArchiveTestProgress((prev) => ({ ...prev, jobId: currentJobId }));

        const wsProtocol =
          window.location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(
          `${wsProtocol}//${window.location.host}/ws?jobId=${currentJobId}&type=archive-test`
        );
        ws.jobId = currentJobId;

        await new Promise((resolve) => {
          ws.onmessage = (event) => {
            const data = JSON.parse(event.data);

            switch (data.type) {
              case "start":
                setArchiveTestProgress((prev) => ({
                  ...prev,
                  totalFiles: data.totalFiles,
                  currentFile: `Testing ${archiveItem.name}: ${
                    data.currentFile ? truncatePath(data.currentFile, 60) : ""
                  }`,
                }));
                break;
              case "progress":
                setArchiveTestProgress((prev) => ({
                  ...prev,
                  testedFiles: data.testedFiles,
                  currentFile: `Testing ${archiveItem.name}: ${
                    data.currentFile ? truncatePath(data.currentFile, 60) : ""
                  }`,
                }));
                break;
              case "complete":
                currentArchiveReport = data.report;
                const fileErrors = data.report?.failedFiles || [];
                const generalError = data.report?.generalError;

                if (fileErrors.length > 0 || generalError) {
                  let title = "Errors were detected in the archive.";
                  if (generalError && fileErrors.length > 0) {
                    title =
                      "A structural error and multiple file errors were detected.";
                  } else if (generalError) {
                    title = "A structural error was detected in the archive.";
                  } else if (fileErrors.length > 0) {
                    title = `${fileErrors.length} of ${data.report.totalFiles} files failed the integrity check.`;
                  }

                  currentArchiveError = {
                    title: title,
                    generalError: generalError,
                    fileErrors: fileErrors,
                  };
                }
                setArchiveTestProgress((prev) => ({
                  ...prev,
                  currentFile: `Test of ${archiveItem.name} completed.`,
                }));
                if (
                  ws &&
                  !ws._closeCalled &&
                  (ws.readyState === WebSocket.OPEN ||
                    ws.readyState === WebSocket.CONNECTING)
                ) {
                  ws._closeCalled = true;
                  ws.close(1000, "Archive integrity test complete");
                }
                resolve();
                break;
              case "failed":
                currentArchiveError = {
                  title: data.title || "An error was detected in the archive.",
                  generalError: data.details,
                  fileErrors: [],
                };
                setArchiveTestProgress((prev) => ({
                  ...prev,
                  currentFile: `Test of ${archiveItem.name} failed.`,
                }));
                if (
                  ws &&
                  !ws._closeCalled &&
                  (ws.readyState === WebSocket.OPEN ||
                    ws.readyState === WebSocket.CONNECTING)
                ) {
                  ws._closeCalled = true;
                  ws.close(1000, "Archive integrity test error");
                }
                resolve();
                break;
            }
          };

          ws.onclose = () => {
            // If the job was cancelled/disconnected before completion/failure
            if (!currentArchiveReport && !currentArchiveError) {
              currentArchiveError = {
                title: "Test Cancelled or Disconnected",
                generalError: "The connection to the server was lost.",
                fileErrors: [],
              };
              setArchiveTestProgress((prev) => ({
                ...prev,
                currentFile: `Test of ${archiveItem.name} cancelled.`,
              }));
            }
            resolve();
          };

          ws.onerror = () => {
            currentArchiveError = {
              title: "WebSocket Error",
              generalError: "Could not connect to the progress server.",
              fileErrors: [],
            };
            setArchiveTestProgress((prev) => ({
              ...prev,
              currentFile: `Test of ${archiveItem.name} failed due to WebSocket error.`,
            }));
            if (
              ws &&
              !ws._closeCalled &&
              (ws.readyState === WebSocket.OPEN ||
                ws.readyState === WebSocket.CONNECTING)
            ) {
              ws._closeCalled = true;
              ws.close(1000, "Archive integrity test closed");
            }
            resolve();
          };
        });
      } catch (err) {
        currentArchiveError = {
          title: "Failed to start test",
          generalError: err.message,
          fileErrors: [],
        };
        setArchiveTestProgress((prev) => ({
          ...prev,
          currentFile: `Failed to start test for ${archiveItem.name}.`,
        }));
        // Ensure the loop continues even on error starting the test
        resolve();
      } finally {
        setArchiveTestProgress((prev) => ({
          ...prev,
          testedArchives: prev.testedArchives + 1,
          reports: [
            ...prev.reports,
            { name: archiveItem.name, report: currentArchiveReport },
          ],
          errors: currentArchiveError
            ? [
                ...prev.errors,
                { name: archiveItem.name, error: currentArchiveError },
              ]
            : prev.errors,
          jobId: isLastArchive ? null : prev.jobId, // Clear jobId only if it's the last archive
        }));
      }
    }
    // After all archives are processed, the modal should remain open with the accumulated reports.
    // The user will manually close it using closeArchiveTestModal.
  }, [activePanel, panels, selections, setError, filter, filteredItems]);

  return {
    archiveTestProgress,
    handleCancelArchiveTest,
    handleTestArchive,
    closeArchiveTestModal,
  };
};

export default useArchiveIntegrityTest;
