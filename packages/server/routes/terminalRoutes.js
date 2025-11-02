import express from 'express';
import { randomUUID } from 'crypto';
import os from 'os';
import pty from 'node-pty';

export default function terminalRoutes(activeTerminalJobs) {
  const router = express.Router();

  router.post('/terminals', (req, res) => {
    const { path = process.env.HOME } = req.body;
    const jobId = randomUUID();
    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: path,
      env: {
        ...process.env,
        PS1: '$ ',
        PROMPT_COMMAND: 'printf "\x1b]6;%s\x07" "$PWD"',
      },
    });

    activeTerminalJobs.set(jobId, { ptyProcess, initialCwd: path });
    res.send({ jobId });
  });

  return router;
}