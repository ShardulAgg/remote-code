import { NodeInfo, SessionInfo } from "@remote-code/protocol";
import { getDb } from "./index.js";

// ---- Node queries ----

export function upsertNode(info: {
  nodeId: string;
  name: string;
  os: string;
  arch: string;
  hostname: string;
}): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    INSERT INTO nodes (node_id, name, status, os, arch, hostname, last_seen)
    VALUES (@nodeId, @name, 'online', @os, @arch, @hostname, @lastSeen)
    ON CONFLICT(node_id) DO UPDATE SET
      name = excluded.name,
      status = 'online',
      os = excluded.os,
      arch = excluded.arch,
      hostname = excluded.hostname,
      last_seen = excluded.last_seen
  `).run({ ...info, lastSeen: now });
}

export function updateNodeStats(
  nodeId: string,
  stats: {
    cpu: number;
    memTotal: number;
    memUsed: number;
    diskTotal: number;
    diskUsed: number;
  }
): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    UPDATE nodes SET
      cpu = @cpu,
      mem_total = @memTotal,
      mem_used = @memUsed,
      disk_total = @diskTotal,
      disk_used = @diskUsed,
      last_seen = @lastSeen
    WHERE node_id = @nodeId
  `).run({ nodeId, ...stats, lastSeen: now });
}

export function setNodeOffline(nodeId: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE nodes SET status = 'offline', last_seen = @lastSeen WHERE node_id = @nodeId
  `).run({ nodeId, lastSeen: Date.now() });
}

export function getAllNodes(): NodeInfo[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM nodes`).all() as Record<string, unknown>[];
  return rows.map(rowToNodeInfo);
}

function rowToNodeInfo(row: Record<string, unknown>): NodeInfo {
  return {
    nodeId: row.node_id as string,
    name: row.name as string,
    status: row.status as "online" | "offline",
    os: row.os as string,
    arch: row.arch as string,
    hostname: row.hostname as string,
    cpu: row.cpu as number,
    memTotal: row.mem_total as number,
    memUsed: row.mem_used as number,
    diskTotal: row.disk_total as number,
    diskUsed: row.disk_used as number,
    activeSessions: row.active_sessions as number,
    lastSeen: row.last_seen as number,
  };
}

export function getNodeInfo(nodeId: string): NodeInfo | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM nodes WHERE node_id = ?`).get(nodeId) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToNodeInfo(row) : null;
}

// ---- Session queries ----

export function createSession(info: {
  sessionId: string;
  nodeId: string;
  cwd: string;
}): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    INSERT OR IGNORE INTO sessions (session_id, node_id, cwd, created_at, last_active, status)
    VALUES (@sessionId, @nodeId, @cwd, @now, @now, 'active')
  `).run({ ...info, now });
  // Update active session count
  _updateActiveSessionCount(info.nodeId);
}

export function updateSessionActivity(sessionId: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE sessions SET last_active = @now WHERE session_id = @sessionId
  `).run({ sessionId, now: Date.now() });
}

export function setSessionStatus(
  sessionId: string,
  status: "active" | "detached" | "closed"
): void {
  const db = getDb();
  db.prepare(`
    UPDATE sessions SET status = @status WHERE session_id = @sessionId
  `).run({ sessionId, status });

  // Update active session count on the node
  const session = db
    .prepare(`SELECT node_id FROM sessions WHERE session_id = ?`)
    .get(sessionId) as { node_id: string } | undefined;
  if (session) {
    _updateActiveSessionCount(session.node_id);
  }
}

export function getActiveSessions(): SessionInfo[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM sessions WHERE status != 'closed'`)
    .all() as Record<string, unknown>[];
  return rows.map(rowToSessionInfo);
}

function rowToSessionInfo(row: Record<string, unknown>): SessionInfo {
  return {
    sessionId: row.session_id as string,
    nodeId: row.node_id as string,
    cwd: row.cwd as string,
    createdAt: row.created_at as number,
    lastActive: row.last_active as number,
    status: row.status as "active" | "detached",
  };
}

function _updateActiveSessionCount(nodeId: string): void {
  const db = getDb();
  const result = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM sessions WHERE node_id = ? AND status = 'active'`
    )
    .get(nodeId) as { cnt: number };
  db.prepare(`UPDATE nodes SET active_sessions = ? WHERE node_id = ?`).run(
    result.cnt,
    nodeId
  );
}

// ---- Auth token queries ----

export function countAuthTokens(): number {
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(*) as cnt FROM auth_tokens`).get() as {
    cnt: number;
  };
  return row.cnt;
}

export function insertAuthToken(tokenHash: string, label: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO auth_tokens (token_hash, label) VALUES (?, ?)`
  ).run(tokenHash, label);
}

export function findAuthToken(tokenHash: string): boolean {
  const db = getDb();
  const row = db
    .prepare(`SELECT id FROM auth_tokens WHERE token_hash = ?`)
    .get(tokenHash);
  return row !== undefined;
}
