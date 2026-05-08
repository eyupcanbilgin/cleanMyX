"use client";

import { useMemo, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function ConfirmPage() {
  const [userId, setUserId] = useState("mock-user-1");
  const [dryRun, setDryRun] = useState(true);
  const [job, setJob] = useState<string>("");
  const headers = useMemo(() => ({ "x-user-id": userId }), [userId]);

  async function createJob() {
    setJob("");
    const res = await fetch(`${apiBase}/v1/deletions`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ dryRun }),
    });
    const json = await res.json();
    setJob(JSON.stringify(json, null, 2));
  }

  return (
    <main className="card">
      <h2>Confirm</h2>
      <p className="muted">
        Bu işlem geri alınamaz. Varsayılan olarak <b>dry-run</b> açıktır. Gerçek
        silme için dry-run’ı kapatıp tekrar onaylaman gerekir.
      </p>

      <div className="row">
        <label>
          User ID&nbsp;
          <input value={userId} onChange={(e) => setUserId(e.target.value)} />
        </label>
        <label>
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
          />
          &nbsp;Dry-run (default)
        </label>
        <button className="btn primary" onClick={createJob}>
          Create Deletion Job
        </button>
      </div>

      {job ? (
        <pre className="card" style={{ marginTop: 16, overflow: "auto" }}>
          {job}
        </pre>
      ) : null}
    </main>
  );
}

