"use client";

import { useEffect, useRef } from "react";
import { FileEntry } from "../hooks/use-files";

interface FileActionsProps {
  entry: FileEntry;
  position: { x: number; y: number };
  onClose: () => void;
  onTerminalHere: (entry: FileEntry) => void;
  onClaudeHere: (entry: FileEntry) => void;
  onDownload: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
}

export function FileActions({
  entry,
  position,
  onClose,
  onTerminalHere,
  onClaudeHere,
  onDownload,
  onDelete,
}: FileActionsProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Adjust position to keep menu within viewport
  const menuStyle: React.CSSProperties = {
    position: "fixed",
    top: position.y + 4,
    left: position.x,
    zIndex: 50,
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      {/* Menu */}
      <div
        ref={menuRef}
        style={menuStyle}
        className="bg-surface-light border border-border rounded-lg shadow-lg py-1 min-w-[200px]"
      >
        {entry.isDirectory && (
          <>
            <button
              onClick={() => { onTerminalHere(entry); onClose(); }}
              className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-surface-lighter hover:text-white transition-colors"
            >
              Open terminal here
            </button>
            <button
              onClick={() => { onClaudeHere(entry); onClose(); }}
              className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-surface-lighter hover:text-white transition-colors"
            >
              Start Claude Code here
            </button>
            <div className="border-t border-border my-1" />
          </>
        )}

        {!entry.isDirectory && (
          <button
            onClick={() => { onDownload(entry); onClose(); }}
            className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-surface-lighter hover:text-white transition-colors"
          >
            Download
          </button>
        )}

        <button
          onClick={() => { onDelete(entry); onClose(); }}
          className="w-full text-left px-4 py-2 text-sm text-danger hover:bg-surface-lighter transition-colors"
        >
          Delete
        </button>
      </div>
    </>
  );
}
