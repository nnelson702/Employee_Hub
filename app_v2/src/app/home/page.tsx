"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import { supabase } from "@/shared/supabase/client";
import { createPost, fetchPosts, PostRow } from "@/shared/db/posts";

export default function HomePage() {
  const [email, setEmail] = useState<string>("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email || "");
    })();
  }, []);

  const load = async () => {
    setLoadingPosts(true);
    setMsg(null);
    try {
      const rows = await fetchPosts();
      setPosts(rows);
    } catch (e: any) {
      setMsg(e.message || "Failed to load posts.");
    } finally {
      setLoadingPosts(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onPost = async () => {
    setMsg(null);
    if (!body.trim()) {
      setMsg("Post body is required.");
      return;
    }
    try {
      await createPost({
        title: title.trim() || null,
        body: body.trim(),
        pinned,
      });
      setTitle("");
      setBody("");
      setPinned(false);
      setMsg("Posted.");
      await load();
    } catch (e: any) {
      setMsg(e.message || "Post failed.");
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.replace("/auth/login");
  };

  return (
    <RequireAuth>
      <div style={{ padding: 24, maxWidth: 1000 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ margin: 0 }}>Home</h1>
            <div style={{ marginTop: 6, opacity: 0.8 }}>Logged in as: {email || "…"}</div>
          </div>

          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <Link href="/goals">Goals</Link>
            <Link href="/admin">Admin</Link>
            <button onClick={logout} style={{ padding: "8px 12px" }}>
              Log out
            </button>
          </div>
        </div>

        <div style={{ marginTop: 18, padding: 16, border: "1px solid #ddd", borderRadius: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Post an update</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            <input
              placeholder="Title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ width: "100%", padding: 10 }}
            />
            <textarea
              placeholder="Write an update…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={{ width: "100%", padding: 10, minHeight: 140 }}
            />
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              Pin this post
            </label>

            <button onClick={onPost} style={{ padding: "10px 14px" }}>
              Post
            </button>

            {msg && <div style={{ color: msg === "Posted." ? "green" : "crimson" }}>{msg}</div>}
          </div>
        </div>

        <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Updates</h2>
          <button onClick={load} style={{ padding: "8px 12px" }} disabled={loadingPosts}>
            {loadingPosts ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          {posts.length === 0 ? (
            <div style={{ opacity: 0.8 }}>No posts yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {posts.map((p) => (
                <div key={p.post_id} style={{ padding: 14, border: "1px solid #eee", borderRadius: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontWeight: 800 }}>{p.title || "(No title)"}</div>
                    {p.pinned && <div style={{ fontSize: 12, opacity: 0.8 }}>Pinned</div>}
                  </div>
                  <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{p.body}</div>
                  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
                    {new Date(p.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </RequireAuth>
  );
}
