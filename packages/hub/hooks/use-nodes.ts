"use client";

import { useEffect, useState } from "react";
import { NodeInfo, NodeList, NodeUpdate, SessionInfo } from "@remote-code/protocol";
import { wsClient } from "../lib/ws-client";

export interface ActiveSession {
  sessionId: string;
  nodeId: string;
  label: string;
}

export function useNodes() {
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);

  useEffect(() => {
    wsClient.send({ type: "subscribe-nodes" });

    const unsubscribe = wsClient.onMessage((msg) => {
      if (msg.type === "node-list") {
        setNodes((msg as NodeList).nodes);
      } else if (msg.type === "node-update") {
        const update = msg as NodeUpdate;
        setNodes((prev) => {
          const idx = prev.findIndex((n) => n.nodeId === update.node.nodeId);
          if (idx === -1) return [...prev, update.node];
          const next = [...prev];
          next[idx] = update.node;
          return next;
        });
      } else if (msg.type === "session-list") {
        const list = msg as { type: "session-list"; sessions: SessionInfo[] };
        setSessions(list.sessions.map(s => ({ sessionId: s.sessionId, nodeId: s.nodeId, label: s.label || "" })));
      }
    });

    return unsubscribe;
  }, []);

  return { nodes, sessions };
}
