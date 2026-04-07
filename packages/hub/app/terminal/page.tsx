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
  onSessionClosed: (sessionId: string) => void;
}

function TerminalTab({ nodeId, sessionId, cwd, command, active, onSessionClosed }: TerminalTabProps) {
  const { connect } = useTerminal(nodeId, sessionId, onSessionClosed);

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
  try {
    await wsClient.waitForAuth(5000);
  } catch {
    return [];
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
  const isNewSession = searchParams.get("new") === "1";
  const cwdParam = searchParams.get("cwd") ?? undefined;
  const commandParam = searchParams.get("command") ?? undefined;

  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // Track which sessions are newly created (need cwd/command passed to spawn)
  const [newSessionIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    async function init() {
      const hubSessions = await fetchSessions();
      const tabsToShow: TabInfo[] = [];

      if (nodeParam) {
        const nodeSessions = hubSessions.filter(s => s.nodeId === nodeParam);

        // Add tabs for all existing sessions on this node
        nodeSessions.forEach((s, i) => {
          tabsToShow.push({
            id: s.sessionId,
            nodeId: s.nodeId,
            nodeName: s.nodeId,
            sessionId: s.sessionId,
            label: `Session ${i + 1}`,
          });
        });

        // If reconnecting to a specific session that's not in the list
        if (sessionParam && !tabsToShow.find(t => t.sessionId === sessionParam)) {
          tabsToShow.push({
            id: sessionParam,
            nodeId: nodeParam,
            nodeName: nodeParam,
            sessionId: sessionParam,
            label: `Session ${tabsToShow.length + 1}`,
          });
        }

        // If explicitly creating a new session, or no sessions exist
        if (isNewSession || tabsToShow.length === 0) {
          const newId = uuid();
          newSessionIds.add(newId);
          tabsToShow.push({
            id: newId,
            nodeId: nodeParam,
            nodeName: nodeParam,
            sessionId: newId,
            label: commandParam === "claude" ? "Claude Code" : `Session ${tabsToShow.length + 1}`,
          });
        }
      } else {
        // No node — show all sessions across all nodes
        hubSessions.forEach((s, i) => {
          tabsToShow.push({
            id: s.sessionId,
            nodeId: s.nodeId,
            nodeName: s.nodeId,
            sessionId: s.sessionId,
            label: `Session ${i + 1}`,
          });
        });
      }

      setTabs(tabsToShow);

      // Activate: new session if created, specific session if requested, or last tab
      if (isNewSession) {
        const newTab = tabsToShow.find(t => newSessionIds.has(t.sessionId));
        setActiveTab(newTab?.id ?? tabsToShow[tabsToShow.length - 1]?.id ?? null);
      } else if (sessionParam) {
        const tab = tabsToShow.find(t => t.sessionId === sessionParam);
        setActiveTab(tab?.id ?? tabsToShow[0]?.id ?? null);
      } else {
        setActiveTab(tabsToShow[tabsToShow.length - 1]?.id ?? null);
      }

      setReady(true);
    }

    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleAdd() {
    const currentTab = tabs.find(t => t.id === activeTab);
    const nodeId = currentTab?.nodeId || nodeParam;

    if (!nodeId) {
      // No node context — rare but handle it
      return;
    }

    const newId = uuid();
    newSessionIds.add(newId);
    const newTab: TabInfo = {
      id: newId,
      nodeId,
      nodeName: nodeId,
      sessionId: newId,
      label: `Session ${tabs.length + 1}`,
    };
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

  // When a session's PTY exits (user typed `exit`), auto-remove the tab after a short delay
  const handleSessionClosed = useCallback((sessionId: string) => {
    setTimeout(() => {
      setTabs(prev => {
        const next = prev.filter(t => t.sessionId !== sessionId);
        setActiveTab(current => {
          const closedTab = prev.find(t => t.sessionId === sessionId);
          if (closedTab && current === closedTab.id) {
            return next.length > 0 ? next[next.length - 1].id : null;
          }
          return current;
        });
        return next;
      });
    }, 1500); // Brief delay so user sees "[Session ended]"
  }, []);

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
          <p className="text-lg">No active sessions</p>
          <p className="text-sm text-gray-600">Go to the dashboard and open a terminal on a node.</p>
          <a
            href="/"
            className="px-4 py-2 rounded bg-accent text-white text-sm hover:bg-accent/80 transition-colors"
          >
            Dashboard
          </a>
        </div>
      ) : (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {tabs.map((tab) => (
            <TerminalTab
              key={tab.id}
              nodeId={tab.nodeId}
              sessionId={tab.sessionId}
              cwd={newSessionIds.has(tab.sessionId) ? cwdParam : undefined}
              command={newSessionIds.has(tab.sessionId) ? commandParam : undefined}
              active={tab.id === activeTab}
              onSessionClosed={handleSessionClosed}
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
