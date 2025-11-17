import { useCallback } from "react";

export default function useCopyPaths({
  setError,
  activePanel,
  panels,
  selections,
  setCopyPathsModal,
  wsRef,
  filter,
  filteredItems,
}) {
  const cancelCopyPaths = useCallback(() => {
    if (
      wsRef.current &&
      wsRef.current.jobId &&
      !wsRef.current._closeCalled &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      wsRef.current._closeCalled = true;
      wsRef.current.close(1000, "Copy Paths modal canceled");
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
        const itemsToConsider = filter[activePanel].pattern
          ? filteredItems[activePanel]
          : panel.items;

        const selectedItems = Array.from(selections[activePanel])
          .map((name) => itemsToConsider.find((item) => item.name === name))
          .filter(Boolean); // Filter out any undefined entries

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

        jobWs.jobId = jobId;
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

        jobWs.onerror = (err) => {
          console.error(
            `[useCopyPaths] WebSocket error for job ${jobId}:`,
            err
          );
          setError("WebSocket connection error.");
          setCopyPathsModal({
            isVisible: false,
            jobId: null,
            currentPath: "",
            count: 0,
            mode: "clipboard",
          });
        };

        jobWs.onclose = (event) => {
          console.log(
            `[useCopyPaths] WebSocket onclose for job ${jobId} code=${event.code} reason='${event.reason}' wasClean=${event.wasClean}`
          );
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
    [
      activePanel,
      panels,
      selections,
      setError,
      setCopyPathsModal,
      wsRef,
      filter,
      filteredItems,
    ]
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
