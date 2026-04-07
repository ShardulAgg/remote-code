"use client";

import { useSearchParams } from "next/navigation";
import { useState, useCallback } from "react";
import { v4 as uuid } from "uuid";
import type { Terminal } from "@xterm/xterm";
import { TerminalPanel } from "../../components/terminal-panel";
import { TerminalTabs, TabInfo } from "../../components/terminal-tabs";
import { useTerminal } from "../../hooks/use-terminal";

// TerminalTab renders a single terminal connected to a node
interface TerminalTabProps {
  nodeId: string;
  sessionId: string;
  cwd?: string;
  command?: string;
  hidden: boolean;
}

function TerminalTab({ nodeId, sessionId, cwd, command, hidden }: TerminalTabProps) {
  const { connect } = useTerminal(nodeId, sessionId);

  const handleReady = useCallback(
    (terminal: Terminal) => {
      return connect(terminal, { cwd, command });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodeId, sessionId, cwd, command]
  );

  return (
    <div className={`flex-1 ${hidden ? "hidden" : "flex"}`} style={{ minHeight: 0 }}>
      <TerminalPanel onReady={handleReady} />
    </div>
  );
}

export default function TerminalPage() {
  const searchParams = useSearchParams();
  const nodeParam = searchParams.get("node") ?? "";
  const cwdParam = searchParams.get("cwd") ?? undefined;
  const commandParam = searchParams.get("command") ?? undefined;

  // Build initial tab from query params if a node was specified
  const [tabs, setTabs] = useState<TabInfo[]>(() => {
    if (!nodeParam) return [];
    return [
      {
        id: uuid(),
        nodeId: nodeParam,
        nodeName: nodeParam,
        sessionId: uuid(),
      },
    ];
  });

  const [activeTab, setActiveTab] = useState<string | null>(
    () => (tabs.length > 0 ? tabs[0].id : null)
  );

  // Only apply cwd/command to the very first tab (captured once at mount)
  const [initialCwd] = useState(cwdParam);
  const [initialCommand] = useState(commandParam);

  function handleAdd() {
    const nodeId = window.prompt("Enter node ID:");
    if (!nodeId || !nodeId.trim()) return;
    const id = uuid();
    const newTab: TabInfo = {
      id,
      nodeId: nodeId.trim(),
      nodeName: nodeId.trim(),
      sessionId: uuid(),
    };
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

  function handleSelect(id: string) {
    setActiveTab(id);
  }

  return (
    <div className="flex flex-col h-screen bg-surface">
      <TerminalTabs
        tabs={tabs}
        activeTab={activeTab}
        onSelect={handleSelect}
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
        <div className="flex flex-1 overflow-hidden">
          {tabs.map((tab, idx) => (
            <TerminalTab
              key={tab.id}
              nodeId={tab.nodeId}
              sessionId={tab.sessionId}
              cwd={idx === 0 ? initialCwd : undefined}
              command={idx === 0 ? initialCommand : undefined}
              hidden={tab.id !== activeTab}
            />
          ))}
        </div>
      )}
    </div>
  );
}
