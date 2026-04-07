# Remote Code

A self-hosted platform for securely accessing and managing remote terminals from a central web dashboard.

## Quick Start

### 1. Start the Hub

```bash
npm install
npm run build:protocol
npm run dev:hub
```

The hub starts on `http://localhost:3000`. On first run it prints an **admin token** to the console — save it, you'll need it to log in.

### 2. Connect a Node

On the machine you want to manage, run the agent install script:

```bash
sudo bash packages/agent/install.sh \
  --hub ws://your-hub-host:3001 \
  --token <admin-token> \
  --name my-server
```

Or run the agent directly (dev mode):

```bash
npm run dev:agent -- --hub ws://localhost:3001 --token <admin-token> --name local
```

### 3. Open the Dashboard

Visit `http://localhost:3000` and enter your token when prompted. Connected nodes appear in the sidebar — click one to open a terminal session.

---

## REST API

The hub exposes a small REST API:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth` | Generate or validate tokens |
| `GET` | `/api/nodes` | List all registered nodes |
| `GET` | `/api/sessions?nodeId=<id>` | List active sessions |

**Generate a token:**
```bash
curl -X POST http://localhost:3000/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"action":"generate","label":"ci-runner"}'
```

**Validate a token:**
```bash
curl -X POST http://localhost:3000/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"action":"validate","token":"rc_..."}'
```

---

## Production Deployment

### Hub — Docker

```bash
docker build -t remote-code-hub .
docker run -d \
  -p 3000:3000 \
  -v remote-code-data:/app/data \
  --name hub \
  remote-code-hub
```

The SQLite database is stored in `/app/data` inside the container. Mount a volume to persist it across restarts.

### Agent — systemd

Use the install script on each node you want to manage:

```bash
curl -fsSL https://your-hub/install.sh | sudo bash -s -- \
  --hub ws://your-hub:3001 \
  --token <token> \
  --name <node-name>
```

Or manually copy `packages/agent/remote-code-agent.service` to `/etc/systemd/system/`, edit `ExecStart` and the `EnvironmentFile`, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now remote-code-agent
```

---

## Architecture

```
┌──────────────────────────────────────────────┐
│  Browser                                     │
│  Next.js UI  ──── REST API (/api/*)          │
└──────────────┬───────────────────────────────┘
               │ WebSocket (port 3001)
┌──────────────▼───────────────────────────────┐
│  Hub (Node.js + Next.js)                     │
│  • Auth token validation                     │
│  • Node registry (SQLite)                    │
│  • Session routing                           │
└──────────────┬───────────────────────────────┘
               │ WebSocket (outbound)
     ┌─────────┴────────┐
     │                  │
┌────▼────┐        ┌────▼────┐
│ Agent A │        │ Agent B │
│ Node 1  │        │ Node 2  │
│ (pty)   │        │ (pty)   │
└─────────┘        └─────────┘
```

- **Protocol** (`packages/protocol`): shared TypeScript types and message schemas
- **Hub** (`packages/hub`): Next.js app serving the dashboard and WebSocket server for node connections
- **Agent** (`packages/agent`): lightweight daemon that runs on each managed node, spawns PTY sessions, and streams I/O to the hub
