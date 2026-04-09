"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { NodeInfo, FsTreeEntry } from "@remote-code/protocol";
import { StatsBar } from "./stats-bar";
import { wsClient } from "../lib/ws-client";

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
  onOpenFile?: (nodeId: string, filePath: string) => void;
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
// VS Code-style file tree
// ---------------------------------------------------------------------------

function SidebarFiles({ nodeId, onOpenTerminalAt, onOpenFile }: { nodeId: string; onOpenTerminalAt?: (cwd: string) => void; onOpenFile?: (filePath: string) => void }) {
  const [tree, setTree] = useState<FsTreeEntry[]>([]);
  const [root, setRoot] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Request tree from hub
  useEffect(() => {
    if (!nodeId) return;
    setLoading(true);
    wsClient.send({ type: "request-node-tree", nodeId });

    const unsub = wsClient.onMessage((msg) => {
      if (msg.type === "node-fs-tree" && (msg as any).nodeId === nodeId) {
        setTree((msg as any).entries);
        setRoot((msg as any).root);
        setLoading(false);
      } else if (msg.type === "node-fs-tree-update" && (msg as any).nodeId === nodeId) {
        // Apply incremental updates
        setTree(prev => applyUpdates([...prev], (msg as any).changes));
      }
    });
    return unsub;
  }, [nodeId]);

  // Focus search on open
  useEffect(() => {
    if (searchOpen && searchRef.current) searchRef.current.focus();
  }, [searchOpen]);

  if (!nodeId) return <div className="px-2 py-3 text-[11px] text-gray-600">Select an agent</div>;

  // Flatten tree for search
  const searchResults = searchQuery.length > 1 ? flatSearch(tree, searchQuery.toLowerCase()) : null;

  return (
    <div className="flex flex-col min-h-0">
      {/* Header with search toggle */}
      <div className="flex items-center gap-1 px-2 py-1 shrink-0">
        <span className="text-[10px] text-gray-500 font-mono truncate flex-1">{root || "/"}</span>
        <button
          onClick={() => { setSearchOpen(p => !p); setSearchQuery(""); }}
          className={`text-[10px] px-1 transition-colors ${searchOpen ? "text-accent" : "text-gray-600 hover:text-accent"}`}
          title="Search files"
        >
          &#128269;
        </button>
        {onOpenTerminalAt && (
          <button onClick={() => onOpenTerminalAt(root || "/")} className="text-[10px] text-gray-600 hover:text-accent" title="Terminal here">&gt;_</button>
        )}
      </div>

      {/* Search input */}
      {searchOpen && (
        <div className="px-2 pb-1 shrink-0">
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="w-full bg-surface-lighter border border-border rounded px-1.5 py-0.5 text-[11px] text-white outline-none focus:border-accent/50"
          />
        </div>
      )}

      {/* Tree or search results */}
      <div className="overflow-y-auto flex-1" style={{ maxHeight: "50vh" }}>
        {loading ? (
          <div className="text-[10px] text-gray-600 px-2 py-2">Indexing files...</div>
        ) : searchResults ? (
          searchResults.length === 0 ? (
            <div className="text-[10px] text-gray-600 px-2 py-2">No matches</div>
          ) : (
            searchResults.slice(0, 50).map(entry => (
              <button
                key={entry.path}
                onClick={() => entry.isDirectory ? onOpenTerminalAt?.(entry.path) : onOpenFile?.(entry.path)}
                className="flex items-center gap-1 w-full text-left px-2 py-0.5 text-[11px] hover:bg-surface-lighter transition-colors text-gray-400"
              >
                <span className="text-[9px] shrink-0">{fileIcon(entry.name, entry.isDirectory)}</span>
                <span className="truncate text-gray-300">{entry.name}</span>
                <span className="text-[9px] text-gray-700 truncate ml-auto">{shortPath(entry.path, root)}</span>
              </button>
            ))
          )
        ) : tree.length === 0 ? (
          <div className="text-[10px] text-gray-600 px-2 py-2">Empty</div>
        ) : (
          <TreeNodes entries={tree} depth={0} onOpenTerminalAt={onOpenTerminalAt} onOpenFile={onOpenFile} root={root} />
        )}
      </div>
    </div>
  );
}

function TreeNodes({ entries, depth, onOpenTerminalAt, onOpenFile, root }: {
  entries: FsTreeEntry[];
  depth: number;
  onOpenTerminalAt?: (cwd: string) => void;
  onOpenFile?: (filePath: string) => void;
  root: string;
}) {
  return (
    <>
      {entries.map(entry => (
        <TreeNode key={entry.path} entry={entry} depth={depth} onOpenTerminalAt={onOpenTerminalAt} onOpenFile={onOpenFile} root={root} />
      ))}
    </>
  );
}

