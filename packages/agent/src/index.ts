#!/usr/bin/env node
import os from "os";
import { AgentHello, HubToAgentMessage } from "@remote-code/protocol";
import { Connection } from "./connection.js";
import { PtyManager } from "./pty-manager.js";
import { getStats } from "./stats.js";
import { handleFsRequest } from "./fs-handler.js";

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
const nodeId = args["id"] ?? `${os.hostname()}-${process.pid}`;

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

    // Send hello
    const hello: AgentHello = {
      type: "agent-hello",
      nodeId,
      name,
      token,
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      hostname: os.hostname(),
    };
    connection.send(hello);

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

    default: {
      const _exhaustive: never = msg;
      console.warn("[agent] Unknown message type:", (_exhaustive as HubToAgentMessage & { type: string }).type);
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
