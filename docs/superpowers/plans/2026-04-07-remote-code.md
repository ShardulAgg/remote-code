# Remote Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web dashboard for managing parallel Claude Code sessions across multiple remote Linux nodes via persistent WebSocket connections.

**Architecture:** A Next.js hub server accepts outbound WebSocket connections from lightweight Node.js agents running on remote machines. The hub bridges browser xterm.js terminals to agent-spawned PTYs, with session persistence surviving disconnects. A shared typed protocol package defines all messages.

**Tech Stack:** TypeScript monorepo (npm workspaces), Next.js 14 (App Router), ws, node-pty, xterm.js, better-sqlite3, Tailwind CSS

---

## File Structure

```
remote-code/
  package.json                          # workspace root
  tsconfig.base.json                    # shared TS config
  packages/
    protocol/
      package.json
      tsconfig.json
      src/
        messages.ts                     # typed message definitions + encode/decode
        index.ts                        # re-exports
    agent/
      package.json
      tsconfig.json
      src/
        index.ts                        # CLI entry point
        connection.ts                   # WebSocket to hub + auto-reconnect
        pty-manager.ts                  # spawn/manage PTY sessions
        stats.ts                        # system stats collection
        fs-handler.ts                   # file system operations
      install.sh                        # one-liner installer script
    hub/
      package.json
      tsconfig.json
      next.config.js
      tailwind.config.js
      postcss.config.js
      server.ts                         # custom server: HTTP + WS on same port
      src/
        ws/
          agent-registry.ts             # track connected agents + state
          terminal-proxy.ts             # bridge browser WS <-> agent WS
          browser-handler.ts            # handle browser WS connections
          file-proxy.ts                 # proxy file operations to agents
        db/
          schema.ts                     # SQLite table definitions + migrations
          index.ts                      # db connection singleton
          queries.ts                    # typed query functions
        auth/
          tokens.ts                     # token generation, validation, hashing
      app/
        layout.tsx                      # root layout + nav shell
        page.tsx                        # dashboard (node grid)
        terminal/
          page.tsx                      # terminal workspace
        files/
          [nodeId]/
            page.tsx                    # file browser for specific node
        api/
          auth/
            route.ts                    # token validation endpoint
          nodes/
            route.ts                    # REST: list nodes
          sessions/
            route.ts                    # REST: list/manage sessions
      components/
        node-card.tsx                   # single node status card
        node-grid.tsx                   # grid of node cards
        status-badge.tsx                # online/offline indicator
        stats-bar.tsx                   # CPU/mem/disk bar
        terminal-panel.tsx              # xterm.js wrapper component
        terminal-tabs.tsx               # tab bar for terminals
        file-tree.tsx                   # directory tree component
        file-list.tsx                   # file listing table
        file-actions.tsx                # context menu for file ops
        upload-dialog.tsx               # file upload modal
        login-form.tsx                  # token auth form
      hooks/
        use-nodes.ts                    # live node data via WS
        use-terminal.ts                 # terminal session WS hook
        use-files.ts                    # file operations via WS
      lib/
        ws-client.ts                    # browser WebSocket client wrapper
```

---

### Task 1: Project Scaffold + Shared Protocol

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `packages/protocol/package.json`
- Create: `packages/protocol/tsconfig.json`
- Create: `packages/protocol/src/messages.ts`
- Create: `packages/protocol/src/index.ts`
- Create: `packages/agent/package.json`
- Create: `packages/agent/tsconfig.json`
- Create: `packages/hub/package.json`
- Create: `packages/hub/tsconfig.json`

- [ ] **Step 1: Create workspace root package.json**

```json
{
  "name": "remote-code",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "npm run build --workspaces",
    "build:protocol": "npm run build -w packages/protocol",
    "build:agent": "npm run build -w packages/agent",
    "dev:hub": "npm run dev -w packages/hub",
    "dev:agent": "npm run dev -w packages/agent"
  }
}
```

- [ ] **Step 2: Create shared tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist"
  }
}
```

- [ ] **Step 3: Create protocol package**

`packages/protocol/package.json`:
```json
{
  "name": "@remote-code/protocol",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  }
}
```

`packages/protocol/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Define protocol messages**

