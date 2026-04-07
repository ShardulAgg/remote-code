"use client";

import { useSearchParams } from "next/navigation";
import { useState, useCallback, useEffect, Suspense } from "react";
import { v4 as uuid } from "uuid";
import dynamic from "next/dynamic";
import { TerminalTabs, TabInfo } from "../../components/terminal-tabs";
import { useTerminal } from "../../hooks/use-terminal";

const TerminalPanel = dynamic(
  () => import("../../components/terminal-panel").then((m) => ({ default: m.TerminalPanel })),
  { ssr: false, loading: () => <div style={{ flex: 1, background: "#0d1117" }} /> }
);

const STORAGE_KEY = "rc-terminal-tabs";

function saveTabs(tabs: TabInfo[], activeTab: string | null) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTab }));
  } catch {}
}

function loadTabs(): { tabs: TabInfo[]; activeTab: string | null } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

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

function TerminalPageInner() {
  const searchParams = useSearchParams();
  const nodeParam = searchParams.get("node") ?? "";
  const cwdParam = searchParams.get("cwd") ?? undefined;
  const commandParam = searchParams.get("command") ?? undefined;

  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [initialCwd] = useState(cwdParam);
  const [initialCommand] = useState(commandParam);

  // Restore tabs from sessionStorage after mount (avoids SSR hydration mismatch)
  useEffect(() => {
    const saved = loadTabs();
    let restoredTabs = saved?.tabs ?? [];

    if (nodeParam) {
      const existing = restoredTabs.find(t => t.nodeId === nodeParam);
      if (!existing) {
        const newTab: TabInfo = {
          id: uuid(),
          nodeId: nodeParam,
          nodeName: nodeParam,
          sessionId: uuid(),
        };
        restoredTabs = [...restoredTabs, newTab];
      }
    }

    setTabs(restoredTabs);

    if (nodeParam) {
      const tab = restoredTabs.find(t => t.nodeId === nodeParam);
      setActiveTab(tab?.id ?? restoredTabs[0]?.id ?? null);
    } else if (saved?.activeTab && restoredTabs.find(t => t.id === saved.activeTab)) {
      setActiveTab(saved.activeTab);
    } else {
      setActiveTab(restoredTabs[0]?.id ?? null);
    }

    setReady(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist tabs on change (only after initial load)
  useEffect(() => {
    if (ready) saveTabs(tabs, activeTab);
  }, [tabs, activeTab, ready]);

  function handleAdd() {
    const nodeId = window.prompt("Node ID:");
    if (!nodeId?.trim()) return;
    const id = uuid();
    const newTab: TabInfo = { id, nodeId: nodeId.trim(), nodeName: nodeId.trim(), sessionId: uuid() };
    setTabs((prev) => [...prev, newTab]);
    setActiveTab(id);
  }

  function handleClose(id: string) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTab === id) {
        setActiveTab(next.length > 0 ? next[next.length - 1].id : null);
      }
      return next;
    });
  }

  const newestTabForNode = nodeParam ? tabs.find(t => t.nodeId === nodeParam) : null;

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
              cwd={tab.id === newestTabForNode?.id ? initialCwd : undefined}
              command={tab.id === newestTabForNode?.id ? initialCommand : undefined}
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
