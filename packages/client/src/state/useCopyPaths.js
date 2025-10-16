import { useCallback } from "react";

export default function useCopyPaths({
  setError,
  activePanel,
  panels,
  selections,
  setCopyPathsModal,
  wsRef,
}) {
  const cancelCopyPaths = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setCopyPathsModal({
      isVisible: false,
      jobId: null,
      currentPath: "",
      count: 0,
      mode: "clipboard",
      onCancel: null,
    });
  }, [setCopyPathsModal, wsRef]);

  const getPaths = useCallback(
    async (isAbsolute, includeSubfolders, download = false) => {
      try {
        const panel = panels[activePanel];
        const selectedItems = Array.from(selections[activePanel]).map((name) =>
          panel.items.find((item) => item.name === name)
        );

        const response = await fetch("/api/get-paths", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: selectedItems,
            basePath: panel.path,
            isAbsolute,
            includeSubfolders,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || "Failed to get paths.");
        }

        const { jobId } = await response.json();

        setCopyPathsModal({
          isVisible: true,
          jobId,
          currentPath: "Starting...",
          count: 0,
          mode: download ? "download" : "clipboard",
          onCancel: cancelCopyPaths,
        });

        const wsProtocol =
          window.location.protocol === "https:" ? "wss:" : "ws:";
        const jobWs = new WebSocket(
          `${wsProtocol}//${window.location.host}/ws?jobId=${jobId}&type=copy-paths`
        );

        wsRef.current = jobWs;

        jobWs.onmessage = (event) => {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case "progress":
              setCopyPathsModal((prev) => ({
                ...prev,
                currentPath: data.path,
                count: data.count,
              }));
              break;
            case "complete":
              if (download) {
                const blob = new Blob([data.paths.join("\n")], {
                  type: "text/plain",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                const now = new Date();
                const timestamp = `${now.getFullYear()}${(now.getMonth() + 1)
                  .toString()
                  .padStart(2, "0")}${now
                  .getDate()
                  .toString()
                  .padStart(2, "0")}-${now
                  .getHours()
                  .toString()
                  .padStart(2, "0")}${now
                  .getMinutes()
                  .toString()
                  .padStart(2, "0")}${now
                  .getSeconds()
                  .toString()
                  .padStart(2, "0")}`;
                a.download = `${timestamp}_items_report.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              } else {
                navigator.clipboard.writeText(data.paths.join("\n"));
              }
              setCopyPathsModal({
                isVisible: false,
                jobId: null,
                currentPath: "",
                count: 0,
                mode: "clipboard",
              });
              break;
            case "error":
              setError(data.message);
              setCopyPathsModal({
                isVisible: false,
                jobId: null,
                currentPath: "",
                count: 0,
                mode: "clipboard",
              });
              break;
          }
        };

        jobWs.onerror = () => {
          setError("WebSocket connection error.");
          setCopyPathsModal({
            isVisible: false,
            jobId: null,
            currentPath: "",
            count: 0,
            mode: "clipboard",
          });
        };

        jobWs.onclose = () => {
          setCopyPathsModal({
            isVisible: false,
            jobId: null,
            currentPath: "",
            count: 0,
            mode: "clipboard",
          });
        };
      } catch (err) {
        setError(err.message);
      }
    },
    [activePanel, panels, selections, setError, setCopyPathsModal, wsRef]
  );

  const copyAbsolutePaths = useCallback(
    (includeSubfolders, download = false) => {
      getPaths(true, includeSubfolders, download);
    },
    [getPaths]
  );

  const copyRelativePaths = useCallback(
    (includeSubfolders, download = false) => {
      getPaths(false, includeSubfolders, download);
    },
    [getPaths]
  );

  return {
    copyAbsolutePaths,
    copyRelativePaths,
  };
}
