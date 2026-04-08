"use client";

import { useState, useEffect, useRef } from "react";
import { NodeInfo } from "@remote-code/protocol";
import { StatsBar } from "./stats-bar";
import { useFiles, FileEntry } from "../hooks/use-files";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SidebarSession {
  id: string;
  nodeId: string;
  sessionId: string;
  label: string;
}

type SidebarSection = "agents" | "files" | "resources";

interface TerminalSidebarProps {
  nodes: NodeInfo[];
  sessions: SidebarSession[];
  activeSessionId: string | null;
  activeNodeId: string;
  onSelectSession: (sessionId: string) => void;
  onNewSession: (nodeId: string) => void;
  onNewClaudeSession: (nodeId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onRenameSession?: (sessionId: string, newLabel: string) => void;
  onOpenTerminalAt?: (nodeId: string, cwd: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

// ---------------------------------------------------------------------------
// Editable label for sidebar sessions
// ---------------------------------------------------------------------------

function SidebarEditableLabel({ value, onChange }: { value: string; onChange?: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value && onChange) onChange(trimmed);
    else setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
          e.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-lighter border border-accent/40 rounded px-0.5 text-[11px] text-white outline-none w-full min-w-0"
      />
    );
  }

  return (
    <span
      onDoubleClick={onChange ? (e) => { e.stopPropagation(); setDraft(value); setEditing(true); } : undefined}
      className="truncate flex-1 cursor-default"
      title={onChange ? "Double-click to rename" : value}
    >
      {value}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Mini file browser for sidebar
// ---------------------------------------------------------------------------

function SidebarFiles({ nodeId, onOpenTerminalAt }: { nodeId: string; onOpenTerminalAt?: (cwd: string) => void }) {
  const { entries, currentPath, loading, listDir } = useFiles(nodeId);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized && nodeId) {
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

  const sorted = [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  if (!nodeId) return <div className="px-2 py-3 text-[11px] text-gray-600">Select an agent</div>;

  return (
    <div className="flex flex-col min-h-0">
      {/* Path */}
      <div className="flex items-center gap-1 px-2 py-1 shrink-0">
        <button onClick={goUp} disabled={currentPath === "/"} className="text-[11px] text-gray-600 hover:text-white disabled:opacity-30 px-0.5">..</button>
        <span className="text-[10px] text-gray-500 font-mono truncate flex-1">{currentPath}</span>
        {onOpenTerminalAt && (
          <button onClick={() => onOpenTerminalAt(currentPath)} className="text-[10px] text-gray-600 hover:text-accent" title="Terminal here">&gt;_</button>
        )}
      </div>
      {/* Entries */}
      <div className="overflow-y-auto flex-1 max-h-48">
        {loading ? (
          <div className="text-[10px] text-gray-600 px-2 py-2">Loading...</div>
        ) : sorted.length === 0 ? (
          <div className="text-[10px] text-gray-600 px-2 py-2">Empty</div>
        ) : (
          sorted.map(entry => (
            <button
              key={entry.path}
              onClick={() => entry.isDirectory && listDir(entry.path)}
              className={`flex items-center gap-1 w-full text-left px-2 py-0.5 text-[11px] hover:bg-surface-lighter transition-colors ${
                entry.isDirectory ? "text-accent cursor-pointer" : "text-gray-500 cursor-default"
              }`}
            >
              <span className="text-[9px] text-gray-700 w-4 shrink-0">{entry.isDirectory ? "\u25b8" : " "}</span>
              <span className="truncate">{entry.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini resource monitor for sidebar
// ---------------------------------------------------------------------------

function SidebarResources({ node }: { node: NodeInfo | null }) {
  if (!node) return <div className="px-2 py-3 text-[11px] text-gray-600">Select an agent</div>;

  function fmtB(b: number) {
    if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(0)}M`;
    return `${(b / (1024 * 1024 * 1024)).toFixed(1)}G`;
  }

  return (
    <div className="px-2 py-1.5 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[11px] text-gray-400">
        <span className={`w-1.5 h-1.5 rounded-full ${node.status === "online" ? "bg-success" : "bg-gray-600"}`} />
        <span className="truncate">{node.name}</span>
        <span className="ml-auto text-[9px] text-gray-600">{node.os} {node.arch}</span>
      </div>
      <StatsBar label="CPU" used={node.cpu} total={100} />
      <StatsBar label="Mem" used={node.memUsed} total={node.memTotal} />
      <StatsBar label="Disk" used={node.diskUsed} total={node.diskTotal} />
      <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
        <span>CPU {node.cpu.toFixed(0)}%</span>
        <span>Mem {fmtB(node.memUsed)}/{fmtB(node.memTotal)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main sidebar
// ---------------------------------------------------------------------------

export function TerminalSidebar({
  nodes,
  sessions,
  activeSessionId,
  activeNodeId,
  onSelectSession,
  onNewSession,
  onNewClaudeSession,
  onCloseSession,
  onRenameSession,
  onOpenTerminalAt,
  collapsed = false,
  onToggleCollapse,
}: TerminalSidebarProps) {
  const [expandedSections, setExpandedSections] = useState<Set<SidebarSection>>(
    () => new Set(["agents"])
  );

  const toggleSection = (s: SidebarSection) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  const activeNode = nodes.find(n => n.nodeId === activeNodeId) ?? null;

  // --- Collapsed ---
  if (collapsed) {
    return (
      <div className="w-8 bg-surface-light border-r border-border flex flex-col items-center py-1 shrink-0 gap-1">
        <button onClick={onToggleCollapse} className="text-gray-500 hover:text-white text-xs py-1" title="Expand">&rsaquo;</button>
        <a href="/" className="text-[9px] text-gray-600 hover:text-accent mt-1" title="Dashboard">H</a>
        <div className="w-4 border-t border-border my-1" />
        {nodes.filter(n => n.status === "online").map(node => (
          <div
            key={node.nodeId}
            className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold uppercase cursor-default ${
              node.nodeId === activeNodeId ? "bg-accent/20 text-accent" : "bg-surface-lighter text-gray-500"
            }`}
            title={node.name}
          >
            {node.name.charAt(0)}
          </div>
        ))}
      </div>
    );
  }

  // --- Expanded ---
  const onlineNodes = nodes.filter(n => n.status === "online");
  const offlineNodes = nodes.filter(n => n.status !== "online");

  return (
    <div className="w-52 bg-surface-light border-r border-border flex flex-col shrink-0 overflow-hidden select-none">
      {/* Top bar: logo + collapse */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border shrink-0">
        <a href="/" className="text-[11px] text-gray-400 hover:text-white font-semibold transition-colors">Remote Code</a>
        <button onClick={onToggleCollapse} className="text-gray-600 hover:text-white text-xs px-1" title="Collapse">&lsaquo;</button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* ---- AGENTS section ---- */}
        <SectionHeader label="Agents" section="agents" expanded={expandedSections.has("agents")} onToggle={toggleSection} count={onlineNodes.length} />
        {expandedSections.has("agents") && (
          <div className="pb-1">
            {onlineNodes.length === 0 && offlineNodes.length === 0 && (
              <p className="text-[10px] text-gray-600 px-2 py-2">No agents</p>
            )}
            {onlineNodes.map(node => {
              const nodeSessions = sessions.filter(s => s.nodeId === node.nodeId);
              return (
                <div key={node.nodeId}>
                  <div className="flex items-center gap-1.5 px-2 py-1 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                    <span className="text-gray-200 font-medium truncate flex-1">{node.name}</span>
                    {nodeSessions.length > 0 && <span className="text-[9px] text-gray-600">{nodeSessions.length}</span>}
                  </div>
                  {nodeSessions.map(session => {
                    const isActive = session.sessionId === activeSessionId;
                    return (
                      <div
                        key={session.sessionId}
                        onClick={() => onSelectSession(session.sessionId)}
                        className={`flex items-center gap-1 pl-5 pr-1.5 py-0.5 cursor-pointer text-[11px] transition-colors group ${
                          isActive ? "bg-accent/15 text-accent" : "text-gray-400 hover:text-gray-200 hover:bg-surface-lighter/50"
                        }`}
                      >
                        <SidebarEditableLabel
                          value={session.label}
                          onChange={onRenameSession ? (v) => onRenameSession(session.sessionId, v) : undefined}
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); onCloseSession(session.sessionId); }}
                          className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-danger text-[9px] px-0.5 transition-opacity"
                        >x</button>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-1 pl-5 pr-1.5 py-0.5">
                    <button onClick={() => onNewSession(node.nodeId)} className="text-[9px] text-gray-600 hover:text-accent">+term</button>
                    <button onClick={() => onNewClaudeSession(node.nodeId)} className="text-[9px] text-gray-600 hover:text-success">+claude</button>
                  </div>
                </div>
              );
            })}
            {offlineNodes.map(node => (
              <div key={node.nodeId} className="flex items-center gap-1.5 px-2 py-0.5 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-700 shrink-0" />
                <span className="text-gray-600 truncate">{node.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* ---- FILES section ---- */}
        <SectionHeader label="Files" section="files" expanded={expandedSections.has("files")} onToggle={toggleSection} />
        {expandedSections.has("files") && (
          <SidebarFiles
            nodeId={activeNodeId}
            onOpenTerminalAt={onOpenTerminalAt ? (cwd) => onOpenTerminalAt(activeNodeId, cwd) : undefined}
          />
        )}

        {/* ---- RESOURCES section ---- */}
        <SectionHeader label="Resources" section="resources" expanded={expandedSections.has("resources")} onToggle={toggleSection} />
        {expandedSections.has("resources") && <SidebarResources node={activeNode} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ label, section, expanded, onToggle, count }: {
  label: string;
  section: SidebarSection;
  expanded: boolean;
  onToggle: (s: SidebarSection) => void;
  count?: number;
}) {
  return (
    <button
      onClick={() => onToggle(section)}
      className="flex items-center gap-1 w-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300 border-b border-border bg-surface transition-colors"
    >
      <span className="text-[8px]">{expanded ? "\u25bc" : "\u25b6"}</span>
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && <span className="text-[9px] text-gray-600">{count}</span>}
    </button>
  );
}
