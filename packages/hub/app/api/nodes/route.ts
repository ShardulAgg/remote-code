import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";
import { mkdirSync } from "fs";

function getDb() {
  const dataDir = join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, "hub.db"));
  db.pragma("journal_mode = WAL");
  return db;
}

export async function GET() {
  const db = getDb();
  const nodes = db.prepare("SELECT * FROM nodes").all();
  db.close();
  return NextResponse.json({ nodes });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const { nodeId } = body;

  if (!nodeId) {
    return NextResponse.json({ error: "Missing nodeId" }, { status: 400 });
  }

  const db = getDb();
  db.prepare("DELETE FROM nodes WHERE node_id = ?").run(nodeId);
  db.prepare("DELETE FROM sessions WHERE node_id = ?").run(nodeId);
  db.close();

  return NextResponse.json({ ok: true });
}
