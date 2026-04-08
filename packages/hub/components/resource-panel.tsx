"use client";

import { NodeInfo } from "@remote-code/protocol";
import { StatsBar } from "./stats-bar";

interface ResourcePanelProps {
  node: NodeInfo | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function ResourcePanel({ node }: ResourcePanelProps) {
  if (!node) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-sm">
        No agent selected
      </div>
    );
  }

  const isOnline = node.status === "online";

  return (
    <div className="flex flex-col h-full bg-surface-light overflow-auto">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-success" : "bg-gray-600"}`} />
        <span className="text-sm font-medium text-white truncate">{node.name}</span>
        <span className="text-[10px] text-gray-600 ml-auto">{node.hostname}</span>
      </div>

      {/* System info */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="flex gap-3 text-[11px] text-gray-500">
          <span>{node.os}</span>
          <span>{node.arch}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="px-3 py-3 flex flex-col gap-3">
        <div>
          <StatsBar label="CPU" used={node.cpu} total={100} />
          <div className="text-[10px] text-gray-600 mt-0.5 text-right">{node.cpu.toFixed(1)}%</div>
        </div>
        <div>
          <StatsBar label="Memory" used={node.memUsed} total={node.memTotal} />
          <div className="text-[10px] text-gray-600 mt-0.5 text-right">
            {formatBytes(node.memUsed)} / {formatBytes(node.memTotal)}
          </div>
        </div>
        <div>
          <StatsBar label="Disk" used={node.diskUsed} total={node.diskTotal} />
          <div className="text-[10px] text-gray-600 mt-0.5 text-right">
            {formatBytes(node.diskUsed)} / {formatBytes(node.diskTotal)}
          </div>
        </div>

        {/* Active sessions count */}
        <div className="border-t border-border pt-2 mt-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Active sessions</span>
            <span className="text-white font-medium">{node.activeSessions ?? 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