`packages/protocol/src/messages.ts`:
```typescript
// === Agent -> Hub Messages ===

export interface AgentHello {
  type: "agent-hello";
  nodeId: string;
  name: string;
  token: string;
  os: string;
  arch: string;
  hostname: string;
}

export interface PtyData {
  type: "pty-data";
  sessionId: string;
  data: string; // base64-encoded terminal output
}

export interface PtyExit {
  type: "pty-exit";
  sessionId: string;
  exitCode: number;
}

export interface StatsReport {
  type: "stats-report";
  cpu: number;       // 0-100 percentage
  memTotal: number;  // bytes
  memUsed: number;   // bytes
  diskTotal: number; // bytes
  diskUsed: number;  // bytes
}

export interface FsResponse {
  type: "fs-response";
  requestId: string;
  data?: unknown;
  error?: string;
}

// === Hub -> Agent Messages ===

export interface SpawnPty {
  type: "spawn-pty";
  sessionId: string;
  cols: number;
  rows: number;
  cwd?: string;
  command?: string;
}

export interface PtyInput {
  type: "pty-input";
  sessionId: string;
  data: string;
}

export interface PtyResize {
  type: "pty-resize";
  sessionId: string;
  cols: number;
  rows: number;
}

export interface KillPty {
  type: "kill-pty";
  sessionId: string;
}

export interface FsRequest {
  type: "fs-request";
  requestId: string;
  action: "list" | "read" | "write" | "stat" | "mkdir" | "delete";
  path: string;
  data?: string;
}

// === Browser -> Hub Messages ===

export interface BrowserAuth {
  type: "browser-auth";
  token: string;
}

export interface OpenTerminal {
  type: "open-terminal";
  nodeId: string;
  sessionId?: string;
  cols: number;
  rows: number;
  cwd?: string;
  command?: string;
}

export interface TerminalInput {
  type: "terminal-input";
  sessionId: string;
  data: string;
}

export interface TerminalResize {
  type: "terminal-resize";
  sessionId: string;
  cols: number;
  rows: number;
}

export interface CloseTerminal {
  type: "close-terminal";
  sessionId: string;
}

export interface BrowserFsRequest {
  type: "browser-fs-request";
  nodeId: string;
  requestId: string;
  action: "list" | "read" | "write" | "stat" | "mkdir" | "delete";
  path: string;
  data?: string;
}

export interface SubscribeNodes {
  type: "subscribe-nodes";
}

// === Hub -> Browser Messages ===

export interface AuthResult {
  type: "auth-result";
  success: boolean;
  error?: string;
}

export interface NodeList {
  type: "node-list";
  nodes: NodeInfo[];
}

export interface NodeUpdate {
  type: "node-update";
  node: NodeInfo;
}

export interface NodeInfo {
  nodeId: string;
  name: string;
  status: "online" | "offline";
  os: string;
  arch: string;
  hostname: string;
  cpu: number;
  memTotal: number;
  memUsed: number;
  diskTotal: number;
  diskUsed: number;
  activeSessions: number;
  lastSeen: number;
}

export interface TerminalOpened {
  type: "terminal-opened";
  sessionId: string;
  nodeId: string;
}

export interface TerminalData {
  type: "terminal-data";
  sessionId: string;
  data: string;
}

export interface TerminalClosed {
  type: "terminal-closed";
  sessionId: string;
  exitCode?: number;
}

export interface BrowserFsResponse {
  type: "browser-fs-response";
  requestId: string;
  data?: unknown;
  error?: string;
}

export interface SessionList {
  type: "session-list";
  sessions: SessionInfo[];
}

export interface SessionInfo {
  sessionId: string;
  nodeId: string;
  cwd: string;
  createdAt: number;
  lastActive: number;
  status: "active" | "detached";
}

// === Union types ===

export type AgentMessage =
  | AgentHello | PtyData | PtyExit | StatsReport | FsResponse;

export type HubToAgentMessage =
  | SpawnPty | PtyInput | PtyResize | KillPty | FsRequest;

export type BrowserMessage =
  | BrowserAuth | OpenTerminal | TerminalInput | TerminalResize
  | CloseTerminal | BrowserFsRequest | SubscribeNodes;

export type HubToBrowserMessage =
  | AuthResult | NodeList | NodeUpdate | TerminalOpened | TerminalData
  | TerminalClosed | BrowserFsResponse | SessionList;

// === Encode/Decode ===

export function encode(
  msg: AgentMessage | HubToAgentMessage | BrowserMessage | HubToBrowserMessage
): string {
  return JSON.stringify(msg);
}

export function decode<T>(raw: string): T {
  return JSON.parse(raw) as T;
}
```

- [ ] **Step 5: Create protocol index.ts**

`packages/protocol/src/index.ts`:
```typescript
export * from "./messages.js";
```

- [ ] **Step 6: Create agent and hub package stubs**

`packages/agent/package.json`:
```json
{
  "name": "@remote-code/agent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "bin": {
    "remote-code-agent": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "@remote-code/protocol": "*",
    "node-pty": "^1.0.0",
    "ws": "^8.16.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.10",
    "tsx": "^4.7.0",
    "typescript": "^5.3.0"
  }
}
```

`packages/agent/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src"]
}
```

`packages/hub/package.json`:
```json
{
  "name": "@remote-code/hub",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "next build",
    "dev": "tsx server.ts",
    "start": "NODE_ENV=production tsx server.ts"
  },
  "dependencies": {
    "@remote-code/protocol": "*",
    "better-sqlite3": "^11.0.0",
    "next": "^14.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "ws": "^8.16.0",
    "@xterm/xterm": "^5.4.0",
    "@xterm/addon-fit": "^0.9.0",
    "@xterm/addon-webgl": "^0.17.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.8",
    "@types/node": "^20.11.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@types/uuid": "^9.0.7",
    "@types/ws": "^8.5.10",
    "autoprefixer": "^10.4.17",
    "postcss": "^8.4.33",
    "tailwindcss": "^3.4.1",
    "tsx": "^4.7.0",
    "typescript": "^5.3.0"
  }
}
```

`packages/hub/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": ".",
    "jsx": "preserve",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./components/*"],
      "@/hooks/*": ["./hooks/*"],
      "@/lib/*": ["./lib/*"]
    }
  },
  "include": ["src", "app", "components", "hooks", "lib", "server.ts", "next-env.d.ts"],
  "exclude": ["node_modules", ".next"]
}
```

- [ ] **Step 7: Build protocol and verify**

