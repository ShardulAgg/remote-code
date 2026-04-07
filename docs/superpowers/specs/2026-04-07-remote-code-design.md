# Remote Code — System Design Spec

## Problem

Engineers running parallel Claude Code agents across multiple Linux machines currently manage this through multiple SSH sessions. This is chaotic: terminals disconnect and lose context, there's no unified view of all agents, and reconnecting to a lost session means starting over.

## Solution

A web application ("Remote Code") that provides a unified dashboard to manage, monitor, and interact with Claude Code sessions running on multiple remote Linux nodes — via persistent WebSocket connections that survive disconnects.

## Users

- Primary: The author (solo engineer running 2-3 parallel agents across VMs and bare metal servers)
- Future: Offered as a service and/or open-sourced for other engineers

## Architecture

Three components:

### 1. Hub Server (Next.js)

The central webapp that serves the browser UI and brokers all connections to nodes.

**Stack:** Next.js 14 (App Router), WebSocket (ws library), SQLite (better-sqlite3), Tailwind CSS

**Responsibilities:**
- **Node registry** — nodes register on WebSocket connect; hub tracks online/offline status, system stats
- **Terminal proxy** — bridges browser WebSocket ↔ node WebSocket for terminal I/O
- **Session management** — tracks active PTY sessions per node, allows reconnect after browser refresh/disconnect
- **File browser API** — proxies file system operations to nodes via the agent
- **Auth** — token-based authentication for MVP
- **Port forwarding** (Phase 2) — tunnel arbitrary node ports to browser

### 2. Node Agent (Node.js)

A lightweight daemon (~200 lines) that runs on each remote server. Installed via one-liner:

```bash
curl -sL https://your-hub/install.sh | bash -s -- --token YOUR_TOKEN
```

**Responsibilities:**
- Connects **outbound** to the hub via WebSocket (port 443) — no inbound ports needed on nodes
- Spawns PTY (pseudo-terminal) sessions on demand
- Streams terminal I/O bidirectionally to the hub
- Reports system stats (CPU, memory, disk) periodically
- Serves file system operations (list, read, write, upload, download)
- **Auto-reconnects** on disconnect — PTY sessions stay alive on the node
- Runs as systemd service for auto-start on boot

**Key design decision:** Nodes connect outbound to the hub. This means:
- Works behind NAT, firewalls, corporate networks
- No SSH key distribution needed
- Adding a node = running one command
- Hub doesn't need to know node IPs in advance

### 3. Browser Client

A Next.js-served SPA with three main views:

**Node Grid (Dashboard)**
- All nodes at a glance: name, status (online/offline), CPU/memory/disk usage, active session count
- Click a node to open a terminal or file browser
- Visual indicators for nodes with running Claude Code sessions

**Terminal View**
- Tabbed/split xterm.js terminals — each tab is a session on a specific node
- Sessions survive page refresh and browser close (reconnect to existing PTY)
- Ability to launch terminal into a specific directory (from file browser)
- Ability to launch Claude Code directly into a specific project folder

**File Browser**
- Browse files on any connected node
- Upload/download files
- Navigate to a folder and "Open terminal here" or "Start Claude Code here"
- Ties into terminal view as a session launcher

## Connection Flow

```
1. Node agent starts → connects to hub via wss://hub-url/agent?token=XXX
2. Hub registers node → adds to registry, starts receiving stats
3. User opens browser → sees node grid with all connected nodes
4. User clicks "Open terminal" on Node 1
   → Browser opens WebSocket to hub: wss://hub-url/terminal?node=node-1
   → Hub sends "spawn-pty" command to Node 1's agent
   → Agent spawns PTY, starts streaming I/O
   → Hub bridges: browser WS ↔ node WS
   → xterm.js renders the terminal
5. User closes browser tab
   → PTY stays alive on node
   → User reopens → reconnects to same PTY session
6. Network blip between node and hub
   → Agent auto-reconnects
   → Existing PTY sessions resume
```

## Data Model (SQLite)

**nodes**
- id, name, token, last_seen, status, cpu, memory, disk

**sessions**
- id, node_id, pty_id, working_directory, created_at, last_active, status (active/detached/closed)

**auth_tokens**
- id, token_hash, label, created_at, expires_at

## Deployment Note

The hub runs as a single process. Next.js handles HTTP; a custom WebSocket server (ws library) runs on the same port via the Node.js `http.Server` upgrade event. This avoids needing a separate WebSocket server or reverse proxy config. In production, put behind nginx/Caddy for TLS termination — both HTTP and WSS traffic go to the same upstream port.

## SSH Compatibility

The agent does not replace SSH. Nodes still run sshd. If the hub goes down, users can SSH directly to any node. The agent augments SSH with:
- Persistent sessions that survive disconnects
- A unified web UI across all nodes
- No need to manage SSH keys for the web interface
- File browsing without SCP/SFTP

## MVP Scope

### Phase 1 (MVP)
- Node agent: WebSocket connect, PTY spawn, reconnect, system stats, file operations
- Hub server: node registry, terminal proxy, session persistence, file browser API, token auth
- Browser UI: node grid dashboard, tabbed xterm.js terminals, file browser, targeted terminal launch (open terminal/Claude Code in a specific folder)

### Phase 2
- Port forwarding / web preview (proxy node ports to browser)
- Multi-user auth (OAuth / SSO)
- Session sharing (read-only spectator mode)

### Phase 3
- Node provisioning (spin up Docker containers / cloud VMs from the dashboard)
- Collaboration features
- API for programmatic access
- Mobile-responsive UI

## Tech Stack Summary

| Component | Technology |
|-----------|-----------|
| Hub frontend | Next.js 14, Tailwind CSS, xterm.js |
| Hub backend | Next.js API routes + custom WebSocket server |
| Hub database | SQLite (better-sqlite3) |
| Node agent | Node.js, ws, node-pty |
| Auth | Token-based (MVP), OAuth (Phase 2) |
| Deployment | Docker (hub), systemd (agent) |

## Non-Goals (MVP)

- Container orchestration / Kubernetes
- Multi-tenant isolation
- Billing / usage metering
- IDE features (code editor, LSP, etc.)
- Mobile app
