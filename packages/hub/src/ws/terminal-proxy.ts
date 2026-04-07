import WebSocket from "ws";
import { encode } from "@remote-code/protocol";
import { agentRegistry } from "./agent-registry.js";
import {
  createSession,
  updateSessionActivity,
  setSessionStatus,
} from "../db/queries.js";

// Max scrollback buffer size per session (100KB of base64 data)
const MAX_BUFFER_SIZE = 100 * 1024;

interface TerminalSession {
  sessionId: string;
  nodeId: string;
  browserWs: WebSocket | null;
  scrollback: string[]; // array of base64-encoded chunks
  scrollbackSize: number; // total bytes in scrollback
}

// sessionId -> session info
const sessions = new Map<string, TerminalSession>();

/**
 * Open a terminal session. If the session already exists (detached),
 * reattach and replay the scrollback buffer instead of spawning a new PTY.
 */
export function openTerminal(
  browserWs: WebSocket,
  opts: {
    sessionId: string;
    nodeId: string;
    cols: number;
    rows: number;
    cwd?: string;
    command?: string;
  }
): void {
  const { sessionId, nodeId, cols, rows, cwd, command } = opts;

  // Check if this session already exists (reconnect case)
  const existing = sessions.get(sessionId);
  if (existing) {
    // Reattach browser to existing session
    existing.browserWs = browserWs;
    setSessionStatus(sessionId, "active");

    // Notify browser the terminal is open
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(encode({ type: "terminal-opened", sessionId, nodeId: existing.nodeId }));
    }

    // Replay scrollback buffer
    replayScrollback(existing, browserWs);

    // Resize to match new browser dimensions
    agentRegistry.sendToAgent(
      existing.nodeId,
      encode({ type: "pty-resize", sessionId, cols, rows })
    );
    return;
  }

  // New session
  const session: TerminalSession = {
    sessionId,
    nodeId,
    browserWs,
    scrollback: [],
    scrollbackSize: 0,
  };
  sessions.set(sessionId, session);

  // Persist session in DB
  createSession({ sessionId, nodeId, cwd: cwd ?? "" });
  agentRegistry.addSession(nodeId, sessionId);

  // Tell the agent to spawn a PTY
  agentRegistry.sendToAgent(
    nodeId,
    encode({ type: "spawn-pty", sessionId, cols, rows, cwd, command })
  );

  // Notify browser
  if (browserWs.readyState === WebSocket.OPEN) {
    browserWs.send(encode({ type: "terminal-opened", sessionId, nodeId }));
  }
}

/**
 * Replay scrollback buffer to a browser WebSocket.
 */
function replayScrollback(session: TerminalSession, browserWs: WebSocket): void {
  if (browserWs.readyState !== WebSocket.OPEN) return;

  for (const chunk of session.scrollback) {
    browserWs.send(encode({
      type: "terminal-data",
      sessionId: session.sessionId,
      data: chunk,
    }));
  }
}

/**
 * Append data to the session's scrollback buffer, trimming old data if needed.
 */
function appendScrollback(session: TerminalSession, data: string): void {
  session.scrollback.push(data);
  session.scrollbackSize += data.length;

  // Trim from the front if we exceed max size
  while (session.scrollbackSize > MAX_BUFFER_SIZE && session.scrollback.length > 1) {
    const removed = session.scrollback.shift()!;
    session.scrollbackSize -= removed.length;
  }
}

/**
 * Forward PTY data from an agent to the connected browser.
 */
export function handlePtyData(sessionId: string, data: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  // Store in scrollback buffer (even if no browser is connected)
  appendScrollback(session, data);

  updateSessionActivity(sessionId);

  if (session.browserWs && session.browserWs.readyState === WebSocket.OPEN) {
    session.browserWs.send(encode({ type: "terminal-data", sessionId, data }));
  }
}

/**
 * Handle PTY exit notification from agent.
 */
export function handlePtyExit(sessionId: string, exitCode: number): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  if (session.browserWs && session.browserWs.readyState === WebSocket.OPEN) {
    session.browserWs.send(
      encode({ type: "terminal-closed", sessionId, exitCode })
    );
  }

  setSessionStatus(sessionId, "closed");
  agentRegistry.removeSession(session.nodeId, sessionId);
  sessions.delete(sessionId);
}

/**
 * Send user input from browser to agent PTY.
 */
export function sendInput(sessionId: string, data: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  agentRegistry.sendToAgent(
    session.nodeId,
    encode({ type: "pty-input", sessionId, data })
  );
}

/**
 * Send resize event from browser to agent PTY.
 */
export function resize(sessionId: string, cols: number, rows: number): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  agentRegistry.sendToAgent(
    session.nodeId,
    encode({ type: "pty-resize", sessionId, cols, rows })
  );
}

/**
 * Close/kill a terminal session.
 */
export function close(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  agentRegistry.sendToAgent(
    session.nodeId,
    encode({ type: "kill-pty", sessionId })
  );

  setSessionStatus(sessionId, "closed");
  agentRegistry.removeSession(session.nodeId, sessionId);
  sessions.delete(sessionId);
}

/**
 * On browser disconnect, mark sessions as detached rather than closed
 * so they can be reattached later.
 */
export function detachBrowser(browserWs: WebSocket): void {
  for (const [sessionId, session] of sessions.entries()) {
    if (session.browserWs === browserWs) {
      session.browserWs = null;
      setSessionStatus(sessionId, "detached");
    }
  }
}

/**
 * Re-attach a browser WebSocket to an existing session.
 */
export function reattach(sessionId: string, browserWs: WebSocket): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  session.browserWs = browserWs;
  setSessionStatus(sessionId, "active");

  if (browserWs.readyState === WebSocket.OPEN) {
    browserWs.send(
      encode({ type: "terminal-opened", sessionId, nodeId: session.nodeId })
    );

    // Replay scrollback
    replayScrollback(session, browserWs);
  }
}

export function getSessionNodeId(sessionId: string): string | undefined {
  return sessions.get(sessionId)?.nodeId;
}

/**
 * Restore a session that the agent reports as still alive.
 * Creates an entry in the hub's session map without a browser attached.
 * This allows browsers to reconnect to it later.
 */
export function restoreSession(sessionId: string, nodeId: string): void {
  if (sessions.has(sessionId)) return; // already tracked

  sessions.set(sessionId, {
    sessionId,
    nodeId,
    browserWs: null,
    scrollback: [],
    scrollbackSize: 0,
  });
}

/**
 * Get all active/detached sessions, optionally filtered by nodeId.
 */
export function getActiveSessions(nodeId?: string): Array<{ sessionId: string; nodeId: string }> {
  const result: Array<{ sessionId: string; nodeId: string }> = [];
  for (const [, session] of sessions) {
    if (!nodeId || session.nodeId === nodeId) {
      result.push({ sessionId: session.sessionId, nodeId: session.nodeId });
    }
  }
  return result;
}
