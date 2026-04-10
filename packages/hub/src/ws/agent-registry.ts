import WebSocket from "ws";
import { NodeInfo, FsTreeEntry, FsTreeUpdate, encode } from "@remote-code/protocol";
import { getNodeInfo } from "../db/queries.js";

type NodeChangeCallback = (node: NodeInfo) => void;
type FsTreeCallback = (nodeId: string, root: string, entries: FsTreeEntry[]) => void;
type FsTreeUpdateCallback = (nodeId: string, changes: FsTreeUpdate["changes"]) => void;

interface AgentEntry {
  ws: WebSocket;
  nodeId: string;
  sessions: Set<string>;
  fsTree?: { root: string; entries: FsTreeEntry[] };
}

/**
 * AgentRegistry — singleton that tracks all currently connected agent WebSockets.
 */
export class AgentRegistry {
  private static _instance: AgentRegistry | null = null;

  private agents = new Map<string, AgentEntry>();
  private nodeChangeCallbacks: NodeChangeCallback[] = [];
  private fsTreeCallbacks: FsTreeCallback[] = [];
  private fsTreeUpdateCallbacks: FsTreeUpdateCallback[] = [];

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

  // --- File tree ---

  setFsTree(nodeId: string, root: string, entries: FsTreeEntry[]): void {
    const agent = this.agents.get(nodeId);
    if (agent) agent.fsTree = { root, entries };
    for (const cb of this.fsTreeCallbacks) cb(nodeId, root, entries);
  }

  getFsTree(nodeId: string): { root: string; entries: FsTreeEntry[] } | undefined {
    return this.agents.get(nodeId)?.fsTree;
  }

  broadcastFsTreeUpdate(nodeId: string, changes: FsTreeUpdate["changes"]): void {
    // Apply changes to cached tree
    const agent = this.agents.get(nodeId);
    if (agent?.fsTree) {
      for (const change of changes) {
        applyTreeChange(agent.fsTree.entries, change);
      }
    }
    for (const cb of this.fsTreeUpdateCallbacks) cb(nodeId, changes);
  }

  onFsTree(cb: FsTreeCallback): () => void {
    this.fsTreeCallbacks.push(cb);
    return () => { this.fsTreeCallbacks = this.fsTreeCallbacks.filter(c => c !== cb); };
  }

  onFsTreeUpdate(cb: FsTreeUpdateCallback): () => void {
    this.fsTreeUpdateCallbacks.push(cb);
    return () => { this.fsTreeUpdateCallbacks = this.fsTreeUpdateCallbacks.filter(c => c !== cb); };
  }

  requestFsTree(nodeId: string, root?: string): void {
    this.sendToAgent(nodeId, JSON.stringify({ type: "request-fs-tree", root: root || "", depth: 8 }));
  }
}

function applyTreeChange(
  entries: FsTreeEntry[],
  change: { action: "add" | "remove" | "modify"; entry: FsTreeEntry; parentPath: string }
): void {
  if (change.action === "remove") {
    removeEntry(entries, change.entry.path);
  } else if (change.action === "add") {
    addEntry(entries, change.entry, change.parentPath);
  } else {
    // modify: update in place
    updateEntry(entries, change.entry);
  }
}

function removeEntry(entries: FsTreeEntry[], path: string): boolean {
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].path === path) { entries.splice(i, 1); return true; }
    if (entries[i].children && removeEntry(entries[i].children!, path)) return true;
  }
  return false;
}

function addEntry(entries: FsTreeEntry[], entry: FsTreeEntry, parentPath: string): boolean {
  for (const e of entries) {
    if (e.path === parentPath && e.children) {
      e.children.push(entry);
      return true;
    }
    if (e.children && addEntry(e.children, entry, parentPath)) return true;
  }
  return false;
}

function updateEntry(entries: FsTreeEntry[], entry: FsTreeEntry): boolean {
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].path === entry.path) {
      entries[i] = { ...entries[i], ...entry, children: entries[i].children };
      return true;
    }
    if (entries[i].children && updateEntry(entries[i].children!, entry)) return true;
  }
  return false;
}

export const agentRegistry = AgentRegistry.getInstance();
