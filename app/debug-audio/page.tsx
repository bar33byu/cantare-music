"use client";

export default function DebugAudioPage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Debug Audio Loader</h1>

      <div style={{ padding: 12, backgroundColor: "#fef3c7", borderRadius: 8, borderLeft: "4px solid #f59e0b", marginBottom: 24 }}>
        <strong>⚠️ Audio Proxy Removed</strong>
        <p style={{ margin: "8px 0 0 0" }}>
          The /api/audio/ proxy endpoint has been removed. Audio is now served directly from R2&apos;s CDN.
        </p>
        <p style={{ margin: "8px 0 0 0" }}>
          To test audio loading, use the R2 debug endpoint or test with actual R2 CDN URLs configured via R2_PUBLIC_URL.
        </p>
      </div>

      <button 
        onClick={() => window.location.href = '/'}
        style={{ padding: "8px 12px" }}
      >
        Back to Home
      </button>
    </main>
  );
}
