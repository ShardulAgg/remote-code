"use client";

import { encode, decode, BrowserMessage, HubToBrowserMessage } from "@remote-code/protocol";

type MessageHandler = (msg: HubToBrowserMessage) => void;

class WsClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;

  connect(token: string): void {
    this.token = token;
    this.openConnection();
  }

  private openConnection(): void {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const url = `${protocol}//${host}/browser`;

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.connected = true;
      if (this.token) {
        ws.send(encode({ type: "browser-auth", token: this.token }));
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      let msg: HubToBrowserMessage;
      try {
        msg = decode<HubToBrowserMessage>(event.data as string);
      } catch {
        return;
      }
      this.handlers.forEach((h) => h(msg));
    };

    ws.onclose = () => {
      this.connected = false;
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      this.connected = false;
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.token) {
        this.openConnection();
      }
    }, 3000);
  }

  send(msg: BrowserMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(encode(msg));
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  disconnect(): void {
    this.token = null;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

export const wsClient = new WsClient();
