// === Agent -> Hub Messages ===

export interface AgentHello {
  type: "agent-hello";
  nodeId: string;
  name: string;
  token: string;
  os: string;
  arch: string;
  hostname: string;
  activeSessions?: string[]; // sessionIds of PTYs still alive on this node
}

export interface PtyData {
  type: "pty-data";
  sessionId: string;
  data: string; // base64-encoded terminal output
}

export interface PtyExit {
  type: "pty-exit";
  sessionId: string;
  exitCode: number;
}

export interface StatsReport {
  type: "stats-report";
  cpu: number;       // 0-100 percentage
  memTotal: number;  // bytes
  memUsed: number;   // bytes
  diskTotal: number; // bytes
  diskUsed: number;  // bytes
}

export interface FsResponse {
  type: "fs-response";
  requestId: string;
  data?: unknown;
  error?: string;
}

// === Hub -> Agent Messages ===

export interface SpawnPty {
  type: "spawn-pty";
  sessionId: string;
  cols: number;
  rows: number;
  cwd?: string;
  command?: string;
}

export interface PtyInput {
  type: "pty-input";
  sessionId: string;
  data: string;
}

export interface PtyResize {
  type: "pty-resize";
  sessionId: string;
  cols: number;
  rows: number;
}

export interface KillPty {
  type: "kill-pty";
  sessionId: string;
}

export interface FsRequest {
  type: "fs-request";
  requestId: string;
  action: "list" | "read" | "write" | "stat" | "mkdir" | "delete";
  path: string;
  data?: string;
}

// === Browser -> Hub Messages ===

export interface BrowserAuth {
  type: "browser-auth";
  token: string;
}

export interface OpenTerminal {
  type: "open-terminal";
  nodeId: string;
  sessionId?: string;
  cols: number;
  rows: number;
  cwd?: string;
  command?: string;
}

export interface TerminalInput {
  type: "terminal-input";
  sessionId: string;
  data: string;
}

export interface TerminalResize {
  type: "terminal-resize";
  sessionId: string;
  cols: number;
  rows: number;
}

export interface CloseTerminal {
  type: "close-terminal";
  sessionId: string;
}

export interface BrowserFsRequest {
  type: "browser-fs-request";
  nodeId: string;
  requestId: string;
  action: "list" | "read" | "write" | "stat" | "mkdir" | "delete";
  path: string;
  data?: string;
}

export interface SubscribeNodes {
  type: "subscribe-nodes";
}

// === Hub -> Browser Messages ===

export interface AuthResult {
  type: "auth-result";
  success: boolean;
  error?: string;
}

export interface NodeList {
  type: "node-list";
  nodes: NodeInfo[];
}

export interface NodeUpdate {
  type: "node-update";
  node: NodeInfo;
}

export interface NodeInfo {
  nodeId: string;
  name: string;
  status: "online" | "offline";
  os: string;
  arch: string;
  hostname: string;
  cpu: number;
  memTotal: number;
  memUsed: number;
  diskTotal: number;
  diskUsed: number;
  activeSessions: number;
  lastSeen: number;
}

export interface TerminalOpened {
  type: "terminal-opened";
  sessionId: string;
  nodeId: string;
}

export interface TerminalData {
  type: "terminal-data";
  sessionId: string;
  data: string;
}

export interface TerminalClosed {
  type: "terminal-closed";
  sessionId: string;
  exitCode?: number;
}

export interface BrowserFsResponse {
  type: "browser-fs-response";
  requestId: string;
  data?: unknown;
  error?: string;
}

export interface SessionList {
  type: "session-list";
  sessions: SessionInfo[];
}

export interface SessionInfo {
  sessionId: string;
  nodeId: string;
  cwd: string;
  createdAt: number;
  lastActive: number;
  status: "active" | "detached";
}

// === Union types ===

export type AgentMessage =
  | AgentHello | PtyData | PtyExit | StatsReport | FsResponse;

export type HubToAgentMessage =
  | SpawnPty | PtyInput | PtyResize | KillPty | FsRequest;

export type BrowserMessage =
  | BrowserAuth | OpenTerminal | TerminalInput | TerminalResize
  | CloseTerminal | BrowserFsRequest | SubscribeNodes;

export type HubToBrowserMessage =
  | AuthResult | NodeList | NodeUpdate | TerminalOpened | TerminalData
  | TerminalClosed | BrowserFsResponse | SessionList;

// === Encode/Decode ===

export function encode(
  msg: AgentMessage | HubToAgentMessage | BrowserMessage | HubToBrowserMessage
): string {
  return JSON.stringify(msg);
}

export function decode<T>(raw: string): T {
  return JSON.parse(raw) as T;
}