Run: `npm install && npm run build:protocol`
Expected: Clean build, `packages/protocol/dist/` contains compiled output.

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.base.json packages/protocol packages/agent/package.json packages/agent/tsconfig.json packages/hub/package.json packages/hub/tsconfig.json
git commit -m "feat: scaffold monorepo and define WebSocket protocol"
```

---

### Task 2: Node Agent -- Core

**Files:**
- Create: `packages/agent/src/index.ts`
- Create: `packages/agent/src/connection.ts`
- Create: `packages/agent/src/pty-manager.ts`
- Create: `packages/agent/src/stats.ts`
- Create: `packages/agent/src/fs-handler.ts`

- [ ] **Step 1: Implement WebSocket connection with auto-reconnect**

`packages/agent/src/connection.ts`:
```typescript
import WebSocket from "ws";
import os from "os";
import {
  encode, decode,
  type AgentMessage, type HubToAgentMessage
} from "@remote-code/protocol";

export interface ConnectionOptions {
  hubUrl: string;
  token: string;
  nodeId: string;
  name: string;
  onMessage: (msg: HubToAgentMessage) => void;
  onConnected: () => void;
  onDisconnected: () => void;
}

export class Connection {
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private shouldReconnect = true;
  private opts: ConnectionOptions;

  constructor(opts: ConnectionOptions) {
    this.opts = opts;
  }

  connect(): void {
    const url = `${this.opts.hubUrl}/agent?token=${encodeURIComponent(this.opts.token)}&nodeId=${encodeURIComponent(this.opts.nodeId)}`;
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log(`[agent] Connected to hub: ${this.opts.hubUrl}`);
      this.reconnectDelay = 1000;
      this.send({
        type: "agent-hello",
        nodeId: this.opts.nodeId,
        name: this.opts.name,
        token: this.opts.token,
        os: process.platform,
        arch: process.arch,
        hostname: os.hostname(),
      });
      this.opts.onConnected();
    });

    this.ws.on("message", (raw) => {
      const msg = decode<HubToAgentMessage>(raw.toString());
      this.opts.onMessage(msg);
    });

    this.ws.on("close", () => {
      console.log("[agent] Disconnected from hub");
      this.opts.onDisconnected();
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      console.error("[agent] WebSocket error:", err.message);
    });
  }

  send(msg: AgentMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(encode(msg));
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    console.log(`[agent] Reconnecting in ${this.reconnectDelay}ms...`);
    setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      this.maxReconnectDelay
    );
  }

  close(): void {
    this.shouldReconnect = false;
    this.ws?.close();
  }
}
```

- [ ] **Step 2: Implement PTY manager**

`packages/agent/src/pty-manager.ts`:
```typescript
import * as pty from "node-pty";

export interface PtySession {
  id: string;
  process: pty.IPty;
  cwd: string;
}

export class PtyManager {
  private sessions = new Map<string, PtySession>();

  spawn(
    sessionId: string,
    cols: number,
    rows: number,
    cwd: string,
    command: string | undefined,
    onData: (data: string) => void,
    onExit: (exitCode: number) => void
  ): void {
    const shell = command || process.env.SHELL || "/bin/bash";

    const proc = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd: cwd || process.env.HOME || "/",
      env: { ...process.env } as Record<string, string>,
    });

    const session: PtySession = {
      id: sessionId,
      process: proc,
      cwd: cwd || proc.cwd,
    };
    this.sessions.set(sessionId, session);

    proc.onData((data) => {
      onData(Buffer.from(data).toString("base64"));
    });

    proc.onExit(({ exitCode }) => {
      this.sessions.delete(sessionId);
      onExit(exitCode);
    });
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.process.write(Buffer.from(data, "base64").toString());
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.process.resize(cols, rows);
    }
  }

  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.process.kill();
      this.sessions.delete(sessionId);
    }
  }

  listSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}
```

- [ ] **Step 3: Implement system stats collection**

`packages/agent/src/stats.ts`:
```typescript
import os from "os";
import { execFileSync } from "child_process";

export interface SystemStats {
  cpu: number;
  memTotal: number;
  memUsed: number;
  diskTotal: number;
  diskUsed: number;
}

export function getStats(): SystemStats {
  const loadAvg = os.loadavg()[0];
  const cpuCount = os.cpus().length;
  const cpu = Math.min(100, Math.round((loadAvg / cpuCount) * 100));

  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const memUsed = memTotal - memFree;

  let diskTotal = 0;
  let diskUsed = 0;
  try {
    const dfOutput = execFileSync("df", ["-B1", "/"], {
      encoding: "utf-8",
    });
    const lines = dfOutput.trim().split("\n");
    if (lines.length >= 2) {
      const parts = lines[1].trim().split(/\s+/);
      diskTotal = parseInt(parts[1], 10) || 0;
      diskUsed = parseInt(parts[2], 10) || 0;
    }
  } catch {
    // ignore disk stats if df fails
  }

  return { cpu, memTotal, memUsed, diskTotal, diskUsed };
}
```

- [ ] **Step 4: Implement file system handler**

`packages/agent/src/fs-handler.ts`:
```typescript
import fs from "fs";
import path from "path";

export interface FsEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: number;
}

