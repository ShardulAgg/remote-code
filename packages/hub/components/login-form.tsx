"use client";

import { useState, FormEvent } from "react";
import { wsClient } from "../lib/ws-client";

interface LoginFormProps {
  onAuth: (token: string) => void;
}

export function LoginForm({ onAuth }: LoginFormProps) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const trimmed = token.trim();
    if (!trimmed) {
      setError("Token is required.");
      return;
    }

    setLoading(true);

    // Connect and wait for auth-result
    const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      const unsubscribe = wsClient.onMessage((msg) => {
        if (msg.type === "auth-result") {
          unsubscribe();
          resolve({ success: msg.success, error: msg.error });
        }
      });

      wsClient.connect(trimmed);

      // Timeout after 8 seconds
      setTimeout(() => {
        unsubscribe();
        resolve({ success: false, error: "Connection timed out." });
      }, 8000);
    });

    setLoading(false);

    if (result.success) {
      localStorage.setItem("rc-token", trimmed);
      onAuth(trimmed);
    } else {
      setError(result.error ?? "Authentication failed.");
      wsClient.disconnect();
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-surface-light border border-border rounded-lg p-8 w-full max-w-sm">
        <h2 className="text-xl font-semibold text-white mb-6">Sign In</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="token" className="text-sm text-gray-400">
              Auth Token
            </label>
            <input
              id="token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your token here"
              autoComplete="current-password"
              className="bg-surface-lighter border border-border rounded px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-accent text-sm"
            />
          </div>

          {error && (
            <p className="text-danger text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-accent text-white py-2 rounded font-medium text-sm hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Connecting…" : "Connect"}
          </button>
        </form>
      </div>
    </div>
  );
}
