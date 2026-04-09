import fs from "fs";
import path from "path";
import { FsTreeEntry } from "@remote-code/protocol";

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", ".cache",
  "__pycache__", ".venv", "venv", ".tox",
  "target", "build", ".gradle", ".idea",
  ".DS_Store", "Thumbs.db",
  // Large system/tool directories
  ".npm", ".nvm", ".cargo", ".rustup", ".local",
  ".vscode-server", ".claude", "Library",
]);

const MAX_ENTRIES = 3000;
const MAX_TIME_MS = 2000;

/**
 * Walk a directory tree up to `depth` levels and return the structure.
 * Skips heavy directories and bails out after MAX_TIME_MS or MAX_ENTRIES.
 */
export function indexTree(root: string, depth: number = 3): FsTreeEntry[] {
  let count = 0;
  const startTime = Date.now();

  function walk(dir: string, currentDepth: number): FsTreeEntry[] {
    if (currentDepth <= 0 || count >= MAX_ENTRIES) return [];
    if (Date.now() - startTime > MAX_TIME_MS) return [];

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }

    // Skip directories with too many entries (likely generated)
    if (entries.length > 500) return [];

    // Sort: directories first, then alphabetical
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const result: FsTreeEntry[] = [];

    for (const entry of entries) {
      if (count >= MAX_ENTRIES) break;
      if (Date.now() - startTime > MAX_TIME_MS) break;
      if (entry.name.startsWith(".") && entry.name !== ".env") continue;
      if (IGNORE_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      const isDir = entry.isDirectory();

      count++;

      const node: FsTreeEntry = {
        name: entry.name,
        path: fullPath,
        isDirectory: isDir,
        size: 0, // skip statSync for speed — size populated on demand
      };

      if (isDir) {
        node.children = walk(fullPath, currentDepth - 1);
      }

      result.push(node);
    }

    return result;
  }

  return walk(root, depth);
}

/**
 * Watch a directory for changes (top-level only to avoid OS overload).
 * Debounces changes over 500ms. Returns a cleanup function.
 */
export function watchTree(
  root: string,
  onChange: (changes: Array<{ action: "add" | "remove" | "modify"; entry: FsTreeEntry; parentPath: string }>) => void
): () => void {
  let pending: Array<{ action: "add" | "remove" | "modify"; entry: FsTreeEntry; parentPath: string }> = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    if (pending.length > 0) {
      onChange([...pending]);
      pending = [];
    }
    timer = null;
  }

  let watcher: fs.FSWatcher;
  try {
    watcher = fs.watch(root, { recursive: false }, (eventType, filename) => {
      if (!filename || filename.startsWith(".") || IGNORE_DIRS.has(filename)) return;

      const fullPath = path.join(root, filename);
      try {
        const stat = fs.statSync(fullPath);
        pending.push({
          action: eventType === "rename" ? "add" : "modify",
          entry: { name: filename, path: fullPath, isDirectory: stat.isDirectory(), size: 0 },
          parentPath: root,
        });
      } catch {
        pending.push({
          action: "remove",
          entry: { name: filename, path: fullPath, isDirectory: false, size: 0 },
          parentPath: root,
        });
      }
      if (!timer) timer = setTimeout(flush, 500);
    });
  } catch {
    return () => {};
  }

  return () => {
    if (timer) clearTimeout(timer);
    try { watcher.close(); } catch {}
  };
}
