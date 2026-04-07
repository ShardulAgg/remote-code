"use client";

import { FileEntry } from "../hooks/use-files";

interface FileListProps {
  entries: FileEntry[];
  onNavigate: (path: string) => void;
  onAction: (entry: FileEntry, position: { x: number; y: number }) => void;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(timestamp: number): string {
  if (!timestamp) return "-";
  const d = new Date(timestamp);
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${month} ${day} ${hours}:${minutes}`;
}

function sortEntries(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

export function FileList({ entries, onNavigate, onAction }: FileListProps) {
  const sorted = sortEntries(entries);

  if (sorted.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 text-sm">
        No files found
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-gray-400 text-left">
          <th className="pb-2 pr-4 font-medium">Name</th>
          <th className="pb-2 pr-4 font-medium w-24 text-right">Size</th>
          <th className="pb-2 pr-4 font-medium w-36">Modified</th>
          <th className="pb-2 font-medium w-10"></th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((entry) => (
          <tr
            key={entry.path}
            className="border-b border-border hover:bg-surface-light group"
          >
            <td className="py-2 pr-4">
              <button
                onClick={() => entry.isDirectory && onNavigate(entry.path)}
                className={`flex items-center gap-2 text-left w-full ${
                  entry.isDirectory
                    ? "text-accent cursor-pointer hover:underline"
                    : "text-gray-300 cursor-default"
                }`}
              >
                <span className="font-mono text-xs text-gray-500 select-none w-12 shrink-0">
                  {entry.isDirectory ? "[DIR]" : "[FILE]"}
                </span>
                <span className="truncate">{entry.name}</span>
              </button>
            </td>
            <td className="py-2 pr-4 text-right text-gray-400 font-mono text-xs">
              {entry.isDirectory ? "-" : formatSize(entry.size)}
            </td>
            <td className="py-2 pr-4 text-gray-400 text-xs">
              {formatDate(entry.modified)}
            </td>
            <td className="py-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = (e.target as HTMLElement).getBoundingClientRect();
                  onAction(entry, { x: rect.left, y: rect.bottom });
                }}
                className="px-2 py-0.5 text-gray-500 hover:text-gray-200 hover:bg-surface-lighter rounded opacity-0 group-hover:opacity-100 transition-opacity"
                title="Actions"
              >
                ...
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
