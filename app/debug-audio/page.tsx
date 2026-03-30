"use client";

import { useState, useEffect } from "react";

export default function DebugAudioPage() {
  const [key, setKey] = useState("audio/sample.mp3");
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  async function load() {
    setError(null);
    setLoading(true);
    setUrl(null);

    try {
      const segments = key
        .split("/")
        .filter(Boolean)
        .map((s) => encodeURIComponent(s))
        .join("/");

      const resp = await fetch(`/api/audio/${segments}`);
      if (!resp.ok) throw new Error(`Failed to fetch audio: ${resp.status}`);

      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function checkR2() {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (key) params.set('key', key);
      const resp = await fetch(`/api/debug/r2?${params.toString()}`);
      const json = await resp.json();
      if (!resp.ok) {
        setError(json?.error ?? `R2 check failed: ${resp.status}`);
      } else {
        // Show debug result in console and on page
        console.info('R2 debug result:', json);
        if (!json.ok) setError(json.error ?? 'R2 reported failure');
        else setError(null);
        alert(JSON.stringify(json, null, 2));
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Debug Audio Loader</h1>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", marginBottom: 6 }}>Audio key (path inside R2 or `audio/...`):</label>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          style={{ width: "60%", padding: 8, fontSize: 14 }}
        />
        <button onClick={load} style={{ marginLeft: 8, padding: "8px 12px" }} disabled={loading}>
          {loading ? "Loading…" : "Load"}
        </button>
        <button onClick={checkR2} style={{ marginLeft: 8, padding: "8px 12px" }} disabled={loading}>
          Check R2
        </button>
      </div>

      {error && (
        <div style={{ color: "#b00020", marginBottom: 12 }}>Error: {error}</div>
      )}

      {url ? (
        <div>
          <p>Loaded audio — playing below. This ignores any segment metadata.</p>
          <audio src={url} controls style={{ width: "100%" }} />
          <p style={{ fontSize: 12, color: "#666" }}>Direct fetched URL: <a href={url} target="_blank" rel="noreferrer">open blob</a></p>
        </div>
      ) : (
        <p style={{ color: "#666" }}>No audio loaded yet.</p>
      )}
    </main>
  );
}
