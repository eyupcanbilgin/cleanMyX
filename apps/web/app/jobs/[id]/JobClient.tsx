"use client";

import { useEffect, useMemo, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type JobProgress = {
  ok: boolean;
  job: {
    id: string;
    status: string;
    dryRun: boolean;
    createdAt: string;
    startedAt?: string | null;
    finishedAt?: string | null;
  };
  counts: Record<string, number>;
  items: Array<{
    id: string;
    postId: string;
    status: string;
    attempts: number;
    lastError?: string | null;
    text?: string;
    type?: string;
  }>;
};

const countLabels = [
  ["PENDING", "Pending"],
  ["RUNNING", "Processing"],
  ["COMPLETED", "Completed"],
  ["FAILED", "Failed"],
  ["DELETED", "Deleted"],
  ["DELETED_ALREADY", "Deleted already"],
  ["WAITING_RATE_LIMIT", "Waiting rate limit"],
  ["SKIPPED", "Dry-run skipped"],
] as const;

export function JobClient({ id }: { id: string }) {
  const [userId, setUserId] = useState("mock-user-1");
  const [data, setData] = useState<JobProgress | null>(null);
  const [error, setError] = useState("");
  const headers = useMemo(() => ({ "x-user-id": userId }), [userId]);
  const exportQuery = new URLSearchParams({ userId }).toString();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setUserId(params.get("userId") ?? "mock-user-1");
  }, []);

  async function refresh() {
    const res = await fetch(`${apiBase}/v1/deletions/${id}`, { headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      setError(JSON.stringify(json, null, 2));
      return;
    }
    setError("");
    setData(json);
  }

  useEffect(() => {
    void refresh();
    const intervalId = window.setInterval(() => {
      void refresh();
    }, 2000);
    return () => window.clearInterval(intervalId);
    // Poll the current job for the selected scaffold user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, userId]);

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
        <a className="btn" href={`${apiBase}/v1/deletions/${id}/export.json?${exportQuery}`}>
          Export JSON
        </a>
        <a className="btn" href={`${apiBase}/v1/deletions/${id}/export.csv?${exportQuery}`}>
          Export CSV
        </a>
      </div>

      {error ? (
        <pre className="card" style={{ marginTop: 16, overflow: "auto" }}>
          {error}
        </pre>
      ) : null}

      {data ? (
        <div style={{ marginTop: 16 }}>
          <p>
            <b>Status:</b> {data.job.status} {data.job.dryRun ? "(dry-run)" : ""}
          </p>
          <div className="statusGrid">
            {countLabels.map(([key, label]) => (
              <div className="statusBox" key={key}>
                <div className="muted">{label}</div>
                <strong>{data.counts[key] ?? 0}</strong>
              </div>
            ))}
          </div>
          <ul>
            {data.items.map((item) => (
              <li key={item.id} style={{ marginBottom: 10 }}>
                <div className="muted">
                  {item.status} • {item.type ?? "post"} • attempts {item.attempts}
                </div>
                <div>{item.text ?? item.postId}</div>
                {item.lastError ? <div className="muted">{item.lastError}</div> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 16 }}>
          Loading job progress...
        </p>
      )}
    </main>
  );
}