export function handleFsRequest(
  action: string,
  targetPath: string,
  data?: string
): unknown {
  const resolved = path.resolve(targetPath);

  switch (action) {
    case "list": {
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      return entries.map((entry): FsEntry => {
        const fullPath = path.join(resolved, entry.name);
        let size = 0;
        let modified = 0;
        try {
          const stat = fs.statSync(fullPath);
          size = stat.size;
          modified = stat.mtimeMs;
        } catch {
          // skip stat errors
        }
        return {
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          size,
          modified,
        };
      });
    }
    case "read": {
      const content = fs.readFileSync(resolved);
      return { content: content.toString("base64"), size: content.length };
    }
    case "write": {
      if (!data) throw new Error("No data provided for write");
      const buf = Buffer.from(data, "base64");
      fs.writeFileSync(resolved, buf);
      return { written: buf.length };
    }
    case "stat": {
      const stat = fs.statSync(resolved);
      return {
        size: stat.size,
        isDirectory: stat.isDirectory(),
        modified: stat.mtimeMs,
        permissions: stat.mode.toString(8),
      };
    }
    case "mkdir": {
      fs.mkdirSync(resolved, { recursive: true });
      return { created: true };
    }
    case "delete": {
      fs.rmSync(resolved, { recursive: true, force: true });
      return { deleted: true };
    }
    default:
      throw new Error(`Unknown fs action: ${action}`);
  }
}
```

- [ ] **Step 5: Wire up the agent entry point**

`packages/agent/src/index.ts`:
```typescript
#!/usr/bin/env node
import crypto from "crypto";
import os from "os";
import { Connection } from "./connection.js";
import { PtyManager } from "./pty-manager.js";
import { getStats } from "./stats.js";
import { handleFsRequest } from "./fs-handler.js";
import type { HubToAgentMessage } from "@remote-code/protocol";

const args = process.argv.slice(2);
function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const hubUrl = getArg("--hub") || "ws://localhost:3000";
const token = getArg("--token") || "";
const name = getArg("--name") || os.hostname();
const nodeId = getArg("--id") || crypto.randomUUID();

if (!token) {
  console.error(
    "Usage: remote-code-agent --hub <url> --token <token> [--name <name>] [--id <id>]"
  );
  process.exit(1);
}

const ptyManager = new PtyManager();
let statsInterval: ReturnType<typeof setInterval> | null = null;

const conn = new Connection({
  hubUrl,
  token,
  nodeId,
  name,
  onConnected() {
    if (statsInterval) clearInterval(statsInterval);
    statsInterval = setInterval(() => {
      const stats = getStats();
      conn.send({ type: "stats-report", ...stats });
    }, 5000);
  },
  onDisconnected() {
    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }
  },
  onMessage(msg: HubToAgentMessage) {
    switch (msg.type) {
      case "spawn-pty":
        ptyManager.spawn(
          msg.sessionId, msg.cols, msg.rows,
          msg.cwd || "", msg.command,
          (data) => conn.send({ type: "pty-data", sessionId: msg.sessionId, data }),
          (exitCode) => conn.send({ type: "pty-exit", sessionId: msg.sessionId, exitCode })
        );
        break;
      case "pty-input":
        ptyManager.write(msg.sessionId, msg.data);
        break;
      case "pty-resize":
        ptyManager.resize(msg.sessionId, msg.cols, msg.rows);
        break;
      case "kill-pty":
        ptyManager.kill(msg.sessionId);
        break;
      case "fs-request":
        try {
          const result = handleFsRequest(msg.action, msg.path, msg.data);
          conn.send({ type: "fs-response", requestId: msg.requestId, data: result });
        } catch (err) {
          conn.send({
            type: "fs-response",
            requestId: msg.requestId,
            error: (err as Error).message,
          });
        }
        break;
    }
  },
});

conn.connect();
console.log(`[agent] Node "${name}" (${nodeId}) connecting to ${hubUrl}`);

process.on("SIGINT", () => {
  conn.close();
  process.exit(0);
});
```

- [ ] **Step 6: Verify agent compiles**

Run: `npm run build:protocol && cd packages/agent && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src
git commit -m "feat: implement node agent (connection, PTY, stats, file ops)"
```

---

### Task 3: Hub Server -- WebSocket Layer + Database

**Files:**
- Create: `packages/hub/server.ts`
- Create: `packages/hub/src/ws/agent-registry.ts`
- Create: `packages/hub/src/ws/terminal-proxy.ts`
- Create: `packages/hub/src/ws/browser-handler.ts`
- Create: `packages/hub/src/ws/file-proxy.ts`
- Create: `packages/hub/src/db/schema.ts`
- Create: `packages/hub/src/db/index.ts`
- Create: `packages/hub/src/db/queries.ts`
- Create: `packages/hub/src/auth/tokens.ts`

- [ ] **Step 1: Implement SQLite schema and database layer**

`packages/hub/src/db/schema.ts`:
```typescript
import Database from "better-sqlite3";

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      last_seen INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'offline',
      os TEXT DEFAULT '',
      arch TEXT DEFAULT '',
      hostname TEXT DEFAULT '',
      cpu REAL DEFAULT 0,
      mem_total INTEGER DEFAULT 0,
      mem_used INTEGER DEFAULT 0,
      disk_total INTEGER DEFAULT 0,
      disk_used INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL,
      cwd TEXT DEFAULT '/',
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      last_active INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      status TEXT NOT NULL DEFAULT 'active',
      FOREIGN KEY (node_id) REFERENCES nodes(id)
    );

    CREATE TABLE IF NOT EXISTS auth_tokens (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      label TEXT DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      expires_at INTEGER
    );
  `);
}
```

`packages/hub/src/db/index.ts`:
```typescript
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { migrate } from "./schema.js";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(process.cwd(), "data", "remote-code.db");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    migrate(db);
  }
  return db;
}
```

`packages/hub/src/db/queries.ts`:
```typescript
import { getDb } from "./index.js";
import type { NodeInfo, SessionInfo } from "@remote-code/protocol";

export function upsertNode(
  nodeId: string, name: string, tokenHash: string,
  os: string, arch: string, hostname: string
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO nodes (id, name, token_hash, last_seen, status, os, arch, hostname)
    VALUES (?, ?, ?, ?, 'online', ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, last_seen = excluded.last_seen, status = 'online',
      os = excluded.os, arch = excluded.arch, hostname = excluded.hostname
  `).run(nodeId, name, tokenHash, Date.now(), os, arch, hostname);
}

