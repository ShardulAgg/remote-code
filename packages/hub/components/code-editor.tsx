"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { wsClient } from "../lib/ws-client";
import { v4 as uuid } from "uuid";

interface CodeEditorProps {
  nodeId: string;
  filePath: string;
  onTitleChange?: (title: string) => void;
}

function sendFsRequest(
  nodeId: string,
  action: "read" | "write",
  path: string,
  data?: string
): Promise<any> {
  return new Promise((resolve, reject) => {
    const requestId = uuid();
    const unsub = wsClient.onMessage((msg) => {
      if (msg.type === "browser-fs-response" && (msg as any).requestId === requestId) {
        unsub();
        if ((msg as any).error) reject(new Error((msg as any).error));
        else resolve((msg as any).data);
      }
    });
    wsClient.send({
      type: "browser-fs-request",
      nodeId,
      requestId,
      action,
      path,
      ...(data !== undefined ? { data } : {}),
    });
    setTimeout(() => { unsub(); reject(new Error("Timeout")); }, 10000);
  });
}

function getLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rs: "rust", go: "go", rb: "ruby",
    json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
    md: "markdown", css: "css", html: "html", svg: "xml",
    sh: "bash", bash: "bash", zsh: "bash",
    sql: "sql", graphql: "graphql",
    dockerfile: "dockerfile", makefile: "makefile",
  };
  return map[ext] ?? "text";
}

export function CodeEditor({ nodeId, filePath, onTitleChange }: CodeEditorProps) {
  const [content, setContent] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filename = filePath.split("/").pop() ?? filePath;
  const language = getLanguage(filename);
  const isModified = content !== null && content !== originalContent;

  useEffect(() => {
    if (onTitleChange) {
      onTitleChange(isModified ? `${filename} *` : filename);
    }
  }, [isModified, filename, onTitleChange]);

  // Load file
  useEffect(() => {
    setLoading(true);
    setError(null);
    sendFsRequest(nodeId, "read", filePath)
      .then((data: any) => {
        // data is the base64 string directly, or { content: string }
        const b64 = typeof data === "string" ? data : data?.content ?? data;
        if (typeof b64 !== "string") throw new Error("Invalid response format");
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const text = new TextDecoder().decode(bytes);
        setContent(text);
        setOriginalContent(text);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [nodeId, filePath]);

  // Save file
  const save = useCallback(async () => {
    if (content === null) return;
    setSaving(true);
    try {
      // Encode UTF-8 → base64 (chunk to avoid stack overflow on large files)
      const bytes = new TextEncoder().encode(content);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      await sendFsRequest(nodeId, "write", filePath, base64);
      setOriginalContent(content);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [content, nodeId, filePath]);

  // Ctrl+S to save
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [save]);

  // Handle tab key in textarea
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newContent = content!.substring(0, start) + "  " + content!.substring(end);
      setContent(newContent);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-sm">
        Loading {filename}...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
        <p className="text-danger text-sm">Failed to load file</p>
        <p className="text-xs text-gray-600">{error}</p>
      </div>
    );
  }

  const lines = (content ?? "").split("\n");

  return (
    <div className="flex flex-col h-full bg-surface overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-surface-light shrink-0">
        <span className="text-[11px] text-gray-400 font-mono truncate flex-1" title={filePath}>
          {filePath}
        </span>
        <span className="text-[10px] text-gray-600">{language}</span>
        <span className="text-[10px] text-gray-600">{lines.length} lines</span>
        {isModified && <span className="text-[10px] text-warning">Modified</span>}
        {saved && <span className="text-[10px] text-success">Saved</span>}
        <button
          onClick={save}
          disabled={!isModified || saving}
          className="px-2 py-0.5 text-[11px] rounded bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Editor area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Line numbers */}
        <div className="py-2 px-2 text-right select-none bg-surface-light border-r border-border overflow-hidden shrink-0">
          {lines.map((_, i) => (
            <div key={i} className="text-[11px] text-gray-700 leading-[1.4rem] font-mono">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Text content */}
        <textarea
          ref={textareaRef}
          value={content ?? ""}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          className="flex-1 bg-surface text-gray-200 font-mono text-[12px] leading-[1.4rem] p-2 resize-none outline-none overflow-auto border-none"
          style={{ tabSize: 2 }}
        />
      </div>
    </div>
  );
}
