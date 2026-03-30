"use client";

import { useState, useEffect } from "react";

export default function DebugAudioPage() {
  const [key, setKey] = useState("audio/sample.mp3");
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any | null>(null);

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
      if (!resp.ok) {
        let bodyText = null;
        try { bodyText = await resp.text(); } catch (e) { bodyText = null; }
        let bodyJson = null;
        try { bodyJson = bodyText ? JSON.parse(bodyText) : null; } catch (e) { bodyJson = null; }
        const headers: Record<string,string> = {};
        resp.headers.forEach((v,k) => { headers[k] = v; });

        const info = { audioFetch: { status: resp.status, statusText: resp.statusText, bodyText, bodyJson, headers } };
        setDebugInfo((prev: any) => ({ ...(prev || {}), ...info }));

        if (resp.status >= 500) {
          try {
            const dbgResp = await fetch(`/api/debug/r2?key=${segments}`);
            const dbgJson = await dbgResp.json();
            setDebugInfo((prev: any) => ({ ...(prev || {}), r2Check: dbgJson }));
          } catch (e) {
            // ignore
          }
        }

        throw new Error(`Failed to fetch audio: ${resp.status} ${resp.statusText}`);
      }

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
      console.info('R2 debug result:', json);
      setDebugInfo(json);
      if (!resp.ok || !json?.ok) {
        setError(json?.error ?? `R2 check failed: ${resp.status}`);
      } else {
        setError(null);
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

      <section style={{ marginTop: 20 }}>
        <h2>Debug info</h2>
        <div style={{ fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap', background: '#f6f7fb', padding: 12, borderRadius: 6 }}>
          {debugInfo ? JSON.stringify(debugInfo, null, 2) : 'No debug info yet. Click "Check R2" to fetch.'}
        </div>
      </section>
    </main>
  );
}