export function updateNodeStats(
  nodeId: string, cpu: number, memTotal: number,
  memUsed: number, diskTotal: number, diskUsed: number
): void {
  const db = getDb();
  db.prepare(
    "UPDATE nodes SET cpu=?, mem_total=?, mem_used=?, disk_total=?, disk_used=?, last_seen=? WHERE id=?"
  ).run(cpu, memTotal, memUsed, diskTotal, diskUsed, Date.now(), nodeId);
}

export function setNodeOffline(nodeId: string): void {
  getDb().prepare("UPDATE nodes SET status='offline' WHERE id=?").run(nodeId);
}

export function getAllNodes(): NodeInfo[] {
  const rows = getDb().prepare("SELECT * FROM nodes").all() as any[];
  return rows.map((r) => ({
    nodeId: r.id, name: r.name, status: r.status,
    os: r.os, arch: r.arch, hostname: r.hostname,
    cpu: r.cpu, memTotal: r.mem_total, memUsed: r.mem_used,
    diskTotal: r.disk_total, diskUsed: r.disk_used,
    activeSessions: 0, lastSeen: r.last_seen,
  }));
}

export function createSession(sessionId: string, nodeId: string, cwd: string): void {
  getDb().prepare("INSERT INTO sessions (id, node_id, cwd) VALUES (?, ?, ?)").run(sessionId, nodeId, cwd);
}

export function updateSessionActivity(sessionId: string): void {
  getDb().prepare("UPDATE sessions SET last_active=? WHERE id=?").run(Date.now(), sessionId);
}

export function setSessionStatus(sessionId: string, status: string): void {
  getDb().prepare("UPDATE sessions SET status=? WHERE id=?").run(status, sessionId);
}

export function getActiveSessions(nodeId: string): SessionInfo[] {
  const query = nodeId
    ? "SELECT * FROM sessions WHERE node_id=? AND status!='closed'"
    : "SELECT * FROM sessions WHERE status!='closed'";
  const rows = (nodeId
    ? getDb().prepare(query).all(nodeId)
    : getDb().prepare(query).all()) as any[];
  return rows.map((r) => ({
    sessionId: r.id, nodeId: r.node_id, cwd: r.cwd,
    createdAt: r.created_at, lastActive: r.last_active, status: r.status,
  }));
}
```

- [ ] **Step 2: Implement token auth**

`packages/hub/src/auth/tokens.ts`:
```typescript
import crypto from "crypto";
import { getDb } from "../db/index.js";

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateToken(label: string): string {
  const token = `rc_${crypto.randomBytes(24).toString("hex")}`;
  getDb().prepare(
    "INSERT INTO auth_tokens (id, token_hash, label) VALUES (?, ?, ?)"
  ).run(crypto.randomUUID(), hashToken(token), label);
  return token;
}

export function validateToken(token: string): boolean {
  const row = getDb().prepare(
    "SELECT id FROM auth_tokens WHERE token_hash = ?"
  ).get(hashToken(token));
  return !!row;
}
```

- [ ] **Step 3: Implement agent registry**

`packages/hub/src/ws/agent-registry.ts`:
```typescript
import type WebSocket from "ws";
import type { AgentHello, HubToAgentMessage } from "@remote-code/protocol";
import { encode } from "@remote-code/protocol";
import * as queries from "../db/queries.js";
import { hashToken } from "../auth/tokens.js";

export interface ConnectedAgent {
  ws: WebSocket;
  nodeId: string;
  name: string;
  sessions: Set<string>;
}

class AgentRegistry {
  private agents = new Map<string, ConnectedAgent>();
  private changeCallbacks: Array<(nodeId: string) => void> = [];

  register(ws: WebSocket, hello: AgentHello): ConnectedAgent {
    const agent: ConnectedAgent = {
      ws, nodeId: hello.nodeId, name: hello.name, sessions: new Set(),
    };
    this.agents.set(hello.nodeId, agent);
    queries.upsertNode(
      hello.nodeId, hello.name, hashToken(hello.token),
      hello.os, hello.arch, hello.hostname
    );
    this.notifyChange(hello.nodeId);
    return agent;
  }

  unregister(nodeId: string): void {
    this.agents.delete(nodeId);
    queries.setNodeOffline(nodeId);
    this.notifyChange(nodeId);
  }

  get(nodeId: string): ConnectedAgent | undefined {
    return this.agents.get(nodeId);
  }

  sendToAgent(nodeId: string, msg: HubToAgentMessage): boolean {
    const agent = this.agents.get(nodeId);
    if (!agent || agent.ws.readyState !== 1) return false;
    agent.ws.send(encode(msg));
    return true;
  }

  getOnlineNodeIds(): string[] {
    return Array.from(this.agents.keys());
  }

  onNodeChange(cb: (nodeId: string) => void): void {
    this.changeCallbacks.push(cb);
  }

  private notifyChange(nodeId: string): void {
    for (const cb of this.changeCallbacks) cb(nodeId);
  }
}

export const registry = new AgentRegistry();
```

- [ ] **Step 4: Implement terminal proxy**

`packages/hub/src/ws/terminal-proxy.ts`:
```typescript
import type WebSocket from "ws";
import {
  encode,
  type TerminalData, type TerminalOpened, type TerminalClosed,
} from "@remote-code/protocol";
import { registry } from "./agent-registry.js";
import * as queries from "../db/queries.js";

