import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { join } from "path";
import {
  CREATE_NODES_TABLE,
  CREATE_SESSIONS_TABLE,
  CREATE_AUTH_TOKENS_TABLE,
} from "./schema.js";

const DATA_DIR = join(process.cwd(), "data");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  mkdirSync(DATA_DIR, { recursive: true });

  const dbPath = join(DATA_DIR, "hub.db");
  _db = new Database(dbPath);

  // Enable WAL mode for better concurrent performance
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  // Run migrations / create tables
  _db.exec(CREATE_NODES_TABLE);
  _db.exec(CREATE_SESSIONS_TABLE);
  _db.exec(CREATE_AUTH_TOKENS_TABLE);

  return _db;
}