function TreeNode({ entry, depth, onOpenTerminalAt, onOpenFile, root }: {
  entry: FsTreeEntry;
  depth: number;
  onOpenTerminalAt?: (cwd: string) => void;
  onOpenFile?: (filePath: string) => void;
  root: string;
}) {
  const [expanded, setExpanded] = useState(depth < 2);

  return (
    <div>
      <button
        onClick={() => {
          if (entry.isDirectory) setExpanded(p => !p);
          else onOpenFile?.(entry.path);
        }}
        className="flex items-center gap-0.5 w-full text-left py-0.5 hover:bg-surface-lighter transition-colors text-[11px]"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {entry.isDirectory ? (
          <span className="text-[9px] text-gray-600 w-3 shrink-0">{expanded ? "\u25BE" : "\u25B8"}</span>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <span className="text-[10px] shrink-0 w-4">{fileIcon(entry.name, entry.isDirectory)}</span>
        <span className={`truncate ${entry.isDirectory ? "text-gray-200" : "text-gray-400"}`}>{entry.name}</span>
        {!entry.isDirectory && entry.size > 0 && (
          <span className="text-[9px] text-gray-700 ml-auto pr-2 shrink-0">{fmtSize(entry.size)}</span>
        )}
      </button>
      {entry.isDirectory && expanded && entry.children && (
        <TreeNodes entries={entry.children} depth={depth + 1} onOpenTerminalAt={onOpenTerminalAt} onOpenFile={onOpenFile} root={root} />
      )}
    </div>
  );
}

function fileIcon(name: string, isDir: boolean): string {
  if (isDir) return "\ud83d\udcc1";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const icons: Record<string, string> = {
    ts: "\ud83d\udfe6", tsx: "\ud83d\udfe6", js: "\ud83d\udfe8", jsx: "\ud83d\udfe8",
    json: "{ }", md: "\ud83d\udcdd", py: "\ud83d\udc0d", rs: "\ud83e\udda0",
    go: "\ud83d\udfe2", css: "\ud83c\udfa8", html: "\ud83c\udf10", svg: "\ud83d\uddbc",
    png: "\ud83d\uddbc", jpg: "\ud83d\uddbc", gif: "\ud83d\uddbc",
    sh: "\ud83d\udcdc", yml: "\u2699", yaml: "\u2699", toml: "\u2699",
    lock: "\ud83d\udd12", env: "\ud83d\udd11",
  };
  return icons[ext] ?? "\ud83d\udcc4";
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

function shortPath(fullPath: string, root: string): string {
  if (fullPath.startsWith(root)) return fullPath.slice(root.length);
  return fullPath;
}

function flatSearch(entries: FsTreeEntry[], query: string): FsTreeEntry[] {
  const results: FsTreeEntry[] = [];
  function walk(items: FsTreeEntry[]) {
    for (const item of items) {
      if (item.name.toLowerCase().includes(query)) results.push(item);
      if (item.children) walk(item.children);
    }
  }
  walk(entries);
  return results;
}

function applyUpdates(entries: FsTreeEntry[], changes: Array<{ action: string; entry: FsTreeEntry; parentPath: string }>): FsTreeEntry[] {
  for (const change of changes) {
    if (change.action === "remove") {
      removeFromTree(entries, change.entry.path);
    } else if (change.action === "add") {
      addToTree(entries, change.entry, change.parentPath);
    } else {
      updateInTree(entries, change.entry);
    }
  }
  return entries;
}

function removeFromTree(entries: FsTreeEntry[], path: string): boolean {
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].path === path) { entries.splice(i, 1); return true; }
    if (entries[i].children && removeFromTree(entries[i].children!, path)) return true;
  }
  return false;
}

function addToTree(entries: FsTreeEntry[], entry: FsTreeEntry, parentPath: string): boolean {
  for (const e of entries) {
    if (e.path === parentPath && e.isDirectory) {
      if (!e.children) e.children = [];
      if (!e.children.find(c => c.path === entry.path)) e.children.push(entry);
      return true;
    }
    if (e.children && addToTree(e.children, entry, parentPath)) return true;
  }
  return false;
}

function updateInTree(entries: FsTreeEntry[], entry: FsTreeEntry): boolean {
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].path === entry.path) {
      entries[i] = { ...entries[i], name: entry.name, size: entry.size };
      return true;
    }
    if (entries[i].children && updateInTree(entries[i].children!, entry)) return true;
  }
  return false;
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
  onOpenFile,
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
            onOpenFile={onOpenFile ? (path) => onOpenFile(activeNodeId, path) : undefined}
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