const browserSessions = new Map<string, WebSocket>();

export function openTerminal(
  browserWs: WebSocket, sessionId: string, nodeId: string,
  cols: number, rows: number, cwd?: string, command?: string
): boolean {
  const sent = registry.sendToAgent(nodeId, {
    type: "spawn-pty", sessionId, cols, rows, cwd, command,
  });
  if (sent) {
    browserSessions.set(sessionId, browserWs);
    registry.get(nodeId)?.sessions.add(sessionId);
    queries.createSession(sessionId, nodeId, cwd || "/");
    browserWs.send(encode({ type: "terminal-opened", sessionId, nodeId } as TerminalOpened));
  }
  return sent;
}

export function handlePtyData(sessionId: string, data: string): void {
  const ws = browserSessions.get(sessionId);
  if (ws?.readyState === 1) {
    ws.send(encode({ type: "terminal-data", sessionId, data } as TerminalData));
  }
  queries.updateSessionActivity(sessionId);
}

export function handlePtyExit(sessionId: string, exitCode: number): void {
  const ws = browserSessions.get(sessionId);
  if (ws?.readyState === 1) {
    ws.send(encode({ type: "terminal-closed", sessionId, exitCode } as TerminalClosed));
  }
  browserSessions.delete(sessionId);
  queries.setSessionStatus(sessionId, "closed");
}

export function sendInput(sessionId: string, nodeId: string, data: string): void {
  registry.sendToAgent(nodeId, { type: "pty-input", sessionId, data });
}

export function resize(sessionId: string, nodeId: string, cols: number, rows: number): void {
  registry.sendToAgent(nodeId, { type: "pty-resize", sessionId, cols, rows });
}

export function close(sessionId: string, nodeId: string): void {
  registry.sendToAgent(nodeId, { type: "kill-pty", sessionId });
  browserSessions.delete(sessionId);
  queries.setSessionStatus(sessionId, "closed");
}

export function detachBrowser(browserWs: WebSocket): void {
  for (const [sid, ws] of browserSessions.entries()) {
    if (ws === browserWs) {
      browserSessions.delete(sid);
      queries.setSessionStatus(sid, "detached");
    }
  }
}

export function reattach(browserWs: WebSocket, sessionId: string): void {
  browserSessions.set(sessionId, browserWs);
  queries.setSessionStatus(sessionId, "active");
}
```

- [ ] **Step 5: Implement file proxy**

`packages/hub/src/ws/file-proxy.ts`:
```typescript
import type WebSocket from "ws";
import { encode, type BrowserFsResponse } from "@remote-code/protocol";
import { registry } from "./agent-registry.js";

const pending = new Map<string, WebSocket>();

export function proxyRequest(
  browserWs: WebSocket, nodeId: string,
  requestId: string, action: string, filePath: string, data?: string
): boolean {
  pending.set(requestId, browserWs);
  return registry.sendToAgent(nodeId, {
    type: "fs-request", requestId, action: action as any, path: filePath, data,
  });
}

export function handleResponse(requestId: string, data: unknown, error?: string): void {
  const ws = pending.get(requestId);
  if (ws?.readyState === 1) {
    ws.send(encode({ type: "browser-fs-response", requestId, data, error } as BrowserFsResponse));
  }
  pending.delete(requestId);
}
```

- [ ] **Step 6: Implement browser WebSocket handler**

`packages/hub/src/ws/browser-handler.ts`:
```typescript
import type WebSocket from "ws";
import { decode, encode, type BrowserMessage, type HubToBrowserMessage } from "@remote-code/protocol";
import { validateToken } from "../auth/tokens.js";
import { registry } from "./agent-registry.js";
import * as terminalProxy from "./terminal-proxy.js";
import * as fileProxy from "./file-proxy.js";
import * as queries from "../db/queries.js";
import { v4 as uuid } from "uuid";

const subscribedBrowsers = new Set<WebSocket>();

// Track session -> nodeId mapping
const sessionNodeMap = new Map<string, string>();

export function handleBrowserConnection(ws: WebSocket): void {
  let authenticated = false;

  ws.on("message", (raw) => {
    const msg = decode<BrowserMessage>(raw.toString());

    if (!authenticated && msg.type !== "browser-auth") {
      ws.send(encode({
        type: "auth-result", success: false, error: "Not authenticated"
      } as HubToBrowserMessage));
      return;
    }

    switch (msg.type) {
      case "browser-auth": {
        authenticated = validateToken(msg.token);
        ws.send(encode({
          type: "auth-result",
          success: authenticated,
          error: authenticated ? undefined : "Invalid token",
        } as HubToBrowserMessage));
        break;
      }
      case "subscribe-nodes": {
        subscribedBrowsers.add(ws);
        const nodes = queries.getAllNodes();
        const onlineIds = new Set(registry.getOnlineNodeIds());
        for (const node of nodes) {
          node.status = onlineIds.has(node.nodeId) ? "online" : "offline";
        }
        ws.send(encode({ type: "node-list", nodes } as HubToBrowserMessage));
        break;
      }
      case "open-terminal": {
        const sessionId = msg.sessionId || uuid();
        sessionNodeMap.set(sessionId, msg.nodeId);
        terminalProxy.openTerminal(
          ws, sessionId, msg.nodeId, msg.cols, msg.rows, msg.cwd, msg.command
        );
        break;
      }
      case "terminal-input": {
        const nodeId = sessionNodeMap.get(msg.sessionId);
        if (nodeId) terminalProxy.sendInput(msg.sessionId, nodeId, msg.data);
        break;
      }
      case "terminal-resize": {
        const nodeId = sessionNodeMap.get(msg.sessionId);
        if (nodeId) terminalProxy.resize(msg.sessionId, nodeId, msg.cols, msg.rows);
        break;
      }
      case "close-terminal": {
        const nodeId = sessionNodeMap.get(msg.sessionId);
        if (nodeId) terminalProxy.close(msg.sessionId, nodeId);
        sessionNodeMap.delete(msg.sessionId);
        break;
      }
      case "browser-fs-request": {
        fileProxy.proxyRequest(
          ws, msg.nodeId, msg.requestId, msg.action, msg.path, msg.data
        );
        break;
      }
    }
  });

  ws.on("close", () => {
    subscribedBrowsers.delete(ws);
    terminalProxy.detachBrowser(ws);
  });
}

