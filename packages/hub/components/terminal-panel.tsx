"use client";

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalPanelProps {
  onReady: (terminal: Terminal) => (() => void) | void;
}

function TerminalPanelInner({ onReady }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    let onReadyCleanup: (() => void) | void;

    const terminal = new Terminal({
      theme: {
        background: "#0d1117",
        foreground: "#e6edf3",
        cursor: "#58a6ff",
        selectionBackground: "rgba(88,166,255,0.3)",
      },
      fontFamily: "'Courier New', Courier, 'Lucida Console', monospace",
      fontSize: 14,
      cursorBlink: true,
      drawBoldTextInBrightColors: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);

    const safeFit = () => {
      try {
        const el = containerRef.current;
        if (el && el.clientWidth > 0 && el.clientHeight > 0) {
          fitAddon.fit();
        }
      } catch {
        // ignore fit errors
      }
    };

    requestAnimationFrame(() => {
      if (disposed) return;
      safeFit();
      onReadyCleanup = onReady(terminal);
    });

    const resizeObserver = new ResizeObserver(() => safeFit());
    resizeObserver.observe(containerRef.current);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      if (typeof onReadyCleanup === "function") onReadyCleanup();
      terminal.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", minHeight: "300px", background: "#0d1117" }}
    />
  );
}

export { TerminalPanelInner as TerminalPanel };
export type { TerminalPanelProps };
