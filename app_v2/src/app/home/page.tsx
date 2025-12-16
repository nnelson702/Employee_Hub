"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/shared/supabase/client";
import { createPost, fetchPosts, toggleReaction, PostRow } from "@/shared/db/posts";

export default function HomePage() {
  const [email, setEmail] = useState("");
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.href = "/auth/login";
        return;
      }
      setEmail(data.user.email || "");
      const rows = await fetchPosts();
      setPosts(rows);
    } catch (e: any) {
      setMsg(e.message || "Failed to load posts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  };

  const submit = async () => {
    if (!body.trim()) {
      setMsg("Post body is required.");
      return;
    }
    try {
      await createPost({ title: title.trim() || undefined, body: body.trim(), is_pinned: pinned });
      setTitle("");
      setBody("");
      setPinned(false);
      await load();
    } catch (e: any) {
      setMsg(e.message || "Failed to create post.");
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Home</h1>
          <div style={{ marginTop: 6 }}>Logged in as: {email}</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a href="/goals">Goals</a>
          <a href="/admin">Admin</a>
          <button onClick={logout} style={{ padding: 10 }}>
            Log out
          </button>
        </div>
      </div>

      <div style={{ marginTop: 18, padding: 16, border: "1px solid #ddd", borderRadius: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Post an update</div>

        <input
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 10 }}
        />

        <textarea
          placeholder="Write an update…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          style={{ width: "100%", padding: 10, marginBottom: 10 }}
        />

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          Pin this post
        </label>

        <button onClick={submit} style={{ marginTop: 10, padding: 10 }}>
          Post
        </button>

        {msg && <div style={{ marginTop: 10, color: "crimson" }}>{msg}</div>}
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Updates</h2>
          <button onClick={load} style={{ padding: 8 }}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {loading && <div style={{ marginTop: 12 }}>Loading…</div>}
        {!loading && posts.length === 0 && <div style={{ marginTop: 12 }}>No posts yet.</div>}

        {!loading &&
          posts.map((p) => (
            <div
              key={p.post_id}
              style={{
                marginTop: 12,
                padding: 14,
                border: "1px solid #eee",
                borderRadius: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 900 }}>
                  {p.is_pinned ? "📌 " : ""}
                  {p.title || "Update"}
                </div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>
                  {new Date(p.created_at).toLocaleString()}
                </div>
              </div>

              <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{p.body}</div>

              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <button onClick={() => toggleReaction(p.post_id, "like")} style={{ padding: "6px 10px" }}>
                  👍
                </button>
                <button onClick={() => toggleReaction(p.post_id, "fire")} style={{ padding: "6px 10px" }}>
                  🔥
                </button>
                <button onClick={() => toggleReaction(p.post_id, "check")} style={{ padding: "6px 10px" }}>
                  ✅
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