registry.onNodeChange((nodeId) => {
  const nodes = queries.getAllNodes();
  const onlineIds = new Set(registry.getOnlineNodeIds());
  const node = nodes.find((n) => n.nodeId === nodeId);
  if (!node) return;
  node.status = onlineIds.has(nodeId) ? "online" : "offline";
  for (const ws of subscribedBrowsers) {
    if (ws.readyState === 1) {
      ws.send(encode({ type: "node-update", node } as HubToBrowserMessage));
    }
  }
});
```

- [ ] **Step 7: Implement custom server (Next.js + WebSocket)**

`packages/hub/server.ts`:
```typescript
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, type WebSocket } from "ws";
import { decode, type AgentMessage } from "@remote-code/protocol";
import { registry } from "./src/ws/agent-registry.js";
import { handleBrowserConnection } from "./src/ws/browser-handler.js";
import * as terminalProxy from "./src/ws/terminal-proxy.js";
import * as fileProxy from "./src/ws/file-proxy.js";
import { updateNodeStats } from "./src/db/queries.js";
import { validateToken, generateToken } from "./src/auth/tokens.js";
import { getDb } from "./src/db/index.js";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url || "/", true));
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const { pathname, query } = parse(req.url || "/", true);

    if (pathname === "/agent") {
      const token = query.token as string;
      if (!token || !validateToken(token)) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => handleAgent(ws));
    } else if (pathname === "/browser") {
      wss.handleUpgrade(req, socket, head, (ws) => handleBrowserConnection(ws));
    } else {
      socket.destroy();
    }
  });

  getDb();
  const db = getDb();
  const { count } = db.prepare("SELECT COUNT(*) as count FROM auth_tokens").get() as any;
  if (count === 0) {
    const token = generateToken("admin");
    console.log(`\n  Generated admin token: ${token}\n`);
  }

  server.listen(port, () => {
    console.log(`\n  Remote Code Hub running on http://localhost:${port}\n`);
  });
});

function handleAgent(ws: WebSocket): void {
  let agent: ReturnType<typeof registry.register> | null = null;

  ws.on("message", (raw) => {
    const msg = decode<AgentMessage>(raw.toString());
    switch (msg.type) {
      case "agent-hello":
        agent = registry.register(ws, msg);
        console.log(`[hub] Agent connected: ${msg.name} (${msg.nodeId})`);
        break;
      case "stats-report":
        if (agent) updateNodeStats(agent.nodeId, msg.cpu, msg.memTotal, msg.memUsed, msg.diskTotal, msg.diskUsed);
        break;
      case "pty-data":
        terminalProxy.handlePtyData(msg.sessionId, msg.data);
        break;
      case "pty-exit":
        terminalProxy.handlePtyExit(msg.sessionId, msg.exitCode);
        break;
      case "fs-response":
        fileProxy.handleResponse(msg.requestId, msg.data, msg.error);
        break;
    }
  });

  ws.on("close", () => {
    if (agent) {
      console.log(`[hub] Agent disconnected: ${agent.name} (${agent.nodeId})`);
      registry.unregister(agent.nodeId);
    }
  });
}
```

- [ ] **Step 8: Commit**

```bash
git add packages/hub/server.ts packages/hub/src
git commit -m "feat: implement hub WebSocket server, database, and auth"
```

---

### Task 4: Hub -- Next.js Config + Dashboard UI

**Files:**
- Create: `packages/hub/next.config.js`
- Create: `packages/hub/tailwind.config.js`
- Create: `packages/hub/postcss.config.js`
- Create: `packages/hub/app/globals.css`
- Create: `packages/hub/app/layout.tsx`
- Create: `packages/hub/app/page.tsx`
- Create: `packages/hub/lib/ws-client.ts`
- Create: `packages/hub/hooks/use-nodes.ts`
- Create: `packages/hub/components/node-card.tsx`
- Create: `packages/hub/components/node-grid.tsx`
- Create: `packages/hub/components/status-badge.tsx`
- Create: `packages/hub/components/stats-bar.tsx`
- Create: `packages/hub/components/login-form.tsx`

- [ ] **Step 1: Create Next.js + Tailwind config**

`packages/hub/next.config.js`:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true };
module.exports = nextConfig;
```

`packages/hub/tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: "#0d1117", light: "#161b22", lighter: "#21262d" },
        border: { DEFAULT: "rgba(255,255,255,0.08)", light: "rgba(255,255,255,0.12)" },
        accent: { DEFAULT: "#58a6ff", dim: "rgba(88,166,255,0.15)" },
        success: { DEFAULT: "#3fb950" },
        danger: { DEFAULT: "#f85149" },
        warning: { DEFAULT: "#d29922" },
      },
    },
  },
  plugins: [],
};
```

