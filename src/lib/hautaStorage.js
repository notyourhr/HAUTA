import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/* ---------------- Auth (owner only) ---------------- */

export async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  return !error;
}

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
  });
  return data.subscription;
}

/* ---------------- Owner-side session CRUD ----------------
   Row-level security restricts all of this to the logged-in
   owner's own rows — no manual filtering needed here, Postgres
   enforces it. */

export async function listMySessions() {
  try {
    const { data, error } = await supabase
      .from("hauta_sessions")
      .select("id, data, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) return [];
    return data;
  } catch (e) {
    return [];
  }
}

export async function createSession(sessionData) {
  try {
    const user = await getCurrentUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from("hauta_sessions")
      .insert({ owner_id: user.id, data: sessionData })
      .select("id")
      .single();
    if (error) return null;
    return data.id;
  } catch (e) {
    return null;
  }
}

export async function loadSessionById(id) {
  try {
    const { data, error } = await supabase
      .from("hauta_sessions")
      .select("data")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return data.data;
  } catch (e) {
    return null;
  }
}

export async function saveSessionById(id, sessionData) {
  try {
    const { error } = await supabase
      .from("hauta_sessions")
      .update({ data: sessionData, updated_at: new Date().toISOString() })
      .eq("id", id);
    return !error;
  } catch (e) {
    return false;
  }
}

export async function deleteSessionById(id) {
  try {
    const { error } = await supabase.from("hauta_sessions").delete().eq("id", id);
    return !error;
  } catch (e) {
    return false;
  }
}

/* ---------------- Code-based access (no login) ----------------
   Participants and interviewers never authenticate. These go
   through security-definer database functions instead of the
   table directly, so a code only ever unlocks exactly one
   participant's or interviewer's own entry — nothing else. */

export async function getSessionByCode(code) {
  try {
    const { data, error } = await supabase.rpc("hauta_get_session_by_code", { p_code: code });
    if (error) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export async function submitRankingByCode(code, email, ranking) {
  try {
    const { data, error } = await supabase.rpc("hauta_submit_ranking", {
      p_code: code,
      p_email: email,
      p_ranking: ranking,
    });
    if (error) return false;
    return !!data;
  } catch (e) {
    return false;
  }
}

export async function submitEvaluationByCode(code, ratings, total) {
  try {
    const { data, error } = await supabase.rpc("hauta_submit_evaluation", {
      p_code: code,
      p_ratings: ratings,
      p_total: total,
    });
    if (error) return false;
    return !!data;
  } catch (e) {
    return false;
  }
}
