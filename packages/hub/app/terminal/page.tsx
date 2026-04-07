"use client";

import { useSearchParams } from "next/navigation";
import { useState, useCallback, useEffect, Suspense } from "react";
import { v4 as uuid } from "uuid";
import dynamic from "next/dynamic";
import { TerminalTabs, TabInfo } from "../../components/terminal-tabs";
import { useTerminal } from "../../hooks/use-terminal";
import { wsClient } from "../../lib/ws-client";

const TerminalPanel = dynamic(
  () => import("../../components/terminal-panel").then((m) => ({ default: m.TerminalPanel })),
  { ssr: false, loading: () => <div style={{ flex: 1, background: "#0d1117" }} /> }
);

interface TerminalTabProps {
  nodeId: string;
  sessionId: string;
  cwd?: string;
  command?: string;
  active: boolean;
}

function TerminalTab({ nodeId, sessionId, cwd, command, active }: TerminalTabProps) {
  const { connect } = useTerminal(nodeId, sessionId);

  const handleReady = useCallback(
    (terminal: any) => {
      return connect(terminal, { cwd, command });
    },
    [nodeId, sessionId, cwd, command] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <div style={{ display: active ? "flex" : "none", flex: 1, minHeight: 0 }}>
      <TerminalPanel onReady={handleReady} />
    </div>
  );
}

/**
 * Fetch all active sessions from the hub. Waits for auth first.
 */
async function fetchSessions(): Promise<Array<{ sessionId: string; nodeId: string }>> {
  // Wait for WS to be authenticated before requesting sessions
  try {
    await wsClient.waitForAuth(5000);
  } catch {
    return []; // not authed — will show login
  }

  return new Promise((resolve) => {
    let resolved = false;

    const unsub = wsClient.onMessage((msg) => {
      if (msg.type === "session-list" && !resolved) {
        resolved = true;
        unsub();
        resolve((msg as any).sessions ?? []);
      }
    });

    wsClient.send({ type: "subscribe-nodes" });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        unsub();
        resolve([]);
      }
    }, 3000);
  });
}

function TerminalPageInner() {
  const searchParams = useSearchParams();
  const nodeParam = searchParams.get("node") ?? "";
  const sessionParam = searchParams.get("session") ?? "";
  const cwdParam = searchParams.get("cwd") ?? undefined;
  const commandParam = searchParams.get("command") ?? undefined;

  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [initialCwd] = useState(cwdParam);
  const [initialCommand] = useState(commandParam);
  // Track which sessions are new (need cwd/command) vs reconnected
  const [newSessionIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    async function init() {
      // Get all active sessions from the hub
      const hubSessions = await fetchSessions();

      // Build tabs from hub sessions
      const tabsFromHub: TabInfo[] = [];

      if (nodeParam) {
        // Get all sessions for this node
        const nodeSessions = hubSessions.filter(s => s.nodeId === nodeParam);

        for (const s of nodeSessions) {
          tabsFromHub.push({
            id: s.sessionId, // use sessionId as tab id for dedup
            nodeId: s.nodeId,
            nodeName: s.nodeId,
            sessionId: s.sessionId,
          });
        }

        // If a specific session was requested, make sure it's in the list
        if (sessionParam && !tabsFromHub.find(t => t.sessionId === sessionParam)) {
          tabsFromHub.push({
            id: sessionParam,
            nodeId: nodeParam,
            nodeName: nodeParam,
            sessionId: sessionParam,
          });
        }

        // If no sessions exist at all, create a new one
        if (tabsFromHub.length === 0) {
          const newSessionId = uuid();
          newSessionIds.add(newSessionId);
          tabsFromHub.push({
            id: newSessionId,
            nodeId: nodeParam,
            nodeName: nodeParam,
            sessionId: newSessionId,
          });
        }
      } else {
        // No node param — show all active sessions across all nodes
        for (const s of hubSessions) {
          tabsFromHub.push({
            id: s.sessionId,
            nodeId: s.nodeId,
            nodeName: s.nodeId,
            sessionId: s.sessionId,
          });
        }
      }

      setTabs(tabsFromHub);

      // Activate the right tab
      if (sessionParam) {
        const tab = tabsFromHub.find(t => t.sessionId === sessionParam);
        setActiveTab(tab?.id ?? tabsFromHub[0]?.id ?? null);
      } else {
        setActiveTab(tabsFromHub[tabsFromHub.length - 1]?.id ?? null);
      }

      setReady(true);
    }

    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleAdd() {
    // Create a new session on the current node (or prompt for node)
    const currentTab = tabs.find(t => t.id === activeTab);
    const nodeId = currentTab?.nodeId || nodeParam;

    if (!nodeId) {
      const input = window.prompt("Node ID:");
      if (!input?.trim()) return;
      const newSessionId = uuid();
      newSessionIds.add(newSessionId);
      const newTab: TabInfo = { id: newSessionId, nodeId: input.trim(), nodeName: input.trim(), sessionId: newSessionId };
      setTabs(prev => [...prev, newTab]);
      setActiveTab(newTab.id);
      return;
    }

    const newSessionId = uuid();
    newSessionIds.add(newSessionId);
    const newTab: TabInfo = { id: newSessionId, nodeId, nodeName: nodeId, sessionId: newSessionId };
    setTabs(prev => [...prev, newTab]);
    setActiveTab(newTab.id);
  }

  function handleClose(id: string) {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (activeTab === id) {
        setActiveTab(next.length > 0 ? next[next.length - 1].id : null);
      }
      return next;
    });
  }

  if (!ready) {
    return <div style={{ flex: 1, background: "#0d1117" }} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <TerminalTabs
        tabs={tabs}
        activeTab={activeTab}
        onSelect={setActiveTab}
        onClose={handleClose}
        onAdd={handleAdd}
      />
      {tabs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-4">
          <p className="text-lg">No terminals open</p>
          <button
            onClick={handleAdd}
            className="px-4 py-2 rounded bg-surface-lighter border border-border text-gray-300 hover:bg-accent hover:text-white hover:border-accent transition-colors"
          >
            Open a terminal
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {tabs.map((tab) => (
            <TerminalTab
              key={tab.id}
              nodeId={tab.nodeId}
              sessionId={tab.sessionId}
              cwd={newSessionIds.has(tab.sessionId) ? initialCwd : undefined}
              command={newSessionIds.has(tab.sessionId) ? initialCommand : undefined}
              active={tab.id === activeTab}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TerminalPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-gray-500">Loading...</div>}>
      <TerminalPageInner />
    </Suspense>
  );
}
