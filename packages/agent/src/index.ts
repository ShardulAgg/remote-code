#!/usr/bin/env node
import os from "os";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { AgentHello, HubToAgentMessage } from "@remote-code/protocol";

/**
 * Get or create a stable node ID that persists across restarts.
 * Stored in ~/.remote-code-agent/node-id
 */
function getStableNodeId(): string {
  const configDir = path.join(os.homedir(), ".remote-code-agent");
  const idFile = path.join(configDir, "node-id");
  try {
    return fs.readFileSync(idFile, "utf-8").trim();
  } catch {
    // First run — generate and persist
    const id = `${os.hostname()}-${crypto.randomBytes(4).toString("hex")}`;
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(idFile, id);
    return id;
  }
}
import { Connection } from "./connection.js";
import { PtyManager } from "./pty-manager.js";
import { getStats } from "./stats.js";
import { handleFsRequest } from "./fs-handler.js";
import { indexTree, watchTree } from "./fs-tree.js";

// ---------------------------------------------------------------------------
// Parse CLI arguments
// ---------------------------------------------------------------------------
function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        result[key] = next;
        i++;
      } else {
        result[key] = "true";
      }
    }
  }
  return result;
}

const args = parseArgs(process.argv);

const hubUrl = args["hub"];
const token = args["token"];
const name = args["name"] ?? os.hostname();
const nodeId = args["id"] ?? getStableNodeId();

if (!hubUrl || !token) {
  console.error("Usage: remote-code-agent --hub <ws://...> --token <token> [--name <name>] [--id <nodeId>]");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Create subsystems
// ---------------------------------------------------------------------------
const ptyManager = new PtyManager();
let statsInterval: ReturnType<typeof setInterval> | null = null;

const connection = new Connection({
  hubUrl,
  token,
  nodeId,
  onConnected() {
    console.log("[agent] Connected to hub");

    // Send hello with active sessions
    const hello: AgentHello = {
      type: "agent-hello",
      nodeId,
      name,
      token,
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      hostname: os.hostname(),
      activeSessions: ptyManager.listSessions(),
    };
    connection.send(hello);

    // Re-wire existing PTY sessions to the new connection
    for (const sid of ptyManager.listSessions()) {
      ptyManager.reattach(
        sid,
        (data) => connection.send({ type: "pty-data", sessionId: sid, data }),
        (exitCode) => connection.send({ type: "pty-exit", sessionId: sid, exitCode })
      );
    }

    // Start sending stats every 5 seconds
    statsInterval = setInterval(() => {
      const s = getStats();
      connection.send({
        type: "stats-report",
        cpu: s.cpu,
        memTotal: s.memTotal,
        memUsed: s.memUsed,
        diskTotal: s.diskTotal,
        diskUsed: s.diskUsed,
      });
    }, 5000);
  },

  onDisconnected() {
    console.log("[agent] Disconnected from hub");
    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }
  },

  onMessage(msg: HubToAgentMessage) {
    handleMessage(msg);
  },
});

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------
function handleMessage(msg: HubToAgentMessage): void {
  switch (msg.type) {
    case "spawn-pty": {
      ptyManager.spawn(
        msg.sessionId,
        msg.cols,
        msg.rows,
        msg.cwd,
        msg.command,
        (data) => {
          connection.send({ type: "pty-data", sessionId: msg.sessionId, data });
        },
        (exitCode) => {
          connection.send({ type: "pty-exit", sessionId: msg.sessionId, exitCode });
        }
      );
      break;
    }

    case "pty-input": {
      ptyManager.write(msg.sessionId, msg.data);
      break;
    }

    case "pty-resize": {
      ptyManager.resize(msg.sessionId, msg.cols, msg.rows);
      break;
    }

    case "kill-pty": {
      ptyManager.kill(msg.sessionId);
      break;
    }

    case "fs-request": {
      const result = handleFsRequest(msg.action, msg.path, msg.data);
      connection.send({
        type: "fs-response",
        requestId: msg.requestId,
        data: result.data,
        error: result.error,
      });
      break;
    }

    case "request-fs-tree": {
      const root = msg.root || os.homedir();
      const entries = indexTree(root, msg.depth || 3);
      connection.send({ type: "fs-tree", root, entries });

      // Start watching for changes
      if ((handleMessage as any)._treeCleanup) {
        (handleMessage as any)._treeCleanup();
      }
      (handleMessage as any)._treeCleanup = watchTree(root, (changes) => {
        connection.send({ type: "fs-tree-update", changes });
      });
      break;
    }

    default: {
      console.warn("[agent] Unknown message type:", (msg as HubToAgentMessage & { type: string }).type);
    }
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
function shutdown(): void {
  console.log("[agent] Shutting down…");
  if (statsInterval) clearInterval(statsInterval);
  ptyManager.killAll();
  connection.destroy();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`[agent] Starting — nodeId=${nodeId}, hub=${hubUrl}`);
