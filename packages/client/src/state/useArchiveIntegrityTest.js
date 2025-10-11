import { useState, useCallback } from "react";
import { testArchive, cancelArchiveTest } from "../lib/api";

const useArchiveIntegrityTest = ({
  activePanel,
  panels,
  selections,
  setError,
  wsRef,
}) => {
  const [archiveTestProgress, setArchiveTestProgress] = useState({
    isVisible: false,
    jobId: null,
    currentFile: "",
    totalFiles: 0,
    testedFiles: 0,
    report: null,
    error: null,
  });

  const handleCancelArchiveTest = () => {
    if (archiveTestProgress.jobId) {
      cancelArchiveTest(archiveTestProgress.jobId);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setArchiveTestProgress({
      isVisible: false,
      jobId: null,
      currentFile: "",
      totalFiles: 0,
      testedFiles: 0,
      report: null,
      error: null,
    });
  };

  const closeArchiveTestModal = () => {
    setArchiveTestProgress((prev) => ({ ...prev, isVisible: false }));
  };

  const handleTestArchive = useCallback(async () => {
    const sourcePanelId = activePanel;
    const itemsToTest = [...selections[sourcePanelId]]
      .map((itemName) =>
        panels[sourcePanelId].items.find((item) => item.name === itemName)
      )
      .filter(Boolean);

    if (itemsToTest.length !== 1 || itemsToTest[0].type !== "archive") {
      setError("Please select a single archive file to test.");
      return;
    }

    const source = {
      path: panels[sourcePanelId].path,
      name: itemsToTest[0].name,
    };

    setArchiveTestProgress({
      isVisible: true,
      jobId: null,
      currentFile: "Preparing...",
      totalFiles: 0,
      testedFiles: 0,
      report: null,
      error: null,
    });

    try {
      const { jobId } = await testArchive(source);
      setArchiveTestProgress((prev) => ({ ...prev, jobId }));

      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsHost = window.location.host.replace(/:\d+$/, ":3001");
      const ws = new WebSocket(
        `${wsProtocol}//${wsHost}?jobId=${jobId}&type=archive-test`
      );
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "start":
            setArchiveTestProgress((prev) => ({
              ...prev,
              totalFiles: data.totalFiles,
            }));
            break;
          case "progress":
            setArchiveTestProgress((prev) => ({
              ...prev,
              testedFiles: data.testedFiles,
              currentFile: data.currentFile,
            }));
            break;
          case "complete":
            setArchiveTestProgress((prev) => ({
              ...prev,
              report: data.report,
            }));
            const { report } = data;
            const fileErrors = report?.failedFiles || [];
            const generalError = report?.generalError;

            if (fileErrors.length > 0 || generalError) {
              let title = "Errors were detected in the archive.";
              if (generalError && fileErrors.length > 0) {
                title =
                  "A structural error and multiple file errors were detected.";
              } else if (generalError) {
                title = "A structural error was detected in the archive.";
              } else if (fileErrors.length > 0) {
                title = `${fileErrors.length} of ${report.totalFiles} files failed the integrity check.`;
              }

              setArchiveTestProgress((prev) => ({
                ...prev,
                error: {
                  title: title,
                  generalError: generalError,
                  fileErrors: fileErrors,
                },
              }));
            }
            break;
          case "failed":
            setArchiveTestProgress((prev) => ({
              ...prev,
              error: {
                title: data.title || "An error was detected in the archive.",
                generalError: data.details,
                fileErrors: [],
              },
            }));
            break;
        }
      };

      ws.onclose = () => {
        setArchiveTestProgress((prev) => {
          if (prev.isVisible && !prev.report && !prev.error) {
            return {
              ...prev,
              error: {
                title: "Test Cancelled or Disconnected",
                generalError: "The connection to the server was lost.",
                fileErrors: [],
              },
            };
          }
          return prev;
        });
      };

      ws.onerror = () => {
        setArchiveTestProgress((prev) => ({
          ...prev,
          error: {
            title: "WebSocket Error",
            generalError: "Could not connect to the progress server.",
            fileErrors: [],
          },
        }));
      };
    } catch (err) {
      setArchiveTestProgress({
        isVisible: false,
        error: {
          title: "Failed to start test",
          generalError: err.message,
          fileErrors: [],
        },
      });
    }
  }, [activePanel, panels, selections, setError, wsRef]);

  return {
    archiveTestProgress,
    handleCancelArchiveTest,
    handleTestArchive,
    closeArchiveTestModal,
  };
};

export default useArchiveIntegrityTest;
