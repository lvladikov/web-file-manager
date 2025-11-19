import React, { useEffect, useRef, useState } from "react";
import { XCircle, Expand, Eraser, ScrollText } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import TruncatedText from "../ui/TruncatedText";

const TerminalModal = ({
  isOpen,
  onClose,
  jobId,
  initialCommand,
  initialPath,
  triggeredFromConsole,
  commandToRun,
  commandId,
}) => {
  const terminalInstanceRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddon = useRef(new FitAddon());
  const hasReceivedData = useRef(false);
  const wsRef = useRef(null); // Keep a ref to the websocket
  const [isFullscreen, setIsFullscreen] = useState(false);
  const previewContainerRef = useRef(null);
  const [cwd, setCwd] = useState("");
  const [isPty, setIsPty] = useState(null);
  const lastSentInitialPathRef = useRef(null);
  const initialCommandWrittenRef = useRef(false);

  // Keep the latest onClose in a ref so we don't need to re-run the effect when it changes
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      hasReceivedData.current = false; // Reset on close
      return;
    }

    const term = new Terminal({
      allowProposedApi: true,
      rightClickSelectsWord: false,
      theme: {
        background: "#1f2937",
        foreground: "#d1d5db",
      },
    });

    terminalInstanceRef.current = term;

    term.loadAddon(fitAddon.current);
    term.open(terminalRef.current);

    setTimeout(() => {
      const terminalWrapper = terminalRef.current;
      if (terminalWrapper) {
        terminalWrapper.addEventListener("contextmenu", (e) => {
          e.stopPropagation();
        });
      }
    }, 50);

    const ws = new WebSocket(
      `ws://${window.location.host}/ws?jobId=${jobId}&type=terminal`
    );
    ws.jobId = jobId;
    wsRef.current = ws;

    setTimeout(() => {
      fitAddon.current.fit();
      const { cols, rows } = term;
      // Send initial resize to ensure server PTY is sized correctly
      try {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      } catch (e) {
        // swallow send errors if WS not open
      }
      term.focus();
    }, 150);

    // Debounce resize events to avoid spamming the server
    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (terminalRef.current) {
          fitAddon.current.fit();
          const { cols, rows } = term;
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: "resize", cols, rows }));
          }
        }
      }, 100); // Debounce for 100ms
    };

    ws.onopen = () => {
      fitAddon.current.fit();
      const { cols, rows } = term;
      try {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      } catch (e) {}

      term.onData((data) => {
        try {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "data", data }));
          }
        } catch (e) {}
      });

      term.onResize(({ cols, rows }) => {
        try {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "resize", cols, rows }));
          }
        } catch (e) {}
      });

      // Set up resize observer after websocket is open
      const resizeObserver = new ResizeObserver(handleResize);
      if (terminalRef.current) {
        resizeObserver.observe(terminalRef.current.parentElement);
      }

      // If an initial command was provided when triggeredFromConsole=true, send it and press Enter once.
      // We do NOT write it locally here to avoid duplicate echoes on the fallback (non-PTY) case.
      // Instead, wait for the server to send a 'pty_info' message to decide whether to locally
      // echo the command. We'll still send the typed data to the server immediately so the
      // server receives it regardless of backend type.
      if (
        triggeredFromConsole &&
        initialCommand &&
        typeof initialCommand === "string"
      ) {
        try {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({ type: "data", data: initialCommand + "\r" })
            );
          }
        } catch (e) {
          console.error("Failed to send initial command to terminal:", e);
        }
      }
    };

    ws.onmessage = async (event) => {
      const data = event.data;
      if (typeof data === "string") {
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "cwd") {
            setCwd(parsed.data);
            // After receiving the server's initial cwd, if an initialPath was
            // requested by the caller (the console) and it differs from the
            // server cwd, send a cd command. Only do this once per initialPath
            // value to avoid duplicate sends on reuse.
            try {
              if (
                triggeredFromConsole &&
                initialPath &&
                typeof initialPath === "string" &&
                parsed.data !== initialPath &&
                lastSentInitialPathRef.current !== initialPath &&
                ws.readyState === 1
              ) {
                ws.send(
                  JSON.stringify({ type: "data", data: "cd " + initialPath + "\r" })
                );
                lastSentInitialPathRef.current = initialPath;
              }
            } catch (e) {
              console.error("Failed to send initial path after cwd:", e);
            }
            return;
          }
          if (parsed.type === "pty_info") {
            setIsPty(Boolean(parsed.isPty));
            // If the server indicates a proper PTY and we have an initial
            // command that we sent earlier from the console, opt to echo it
            // locally for snappy feedback if we didn't yet write it.
            try {
              if (
                parsed.isPty &&
                triggeredFromConsole &&
                initialCommand &&
                !initialCommandWrittenRef.current
              ) {
                term.write(initialCommand + "\r");
                initialCommandWrittenRef.current = true;
              }
            } catch (e) {
              // ignore
            }
            return;
          }
        } catch (e) {
          // Not a JSON message, treat as raw terminal data
        }
      }
      let text = data instanceof Blob ? await data.text() : data.toString();
      // If this is the first chunk, check whether zsh printed a leading
      // partial-line marker `%` as the first non-empty line. If so, drop
      // that single-line marker to avoid the stray `%` shown above the
      // actual prompt. This only affects the first received chunk so we're
      // conservative and won't swallow legitimate subsequent output.
      if (!hasReceivedData.current) {
        try {
          // Split into lines respecting CRLF or LF
          const lines = text.split(/\r?\n/);
          // Find the first non-empty line
          let i = 0;
          while (i < lines.length && lines[i].trim() === "") i++;
          // Strip ANSI/OSC sequences for the single-char check; some shells
          // may emit color or control sequences around the percent marker.
          const stripAnsi = (s) =>
            String(s)
              .replace(/\x1b\][^\x07]*\x07/g, "") // OSC sequences
              .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, ""); // ANSI CSI sequences
          const firstNonEmpty = lines[i] || "";
          if (i < lines.length && stripAnsi(firstNonEmpty).trim() === "%") {
            // Remove the percent-only line
            lines.splice(i, 1);
            const remainder = lines.join("\n");
            if (!remainder || remainder.trim() === "") {
              // Nothing else to render; mark received and skip writing
                hasReceivedData.current = true;
                console.debug(
                  "[terminal] Swallowing leading % marker for job",
                  jobId
                );
              return;
            }
            text = remainder;
              console.debug("[terminal] Swallowed leading % marker, writing remainder for job", jobId);
          }
        } catch (e) {
          // If any error parsing lines, fall back to normal write
          console.warn("TerminalModal: failed to check for leading % marker:", e);
        }
      }
      term.write(text);
      hasReceivedData.current = true;
    };

    // Handle OSC sequences for setting the window/title. Historically the
    // app used OSC 6, but OSC 0 is the conventional sequence for setting
    // the window/icon title. Register handlers for both so we remain
    // compatible with older versions and different terminal backends.
    try {
      term.parser.registerOscHandler(0, (data) => {
        setCwd(data);
        return true;
      });
      term.parser.registerOscHandler(6, (data) => {
        setCwd(data);
        return true;
      });
    } catch (err) {
      // Some xterm builds may not expose parser.registerOscHandler; ignore
      // if not available (the terminal will still function, but cwd
      // display may not update from OSC sequences).
    }

    ws.onclose = (event) => {
      clearTimeout(resizeTimeout);
      term.dispose();
      lastSentInitialPathRef.current = null;
      initialCommandWrittenRef.current = false;
      setIsPty(null);
      if (onCloseRef.current) onCloseRef.current();
    };

    ws.onerror = (error) => {
      console.error("[ws] Error:", error);
    };

    return () => {
      clearTimeout(resizeTimeout);
      if (
        ws &&
        !ws._closeCalled &&
        (ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING)
      ) {
        ws._closeCalled = true;
        ws.close(1000, "Terminal modal closed");
      }
      term.dispose();
    };
  }, [isOpen, jobId]); // Removed onClose from dependencies to prevent re-connection on prop change

  // Effect to handle new commands sent to an existing terminal
  useEffect(() => {
    if (
      isOpen &&
      commandId &&
      commandToRun &&
      wsRef.current &&
      wsRef.current.readyState === WebSocket.OPEN
    ) {
      try {
        // Write to terminal UI only if we're connected to a real PTY. For
        // the fallback (non-PTY) the server echoes characters back and
        // writing locally causes duplicate rendering.
        if (
          terminalInstanceRef.current &&
          (isPty === true || isPty === null) // default to local write for unknown
        ) {
          terminalInstanceRef.current.write(commandToRun + "\r");
        }
        // Send through websocket to the server PTY
        wsRef.current.send(
          JSON.stringify({ type: "data", data: commandToRun + "\r" })
        );
      } catch (e) {
        console.error("Failed to send command to terminal:", e);
      }
    }
  }, [isOpen, commandId, commandToRun]);

  // If the initialPath changes while the modal is open (reusing an existing
  // terminal modal), send a cd command to change the working directory.
  useEffect(() => {
    if (!isOpen || !triggeredFromConsole || !initialPath) return;
    try {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (lastSentInitialPathRef.current === initialPath) return;
      try {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "data", data: "cd " + initialPath + "\r" }));
        }
        if (initialCommand && typeof initialCommand === "string") {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "data", data: initialCommand + "\r" }));
          }
        }
      }
      catch (e) {
        console.error("Failed to send dynamic cd/command to terminal:", e);
      }
      lastSentInitialPathRef.current = initialPath;
    } catch (e) {
      console.error("Failed to send dynamic cd/command to terminal:", e);
    }
  }, [isOpen, initialPath, initialCommand, triggeredFromConsole]);

  useEffect(() => {
    const onFullscreenChange = () =>
      setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const handleClearTerminal = () => {
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.clear();
      terminalInstanceRef.current.focus();
    }
  };

  const handleClearScrollback = () => {
    if (terminalInstanceRef.current) {
      const term = terminalInstanceRef.current;
      const originalScrollback = term.options.scrollback;
      term.options.scrollback = 0;
      term.options.scrollback = originalScrollback;
      term.focus();
    }
  };

  const handleFullscreen = () => {
    const target = previewContainerRef.current;
    if (target) {
      if (!document.fullscreenElement) target.requestFullscreen();
      else document.exitFullscreen();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        ref={previewContainerRef}
        className={`bg-gray-900 border border-gray-600 rounded-lg shadow-lg flex flex-col ${
          isFullscreen
            ? "w-full h-full p-0 border-none rounded-none"
            : "w-full max-w-[80vw] h-[80vh]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="w-full h-12 bg-black bg-opacity-60 flex-shrink-0 flex justify-between items-center px-3 rounded-t-lg z-20"
          title={cwd}
        >
          <div className="flex items-center space-x-4 flex-grow min-w-0">
            <h2 className="text-lg font-semibold text-gray-200 flex-shrink-0">
              Terminal
            </h2>
            <TruncatedText text={cwd} className="text-gray-400" />
          </div>
          <div className="flex items-center space-x-3">
            <button
              className="p-1 text-gray-300 hover:text-white"
              onClick={handleClearScrollback}
              title="Clear Scrollback"
            >
              <ScrollText className="w-6 h-6" />
            </button>
            <button
              className="p-1 text-gray-300 hover:text-white"
              onClick={handleClearTerminal}
              title="Clear Terminal"
            >
              <Eraser className="w-6 h-6" />
            </button>
            <button
              className="p-1 text-gray-300 hover:text-white"
              onClick={handleFullscreen}
              title="Toggle Fullscreen"
            >
              <Expand className="w-6 h-6" />
            </button>
            <button
              className="p-1 text-gray-300 hover:text-white"
              onClick={onClose}
              title="Close"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 flex flex-col rounded-b-lg overflow-hidden">
          <div
            className="w-full h-full xterm-container"
            ref={terminalRef}
          ></div>
        </div>
      </div>
    </div>
  );
};

export default TerminalModal;
