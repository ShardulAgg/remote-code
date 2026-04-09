import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
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

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateToken(): string {
  return `rc_${randomBytes(24).toString("hex")}`;
}

export async function POST(req: Request) {
  const body = await req.json();

  if (body.action === "generate") {
    const label: string = body.label || "api-generated";
    const token = generateToken();
    const db = getDb();
    db.prepare("INSERT INTO auth_tokens (token_hash, label) VALUES (?, ?)").run(hashToken(token), label);
    db.close();
    return NextResponse.json({ token, label });
  }

  if (body.action === "validate") {
    const db = getDb();
    const row = db.prepare("SELECT id FROM auth_tokens WHERE token_hash = ?").get(hashToken(body.token));
    db.close();
    return NextResponse.json({ valid: !!row });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
