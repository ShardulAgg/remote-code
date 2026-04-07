"use client";

import { encode, decode, BrowserMessage, HubToBrowserMessage } from "@remote-code/protocol";

type MessageHandler = (msg: HubToBrowserMessage) => void;

class WsClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private authenticated = false;

  connect(token: string): void {
    this.token = token;
    this.authenticated = false;
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

      // Track auth state
      if (msg.type === "auth-result") {
        if (msg.success) {
          this.authenticated = true;
        } else {
          // Bad token — stop reconnecting and clear it
          this.authenticated = false;
          this.token = null;
          localStorage.removeItem("rc-token");
        }
      }

      this.handlers.forEach((h) => h(msg));
    };

    ws.onclose = () => {
      this.connected = false;
      // Only reconnect if we have a valid token (auth didn't fail)
      if (this.token) {
        this.scheduleReconnect();
      }
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
    this.authenticated = false;
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

  isAuthenticated(): boolean {
    return this.authenticated;
  }

  /**
   * Wait until the WebSocket is authenticated. Resolves immediately if already authed.
   * Rejects after timeout if auth doesn't complete.
   */
  waitForAuth(timeoutMs: number = 5000): Promise<void> {
    if (this.authenticated) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const unsub = this.onMessage((msg) => {
        if (msg.type === "auth-result") {
          unsub();
          clearTimeout(timer);
          if ((msg as any).success) {
            resolve();
          } else {
            reject(new Error("Auth failed"));
          }
        }
      });
      const timer = setTimeout(() => {
        unsub();
        // If we're authed by now (race), resolve
        if (this.authenticated) resolve();
        else reject(new Error("Auth timeout"));
      }, timeoutMs);
    });
  }
}

export const wsClient = new WsClient();

// Auto-connect if token exists in localStorage
if (typeof window !== "undefined") {
  const saved = localStorage.getItem("rc-token");
  if (saved) {
    wsClient.connect(saved);
  }
}
