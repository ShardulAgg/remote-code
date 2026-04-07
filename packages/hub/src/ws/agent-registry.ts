import WebSocket from "ws";
import { NodeInfo } from "@remote-code/protocol";
import { getNodeInfo } from "../db/queries.js";

type NodeChangeCallback = (node: NodeInfo) => void;

interface AgentEntry {
  ws: WebSocket;
  nodeId: string;
  sessions: Set<string>;
}

/**
 * AgentRegistry — singleton that tracks all currently connected agent WebSockets.
 */
export class AgentRegistry {
  private static _instance: AgentRegistry | null = null;

  private agents = new Map<string, AgentEntry>();
  private nodeChangeCallbacks: NodeChangeCallback[] = [];

  private constructor() {}

  static getInstance(): AgentRegistry {
    if (!AgentRegistry._instance) {
      AgentRegistry._instance = new AgentRegistry();
    }
    return AgentRegistry._instance;
  }

  register(nodeId: string, ws: WebSocket): void {
    this.agents.set(nodeId, { ws, nodeId, sessions: new Set() });
  }

  unregister(nodeId: string): void {
    this.agents.delete(nodeId);
  }

  isOnline(nodeId: string): boolean {
    return this.agents.has(nodeId);
  }

  getOnlineNodeIds(): string[] {
    return Array.from(this.agents.keys());
  }

  getAgentWs(nodeId: string): WebSocket | undefined {
    return this.agents.get(nodeId)?.ws;
  }

  addSession(nodeId: string, sessionId: string): void {
    this.agents.get(nodeId)?.sessions.add(sessionId);
  }

  removeSession(nodeId: string, sessionId: string): void {
    this.agents.get(nodeId)?.sessions.delete(sessionId);
  }

  getNodeSessions(nodeId: string): Set<string> {
    return this.agents.get(nodeId)?.sessions ?? new Set();
  }

  sendToAgent(nodeId: string, payload: string): boolean {
    const entry = this.agents.get(nodeId);
    if (!entry || entry.ws.readyState !== WebSocket.OPEN) return false;
    entry.ws.send(payload);
    return true;
  }

  onNodeChange(cb: NodeChangeCallback): () => void {
    this.nodeChangeCallbacks.push(cb);
    return () => {
      this.nodeChangeCallbacks = this.nodeChangeCallbacks.filter((c) => c !== cb);
    };
  }

  notifyNodeChange(nodeId: string): void {
    const info = getNodeInfo(nodeId);
    if (!info) return;
    for (const cb of this.nodeChangeCallbacks) {
      cb(info);
    }
  }
}

export const agentRegistry = AgentRegistry.getInstance();
