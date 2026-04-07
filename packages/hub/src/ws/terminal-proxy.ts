import WebSocket from "ws";
import { encode } from "@remote-code/protocol";
import { agentRegistry } from "./agent-registry.js";
import {
  createSession,
  updateSessionActivity,
  setSessionStatus,
} from "../db/queries.js";

interface TerminalSession {
  sessionId: string;
  nodeId: string;
  browserWs: WebSocket | null;
}

// sessionId -> session info (including browser WS)
const sessions = new Map<string, TerminalSession>();

/**
 * Open a new terminal session on the given agent node.
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

  sessions.set(sessionId, { sessionId, nodeId, browserWs });

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
 * Forward PTY data from an agent to the connected browser.
 */
export function handlePtyData(sessionId: string, data: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;

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
  }
}

export function getSessionNodeId(sessionId: string): string | undefined {
  return sessions.get(sessionId)?.nodeId;
}
