import React, { useEffect, useRef, useState } from "react";
import { XCircle, Expand, Eraser, ScrollText } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import TruncatedText from "../ui/TruncatedText";

const TerminalModal = ({ isOpen, onClose, jobId }) => {
  const terminalInstanceRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddon = useRef(new FitAddon());
  const hasReceivedData = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const previewContainerRef = useRef(null);
  const [cwd, setCwd] = useState("");

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

    setTimeout(() => {
      fitAddon.current.fit();
      const { cols, rows } = term;
      ws.send(JSON.stringify({ type: "resize", cols, rows }));
      term.focus();
    }, 150);

    ws.onopen = () => {
      fitAddon.current.fit();
      term.onData((data) => {
        ws.send(JSON.stringify({ type: "data", data }));
      });

      term.onResize(({ cols, rows }) => {
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      });
    };

    ws.onmessage = async (event) => {
      const data = event.data;
      if (typeof data === "string") {
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "cwd") {
            setCwd(parsed.data);
            return;
          }
        } catch (e) {
          // Not a JSON message, treat as raw terminal data
        }
      }
      const text = data instanceof Blob ? await data.text() : data.toString();
      term.write(text);
    };

    term.parser.registerOscHandler(6, (data) => {
      setCwd(data);
      return true;
    });

    ws.onclose = (event) => {
      term.dispose();
      onClose();
    };

    ws.onerror = (error) => {
      console.error("[ws] Error:", error);
    };

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.current.fit();
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current.parentElement);
    }

    return () => {
      resizeObserver.disconnect();
      ws.close();
      term.dispose();
    };
  }, [isOpen, jobId, onClose]);

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
