"use client";

import { useState, useEffect } from "react";
import { LoginForm } from "../components/login-form";
import { NodeGrid } from "../components/node-grid";
import { AddNodeModal } from "../components/add-node-modal";
import { useNodes } from "../hooks/use-nodes";
import { wsClient } from "../lib/ws-client";

function Dashboard() {
  const { nodes, sessions } = useNodes();
  const onlineCount = nodes.filter((n) => n.status === "online").length;
  const [showAddNode, setShowAddNode] = useState(false);

  // Derive hub URL from current page
  const hubUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <>
      <nav className="border-b border-border bg-surface-light shrink-0">
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center gap-6">
          <span className="text-white font-semibold">Remote Code</span>
          <a href="/terminal" className="text-gray-400 text-sm hover:text-white transition-colors">
            Terminals
          </a>
        </div>
      </nav>
      <div className="max-w-7xl mx-auto px-4 py-6 w-full flex-1 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Nodes</h1>
          <div className="flex items-center gap-4">
            {sessions.length > 0 && (
              <span className="text-sm text-accent">
                {sessions.length} active session{sessions.length !== 1 ? "s" : ""}
              </span>
            )}
            <span className="text-sm text-gray-400">
              <span className="text-success font-medium">{onlineCount}</span>
              {" / "}
              <span>{nodes.length}</span>
              {" online"}
            </span>
            <button
              onClick={() => setShowAddNode(true)}
              className="px-4 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/80 transition-colors"
            >
              + Add Node
            </button>
          </div>
        </div>
        <NodeGrid nodes={nodes} sessions={sessions} />
      </div>
      {showAddNode && <AddNodeModal hubUrl={hubUrl} onClose={() => setShowAddNode(false)} />}
    </>
  );
}

export default function HomePage() {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("rc-token");
    if (saved) {
      const unsubscribe = wsClient.onMessage((msg) => {
        if (msg.type === "auth-result") {
          unsubscribe();
          if (msg.success) {
            setAuthed(true);
          } else {
            localStorage.removeItem("rc-token");
          }
          setReady(true);
        }
      });

      wsClient.connect(saved);

      const timer = setTimeout(() => {
        unsubscribe();
        setReady(true);
      }, 5000);

      return () => {
        clearTimeout(timer);
        unsubscribe();
      };
    } else {
      setReady(true);
    }
  }, []);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-500 text-sm">Connecting...</p>
      </div>
    );
  }

  if (!authed) {
    return <LoginForm onAuth={() => setAuthed(true)} />;
  }

  return <Dashboard />;
}
