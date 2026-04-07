"use client";

import { useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import type { Terminal } from "@xterm/xterm";
import { wsClient } from "../lib/ws-client";

interface ConnectOptions {
  cwd?: string;
  command?: string;
}

// UTF-8 safe base64 encode/decode
function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const binStr = Array.from(bytes, (b) => String.fromCodePoint(b)).join("");
  return btoa(binStr);
}

function fromBase64(b64: string): string {
  const binStr = atob(b64);
  const bytes = Uint8Array.from(binStr, (c) => c.codePointAt(0)!);
  return new TextDecoder().decode(bytes);
}

export function useTerminal(nodeId: string, existingSessionId?: string) {
  const [sessionId] = useState<string>(() => existingSessionId ?? uuid());
  const cleanupRef = useRef<(() => void) | null>(null);

  function connect(terminal: Terminal, options: ConnectOptions = {}): () => void {
    // Send open-terminal to hub
    wsClient.send({
      type: "open-terminal",
      nodeId,
      sessionId,
      cols: terminal.cols,
      rows: terminal.rows,
      ...(options.cwd ? { cwd: options.cwd } : {}),
      ...(options.command ? { command: options.command } : {}),
    });

    // Handle user input -> hub
    const dataDisposable = terminal.onData((data) => {
      wsClient.send({
        type: "terminal-input",
        sessionId,
        data: toBase64(data),
      });
    });

    // Handle terminal resize -> hub
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      wsClient.send({
        type: "terminal-resize",
        sessionId,
        cols,
        rows,
      });
    });

    // Handle messages from hub -> terminal
    const unsubscribe = wsClient.onMessage((msg) => {
      if (msg.type === "terminal-data" && msg.sessionId === sessionId) {
        terminal.write(fromBase64(msg.data));
      } else if (msg.type === "terminal-closed" && msg.sessionId === sessionId) {
        terminal.write("\r\n[Session ended]\r\n");
      }
    });

    const cleanup = () => {
      dataDisposable.dispose();
      resizeDisposable.dispose();
      unsubscribe();
    };

    cleanupRef.current = cleanup;
    return cleanup;
  }

  function disconnect() {
    wsClient.send({ type: "close-terminal", sessionId });
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
  }

  return { sessionId, connect, disconnect };
}
