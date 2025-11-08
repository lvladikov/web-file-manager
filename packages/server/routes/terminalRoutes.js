import express from "express";
import { randomUUID } from "crypto";
import os from "os";
import pty from "../lib/terminal-backend.js";

export default function terminalRoutes(activeTerminalJobs) {
  const router = express.Router();

  router.post("/terminals", (req, res) => {
    const { path = process.env.HOME, cols = 120, rows = 40 } = req.body;
    const jobId = randomUUID();
    const shell = os.platform() === "win32" ? "powershell.exe" : "bash";

    const ptyProcess = pty.spawn(shell, [], {
      name: "xterm-color",
      cols,
      rows,
      cwd: path,
      env: {
        ...process.env,
        PS1: "\r\n$ ",
        PROMPT_COMMAND: 'printf "\x1b]6;%s\x07" "$PWD"',
      },
    });

    activeTerminalJobs.set(jobId, { ptyProcess, initialCwd: path });
    res.send({ jobId });
  });

  return router;
}
