import { createServer as createHttpServer, IncomingMessage } from "http";
import { createServer as createHttpsServer } from "https";
import fs from "fs";
import path from "path";
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

  // HTTP/HTTPS server
  const certDir = path.join(__dirname, "certs");
  const hasCerts = fs.existsSync(path.join(certDir, "key.pem")) && fs.existsSync(path.join(certDir, "cert.pem"));

  const requestHandler = (req: any, res: any) => {
    const parsedUrl = parse(req.url ?? "/", true);
    handle(req, res, parsedUrl);
  };

  const httpServer = hasCerts
    ? createHttpsServer(
        {
          key: fs.readFileSync(path.join(certDir, "key.pem")),
          cert: fs.readFileSync(path.join(certDir, "cert.pem")),
        },
        requestHandler
      )
    : createHttpServer(requestHandler);

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

  const HOST = process.env.HOST ?? "0.0.0.0";
  const protocol = hasCerts ? "https" : "http";
  httpServer.listen(PORT, HOST, () => {
    console.log(`Hub server listening on ${protocol}://${HOST}:${PORT}`);
    if (hasCerts) console.log("TLS enabled (self-signed certificate)");
  });
}

function handleAgentMessage(
  ws: WebSocket,
  msg: AgentMessage,
  onNodeId: (nodeId: string) => void
): void {
  switch (msg.type) {
    case "agent-hello": {
      const { nodeId, name, os, arch, hostname, activeSessions } = msg;
      console.log(`[agent] Node connected: ${nodeId} (${name} @ ${hostname}), ${activeSessions?.length ?? 0} active sessions`);

      agentRegistry.register(nodeId, ws);
      upsertNode({ nodeId, name, os, arch, hostname });
      agentRegistry.notifyNodeChange(nodeId);
      onNodeId(nodeId);

      // Restore sessions the agent reports as still alive
      if (activeSessions && activeSessions.length > 0) {
        for (const sessionId of activeSessions) {
          terminalProxy.restoreSession(sessionId, nodeId);
        }
        console.log(`[agent] Restored ${activeSessions.length} session(s) for ${nodeId}`);
      }

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
