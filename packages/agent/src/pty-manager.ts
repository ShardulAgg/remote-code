import * as pty from "node-pty";

interface Session {
  pty: pty.IPty;
  sessionId: string;
}

export class PtyManager {
  private sessions = new Map<string, Session>();

  spawn(
    sessionId: string,
    cols: number,
    rows: number,
    cwd: string | undefined,
    command: string | undefined,
    onData: (data: string) => void,
    onExit: (exitCode: number) => void
  ): void {
    if (this.sessions.has(sessionId)) {
      console.warn(`[pty-manager] Session ${sessionId} already exists`);
      return;
    }

    const shell = command ?? (process.env.SHELL ?? "/bin/bash");
    const args: string[] = [];

    const term = pty.spawn(shell, args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: cwd ?? process.env.HOME ?? "/",
      env: {
        ...process.env,
        LANG: process.env.LANG || "en_US.UTF-8",
        LC_ALL: process.env.LC_ALL || "en_US.UTF-8",
        TERM: "xterm-256color",
      } as Record<string, string>,
    });

    const session: Session = { pty: term, sessionId };
    this.sessions.set(sessionId, session);

    term.onData((data: string) => {
      // Encode output as base64 before passing to callback
      const b64 = Buffer.from(data, "utf8").toString("base64");
      onData(b64);
    });

    term.onExit(({ exitCode }: { exitCode: number }) => {
      this.sessions.delete(sessionId);
      onExit(exitCode ?? 0);
    });
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`[pty-manager] write: session ${sessionId} not found`);
      return;
    }
    // data arrives as base64, decode to string before writing
    const decoded = Buffer.from(data, "base64").toString("utf8");
    session.pty.write(decoded);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`[pty-manager] resize: session ${sessionId} not found`);
      return;
    }
    session.pty.resize(cols, rows);
  }

  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    try {
      session.pty.kill();
    } catch {
      // already dead
    }
    this.sessions.delete(sessionId);
  }

  listSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  killAll(): void {
    for (const id of this.sessions.keys()) {
      this.kill(id);
    }
  }
}
