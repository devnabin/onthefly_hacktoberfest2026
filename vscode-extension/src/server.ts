// Starts the Python server (server.py) and turns its JSON-lines output into events.

import { ChildProcess, spawn } from "child_process";
import * as readline from "readline";

// One message from server.py; the "type" field says which kind
export interface ServerEvent {
  type: string;
  [key: string]: unknown;
}

// Keep this many stderr lines to explain why the server stopped
const STDERR_TAIL_LINES = 20;

// Owns the Python child process for as long as the extension runs
export class PythonServer {
  private child: ChildProcess | undefined;
  private stderrTail: string[] = [];

  constructor(
    private readonly onEvent: (event: ServerEvent) => void,
    private readonly onStopped: (message: string) => void,
    private readonly log: (line: string) => void,
  ) {}

  // Launch `python server.py ...`; any previous server is stopped first.
  // env adds variables such as OPENAI_API_KEY (never logged, never on the command line).
  start(python: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): void {
    this.stop();
    this.stderrTail = [];
    this.log(`Starting: ${python} ${args.join(" ")}`);

    const child = spawn(python, args, { cwd, env: { ...process.env, ...env } });
    this.child = child;

    // Each stdout line is one JSON event; anything else is just logged
    readline.createInterface({ input: child.stdout! }).on("line", (line) => {
      try {
        this.onEvent(JSON.parse(line) as ServerEvent);
      } catch {
        this.log(line);
      }
    });

    // Python errors and warnings go to stderr: log them and remember the last few
    readline.createInterface({ input: child.stderr! }).on("line", (line) => {
      this.log(line);
      this.stderrTail.push(line);
      if (this.stderrTail.length > STDERR_TAIL_LINES) {
        this.stderrTail.shift();
      }
    });

    // Python couldn't be started at all (e.g. wrong path)
    child.on("error", (error) => {
      if (this.child === child) {
        this.child = undefined;
        this.onStopped(`Could not start ${python}: ${error.message}`);
      }
    });

    // Python exited on its own (crash, missing package, bad folder...)
    child.on("exit", (code) => {
      if (this.child === child) {
        this.child = undefined;
        this.onStopped(`Python server exited (code ${code}).\n${this.stderrTail.join("\n")}`);
      }
    });
  }

  // Stop the server on purpose; this does not count as a crash
  stop(): void {
    const child = this.child;
    this.child = undefined;
    child?.kill();
  }
}
