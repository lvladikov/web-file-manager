import express from "express";
import { randomUUID } from "crypto";
import os from "os";
import pty from "../lib/terminal-backend.js";

export default function terminalRoutes(activeTerminalJobs) {
  const router = express.Router();

  router.post("/terminals", (req, res) => {
    const { path = process.env.HOME, cols = 120, rows = 40 } = req.body;
    const jobId = randomUUID();
    const shell =
      os.platform() === "win32"
        ? "powershell.exe"
        : process.env.SHELL || "bash";

    const ptyProcess = pty.spawn(shell, [], {
      name: "xterm-color",
      cols,
      rows,
      cwd: path,
      env: {
        ...process.env,
        // Disable zsh's PROMPT_SP which shows % for incomplete lines
        PROMPT_SP: "",
        // Send OSC 6 with current directory for the terminal header
        PROMPT_COMMAND: 'printf "\x1b]6;%s\x07" "$PWD"',
      },
    });

    activeTerminalJobs.set(jobId, {
      ptyProcess,
      initialCwd: path,
      pendingWrites: [],
      ready: false,
    });
    res.send({ jobId });
  });

  return router;
}
