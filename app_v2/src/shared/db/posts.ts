import { supabase } from "@/shared/supabase/client";

export type PostRow = {
  post_id: string;
  title: string | null;
  body: string;
  is_pinned: boolean;
  expires_at: string | null;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
};

export async function fetchPosts(): Promise<PostRow[]> {
  const { data, error } = await supabase
    .from("posts")
    .select("post_id,title,body,is_pinned,expires_at,is_hidden,created_at,updated_at")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as PostRow[];
}

export async function createPost(input: {
  title?: string;
  body: string;
  is_pinned?: boolean;
  expires_at?: string | null;
}) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("Not signed in.");

  const { error } = await supabase.from("posts").insert({
    author_user_id: user.user.id,
    title: input.title ?? null,
    body: input.body,
    is_pinned: !!input.is_pinned,
    expires_at: input.expires_at ?? null,
    is_hidden: false,
  });

  if (error) throw error;
}

export async function toggleReaction(post_id: string, reaction: string) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("Not signed in.");

  const { data: existing, error: e1 } = await supabase
    .from("post_reactions")
    .select("post_id")
    .eq("post_id", post_id)
    .eq("user_id", user.user.id)
    .eq("reaction", reaction)
    .maybeSingle();

  if (e1) throw e1;

  if (existing) {
    const { error } = await supabase
      .from("post_reactions")
      .delete()
      .eq("post_id", post_id)
      .eq("user_id", user.user.id)
      .eq("reaction", reaction);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("post_reactions").insert({
      post_id,
      user_id: user.user.id,
      reaction,
    });
    if (error) throw error;
  }
}
