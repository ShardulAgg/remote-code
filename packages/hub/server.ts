import { createServer, IncomingMessage } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { decode, encode, AgentMessage } from "@remote-code/protocol";
import { getDb } from "./src/db/index.js";
import {
  upsertNode,
  updateNodeStats,
  setNodeOffline,
  countAuthTokens,
  insertAuthToken,
  findAuthToken,
} from "./src/db/queries.js";
import { agentRegistry } from "./src/ws/agent-registry.js";
import * as terminalProxy from "./src/ws/terminal-proxy.js";
import * as fileProxy from "./src/ws/file-proxy.js";
import { handleBrowserConnection } from "./src/ws/browser-handler.js";
import { generateToken, hashToken } from "./src/auth/tokens.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const dev = process.env.NODE_ENV !== "production";

async function main(): Promise<void> {
  // Initialize database
  getDb();

  // Generate admin token if no tokens exist
  const tokenCount = countAuthTokens();
  if (tokenCount === 0) {
    const adminToken = generateToken();
    const tokenHash = hashToken(adminToken);
    insertAuthToken(tokenHash, "admin");
    console.log("=".repeat(60));
    console.log("ADMIN TOKEN (save this — it won't be shown again):");
    console.log(adminToken);
    console.log("=".repeat(60));
  }

  // Set up Next.js app
  const app = next({ dev, dir: __dirname });
  const handle = app.getRequestHandler();
  await app.prepare();

  // WebSocket servers (noServer mode — we handle upgrades manually)
  const agentWss = new WebSocketServer({ noServer: true });
  const browserWss = new WebSocketServer({ noServer: true });

  // HTTP server
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    handle(req, res, parsedUrl);
  });

  // Handle WebSocket upgrades
  httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
    const { pathname, query } = parse(req.url ?? "/", true);

    if (pathname === "/agent") {
      // Validate token from query param
      const rawToken = query.token as string | undefined;
      if (!rawToken) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      const tokenHash = hashToken(rawToken);
      if (!findAuthToken(tokenHash)) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }

      agentWss.handleUpgrade(req, socket, head, (ws) => {
        agentWss.emit("connection", ws, req);
      });
    } else if (pathname === "/browser") {
      browserWss.handleUpgrade(req, socket, head, (ws) => {
        browserWss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  // Handle agent connections
  agentWss.on("connection", (ws: WebSocket) => {
    let nodeId: string | null = null;

    ws.on("message", (raw: Buffer | string) => {
      let msg: AgentMessage;
      try {
        msg = decode<AgentMessage>(raw.toString());
      } catch (err) {
        console.error("[agent] Failed to decode message:", err);
        return;
      }

      handleAgentMessage(ws, msg, (id) => {
        nodeId = id;
      });
    });

    ws.on("close", () => {
      if (nodeId) {
        console.log(`[agent] Node disconnected: ${nodeId}`);
        agentRegistry.unregister(nodeId);
        setNodeOffline(nodeId);
        agentRegistry.notifyNodeChange(nodeId);
      }
    });

    ws.on("error", (err) => {
      console.error("[agent] WebSocket error:", err.message);
    });
  });

  // Handle browser connections
  browserWss.on("connection", (ws: WebSocket) => {
    handleBrowserConnection(ws);
  });

  httpServer.listen(PORT, () => {
    console.log(`Hub server listening on http://localhost:${PORT}`);
  });
}

function handleAgentMessage(
  ws: WebSocket,
  msg: AgentMessage,
  onNodeId: (nodeId: string) => void
): void {
  switch (msg.type) {
    case "agent-hello": {
      const { nodeId, name, os, arch, hostname } = msg;
      console.log(`[agent] Node connected: ${nodeId} (${name} @ ${hostname})`);

      agentRegistry.register(nodeId, ws);
      upsertNode({ nodeId, name, os, arch, hostname });
      agentRegistry.notifyNodeChange(nodeId);
      onNodeId(nodeId);

      // Acknowledge
      ws.send(encode({ type: "auth-result", success: true }));
      break;
    }

    case "stats-report": {
      // Find which node this ws belongs to
      const currentNodeId = getNodeIdForWs(ws);
      if (!currentNodeId) return;

      updateNodeStats(currentNodeId, {
        cpu: msg.cpu,
        memTotal: msg.memTotal,
        memUsed: msg.memUsed,
        diskTotal: msg.diskTotal,
        diskUsed: msg.diskUsed,
      });
      agentRegistry.notifyNodeChange(currentNodeId);
      break;
    }

    case "pty-data": {
      terminalProxy.handlePtyData(msg.sessionId, msg.data);
      break;
    }

    case "pty-exit": {
      terminalProxy.handlePtyExit(msg.sessionId, msg.exitCode);
      break;
    }

    case "fs-response": {
      fileProxy.handleResponse(msg.requestId, msg.data, msg.error);
      break;
    }

    default:
      console.warn("[agent] Unknown message type:", (msg as { type: string }).type);
      break;
  }
}

/**
 * Look up the nodeId for a given agent WebSocket connection.
 */
function getNodeIdForWs(ws: WebSocket): string | undefined {
  for (const nodeId of agentRegistry.getOnlineNodeIds()) {
    if (agentRegistry.getAgentWs(nodeId) === ws) {
      return nodeId;
    }
  }
  return undefined;
}

main().catch((err) => {
  console.error("Fatal error starting hub server:", err);
  process.exit(1);
});
