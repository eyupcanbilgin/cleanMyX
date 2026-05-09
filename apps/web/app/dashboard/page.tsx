"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function DashboardPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("mock-user-1");
  const [scanResult, setScanResult] = useState<string>("");
  const [isScanning, setIsScanning] = useState(false);

  const headers = useMemo(() => ({ "x-user-id": userId }), [userId]);

  async function scan() {
    setScanResult("");
    setIsScanning(true);
    try {
      const res = await fetch(`${apiBase}/v1/scan`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setScanResult(JSON.stringify(json, null, 2));
        return;
      }
      router.push(`/preview?userId=${encodeURIComponent(userId)}`);
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <main className="card">
      <h2>Dashboard</h2>
      <p className="muted">
        Scaffold auth: şimdilik kullanıcıyı `x-user-id` header ile simüle ediyoruz.
      </p>
      <div className="row">
        <label>
          User ID&nbsp;
          <input value={userId} onChange={(e) => setUserId(e.target.value)} />
        </label>
        <button className="btn primary" onClick={scan} disabled={isScanning}>
          {isScanning ? "Scanning..." : "Scan Posts"}
        </button>
        <a className="btn" href={`/preview?userId=${encodeURIComponent(userId)}`}>
          Preview
        </a>
      </div>

      {scanResult ? (
        <pre className="card" style={{ marginTop: 16, overflow: "auto" }}>
          {scanResult}
        </pre>
      ) : null}
    </main>
  );
}

