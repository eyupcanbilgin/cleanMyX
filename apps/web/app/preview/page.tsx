"use client";

import { useMemo, useState } from "react";
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

  const headers = useMemo(() => ({ "x-user-id": userId }), [userId]);

  async function load() {
    const url = new URL(`${apiBase}/v1/posts`);
    if (type) url.searchParams.set("type", type);
    if (keyword) url.searchParams.set("keyword", keyword);
    if (beforeDate) url.searchParams.set("beforeDate", new Date(beforeDate).toISOString());
    const res = await fetch(url.toString(), { headers });
    const json = await res.json();
    setPosts(json.posts ?? []);
  }

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
        <button className="btn primary" onClick={load}>
          Load
        </button>
        <a className="btn" href={`/confirm?userId=${encodeURIComponent(userId)}`}>
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

