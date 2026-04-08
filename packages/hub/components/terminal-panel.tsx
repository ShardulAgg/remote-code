"use client";

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalPanelProps {
  onReady: (terminal: Terminal) => (() => void) | void;
  onImagePaste?: (base64: string, mimeType: string) => void;
  terminalRef?: React.MutableRefObject<Terminal | null>;
}

function TerminalPanelInner({ onReady, onImagePaste, terminalRef }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    let onReadyCleanup: (() => void) | void;

    const isMobile = window.matchMedia("(max-width: 640px)").matches;

    const terminal = new Terminal({
      theme: {
        background: "#0d1117",
        foreground: "#e6edf3",
        cursor: "#58a6ff",
        selectionBackground: "rgba(88,166,255,0.3)",
      },
      fontFamily: "'Courier New', Courier, 'Lucida Console', monospace",
      fontSize: isMobile ? 12 : 14,
      cursorBlink: true,
      drawBoldTextInBrightColors: true,
      scrollback: 5000,
      fastScrollModifier: "none",
      smoothScrollDuration: isMobile ? 100 : 0,
      overviewRulerWidth: 0,
    });

    if (terminalRef) terminalRef.current = terminal;

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);

    // On mobile, tap to focus the terminal's hidden textarea reliably
    if (isMobile) {
      const handleTap = () => {
        terminal.focus();
        // Find xterm's hidden textarea and force focus
        const textarea = containerRef.current?.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement | null;
        if (textarea) {
          textarea.setAttribute("inputmode", "text");
          textarea.setAttribute("autocapitalize", "none");
          textarea.setAttribute("autocorrect", "off");
          textarea.focus({ preventScroll: true });
        }
      };
      containerRef.current.addEventListener("touchend", handleTap);
      // Store for cleanup
      (containerRef.current as any).__handleTap = handleTap;
    }

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

    // Intercept paste events in capture phase — detect images before xterm handles paste
    const handlePaste = (e: ClipboardEvent) => {
      if (!onImagePaste || !e.clipboardData) return;
      // Check if the paste target is within our terminal container
      if (!containerRef.current?.contains(e.target as Node)) return;
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          e.stopPropagation();
          const file = item.getAsFile();
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const commaIdx = dataUrl.indexOf(",");
            const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
            onImagePaste(base64, item.type);
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    };

    document.addEventListener("paste", handlePaste, true);

    requestAnimationFrame(() => {
      if (disposed) return;
      safeFit();
      onReadyCleanup = onReady(terminal);
    });

    const resizeObserver = new ResizeObserver(() => safeFit());
    resizeObserver.observe(containerRef.current);

    return () => {
      disposed = true;
      if (terminalRef) terminalRef.current = null;
      document.removeEventListener("paste", handlePaste, true);
      const el = containerRef.current;
      if (el && (el as any).__handleTap) {
        el.removeEventListener("touchend", (el as any).__handleTap);
      }
      resizeObserver.disconnect();
      if (typeof onReadyCleanup === "function") onReadyCleanup();
      terminal.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, width: "100%", height: "100%", minWidth: 0, minHeight: 0, background: "#0d1117" }}
    />
  );
}

export { TerminalPanelInner as TerminalPanel };
export type { TerminalPanelProps };
