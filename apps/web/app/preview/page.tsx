"use client";

import { useEffect, useState } from "react";
import type { PostType } from "@xcleaner/shared";
import { PostType as PostTypeEnum } from "@xcleaner/shared";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type PostRow = {
  id: string;
  text: string;
  createdAt: string;
  type: PostType;
};

export default function PreviewPage() {
  const [userId, setUserId] = useState("mock-user-1");
  const [type, setType] = useState<string>("");
  const [keyword, setKeyword] = useState("");
  const [beforeDate, setBeforeDate] = useState("");
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  async function load(nextUserId = userId) {
    setIsLoading(true);
    const url = new URL(`${apiBase}/v1/posts`);
    if (type) url.searchParams.set("type", type);
    if (keyword) url.searchParams.set("keyword", keyword);
    if (beforeDate) url.searchParams.set("beforeDate", new Date(beforeDate).toISOString());
    try {
      const res = await fetch(url.toString(), {
        headers: { "x-user-id": nextUserId },
      });
      const json = await res.json();
      setPosts(json.posts ?? []);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextUserId = params.get("userId") ?? "mock-user-1";
    setUserId(nextUserId);
    void load(nextUserId);
    // Load once on entry with the default mock user or the userId from the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmParams = new URLSearchParams({ userId });
  if (type) confirmParams.set("type", type);
  if (keyword) confirmParams.set("keyword", keyword);
  if (beforeDate) confirmParams.set("beforeDate", new Date(beforeDate).toISOString());

  return (
    <main className="card">
      <h2>Preview</h2>
      <div className="row">
        <label>
          User ID&nbsp;
          <input value={userId} onChange={(e) => setUserId(e.target.value)} />
        </label>
        <label>
          Type&nbsp;
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">all</option>
            <option value={PostTypeEnum.NORMAL}>normal</option>
            <option value={PostTypeEnum.REPLY}>reply</option>
            <option value={PostTypeEnum.QUOTE}>quote</option>
            <option value={PostTypeEnum.REPOST}>repost</option>
          </select>
        </label>
        <label>
          Keyword&nbsp;
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </label>
        <label>
          Before&nbsp;
          <input type="date" value={beforeDate} onChange={(e) => setBeforeDate(e.target.value)} />
        </label>
        <button className="btn primary" onClick={() => void load()} disabled={isLoading}>
          {isLoading ? "Loading..." : "Load"}
        </button>
        <a className="btn" href={`/confirm?${confirmParams.toString()}`}>
          Continue
        </a>
      </div>

      <div style={{ marginTop: 16 }}>
        <p className="muted">Gösterilen ilk 200 post.</p>
        <ul>
          {posts.slice(0, 200).map((p) => (
            <li key={p.id} style={{ marginBottom: 10 }}>
              <div className="muted">
                {p.type} • {new Date(p.createdAt).toLocaleString()}
              </div>
              <div>{p.text}</div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

