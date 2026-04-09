"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NodeInfo } from "@remote-code/protocol";
import { StatusBadge } from "./status-badge";
import { StatsBar } from "./stats-bar";
import { wsClient } from "../lib/ws-client";
import type { ActiveSession } from "../hooks/use-nodes";

// Hub version — read from package.json at build time
const HUB_VERSION = "0.2.0";

interface NodeCardProps {
  node: NodeInfo;
  sessions?: ActiveSession[];
}

export function NodeCard({ node, sessions = [] }: NodeCardProps) {
  const router = useRouter();
  const isOnline = node.status === "online";
  const [updating, setUpdating] = useState(false);
  const isOutdated = node.version && node.version !== HUB_VERSION;

  function openAllSessions() {
    router.push(`/terminal?node=${node.nodeId}`);
  }

  function openSession(sessionId: string) {
    router.push(`/terminal?node=${node.nodeId}&session=${sessionId}`);
  }

  function newSession() {
    router.push(`/terminal?node=${node.nodeId}&new=1`);
  }

  function newClaudeSession() {
    router.push(`/terminal?node=${node.nodeId}&new=1&command=claude`);
  }

  return (
    <div className="bg-surface-light border border-border rounded-lg p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-white truncate">{node.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{node.hostname}</p>
        </div>
        <StatusBadge status={node.status} />
      </div>

      {/* System info + version */}
      <div className="text-xs text-gray-500 flex gap-2 flex-wrap items-center">
        <span>{node.os}</span>
        <span>·</span>
        <span>{node.arch}</span>
        {node.version && (
          <>
            <span>·</span>
            <span className={isOutdated ? "text-warning" : "text-gray-500"}>
              v{node.version}
            </span>
            {isOutdated && isOnline && (
              <button
                onClick={() => {
                  setUpdating(true);
                  wsClient.send({ type: "update-node", nodeId: node.nodeId });
                  setTimeout(() => setUpdating(false), 15000);
                }}
                disabled={updating}
                className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning hover:bg-warning/30 disabled:opacity-50 transition-colors"
              >
                {updating ? "Updating..." : "Update"}
              </button>
            )}
          </>
        )}
      </div>

      {/* Stats */}
      <div className="flex flex-col gap-1.5">
        <StatsBar label="CPU" used={node.cpu} total={100} />
        <StatsBar label="Mem" used={node.memUsed} total={node.memTotal} />
        <StatsBar label="Disk" used={node.diskUsed} total={node.diskTotal} />
      </div>

      {/* Active sessions */}
      {sessions.length > 0 && (
        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">
              {sessions.length} session{sessions.length !== 1 ? "s" : ""}
            </p>
            {sessions.length > 1 && (
              <button
                onClick={openAllSessions}
                className="text-xs text-accent hover:underline"
              >
                Open all
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1">
            {sessions.map((s, i) => (
              <button
                key={s.sessionId}
                onClick={() => openSession(s.sessionId)}
                className="flex items-center gap-2 text-xs text-left px-2.5 py-1.5 rounded bg-surface-lighter hover:bg-accent/20 transition-colors group"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                <span className="text-gray-300 group-hover:text-accent truncate">
                  Session {i + 1}
                </span>
                <span className="text-gray-600 ml-auto font-mono text-[10px]">
                  {s.sessionId.slice(0, 8)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {isOnline ? (
        <div className="flex gap-2 mt-auto pt-1">
          <button
            onClick={newClaudeSession}
            className="flex-1 px-3 py-1.5 text-sm font-medium rounded bg-success/20 text-success hover:bg-success/30 transition-colors"
          >
            Claude Code
          </button>
          <button
            onClick={newSession}
            className="flex-1 px-3 py-1.5 text-sm rounded bg-surface-lighter border border-border text-gray-300 hover:bg-accent/20 hover:text-accent hover:border-accent/30 transition-colors"
          >
            Terminal
          </button>
          <button
            onClick={() => router.push(`/files/${node.nodeId}`)}
            className="px-3 py-1.5 text-sm rounded bg-surface-lighter border border-border text-gray-400 hover:text-gray-300 transition-colors"
          >
            Files
          </button>
        </div>
      ) : (
        <OfflineActions nodeId={node.nodeId} nodeName={node.name} />
      )}
    </div>
  );
}

function OfflineActions({ nodeId, nodeName }: { nodeId: string; nodeName: string }) {
  const [showCommand, setShowCommand] = useState(false);
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState(false);

  const restartCmd = `~/.remote-code-agent/start.sh`;

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function removeNode() {
    if (!confirm(`Remove "${nodeName}" from the dashboard? The agent can reconnect anytime.`)) return;
    setRemoving(true);
    try {
      await fetch("/api/nodes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId }),
      });
      window.location.reload();
    } catch {
      setRemoving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 mt-auto pt-1">
      <div className="flex gap-2">
        <button
          onClick={() => setShowCommand(p => !p)}
          className="flex-1 px-3 py-1.5 text-sm rounded bg-warning/20 text-warning hover:bg-warning/30 transition-colors"
        >
          Reconnect
        </button>
        <button
          onClick={removeNode}
          disabled={removing}
          className="px-3 py-1.5 text-sm rounded bg-surface-lighter border border-border text-gray-500 hover:text-danger hover:border-danger/30 disabled:opacity-50 transition-colors"
        >
          {removing ? "..." : "Remove"}
        </button>
      </div>
      {showCommand && (
        <div className="bg-surface border border-border rounded-lg p-2">
          <p className="text-[10px] text-gray-500 mb-1">SSH into the machine and run:</p>
          <div className="flex items-center gap-1">
            <code className="text-[11px] text-gray-300 font-mono flex-1 break-all">{restartCmd}</code>
            <button
              onClick={() => copy(restartCmd)}
              className="text-[10px] px-1.5 py-0.5 rounded bg-surface-lighter border border-border text-gray-500 hover:text-white shrink-0"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
