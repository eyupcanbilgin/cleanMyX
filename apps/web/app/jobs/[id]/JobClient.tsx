"use client";

import { useMemo, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export function JobClient({ id }: { id: string }) {
  const [userId, setUserId] = useState("mock-user-1");
  const [data, setData] = useState<string>("");
  const headers = useMemo(() => ({ "x-user-id": userId }), [userId]);

  async function refresh() {
    setData("");
    const res = await fetch(`${apiBase}/v1/deletions/${id}`, { headers });
    const json = await res.json();
    setData(JSON.stringify(json, null, 2));
  }

  return (
    <main className="card">
      <h2>Job Progress</h2>
      <div className="row">
        <label>
          User ID&nbsp;
          <input value={userId} onChange={(e) => setUserId(e.target.value)} />
        </label>
        <button className="btn primary" onClick={refresh}>
          Refresh
        </button>
        <a className="btn" href={`${apiBase}/v1/deletions/${id}/export.json`}>
          Export JSON
        </a>
        <a className="btn" href={`${apiBase}/v1/deletions/${id}/export.csv`}>
          Export CSV
        </a>
      </div>

      {data ? (
        <pre className="card" style={{ marginTop: 16, overflow: "auto" }}>
          {data}
        </pre>
      ) : (
        <p className="muted" style={{ marginTop: 16 }}>
          Henüz veri yok. Refresh’e bas.
        </p>
      )}
    </main>
  );
}

