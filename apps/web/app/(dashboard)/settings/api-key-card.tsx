"use client";

import { useState } from "react";
import { Key, Copy, RotateCcw } from "lucide-react";

interface ApiKeyCardProps {
  keyPrefix: string | null;
}

export default function ApiKeyCard({ keyPrefix }: ApiKeyCardProps) {
  const [rotating, setRotating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const maskedDisplay = keyPrefix ? `${keyPrefix}••••••••` : "No API key set";

  async function handleRotate() {
    setRotating(true);
    setError(null);
    try {
      const res = await fetch("/api/proxy/api/v1/admin/companies/me/rotate-api-key", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to rotate API key.");
      const data = await res.json();
      setNewKey(data.api_key);
      setConfirmOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to rotate key.");
    } finally {
      setRotating(false);
    }
  }

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 max-w-lg space-y-4">
      <div className="flex items-center gap-2">
        <Key className="h-4 w-4 text-zinc-500" />
        <h2 className="text-base font-medium text-zinc-800">API Access</h2>
      </div>

      <div>
        <p className="text-xs text-zinc-500 mb-1">Current API Key</p>
        <p className="font-mono text-sm text-zinc-800 bg-zinc-50 rounded-lg px-3 py-2 border border-zinc-200">
          {maskedDisplay}
        </p>
        <p className="text-xs text-zinc-400 mt-1">
          Use this key in the <code className="text-xs">X-API-Key</code> header to authenticate API requests.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        onClick={() => setConfirmOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Rotate API Key
      </button>

      {/* Confirm rotation dialog */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-base font-semibold text-zinc-900">Rotate API key?</h3>
            <p className="text-sm text-zinc-500">
              The existing key will stop working immediately. Any integrations using it must be
              updated. This cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={rotating}
                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-700 border border-zinc-200 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRotate}
                disabled={rotating}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                {rotating ? "Rotating…" : "Rotate Key"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* One-time reveal dialog */}
      {newKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-base font-semibold text-zinc-900">New API Key</h3>
            <p className="text-sm text-zinc-500">
              Copy this key now — it will not be shown again.
            </p>
            <div className="flex items-center gap-2 bg-zinc-50 rounded-lg px-3 py-2 border border-zinc-200">
              <code className="flex-1 text-xs font-mono text-zinc-800 break-all">{newKey}</code>
              <button
                onClick={() => handleCopy(newKey)}
                className="shrink-0 text-zinc-400 hover:text-zinc-700"
                title="Copy"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            {copied && <p className="text-xs text-emerald-600">Copied to clipboard!</p>}
            <div className="flex justify-end">
              <button
                onClick={() => setNewKey(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-zinc-800 hover:bg-zinc-900"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
