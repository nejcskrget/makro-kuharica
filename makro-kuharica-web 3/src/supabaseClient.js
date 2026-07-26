import { createClient } from "@supabase/supabase-js";

/**
 * Vrednosti prideta iz `.env` datoteke (glej `.env.example`) — dobiš ju v
 * svojem Supabase projektu pod: Project Settings → API.
 * NIKOLI ne vpisuj teh vrednosti neposredno v kodo, ki jo deliš javno.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    "[Makro kuharica] Manjkata VITE_SUPABASE_URL in/ali VITE_SUPABASE_ANON_KEY. " +
      "Ustvari datoteko .env (glej .env.example) s podatki iz svojega Supabase projekta."
  );
}

export const supabase = createClient(supabaseUrl || "https://placeholder.supabase.co", supabaseAnonKey || "placeholder-key");
