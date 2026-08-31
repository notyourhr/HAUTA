import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Hauta keeps a single active session at a time, same as the original
// artifact version — this row id is just a fixed key for that one row.
const SESSION_ID = "hauta_session";

export async function loadSession() {
  try {
    const { data, error } = await supabase
      .from("hauta_sessions")
      .select("data")
      .eq("id", SESSION_ID)
      .maybeSingle();
    if (error || !data) return null;
    return data.data;
  } catch (e) {
    return null;
  }
}

export async function saveSession(session) {
  try {
    const { error } = await supabase
      .from("hauta_sessions")
      .upsert({ id: SESSION_ID, data: session, updated_at: new Date().toISOString() });
    return !error;
  } catch (e) {
    return false;
  }
}
