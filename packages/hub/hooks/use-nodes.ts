"use client";

import { useEffect, useState } from "react";
import { NodeInfo, NodeList, NodeUpdate } from "@remote-code/protocol";
import { wsClient } from "../lib/ws-client";

export function useNodes(): NodeInfo[] {
  const [nodes, setNodes] = useState<NodeInfo[]>([]);

  useEffect(() => {
    // Subscribe to node list updates
    wsClient.send({ type: "subscribe-nodes" });

    const unsubscribe = wsClient.onMessage((msg) => {
      if (msg.type === "node-list") {
        const nodeList = msg as NodeList;
        setNodes(nodeList.nodes);
      } else if (msg.type === "node-update") {
        const update = msg as NodeUpdate;
        setNodes((prev) => {
          const idx = prev.findIndex((n) => n.nodeId === update.node.nodeId);
          if (idx === -1) {
            return [...prev, update.node];
          }
          const next = [...prev];
          next[idx] = update.node;
          return next;
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return nodes;
}
