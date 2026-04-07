import fs from "fs";
import path from "path";

export type FsAction = "list" | "read" | "write" | "stat" | "mkdir" | "delete";

export interface FsResult {
  data?: unknown;
  error?: string;
}

export function handleFsRequest(
  action: FsAction,
  targetPath: string,
  data?: string
): FsResult {
  const resolved = path.resolve(targetPath);

  try {
    switch (action) {
      case "list": {
        const entries = fs.readdirSync(resolved, { withFileTypes: true });
        return {
          data: entries.map((e) => ({
            name: e.name,
            isDirectory: e.isDirectory(),
            isFile: e.isFile(),
            isSymbolicLink: e.isSymbolicLink(),
          })),
        };
      }

      case "read": {
        const content = fs.readFileSync(resolved);
        return { data: content.toString("base64") };
      }

      case "write": {
        if (data === undefined) {
          return { error: "No data provided for write operation" };
        }
        const buf = Buffer.from(data, "base64");
        fs.writeFileSync(resolved, buf);
        return { data: null };
      }

      case "stat": {
        const stats = fs.statSync(resolved);
        return {
          data: {
            size: stats.size,
            isDirectory: stats.isDirectory(),
            isFile: stats.isFile(),
            isSymbolicLink: stats.isSymbolicLink(),
            mtime: stats.mtime.toISOString(),
            ctime: stats.ctime.toISOString(),
            atime: stats.atime.toISOString(),
            mode: stats.mode,
          },
        };
      }

      case "mkdir": {
        fs.mkdirSync(resolved, { recursive: true });
        return { data: null };
      }

      case "delete": {
        const stats = fs.statSync(resolved);
        if (stats.isDirectory()) {
          fs.rmSync(resolved, { recursive: true, force: true });
        } else {
          fs.unlinkSync(resolved);
        }
        return { data: null };
      }

      default: {
        const _exhaustive: never = action;
        return { error: `Unknown action: ${_exhaustive}` };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}
