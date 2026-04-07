"use client";

import { useRouter } from "next/navigation";
import { NodeInfo } from "@remote-code/protocol";
import { StatusBadge } from "./status-badge";
import { StatsBar } from "./stats-bar";

interface NodeCardProps {
  node: NodeInfo;
}

export function NodeCard({ node }: NodeCardProps) {
  const router = useRouter();

  return (
    <div className="bg-surface-light border border-border rounded-lg p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-white truncate">{node.name}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{node.hostname}</p>
        </div>
        <StatusBadge status={node.status} />
      </div>

      {/* System info */}
      <div className="text-xs text-gray-500 flex gap-2 flex-wrap">
        <span>{node.os}</span>
        <span>·</span>
        <span>{node.arch}</span>
      </div>

      {/* Stats */}
      <div className="flex flex-col gap-2">
        <StatsBar label="CPU" used={node.cpu} total={100} />
        <StatsBar label="Mem" used={node.memUsed} total={node.memTotal} />
        <StatsBar label="Disk" used={node.diskUsed} total={node.diskTotal} />
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-auto">
        <button
          onClick={() => router.push(`/terminal?node=${node.nodeId}`)}
          disabled={node.status === "offline"}
          className="flex-1 px-3 py-1.5 text-sm rounded bg-surface-lighter border border-border text-gray-300 hover:bg-accent hover:text-white hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Terminal
        </button>
        <button
          onClick={() => router.push(`/files/${node.nodeId}`)}
          disabled={node.status === "offline"}
          className="flex-1 px-3 py-1.5 text-sm rounded bg-surface-lighter border border-border text-gray-300 hover:bg-accent hover:text-white hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Files
        </button>
      </div>
    </div>
  );
}
