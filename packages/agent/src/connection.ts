import WebSocket from "ws";
import { AgentMessage, HubToAgentMessage, encode, decode } from "@remote-code/protocol";

export interface ConnectionOptions {
  hubUrl: string;
  token: string;
  nodeId: string;
  onMessage: (msg: HubToAgentMessage) => void;
  onConnected: () => void;
  onDisconnected: () => void;
}

export class Connection {
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private readonly maxDelay = 30000;
  private destroyed = false;
  private connected = false;

  constructor(private readonly opts: ConnectionOptions) {
    this.connect();
  }

  private connect(): void {
    if (this.destroyed) return;

    const base = this.opts.hubUrl.replace(/\/$/, "");
    const url = new URL(`${base}/agent`);
    url.searchParams.set("token", this.opts.token);
    url.searchParams.set("nodeId", this.opts.nodeId);

    const ws = new WebSocket(url.toString());
    this.ws = ws;

    ws.on("open", () => {
      this.reconnectDelay = 1000;
      this.connected = true;
      this.opts.onConnected();
    });

    ws.on("message", (raw: WebSocket.RawData) => {
      try {
        const msg = decode<HubToAgentMessage>(raw.toString());
        this.opts.onMessage(msg);
      } catch (err) {
        console.error("[connection] Failed to decode message:", err);
      }
    });

    ws.on("close", () => {
      this.connected = false;
      this.ws = null;
      this.opts.onDisconnected();
      this.scheduleReconnect();
    });

    ws.on("error", (err: Error) => {
      console.error("[connection] WebSocket error:", err.message);
      // close event will follow and trigger reconnect
    });
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    console.log(`[connection] Reconnecting in ${this.reconnectDelay}ms…`);
    setTimeout(() => {
      if (!this.destroyed) this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
  }

  send(msg: AgentMessage): void {
    if (!this.connected || !this.ws) return;
    try {
      this.ws.send(encode(msg));
    } catch (err) {
      console.error("[connection] Failed to send message:", err);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.ws?.close();
    this.ws = null;
  }
}
