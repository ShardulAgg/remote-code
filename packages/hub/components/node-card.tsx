"use client";

import { useRouter } from "next/navigation";
import { NodeInfo } from "@remote-code/protocol";
import { StatusBadge } from "./status-badge";
import { StatsBar } from "./stats-bar";
import type { ActiveSession } from "../hooks/use-nodes";

interface NodeCardProps {
  node: NodeInfo;
  sessions?: ActiveSession[];
}

export function NodeCard({ node, sessions = [] }: NodeCardProps) {
  const router = useRouter();

  function openTerminal() {
    router.push(`/terminal?node=${node.nodeId}`);
  }

  function reconnectSession(sessionId: string) {
    router.push(`/terminal?node=${node.nodeId}&session=${sessionId}`);
  }

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

      {/* Active sessions */}
      {sessions.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="text-xs text-gray-500 mb-2">
            {sessions.length} active session{sessions.length !== 1 ? "s" : ""}
          </p>
          <div className="flex flex-col gap-1">
            {sessions.map((s) => (
              <button
                key={s.sessionId}
                onClick={() => reconnectSession(s.sessionId)}
                className="text-xs text-left px-2 py-1 rounded bg-surface-lighter text-accent hover:bg-accent/20 transition-colors truncate"
              >
                Reconnect {s.sessionId.slice(0, 8)}...
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-auto">
        <button
          onClick={openTerminal}
          disabled={node.status === "offline"}
          className="flex-1 px-3 py-1.5 text-sm rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
