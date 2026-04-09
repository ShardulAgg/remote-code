"use client";

import { useSearchParams } from "next/navigation";
import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { v4 as uuid } from "uuid";
import dynamic from "next/dynamic";
import { useTerminal } from "../../hooks/use-terminal";
import { useNodes } from "../../hooks/use-nodes";
import { wsClient } from "../../lib/ws-client";
import { TerminalSidebar, SidebarSession } from "../../components/terminal-sidebar";
import { ResizablePanes } from "../../components/resizable-panes";

const TerminalPanel = dynamic(
  () => import("../../components/terminal-panel").then((m) => ({ default: m.TerminalPanel })),
  { ssr: false, loading: () => <div style={{ flex: 1, background: "#0d1117" }} /> }
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TermSession {
  id: string;
  nodeId: string;
  sessionId: string;
  label: string;
  size: number;
}

// Split tree: either a leaf (single terminal) or a branch (two children split H or V)
type SplitNode =
  | { type: "leaf"; sessionId: string }
  | { type: "split"; direction: "h" | "v"; children: [SplitNode, SplitNode]; ratio: number };

// ---------------------------------------------------------------------------
// Terminal wrapper
// ---------------------------------------------------------------------------

function TerminalPane({ nodeId, sessionId, cwd, command, onSessionClosed, terminalRef }: {
  nodeId: string; sessionId: string; cwd?: string; command?: string;
  onSessionClosed: (sid: string) => void;
  terminalRef?: React.MutableRefObject<any>;
}) {
  const { connect } = useTerminal(nodeId, sessionId, onSessionClosed);
  const handleReady = useCallback(
    (terminal: any) => connect(terminal, { cwd, command }),
    [nodeId, sessionId, cwd, command] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleImagePaste = useCallback((base64: string, mimeType: string) => {
    const ext = mimeType === "image/png" ? "png" : mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] || "png";
    const filename = `paste-${Date.now()}.${ext}`;
    const remotePath = `/tmp/${filename}`;

    const requestId = uuid();
    wsClient.send({
      type: "browser-fs-request",
      nodeId,
      requestId,
      action: "write",
      path: remotePath,
      data: base64,
    });

    const toBase64 = (str: string) => {
      const bytes = new TextEncoder().encode(str);
      const binStr = Array.from(bytes, (b) => String.fromCodePoint(b)).join("");
      return btoa(binStr);
    };
    wsClient.send({
      type: "terminal-input",
      sessionId,
      data: toBase64(remotePath),
    });
  }, [nodeId, sessionId]);

  return <TerminalPanel onReady={handleReady} onImagePaste={handleImagePaste} terminalRef={terminalRef} />;
}

// ---------------------------------------------------------------------------
// Editable label (double-click to rename)
// ---------------------------------------------------------------------------

function EditableLabel({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onChange(trimmed);
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
        className="bg-surface-lighter border border-accent/40 rounded px-1 text-[11px] text-white outline-none w-20"
      />
    );
  }

  return (
    <span
      onDoubleClick={(e) => { e.stopPropagation(); setDraft(value); setEditing(true); }}
      className="cursor-default"
      title="Double-click to rename"
    >
      {value}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Fetch active sessions
// ---------------------------------------------------------------------------

async function fetchSessions(): Promise<Array<{ sessionId: string; nodeId: string; label: string }>> {
  try { await wsClient.waitForAuth(5000); } catch { return []; }
  return new Promise((resolve) => {
    let resolved = false;
    const unsub = wsClient.onMessage((msg) => {
      if (msg.type === "session-list" && !resolved) {
        resolved = true; unsub();
        resolve(((msg as any).sessions ?? []).map((s: any) => ({
          sessionId: s.sessionId,
          nodeId: s.nodeId,
          label: s.label || "",
        })));
      }
    });
    wsClient.send({ type: "subscribe-nodes" });
    setTimeout(() => { if (!resolved) { resolved = true; unsub(); resolve([]); } }, 3000);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function TerminalPageInner() {
  const searchParams = useSearchParams();
  const nodeParam = searchParams.get("node") ?? "";
  const sessionParam = searchParams.get("session") ?? "";
  const isNewSession = searchParams.get("new") === "1";
  const cwdParam = searchParams.get("cwd") ?? undefined;
  const commandParam = searchParams.get("command") ?? undefined;

  const { nodes, sessions: hubSessions } = useNodes();

  const [tabs, setTabs] = useState<TermSession[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [splitRoot, setSplitRoot] = useState<SplitNode | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [ready, setReady] = useState(false);
  const [newSessionIds] = useState<Set<string>>(() => new Set());
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null);
  const activeTerminalRef = useRef<any>(null);

  // Sidebar sessions: show ALL sessions from all nodes (from hub), with tab labels overriding
  const sidebarSessions: SidebarSession[] = hubSessions.map((hs, i) => {
    const tab = tabs.find(t => t.sessionId === hs.sessionId);
    return {
      id: hs.sessionId,
      nodeId: hs.nodeId,
      sessionId: hs.sessionId,
      label: tab?.label || hs.label || `Session ${i + 1}`,
    };
  });

  // Active node from active tab
  const activeTab = tabs.find(t => t.id === activeTabId);
  const activeNodeId = activeTab?.nodeId ?? nodeParam ?? nodes[0]?.nodeId ?? "";
  const activeNode = nodes.find(n => n.nodeId === activeNodeId) ?? null;

  // --- Init ---
  useEffect(() => {
    async function init() {
      const hubSessions = await fetchSessions();
      const initial: TermSession[] = [];

      if (nodeParam) {
        const nodeSessions = hubSessions.filter(s => s.nodeId === nodeParam);
        nodeSessions.forEach((s, i) => {
          initial.push({ id: uuid(), nodeId: s.nodeId, sessionId: s.sessionId, label: s.label || `Session ${i + 1}`, size: 1 });
        });
        if (sessionParam && !initial.find(t => t.sessionId === sessionParam)) {
          initial.push({ id: uuid(), nodeId: nodeParam, sessionId: sessionParam, label: `Session ${initial.length + 1}`, size: 1 });
        }
        if (isNewSession || initial.length === 0) {
          const sid = uuid();
          newSessionIds.add(sid);
          const label = commandParam === "claude" ? "Claude Code" : `Session ${initial.length + 1}`;
          initial.push({ id: uuid(), nodeId: nodeParam, sessionId: sid, label, size: 1 });
        }
      } else {
        hubSessions.forEach((s, i) => {
          initial.push({ id: uuid(), nodeId: s.nodeId, sessionId: s.sessionId, label: s.label || `Session ${i + 1}`, size: 1 });
        });
      }

      setTabs(initial);
      if (initial.length > 0) {
        setActiveTabId(initial[initial.length - 1].id);
        // Default: single leaf for the last session
        setSplitRoot({ type: "leaf", sessionId: initial[initial.length - 1].sessionId });
      }
      setReady(true);
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Tab / split actions ---

  const addTab = useCallback((nodeId: string, command?: string) => {
    const sid = uuid();
    newSessionIds.add(sid);
    const count = tabs.filter(t => t.nodeId === nodeId).length;
    const label = command === "claude" ? "Claude Code" : `Session ${count + 1}`;
    const tab: TermSession = {
      id: uuid(), nodeId, sessionId: sid, label, size: 1,
    };
    setTabs(prev => [...prev, tab]);
    setActiveTabId(tab.id);
    setSplitRoot({ type: "leaf", sessionId: sid });
    // Persist label to hub (session will be created when open-terminal fires)
    setTimeout(() => wsClient.send({ type: "rename-session", sessionId: sid, label }), 500);
  }, [tabs, newSessionIds]);

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const tab = prev.find(t => t.id === tabId);
      const next = prev.filter(t => t.id !== tabId);
      // Kill the PTY and clean up the session on the hub
      if (tab) {
        wsClient.send({ type: "close-terminal", sessionId: tab.sessionId });
        setSplitRoot(root => root ? removeFromTree(root, tab.sessionId) : null);
      }
      setActiveTabId(current => {
        if (current === tabId) return next.length > 0 ? next[next.length - 1].id : null;
        return current;
      });
      if (next.length > 0) {
        setSplitRoot(root => {
          if (!root) return { type: "leaf", sessionId: next[next.length - 1].sessionId };
          return root;
        });
      }
      return next;
    });
  }, []);

  const renameTab = useCallback((sessionId: string, newLabel: string) => {
    setTabs(prev => prev.map(t => t.sessionId === sessionId ? { ...t, label: newLabel } : t));
    wsClient.send({ type: "rename-session", sessionId, label: newLabel });
  }, []);

  const selectTab = useCallback((sessionId: string) => {
    let tab = tabs.find(t => t.sessionId === sessionId);

    // If session isn't in tabs yet (from another node), add it
    if (!tab) {
      const hubSession = hubSessions.find(s => s.sessionId === sessionId);
      if (hubSession) {
        const newTab: TermSession = {
          id: uuid(),
          nodeId: hubSession.nodeId,
          sessionId: hubSession.sessionId,
          label: hubSession.label || `Session`,
          size: 1,
        };
        setTabs(prev => [...prev, newTab]);
        tab = newTab;
      }
    }

    if (tab) {
      setActiveTabId(tab.id);
      setSplitRoot(root => {
        if (root && treeContains(root, sessionId)) return root;
        return { type: "leaf", sessionId };
      });
    }
  }, [tabs, hubSessions]);

  // Split the active terminal in a direction, adding another tab into the new half
  const splitActive = useCallback((direction: "h" | "v") => {
    if (!activeTab) return;
    const sid = uuid();
    newSessionIds.add(sid);
    const count = tabs.filter(t => t.nodeId === activeTab.nodeId).length;
    const newTab: TermSession = {
      id: uuid(), nodeId: activeTab.nodeId, sessionId: sid,
      label: `Session ${count + 1}`, size: 1,
    };
    setTabs(prev => [...prev, newTab]);

    // Replace the active session's leaf with a split
    setSplitRoot(root => {
      if (!root) return { type: "split", direction, children: [{ type: "leaf", sessionId: activeTab.sessionId }, { type: "leaf", sessionId: sid }], ratio: 0.5 };
      return splitLeafInTree(root, activeTab.sessionId, sid, direction);
    });
  }, [activeTab, tabs, newSessionIds]);

  // Split active with an existing tab (bring it into view)
  const splitWithExisting = useCallback((sessionId: string, direction: "h" | "v") => {
    if (!activeTab) return;
    setSplitRoot(root => {
      if (!root) return { type: "split", direction, children: [{ type: "leaf", sessionId: activeTab.sessionId }, { type: "leaf", sessionId }], ratio: 0.5 };
      // First remove the target from tree if it's already there (to avoid duplication)
      let cleaned = removeFromTree(root, sessionId);
      if (!cleaned) cleaned = { type: "leaf", sessionId: activeTab.sessionId };
      return splitLeafInTree(cleaned, activeTab.sessionId, sessionId, direction);
    });
  }, [activeTab]);

  const handleSessionClosed = useCallback((sessionId: string) => {
    setTimeout(() => {
      const tab = tabs.find(t => t.sessionId === sessionId);
      if (tab) closeTab(tab.id);
    }, 1500);
  }, [tabs, closeTab]);

  const handleSplitResize = useCallback((path: number[], ratio: number) => {
    setSplitRoot(root => root ? setRatioInTree(root, path, ratio) : root);
  }, []);

  // Right-click "Split Right" / "Split Down" on a pane - creates a new terminal in the split
  const handleSplitAt = useCallback((targetSessionId: string, _newSessionId: string, direction: "h" | "v") => {
    const targetTab = tabs.find(t => t.sessionId === targetSessionId);
    if (!targetTab) return;
    const sid = uuid();
    newSessionIds.add(sid);
    const count = tabs.filter(t => t.nodeId === targetTab.nodeId).length;
    const newTab: TermSession = {
      id: uuid(), nodeId: targetTab.nodeId, sessionId: sid,
      label: `Session ${count + 1}`, size: 1,
    };
    setTabs(prev => [...prev, newTab]);
    setSplitRoot(root => {
      if (!root) return { type: "split", direction, children: [{ type: "leaf", sessionId: targetSessionId }, { type: "leaf", sessionId: sid }], ratio: 0.5 };
      return splitLeafInTree(root, targetSessionId, sid, direction);
    });
  }, [tabs, newSessionIds]);

  // Drag a tab and drop it onto a pane's drop zone
  const handleDropTab = useCallback((draggedSessionId: string, targetSessionId: string, zone: DropZone) => {
    if (!zone || draggedSessionId === targetSessionId) return;
    if (zone === "center") {
      // Swap: replace target leaf with dragged, put target where dragged was
      setSplitRoot(root => {
        if (!root) return root;
        return swapInTree(root, draggedSessionId, targetSessionId);
      });
      return;
    }
    const direction: "h" | "v" = (zone === "left" || zone === "right") ? "h" : "v";
    setSplitRoot(root => {
      if (!root) return root;
      // Remove dragged from tree first
      let cleaned = removeFromTree(root, draggedSessionId);
      if (!cleaned) cleaned = { type: "leaf", sessionId: targetSessionId };
      // Now split the target leaf
      if (zone === "left" || zone === "top") {
        return splitLeafInTree(cleaned, targetSessionId, draggedSessionId, direction, true);
      }
      return splitLeafInTree(cleaned, targetSessionId, draggedSessionId, direction, false);
    });
  }, []);

  // Unsplit: show only this terminal, remove all splits
  const handleUnsplit = useCallback((sessionId: string) => {
    setSplitRoot({ type: "leaf", sessionId });
  }, []);

  // Upload image to agent and type path into terminal
  const handleImageUpload = useCallback((nodeId: string, sessionId: string, base64: string, mimeType: string) => {
    const ext = mimeType === "image/png" ? "png" : mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] || "png";
    const filename = `paste-${Date.now()}.${ext}`;
    const remotePath = `/tmp/${filename}`;

    const requestId = uuid();
    wsClient.send({ type: "browser-fs-request", nodeId, requestId, action: "write", path: remotePath, data: base64 });

    const toBase64 = (str: string) => {
      const bytes = new TextEncoder().encode(str);
      const binStr = Array.from(bytes, (b) => String.fromCodePoint(b)).join("");
      return btoa(binStr);
    };
    wsClient.send({ type: "terminal-input", sessionId, data: toBase64(remotePath) });
  }, []);

  // Detect mobile (narrow viewport)
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    setIsMobile(mq.matches);
    if (!mq.matches) setSidebarCollapsed(false); // auto-expand on desktop
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      if (e.matches) setSidebarCollapsed(true); // auto-collapse on mobile
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // On mobile, force single-pane view (show active session only)
  const mobileSplitRoot: SplitNode | null =
    isMobile && activeTab
      ? { type: "leaf", sessionId: activeTab.sessionId }
      : splitRoot;

  // Mobile swipe: prev/next session
  const swipeSession = useCallback((direction: -1 | 1) => {
    if (!activeTab) return;
    const idx = tabs.findIndex(t => t.id === activeTab.id);
    const next = tabs[idx + direction];
    if (next) selectTab(next.sessionId);
  }, [activeTab, tabs, selectTab]);

  if (!ready) return <div style={{ flex: 1, background: "#0d1117" }} />;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar — overlay drawer on mobile */}
      {isMobile && !sidebarCollapsed && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}
      <div className={isMobile
        ? `fixed inset-y-0 left-0 z-50 transition-transform duration-200 ${sidebarCollapsed ? "-translate-x-full" : "translate-x-0"}`
        : ""
      }>
        <TerminalSidebar
          nodes={nodes}
          sessions={sidebarSessions}
          activeSessionId={activeTab?.sessionId ?? null}
          activeNodeId={activeNodeId}
          onSelectSession={(sid) => { selectTab(sid); if (isMobile) setSidebarCollapsed(true); }}
          onNewSession={(nid) => { addTab(nid); if (isMobile) setSidebarCollapsed(true); }}
          onNewClaudeSession={(nid) => { addTab(nid, "claude"); if (isMobile) setSidebarCollapsed(true); }}
          onCloseSession={(sid) => { const t = tabs.find(x => x.sessionId === sid); if (t) closeTab(t.id); }}
          onRenameSession={renameTab}
          onOpenTerminalAt={(nid, cwd) => {
            const sid = uuid();
            newSessionIds.add(sid);
            const tab: TermSession = { id: uuid(), nodeId: nid, sessionId: sid, label: `Terminal`, size: 1 };
            setTabs(prev => [...prev, tab]);
            setActiveTabId(tab.id);
            setSplitRoot({ type: "leaf", sessionId: sid });
            if (isMobile) setSidebarCollapsed(true);
          }}
          collapsed={isMobile ? false : sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(p => !p)}
        />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center border-b border-border bg-surface-light shrink-0 overflow-x-auto">
          {/* Mobile hamburger */}
          {isMobile && (
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="px-2.5 py-2 text-gray-400 hover:text-white text-sm shrink-0"
              title="Menu"
            >
              &#9776;
            </button>
          )}
          {tabs.map(tab => {
            const isActive = tab.id === activeTabId;
            const inView = mobileSplitRoot ? treeContains(mobileSplitRoot, tab.sessionId) : false;
            return (
              <div
                key={tab.id}
                draggable={!isMobile}
                onDragStart={isMobile ? undefined : (e) => {
                  e.dataTransfer.setData("text/plain", tab.sessionId);
                  setDraggingSessionId(tab.sessionId);
                }}
                onDragEnd={isMobile ? undefined : () => setDraggingSessionId(null)}
                onClick={() => selectTab(tab.sessionId)}
                className={`flex items-center gap-1.5 px-2.5 ${isMobile ? "py-2" : "py-1"} ${isMobile ? "cursor-pointer" : "cursor-grab"} text-[11px] border-r border-border whitespace-nowrap transition-colors group ${
                  isActive
                    ? "bg-surface text-white border-b-2 border-b-accent"
                    : inView
                    ? "bg-surface-lighter/50 text-gray-300"
                    : "text-gray-500 hover:text-gray-300 hover:bg-surface-lighter/30"
                }`}
              >
                {inView && <span className="w-1 h-1 rounded-full bg-success shrink-0" />}
                {isMobile ? (
                  <span>{tab.label}</span>
                ) : (
                  <EditableLabel
                    value={tab.label}
                    onChange={(newLabel) => renameTab(tab.sessionId, newLabel)}
                  />
                )}
                {!isMobile && <span className="text-[9px] text-gray-600 font-mono">{tab.sessionId.slice(0, 4)}</span>}
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  className={`${isMobile ? "opacity-100 text-gray-600" : "opacity-0 group-hover:opacity-100 text-gray-600"} hover:text-danger text-[9px] ml-0.5 transition-opacity`}
                >x</button>
              </div>
            );
          })}
          {/* Split + Add buttons */}
          <div className="flex items-center ml-auto shrink-0">
            {!isMobile && activeTab && (
              <>
                <button onClick={() => splitActive("h")} className="px-1.5 py-1 text-[10px] text-gray-600 hover:text-accent" title="Split right">Split |</button>
                <button onClick={() => splitActive("v")} className="px-1.5 py-1 text-[10px] text-gray-600 hover:text-accent" title="Split down">Split --</button>
              </>
            )}
            {activeNodeId && (
              <button onClick={() => addTab(activeNodeId)} className={`${isMobile ? "px-3 py-2" : "px-1.5 py-1"} text-[10px] text-gray-600 hover:text-accent`} title="New terminal">+</button>
            )}
          </div>
        </div>

        {/* Mobile: removed top nav bar, moved to bottom toolbar */}

        {/* Terminal area */}
        {!mobileSplitRoot || tabs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-3">
            <p className="text-sm">No terminals open</p>
            <p className="text-[11px] text-gray-600">
              {nodes.length > 0
                ? isMobile ? "Tap \u2630 to open the menu." : "Create a session from the sidebar."
                : "Connect an agent to get started."}
            </p>
            <a href="/" className="px-3 py-1.5 rounded bg-accent/20 text-accent text-xs hover:bg-accent/30 transition-colors">Dashboard</a>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            <SplitView
              node={mobileSplitRoot}
              tabs={tabs}
              nodeNames={new Map(nodes.map(n => [n.nodeId, n.name]))}
              activeSessionId={activeTab?.sessionId ?? null}
              newSessionIds={newSessionIds}
              cwdParam={cwdParam}
              commandParam={commandParam}
              onSessionClosed={handleSessionClosed}
              onSelectSession={selectTab}
              onResize={handleSplitResize}
              onSplitAt={handleSplitAt}
              onDropTab={handleDropTab}
              onUnsplit={handleUnsplit}
              onImageUpload={handleImageUpload}
              draggingSessionId={draggingSessionId}
              isMobile={isMobile}
              activeTerminalRef={activeTerminalRef}
              path={[]}
            />
          </div>
        )}

        {/* Status bar — desktop only */}
        {!isMobile && activeNode && (
          <div className="flex items-center gap-3 px-2 py-0.5 border-t border-border bg-surface-light shrink-0 text-[10px] text-gray-500">
            <span className={`w-1.5 h-1.5 rounded-full ${activeNode.status === "online" ? "bg-success" : "bg-gray-600"}`} />
            <span className="text-gray-400">{activeNode.name}</span>
            <span>CPU {activeNode.cpu.toFixed(0)}%</span>
            <span>Mem {fmtB(activeNode.memUsed)}/{fmtB(activeNode.memTotal)}</span>
            <span>Disk {fmtB(activeNode.diskUsed)}/{fmtB(activeNode.diskTotal)}</span>
            <span className="ml-auto">{tabs.length} session{tabs.length !== 1 ? "s" : ""}</span>
          </div>
        )}

        {/* Mobile bottom toolbar */}
        {isMobile && tabs.length > 0 && (
          <MobileToolbar
            activeTab={activeTab ?? null}
            tabIndex={tabs.findIndex(t => t.id === activeTabId)}
            tabCount={tabs.length}
            onPrev={() => swipeSession(-1)}
            onNext={() => swipeSession(1)}
            onSendKey={(key) => {
              if (!activeTab) return;
              const toB64 = (s: string) => btoa(Array.from(new TextEncoder().encode(s), b => String.fromCodePoint(b)).join(""));
              wsClient.send({ type: "terminal-input", sessionId: activeTab.sessionId, data: toB64(key) });
            }}
            terminalRef={activeTerminalRef}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile bottom toolbar
// ---------------------------------------------------------------------------

function MobileToolbar({ activeTab, tabIndex, tabCount, onPrev, onNext, onSendKey, terminalRef }: {
  activeTab: TermSession | null;
  tabIndex: number;
  tabCount: number;
  onPrev: () => void;
  onNext: () => void;
  onSendKey: (key: string) => void;
  terminalRef: React.MutableRefObject<any>;
}) {
  const [expanded, setExpanded] = useState(false);

  // Collapsed: small floating button top-left
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="fixed top-14 left-2 z-30 h-9 px-3 rounded-lg bg-surface-lighter/90 backdrop-blur-sm border border-border text-xs text-gray-300 shadow-lg flex items-center gap-1.5 active:scale-95 transition-transform"
      >
        <span className="text-accent font-mono">&gt;_</span>
        <span className="text-gray-500">{tabIndex + 1}/{tabCount}</span>
      </button>
    );
  }

  return (
    <div className="fixed top-12 left-2 right-2 z-30 bg-surface/95 backdrop-blur-sm border border-border rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
      {/* Header: session switcher + close */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <button
          onClick={onPrev}
          disabled={tabIndex <= 0}
          className="w-10 h-10 flex items-center justify-center text-lg text-gray-200 bg-surface-lighter rounded-xl disabled:opacity-20 active:bg-accent/30"
        >
          &#9664;
        </button>
        <div className="flex-1 text-center">
          <div className="text-sm text-white font-medium">{activeTab ? activeTab.label : "—"}</div>
          <div className="text-[10px] text-gray-500">{tabIndex + 1} of {tabCount}</div>
        </div>
        <button
          onClick={onNext}
          disabled={tabIndex >= tabCount - 1}
          className="w-10 h-10 flex items-center justify-center text-lg text-gray-200 bg-surface-lighter rounded-xl disabled:opacity-20 active:bg-accent/30"
        >
          &#9654;
        </button>
        <button
          onClick={() => setExpanded(false)}
          className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-white rounded-xl active:bg-surface-lighter"
        >
          &#10005;
        </button>
      </div>

      {/* Keys grid */}
      <div className="grid grid-cols-7 gap-1.5 px-2.5 pt-2">
        {[
          { label: "^C", key: "\x03", danger: true },
          { label: "^D", key: "\x04" },
          { label: "^Z", key: "\x1a" },
          { label: "^L", key: "\x0c" },
          { label: "^A", key: "\x01" },
          { label: "^E", key: "\x05" },
          { label: "Esc", key: "\x1b" },
          { label: "Tab", key: "\t" },
          { label: "|", key: "|" },
          { label: "~", key: "~" },
          { label: "/", key: "/" },
          { label: "\u2191", key: "\x1b[A" },
          { label: "\u2193", key: "\x1b[B" },
          { label: "\u2190\u2192", key: "" },
        ].map(({ label, key, danger }) => {
          if (label === "\u2190\u2192") {
            return (
              <div key={label} className="flex gap-0.5">
                <button
                  onClick={() => onSendKey("\x1b[D")}
                  className="flex-1 h-11 text-sm text-gray-200 bg-surface-lighter rounded-l-xl border border-border active:bg-accent/30 active:text-accent active:scale-95 transition-transform"
                >
                  &#8592;
                </button>
                <button
                  onClick={() => onSendKey("\x1b[C")}
                  className="flex-1 h-11 text-sm text-gray-200 bg-surface-lighter rounded-r-xl border border-border active:bg-accent/30 active:text-accent active:scale-95 transition-transform"
                >
                  &#8594;
                </button>
              </div>
            );
          }
          return (
            <button
              key={label}
              onClick={() => onSendKey(key)}
              className={`h-11 text-sm font-medium rounded-xl border active:scale-95 transition-transform ${
                danger
                  ? "bg-danger/20 text-danger border-danger/30 active:bg-danger/40"
                  : "text-gray-200 bg-surface-lighter border-border active:bg-accent/30 active:text-accent"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Scroll controls — these scroll the terminal viewport, not shell input */}
      <div className="flex items-center gap-1.5 px-2.5 py-2">
        <button
          onClick={() => terminalRef.current?.scrollToTop()}
          className="flex-1 h-10 text-xs font-medium text-gray-300 bg-surface-lighter rounded-xl border border-border active:bg-accent/30 active:text-accent active:scale-95 transition-transform"
        >
          Top
        </button>
        <button
          onClick={() => terminalRef.current?.scrollLines(-15)}
          className="flex-1 h-10 text-xs font-medium text-gray-300 bg-surface-lighter rounded-xl border border-border active:bg-accent/30 active:text-accent active:scale-95 transition-transform"
        >
          &#8593;Pg
        </button>
        <button
          onClick={() => terminalRef.current?.scrollLines(15)}
          className="flex-1 h-10 text-xs font-medium text-gray-300 bg-surface-lighter rounded-xl border border-border active:bg-accent/30 active:text-accent active:scale-95 transition-transform"
        >
          &#8595;Pg
        </button>
        <button
          onClick={() => terminalRef.current?.scrollToBottom()}
          className="flex-1 h-10 text-xs font-medium text-gray-300 bg-surface-lighter rounded-xl border border-border active:bg-accent/30 active:text-accent active:scale-95 transition-transform"
        >
          Bottom
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drop zone overlay for drag-to-split
// ---------------------------------------------------------------------------

type DropZone = "left" | "right" | "top" | "bottom" | "center" | null;

function DropZoneOverlay({ onDrop, sessionId }: { onDrop: (zone: DropZone, targetSessionId: string) => void; sessionId: string }) {
  const [activeZone, setActiveZone] = useState<DropZone>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function getZone(e: React.DragEvent): DropZone {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0.25) return "left";
    if (x > 0.75) return "right";
    if (y < 0.25) return "top";
    if (y > 0.75) return "bottom";
    return "center";
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-10"
      onDragOver={(e) => { e.preventDefault(); setActiveZone(getZone(e)); }}
      onDragLeave={() => setActiveZone(null)}
      onDrop={(e) => { e.preventDefault(); const zone = getZone(e); setActiveZone(null); onDrop(zone, sessionId); }}
    >
      {activeZone && activeZone !== "center" && (
        <div className={`absolute bg-accent/20 border-2 border-accent/40 rounded transition-all ${
          activeZone === "left" ? "inset-y-0 left-0 w-1/2" :
          activeZone === "right" ? "inset-y-0 right-0 w-1/2" :
          activeZone === "top" ? "inset-x-0 top-0 h-1/2" :
          "inset-x-0 bottom-0 h-1/2"
        }`} />
      )}
      {activeZone === "center" && (
        <div className="absolute inset-2 bg-accent/10 border-2 border-accent/30 rounded" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context menu for pane actions
// ---------------------------------------------------------------------------

function PaneContextMenu({ x, y, onSplitH, onSplitV, onClose, onUnsplit }: {
  x: number; y: number;
  onSplitH: () => void; onSplitV: () => void;
  onClose: () => void; onUnsplit: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-surface-lighter border border-border rounded shadow-lg py-1 min-w-[140px]"
      style={{ left: x, top: y }}
    >
      <button onClick={() => { onSplitH(); onClose(); }} className="w-full text-left px-3 py-1 text-[11px] text-gray-300 hover:bg-accent/20 hover:text-accent">Split Right</button>
      <button onClick={() => { onSplitV(); onClose(); }} className="w-full text-left px-3 py-1 text-[11px] text-gray-300 hover:bg-accent/20 hover:text-accent">Split Down</button>
      <div className="border-t border-border my-0.5" />
      <button onClick={() => { onUnsplit(); onClose(); }} className="w-full text-left px-3 py-1 text-[11px] text-gray-300 hover:bg-accent/20 hover:text-accent">Unsplit (show only this)</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recursive split view renderer
// ---------------------------------------------------------------------------

interface SplitViewProps {
  node: SplitNode;
  tabs: TermSession[];
  nodeNames: Map<string, string>;
  activeSessionId: string | null;
  newSessionIds: Set<string>;
  cwdParam?: string;
  commandParam?: string;
  onSessionClosed: (sid: string) => void;
  onSelectSession: (sid: string) => void;
  onResize: (path: number[], ratio: number) => void;
  onSplitAt: (targetSessionId: string, newSessionId: string, direction: "h" | "v") => void;
  onDropTab: (draggedSessionId: string, targetSessionId: string, zone: DropZone) => void;
  onUnsplit: (sessionId: string) => void;
  onImageUpload: (nodeId: string, sessionId: string, base64: string, mimeType: string) => void;
  draggingSessionId: string | null;
  isMobile: boolean;
  activeTerminalRef?: React.MutableRefObject<any>;
  path: number[];
}

function SplitView({ node, tabs, nodeNames, activeSessionId, newSessionIds, cwdParam, commandParam, onSessionClosed, onSelectSession, onResize, onSplitAt, onDropTab, onUnsplit, onImageUpload, draggingSessionId, isMobile, activeTerminalRef, path }: SplitViewProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (node.type === "leaf") {
    const tab = tabs.find(t => t.sessionId === node.sessionId);
    if (!tab) return <div className="flex-1 bg-surface" />;
    const isActive = tab.sessionId === activeSessionId;
    const showDropZones = draggingSessionId !== null && draggingSessionId !== tab.sessionId;
    const agentName = nodeNames.get(tab.nodeId) ?? tab.nodeId.slice(0, 12);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const commaIdx = dataUrl.indexOf(",");
        const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
        onImageUpload(tab.nodeId, tab.sessionId, base64, file.type);
      };
      reader.readAsDataURL(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    return (
      <div
        className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden relative"
        style={{ outline: isActive ? "1px solid rgba(88,166,255,0.25)" : "none" }}
        onClick={() => onSelectSession(tab.sessionId)}
        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }); }}
      >
        {/* Pane label */}
        <div className={`flex items-center gap-1.5 px-2 py-0.5 shrink-0 text-[10px] select-none ${
          isActive ? "bg-accent/10 text-accent" : "bg-surface-lighter/50 text-gray-500"
        }`}>
          <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
          <span className="font-medium">{agentName}</span>
          <span className="text-gray-600">/</span>
          <span className="truncate">{tab.label}</span>
          <span className="ml-auto flex items-center gap-1">
            {/* Image upload button */}
            <button
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              className={`text-gray-600 hover:text-accent transition-colors ${isMobile ? "px-1.5 py-0.5 text-[12px]" : "text-[10px]"}`}
              title="Upload image"
            >
              {isMobile ? "\ud83d\udcf7" : "\ud83d\udcce"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture={isMobile ? "environment" : undefined}
              onChange={handleFileSelect}
              className="hidden"
            />
            <span className="text-gray-700 font-mono">{tab.sessionId.slice(0, 6)}</span>
          </span>
        </div>
        <TerminalPane
          key={tab.sessionId}
          nodeId={tab.nodeId}
          sessionId={tab.sessionId}
          cwd={newSessionIds.has(tab.sessionId) ? cwdParam : undefined}
          command={
            newSessionIds.has(tab.sessionId)
              ? tab.label === "Claude Code" ? "claude" : commandParam
              : undefined
          }
          onSessionClosed={onSessionClosed}
          terminalRef={isActive ? activeTerminalRef : undefined}
        />
        {showDropZones && (
          <DropZoneOverlay
            sessionId={tab.sessionId}
            onDrop={(zone, targetSid) => {
              if (zone && draggingSessionId) onDropTab(draggingSessionId, targetSid, zone);
            }}
          />
        )}
        {contextMenu && (
          <PaneContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onSplitH={() => onSplitAt(tab.sessionId, "", "h")}
            onSplitV={() => onSplitAt(tab.sessionId, "", "v")}
            onUnsplit={() => onUnsplit(tab.sessionId)}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    );
  }

  // Split node
  const isH = node.direction === "h";
  return (
    <ResizablePanes
      direction={isH ? "horizontal" : "vertical"}
      panes={[
        { id: "left", size: node.ratio },
        { id: "right", size: 1 - node.ratio },
      ]}
      onPanesChange={(configs) => {
        const leftSize = configs[0].size;
        const total = configs[0].size + configs[1].size;
        onResize(path, leftSize / total);
      }}
    >
      {[
        <SplitView key="0" node={node.children[0]} tabs={tabs} nodeNames={nodeNames} activeSessionId={activeSessionId} newSessionIds={newSessionIds} cwdParam={cwdParam} commandParam={commandParam} onSessionClosed={onSessionClosed} onSelectSession={onSelectSession} onResize={onResize} onSplitAt={onSplitAt} onDropTab={onDropTab} onUnsplit={onUnsplit} onImageUpload={onImageUpload} draggingSessionId={draggingSessionId} isMobile={isMobile} activeTerminalRef={activeTerminalRef} path={[...path, 0]} />,
        <SplitView key="1" node={node.children[1]} tabs={tabs} nodeNames={nodeNames} activeSessionId={activeSessionId} newSessionIds={newSessionIds} cwdParam={cwdParam} commandParam={commandParam} onSessionClosed={onSessionClosed} onSelectSession={onSelectSession} onResize={onResize} onSplitAt={onSplitAt} onDropTab={onDropTab} onUnsplit={onUnsplit} onImageUpload={onImageUpload} draggingSessionId={draggingSessionId} isMobile={isMobile} activeTerminalRef={activeTerminalRef} path={[...path, 1]} />,
      ]}
    </ResizablePanes>
  );
}

// ---------------------------------------------------------------------------
// Split tree helpers
// ---------------------------------------------------------------------------

function treeContains(node: SplitNode, sessionId: string): boolean {
  if (node.type === "leaf") return node.sessionId === sessionId;
  return treeContains(node.children[0], sessionId) || treeContains(node.children[1], sessionId);
}

function removeFromTree(node: SplitNode, sessionId: string): SplitNode | null {
  if (node.type === "leaf") return node.sessionId === sessionId ? null : node;
  const left = removeFromTree(node.children[0], sessionId);
  const right = removeFromTree(node.children[1], sessionId);
  if (!left && !right) return null;
  if (!left) return right;
  if (!right) return left;
  return { ...node, children: [left, right] };
}

function splitLeafInTree(node: SplitNode, targetSessionId: string, newSessionId: string, direction: "h" | "v", insertBefore = false): SplitNode {
  if (node.type === "leaf") {
    if (node.sessionId === targetSessionId) {
      const first: SplitNode = { type: "leaf", sessionId: insertBefore ? newSessionId : targetSessionId };
      const second: SplitNode = { type: "leaf", sessionId: insertBefore ? targetSessionId : newSessionId };
      return { type: "split", direction, children: [first, second], ratio: 0.5 };
    }
    return node;
  }
  return {
    ...node,
    children: [
      splitLeafInTree(node.children[0], targetSessionId, newSessionId, direction, insertBefore),
      splitLeafInTree(node.children[1], targetSessionId, newSessionId, direction, insertBefore),
    ],
  };
}

function swapInTree(node: SplitNode, sessionA: string, sessionB: string): SplitNode {
  if (node.type === "leaf") {
    if (node.sessionId === sessionA) return { type: "leaf", sessionId: sessionB };
    if (node.sessionId === sessionB) return { type: "leaf", sessionId: sessionA };
    return node;
  }
  return {
    ...node,
    children: [
      swapInTree(node.children[0], sessionA, sessionB),
      swapInTree(node.children[1], sessionA, sessionB),
    ],
  };
}

function setRatioInTree(node: SplitNode, path: number[], ratio: number): SplitNode {
  if (node.type === "leaf") return node;
  if (path.length === 0) return { ...node, ratio };
  const [head, ...rest] = path;
  const children: [SplitNode, SplitNode] = [...node.children];
  children[head] = setRatioInTree(children[head], rest, ratio);
  return { ...node, children };
}

function fmtB(b: number) {
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(0)}M`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(1)}G`;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default function TerminalPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-gray-500">Loading...</div>}>
      <TerminalPageInner />
    </Suspense>
  );
}
