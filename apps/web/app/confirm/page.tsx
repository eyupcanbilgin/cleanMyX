"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function ConfirmPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("mock-user-1");
  const [dryRun, setDryRun] = useState(true);
  const [job, setJob] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  const headers = useMemo(() => ({ "x-user-id": userId }), [userId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setUserId(params.get("userId") ?? "mock-user-1");
  }, []);

  async function createJob() {
    setJob("");
    setIsCreating(true);
    try {
      const filters: {
        types?: string[];
        beforeDate?: string;
        keyword?: string;
      } = {};
      const params = new URLSearchParams(window.location.search);
      const type = params.get("type");
      const beforeDate = params.get("beforeDate");
      const keyword = params.get("keyword");
      if (type) filters.types = [type];
      if (beforeDate) filters.beforeDate = beforeDate;
      if (keyword) filters.keyword = keyword;

      const body = {
        dryRun,
        ...(Object.keys(filters).length ? { filters } : {}),
      };
      const res = await fetch(`${apiBase}/v1/deletions`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setJob(JSON.stringify(json, null, 2));
        return;
      }
      router.push(`/jobs/${json.jobId}?userId=${encodeURIComponent(userId)}`);
    } finally {
      setIsCreating(false);
    }
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
        <button className="btn primary" onClick={createJob} disabled={isCreating}>
          {isCreating ? "Creating..." : "Create Deletion Job"}
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