`packages/hub/postcss.config.js`:
```javascript
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`packages/hub/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
body { background-color: #0d1117; color: #e6edf3; }
```

- [ ] **Step 2: Create browser WebSocket client, hooks, and components**

All files as specified in the file structure. See Task 4 in the visual companion plan for full implementations of `ws-client.ts`, `use-nodes.ts`, `status-badge.tsx`, `stats-bar.tsx`, `node-card.tsx`, `node-grid.tsx`, `login-form.tsx`, `layout.tsx`, and `page.tsx`.

The key components:
- `ws-client.ts`: Singleton WebSocket client with auto-reconnect and message pub/sub
- `use-nodes.ts`: React hook subscribing to live node updates
- `node-card.tsx`: Card showing node name, status, CPU/mem/disk bars, Terminal + Files buttons
- `node-grid.tsx`: Responsive grid of node cards
- `login-form.tsx`: Token entry form
- `page.tsx`: Dashboard combining auth gate + node grid

- [ ] **Step 3: Commit**

```bash
git add packages/hub/next.config.js packages/hub/tailwind.config.js packages/hub/postcss.config.js packages/hub/app packages/hub/components packages/hub/hooks packages/hub/lib
git commit -m "feat: implement dashboard UI with node grid and auth"
```

---

### Task 5: Terminal View (xterm.js)

**Files:**
- Create: `packages/hub/hooks/use-terminal.ts`
- Create: `packages/hub/components/terminal-panel.tsx`
- Create: `packages/hub/components/terminal-tabs.tsx`
- Create: `packages/hub/app/terminal/page.tsx`

- [ ] **Step 1: Create useTerminal hook, terminal panel, tabs, and page**

Key components:
- `use-terminal.ts`: Hook that opens a terminal session via WS, bridges xterm.js data to/from server
- `terminal-panel.tsx`: xterm.js wrapper with FitAddon, WebGL renderer, ResizeObserver
- `terminal-tabs.tsx`: Tab bar for multiple terminal sessions
- `terminal/page.tsx`: Terminal workspace page with tab management, accepts `?node=` and `?cwd=` and `?command=` query params

- [ ] **Step 2: Commit**

```bash
git add packages/hub/hooks/use-terminal.ts packages/hub/components/terminal-panel.tsx packages/hub/components/terminal-tabs.tsx packages/hub/app/terminal
git commit -m "feat: implement terminal view with xterm.js and tabbed sessions"
```

---

### Task 6: File Browser

**Files:**
- Create: `packages/hub/hooks/use-files.ts`
- Create: `packages/hub/components/file-list.tsx`
- Create: `packages/hub/components/file-actions.tsx`
- Create: `packages/hub/components/upload-dialog.tsx`
- Create: `packages/hub/app/files/[nodeId]/page.tsx`

- [ ] **Step 1: Create file hooks, components, and page**

Key components:
- `use-files.ts`: Hook for list/read/write/delete file operations via WS, promise-based
- `file-list.tsx`: Sorted table (directories first) with name, size, modified, action menu
- `file-actions.tsx`: Context menu with "Open terminal here", "Start Claude Code here", Download, Delete
- `upload-dialog.tsx`: File upload modal with drag-and-drop
- `files/[nodeId]/page.tsx`: File browser page with path navigation, breadcrumbs, upload button

- [ ] **Step 2: Commit**

```bash
git add packages/hub/hooks/use-files.ts packages/hub/components/file-list.tsx packages/hub/components/file-actions.tsx packages/hub/components/upload-dialog.tsx packages/hub/app/files
git commit -m "feat: implement file browser with targeted terminal launch"
```

---

### Task 7: Integration, Auth Flow + Deployment

**Files:**
- Create: `packages/hub/app/api/auth/route.ts`
- Create: `packages/hub/app/api/nodes/route.ts`
- Create: `packages/hub/app/api/sessions/route.ts`
- Create: `packages/agent/install.sh`
- Create: `Dockerfile`
- Create: `packages/agent/remote-code-agent.service`
- Create: `README.md`

- [ ] **Step 1: Create REST API routes**

- `api/auth/route.ts`: POST with `action: "generate"` or `action: "validate"`
- `api/nodes/route.ts`: GET returns all nodes
- `api/sessions/route.ts`: GET with optional `?nodeId=` filter

- [ ] **Step 2: Create agent install script**

`packages/agent/install.sh`: Bash script that installs Node.js if needed, creates `/opt/remote-code-agent/`, writes config, creates systemd service, enables and starts it. Accepts `--hub`, `--token`, `--name` flags.

- [ ] **Step 3: Create Dockerfile for the hub**

Multi-stage build: builder installs deps + builds protocol + builds Next.js, runner copies artifacts and runs via tsx.

- [ ] **Step 4: Create systemd service template**

`packages/agent/remote-code-agent.service`: Standard systemd unit with Restart=always, After=network.target.

- [ ] **Step 5: Create README**

Quick start (hub + agent + browser), production deployment (Docker + systemd), architecture overview.

- [ ] **Step 6: Verify full build**

Run: `npm install && npm run build:protocol && cd packages/hub && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add packages/hub/app/api packages/agent/install.sh packages/agent/remote-code-agent.service Dockerfile README.md
git commit -m "feat: add REST API, install script, Docker, and docs"
```
