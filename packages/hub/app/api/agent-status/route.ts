import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../src/db/index";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nodeId, status, exitCode, message, token } = body;

    if (!nodeId || !token) {
      return NextResponse.json({ error: "Missing nodeId or token" }, { status: 400 });
    }

    // Verify token
    const { hashToken } = await import("../../../src/auth/tokens");
    const { findAuthToken } = await import("../../../src/db/queries");
    const tokenHash = hashToken(token);
    if (!findAuthToken(tokenHash)) {
      return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }

    // Log the status report
    const db = getDb();
    const now = Date.now();

    // Store in a simple status log table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS agent_status_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id TEXT NOT NULL,
        status TEXT NOT NULL,
        exit_code INTEGER,
        message TEXT,
        timestamp INTEGER NOT NULL
      )
    `).run();

    db.prepare(`
      INSERT INTO agent_status_log (node_id, status, exit_code, message, timestamp)
      VALUES (@nodeId, @status, @exitCode, @message, @now)
    `).run({ nodeId, status: status ?? "unknown", exitCode: exitCode ?? null, message: message ?? "", now });

    // Keep only last 100 entries per node
    db.prepare(`
      DELETE FROM agent_status_log WHERE node_id = @nodeId AND id NOT IN (
        SELECT id FROM agent_status_log WHERE node_id = @nodeId ORDER BY timestamp DESC LIMIT 100
      )
    `).run({ nodeId });

    console.log(`[agent-status] ${nodeId}: ${status} (exit ${exitCode ?? "?"}) — ${message ?? ""}`);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const nodeId = req.nextUrl.searchParams.get("nodeId");
  if (!nodeId) {
    return NextResponse.json({ error: "Missing nodeId" }, { status: 400 });
  }

  const db = getDb();
  try {
    const rows = db.prepare(`
      SELECT * FROM agent_status_log WHERE node_id = ? ORDER BY timestamp DESC LIMIT 20
    `).all(nodeId);
    return NextResponse.json({ logs: rows });
  } catch {
    return NextResponse.json({ logs: [] });
  }
}
