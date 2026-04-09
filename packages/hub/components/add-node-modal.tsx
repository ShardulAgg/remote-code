"use client";

import { useState } from "react";

type OS = "linux" | "macos";

interface AddNodeModalProps {
  hubUrl: string;
  onClose: () => void;
}

export function AddNodeModal({ hubUrl, onClose }: AddNodeModalProps) {
  const [name, setName] = useState("");
  const [os, setOs] = useState<OS>("linux");
  const [token, setToken] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    if (!name.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", label: `node:${name.trim()}` }),
      });
      const data = await res.json();
      setToken(data.token);
    } catch (err) {
      console.error("Failed to generate token:", err);
    } finally {
      setGenerating(false);
    }
  }

  const wsUrl = hubUrl.replace(/^https?:\/\//, (m) => m.startsWith("https") ? "wss://" : "ws://");

  const installCommand = token
    ? os === "linux"
      ? `curl -sL https://raw.githubusercontent.com/ShardulAgg/remote-code/main/install.sh | bash -s -- --hub ${wsUrl} --token ${token} --name ${name.trim()}`
      : `curl -sL https://raw.githubusercontent.com/ShardulAgg/remote-code/main/install.sh | bash -s -- --hub ${wsUrl} --token ${token} --name ${name.trim()}`
    : "";

  function copyToClipboard() {
    navigator.clipboard.writeText(installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-surface-light border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-white">Add Node</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {!token ? (
            <>
              {/* Node name */}
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Node name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. staging-server, gpu-box, macbook"
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-accent/50"
                  onKeyDown={(e) => e.key === "Enter" && generate()}
                  autoFocus
                />
              </div>

              {/* OS selection */}
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Operating system</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setOs("linux")}
                    className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                      os === "linux"
                        ? "bg-accent/20 text-accent border-accent/40"
                        : "bg-surface border-border text-gray-400 hover:border-gray-500"
                    }`}
                  >
                    Linux
                  </button>
                  <button
                    onClick={() => setOs("macos")}
                    className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                      os === "macos"
                        ? "bg-accent/20 text-accent border-accent/40"
                        : "bg-surface border-border text-gray-400 hover:border-gray-500"
                    }`}
                  >
                    macOS
                  </button>
                </div>
              </div>

              {/* Generate button */}
              <button
                onClick={generate}
                disabled={!name.trim() || generating}
                className="w-full py-2.5 rounded-lg bg-accent text-white font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/80 transition-colors"
              >
                {generating ? "Generating..." : "Generate Install Command"}
              </button>
            </>
          ) : (
            <>
              {/* Success state */}
              <div className="flex items-center gap-2 text-success text-sm">
                <span className="w-2 h-2 rounded-full bg-success" />
                Token generated for <span className="font-medium text-white">{name}</span>
              </div>

              {/* Install command */}
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">
                  Run this on your {os === "linux" ? "Linux server" : "Mac"}:
                </label>
                <div className="relative">
                  <pre className="bg-surface border border-border rounded-lg p-3 text-xs text-gray-300 font-mono overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                    {installCommand}
                  </pre>
                  <button
                    onClick={copyToClipboard}
                    className="absolute top-2 right-2 px-2 py-1 text-[10px] rounded bg-surface-lighter border border-border text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              {/* Token warning */}
              <p className="text-[11px] text-gray-600">
                This token won't be shown again. The node will appear in your dashboard once the agent connects.
              </p>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setToken(null); setName(""); }}
                  className="flex-1 py-2 rounded-lg border border-border text-sm text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                >
                  Add Another
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/80 transition-colors"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
