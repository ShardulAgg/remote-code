"use client";

import { useEffect, useState } from "react";
import { useFiles, FileEntry } from "../hooks/use-files";

interface FilePanelProps {
  nodeId: string;
  onOpenTerminal?: (cwd: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} M`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} G`;
}

function sortEntries(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function FilePanel({ nodeId, onOpenTerminal }: FilePanelProps) {
  const { entries, currentPath, loading, listDir } = useFiles(nodeId);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized) {
      listDir("/");
      setInitialized(true);
    }
  }, [nodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  function goUp() {
    if (currentPath === "/" || currentPath === "") return;
    const trimmed = currentPath.endsWith("/") ? currentPath.slice(0, -1) : currentPath;
    const idx = trimmed.lastIndexOf("/");
    listDir(idx <= 0 ? "/" : trimmed.slice(0, idx));
  }

  const sorted = sortEntries(entries);

  return (
    <div className="flex flex-col h-full bg-surface-light overflow-hidden">
      {/* Path bar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border shrink-0 min-w-0">
        <button
          onClick={goUp}
          disabled={currentPath === "/"}
          className="text-xs text-gray-500 hover:text-white disabled:opacity-30 shrink-0 px-1"
        >
          ..
        </button>
        <span className="text-[11px] text-gray-400 font-mono truncate flex-1">{currentPath}</span>
        {onOpenTerminal && (
          <button
            onClick={() => onOpenTerminal(currentPath)}
            className="text-[10px] text-gray-600 hover:text-accent shrink-0 px-1"
            title="Open terminal here"
          >
            &gt;_
          </button>
        )}
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-600 text-xs">Loading...</div>
        ) : sorted.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-gray-600 text-xs">Empty</div>
        ) : (
          <div className="text-xs">
            {sorted.map((entry) => (
              <button
                key={entry.path}
                onClick={() => entry.isDirectory && listDir(entry.path)}
                className={`flex items-center gap-1.5 w-full text-left px-2 py-1 hover:bg-surface-lighter transition-colors ${
                  entry.isDirectory ? "text-accent cursor-pointer" : "text-gray-400 cursor-default"
                }`}
              >
                <span className="text-[10px] text-gray-600 w-7 shrink-0 font-mono">
                  {entry.isDirectory ? "dir" : "file"}
                </span>
                <span className="truncate flex-1">{entry.name}</span>
                {!entry.isDirectory && (
                  <span className="text-[10px] text-gray-600 shrink-0 font-mono">{formatSize(entry.size)}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
