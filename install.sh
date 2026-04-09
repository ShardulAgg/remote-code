#!/usr/bin/env bash
set -euo pipefail

# Remote Code Agent — one-line installer
# Usage: curl -sL https://raw.githubusercontent.com/ShardulAgg/remote-code/main/install.sh | bash -s -- --hub <url> --token <token> [--name <name>]

HUB_URL=""
TOKEN=""
NODE_NAME="$(hostname)"
INSTALL_DIR="$HOME/.remote-code-agent"

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --hub)   HUB_URL="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --name)  NODE_NAME="$2"; shift 2 ;;
    *)       echo "Unknown flag: $1"; exit 1 ;;
  esac
done

if [[ -z "$HUB_URL" || -z "$TOKEN" ]]; then
  echo "Usage: $0 --hub <hub-url> --token <token> [--name <name>]"
  exit 1
fi

echo "=== Remote Code Agent Installer ==="
echo ""

# 1. Install Node.js if missing
if ! command -v node &>/dev/null; then
  echo "[1/5] Installing Node.js..."
  if command -v curl &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - 2>/dev/null
    sudo apt-get install -y nodejs 2>/dev/null
  elif command -v apt-get &>/dev/null; then
    sudo apt-get update -qq && sudo apt-get install -y nodejs npm 2>/dev/null
  else
    echo "Error: Cannot install Node.js automatically. Install it manually and re-run."
    exit 1
  fi
else
  echo "[1/5] Node.js found: $(node --version)"
fi

# 2. Install build tools if missing (needed for node-pty)
if ! command -v make &>/dev/null || ! command -v g++ &>/dev/null; then
  echo "[2/5] Installing build tools..."
  if command -v apt-get &>/dev/null; then
    sudo apt-get install -y build-essential 2>/dev/null
  elif command -v yum &>/dev/null; then
    sudo yum groupinstall -y "Development Tools" 2>/dev/null
  elif command -v dnf &>/dev/null; then
    sudo dnf groupinstall -y "Development Tools" 2>/dev/null
  else
    echo "Warning: Could not install build tools. node-pty may fail to compile."
  fi
else
  echo "[2/5] Build tools found"
fi

# 3. Clone or update the repo
if [[ -d "$INSTALL_DIR" ]]; then
  echo "[3/5] Updating existing installation..."
  cd "$INSTALL_DIR"
  git pull --quiet 2>/dev/null || true
else
  echo "[3/5] Downloading Remote Code..."
  git clone --depth=1 https://github.com/ShardulAgg/remote-code.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# 4. Install dependencies and build
echo "[4/5] Installing dependencies..."
npm install --loglevel=error 2>&1 | tail -3
echo "       Building protocol..."
npx tsc -p packages/protocol 2>/dev/null
echo "       Done"

# 5. Write config and create start script
cat > "$INSTALL_DIR/.env" <<EOF
HUB_URL=${HUB_URL}
TOKEN=${TOKEN}
NODE_NAME=${NODE_NAME}
EOF
chmod 600 "$INSTALL_DIR/.env"

cat > "$INSTALL_DIR/start.sh" <<'STARTEOF'
#!/usr/bin/env bash
cd "$(dirname "$0")"
set -a; source .env; set +a
exec npx tsx packages/agent/src/index.ts --hub "$HUB_URL" --token "$TOKEN" --name "$NODE_NAME"
STARTEOF
chmod +x "$INSTALL_DIR/start.sh"

# Try to set up systemd if we have root
if [[ "$(id -u)" -eq 0 ]] || sudo -n true 2>/dev/null; then
  echo "[5/5] Setting up systemd service..."
  SERVICE_FILE="/etc/systemd/system/remote-code-agent.service"
  sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Remote Code Agent
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=${INSTALL_DIR}
ExecStart=$(command -v bash) ${INSTALL_DIR}/start.sh
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable remote-code-agent
  sudo systemctl restart remote-code-agent

  echo ""
  echo "=== Installed and running ==="
  echo "  Hub:    $HUB_URL"
  echo "  Name:   $NODE_NAME"
  echo "  Dir:    $INSTALL_DIR"
  echo ""
  echo "  Status: sudo systemctl status remote-code-agent"
  echo "  Logs:   sudo journalctl -u remote-code-agent -f"
  echo "  Stop:   sudo systemctl stop remote-code-agent"
else
  echo "[5/5] No root access — skipping systemd setup"
  echo ""
  echo "=== Installed ==="
  echo "  Hub:    $HUB_URL"
  echo "  Name:   $NODE_NAME"
  echo "  Dir:    $INSTALL_DIR"
  echo ""
  echo "  Start:  $INSTALL_DIR/start.sh"

  # Start it now
  echo ""
  echo "Starting agent..."
  exec "$INSTALL_DIR/start.sh"
fi
