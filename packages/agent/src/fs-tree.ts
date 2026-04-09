import fs from "fs";
import path from "path";
import { FsTreeEntry } from "@remote-code/protocol";

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", ".cache",
  "__pycache__", ".venv", "venv", ".tox",
  "target", "build", ".gradle", ".idea",
  ".DS_Store", "Thumbs.db",
]);

const MAX_ENTRIES = 5000;

/**
 * Walk a directory tree up to `depth` levels and return the structure.
 */
export function indexTree(root: string, depth: number = 3): FsTreeEntry[] {
  let count = 0;

  function walk(dir: string, currentDepth: number): FsTreeEntry[] {
    if (currentDepth <= 0 || count >= MAX_ENTRIES) return [];

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }

    // Sort: directories first, then alphabetical
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const result: FsTreeEntry[] = [];

    for (const entry of entries) {
      if (count >= MAX_ENTRIES) break;
      if (entry.name.startsWith(".") && entry.name !== ".env") continue;
      if (IGNORE_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      const isDir = entry.isDirectory();

      let size = 0;
      if (!isDir) {
        try {
          size = fs.statSync(fullPath).size;
        } catch {
          // skip files we can't stat
        }
      }

      count++;

      const node: FsTreeEntry = {
        name: entry.name,
        path: fullPath,
        isDirectory: isDir,
        size,
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
 * Watch a directory for changes and call the callback with updates.
 * Returns a cleanup function.
 */
export function watchTree(
  root: string,
  onChange: (changes: Array<{ action: "add" | "remove" | "modify"; entry: FsTreeEntry; parentPath: string }>) => void
): () => void {
  let watcher: fs.FSWatcher;

  try {
    watcher = fs.watch(root, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      // Ignore common noisy paths
      const parts = filename.split(path.sep);
      if (parts.some(p => IGNORE_DIRS.has(p) || (p.startsWith(".") && p !== ".env"))) return;

      const fullPath = path.join(root, filename);
      const parentPath = path.dirname(fullPath);

      try {
        const stat = fs.statSync(fullPath);
        onChange([{
          action: eventType === "rename" ? "add" : "modify",
          entry: {
            name: path.basename(filename),
            path: fullPath,
            isDirectory: stat.isDirectory(),
            size: stat.isDirectory() ? 0 : stat.size,
          },
          parentPath,
        }]);
      } catch {
        // File was deleted
        onChange([{
          action: "remove",
          entry: {
            name: path.basename(filename),
            path: fullPath,
            isDirectory: false,
            size: 0,
          },
          parentPath,
        }]);
      }
    });
  } catch {
    // Recursive watch not supported — fall back to no watching
    return () => {};
  }

  return () => {
    try { watcher.close(); } catch {}
  };
}
