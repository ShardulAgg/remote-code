#!/usr/bin/env bash
set -euo pipefail

# remote-code-agent installer
# Usage: install.sh --hub <url> --token <token> [--name <name>]

AGENT_DIR="/opt/remote-code-agent"
SERVICE_NAME="remote-code-agent"
HUB_URL=""
TOKEN=""
NODE_NAME=""

usage() {
  echo "Usage: $0 --hub <hub-url> --token <token> [--name <node-name>]"
  echo ""
  echo "  --hub    Hub WebSocket URL (e.g. ws://your-hub:3001)"
  echo "  --token  Authentication token from hub admin"
  echo "  --name   Node display name (default: hostname)"
  exit 1
}

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --hub)
      HUB_URL="$2"
      shift 2
      ;;
    --token)
      TOKEN="$2"
      shift 2
      ;;
    --name)
      NODE_NAME="$2"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown flag: $1" >&2
      usage
      ;;
  esac
done

# Validate required args
if [[ -z "$HUB_URL" || -z "$TOKEN" ]]; then
  echo "Error: --hub and --token are required." >&2
  usage
fi

if [[ -z "$NODE_NAME" ]]; then
  NODE_NAME="$(hostname)"
fi

# Check for Node.js
if ! command -v node &>/dev/null; then
  echo "Error: Node.js is not installed." >&2
  echo "Install it via your package manager, e.g.:" >&2
  echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -" >&2
  echo "  sudo apt-get install -y nodejs" >&2
  exit 1
fi

NODE_VERSION="$(node --version)"
echo "Found Node.js $NODE_VERSION"

# Require root for system install
if [[ "$(id -u)" -ne 0 ]]; then
  echo "Error: This script must be run as root (use sudo)." >&2
  exit 1
fi

echo "Installing remote-code-agent to $AGENT_DIR ..."
mkdir -p "$AGENT_DIR"

# Determine source: if running from within the repo, copy files; otherwise clone
SCRIPT_DIR=""
if [[ -n "${BASH_SOURCE[0]:-}" && "${BASH_SOURCE[0]}" != "bash" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
fi

if [[ -n "$SCRIPT_DIR" && -f "$SCRIPT_DIR/package.json" ]]; then
  echo "Copying agent files from $SCRIPT_DIR ..."
  cp -r "$SCRIPT_DIR/." "$AGENT_DIR/"
else
  echo "Cloning agent from source ..."
  if ! command -v git &>/dev/null; then
    echo "Error: git is not installed. Install git or run this script from the agent source directory." >&2
    exit 1
  fi
  git clone --depth=1 https://github.com/ShardulAgg/remote-code.git "$AGENT_DIR/repo"
  cp -r "$AGENT_DIR/repo/packages/agent/." "$AGENT_DIR/"
  # Also copy protocol package (dependency)
  mkdir -p "$AGENT_DIR/node_modules/@remote-code"
  cp -r "$AGENT_DIR/repo/packages/protocol" "$AGENT_DIR/node_modules/@remote-code/protocol"
  rm -rf "$AGENT_DIR/repo"
fi

# Install dependencies and build
echo "Installing npm dependencies ..."
cd "$AGENT_DIR"
npm install --ignore-scripts
# Build protocol dependency first
if [[ -d "$AGENT_DIR/node_modules/@remote-code/protocol" ]]; then
  echo "Building protocol package ..."
  cd "$AGENT_DIR/node_modules/@remote-code/protocol"
  npx tsc 2>/dev/null || true
  cd "$AGENT_DIR"
fi
echo "Building agent ..."
npx tsc 2>/dev/null || true
# If build failed, install tsx as fallback to run from source
if [[ ! -f "$AGENT_DIR/dist/index.js" ]]; then
  echo "TypeScript build failed, installing tsx for source execution ..."
  npm install tsx
fi

# Write environment config
cat > "$AGENT_DIR/.env" <<EOF
HUB_URL=${HUB_URL}
TOKEN=${TOKEN}
NODE_NAME=${NODE_NAME}
EOF
chmod 600 "$AGENT_DIR/.env"

# Determine the exec command
if [[ -f "${AGENT_DIR}/dist/index.js" ]]; then
  EXEC_CMD="$(command -v node) ${AGENT_DIR}/dist/index.js"
else
  EXEC_CMD="$(command -v npx) tsx ${AGENT_DIR}/src/index.ts"
fi

# Write systemd service
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Remote Code Agent
After=network.target

[Service]
Type=simple
WorkingDirectory=${AGENT_DIR}
EnvironmentFile=${AGENT_DIR}/.env
ExecStart=${EXEC_CMD}
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo ""
echo "remote-code-agent installed and started."
echo "  Hub:   $HUB_URL"
echo "  Name:  $NODE_NAME"
echo ""
echo "Check status with:  systemctl status $SERVICE_NAME"
echo "View logs with:     journalctl -u $SERVICE_NAME -f"
