import WebSocket from "ws";
import { v4 as uuid } from "uuid";
import {
  encode,
  decode,
  BrowserMessage,
  NodeInfo,
} from "@remote-code/protocol";
import { agentRegistry } from "./agent-registry.js";
import * as terminalProxy from "./terminal-proxy.js";
import { onSessionChange } from "./terminal-proxy.js";
import * as fileProxy from "./file-proxy.js";
import { findAuthToken, updateSessionLabel } from "../db/queries.js";
import { hashToken } from "../auth/tokens.js";
import { getAllNodes } from "../db/queries.js";
import { getActiveSessions as getDbActiveSessions } from "../db/queries.js";

function buildSessionList() {
  const activeSessions = terminalProxy.getActiveSessions();
  const dbSessions = getDbActiveSessions();
  const labelMap = new Map(dbSessions.map(s => [s.sessionId, s.label]));
  return activeSessions.map(s => ({
    sessionId: s.sessionId,
    nodeId: s.nodeId,
    label: labelMap.get(s.sessionId) ?? "",
    cwd: "",
    createdAt: 0,
    lastActive: Date.now(),
    status: "active" as const,
  }));
}

/**
 * Handle a browser WebSocket connection.
 * Requires a browser-auth message before accepting any other messages.
 */
export function handleBrowserConnection(ws: WebSocket): void {
  let authenticated = false;
  // sessionId -> nodeId mapping for routing terminal messages
  const sessionNodeMap = new Map<string, string>();

  let unsubscribeNodeChange: (() => void) | null = null;
  let unsubscribeSessionChange: (() => void) | null = null;

  ws.on("message", (raw: Buffer | string) => {
    let msg: BrowserMessage;
    try {
      msg = decode<BrowserMessage>(raw.toString());
    } catch {
      ws.send(
        encode({ type: "auth-result", success: false, error: "Invalid JSON" })
      );
      return;
    }

    // Always handle browser-auth first
    if (msg.type === "browser-auth") {
      const tokenHash = hashToken(msg.token);
      const valid = findAuthToken(tokenHash);

      if (valid) {
        authenticated = true;
        ws.send(encode({ type: "auth-result", success: true }));
      } else {
        ws.send(
          encode({
            type: "auth-result",
            success: false,
            error: "Invalid token",
          })
        );
        ws.close();
      }
      return;
    }

    if (!authenticated) {
      ws.send(
        encode({
          type: "auth-result",
          success: false,
          error: "Not authenticated",
        })
      );
      return;
    }

    switch (msg.type) {
      case "subscribe-nodes": {
        // Send current node list
        const nodes = getAllNodes();
        ws.send(encode({ type: "node-list", nodes }));

        // Send active sessions so browser can reconnect to them
        const sessionList = buildSessionList();
        if (sessionList.length > 0) {
          ws.send(encode({ type: "session-list", sessions: sessionList }));
        }

        // Subscribe to future node changes
        if (unsubscribeNodeChange) unsubscribeNodeChange();
        unsubscribeNodeChange = agentRegistry.onNodeChange((node: NodeInfo) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(encode({ type: "node-update", node }));
          }
        });

        // Subscribe to session changes (create/close/restore)
        if (unsubscribeSessionChange) unsubscribeSessionChange();
        unsubscribeSessionChange = onSessionChange(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(encode({ type: "session-list", sessions: buildSessionList() }));
          }
        });
        break;
      }

      case "open-terminal": {
        const sessionId = msg.sessionId ?? uuid();
        const nodeId = msg.nodeId;

        // Track sessionId -> nodeId for subsequent routing
        sessionNodeMap.set(sessionId, nodeId);

        terminalProxy.openTerminal(ws, {
          sessionId,
          nodeId,
          cols: msg.cols,
          rows: msg.rows,
          cwd: msg.cwd,
          command: msg.command,
        });
        break;
      }

      case "terminal-input": {
        const { sessionId, data } = msg;
        terminalProxy.sendInput(sessionId, data);
        break;
      }

      case "terminal-resize": {
        const { sessionId, cols, rows } = msg;
        terminalProxy.resize(sessionId, cols, rows);
        break;
      }

      case "close-terminal": {
        const { sessionId } = msg;
        sessionNodeMap.delete(sessionId);
        terminalProxy.close(sessionId);
        break;
      }

      case "browser-fs-request": {
        fileProxy.proxyRequest(ws, {
          nodeId: msg.nodeId,
          requestId: msg.requestId,
          action: msg.action,
          path: msg.path,
          data: msg.data,
        });
        break;
      }

      case "rename-session": {
        updateSessionLabel(msg.sessionId, msg.label);
        break;
      }

      default:
        // Unknown message type, ignore
        break;
    }
  });

  ws.on("close", () => {
    if (unsubscribeNodeChange) unsubscribeNodeChange();
    if (unsubscribeSessionChange) unsubscribeSessionChange();
    terminalProxy.detachBrowser(ws);
  });

  ws.on("error", (err) => {
    console.error("[browser-handler] WebSocket error:", err.message);
  });
}
