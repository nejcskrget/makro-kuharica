import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";

/** Profil trenutno prijavljenega uporabnika — nalaganje, shranjevanje. */
export function useProfile(userId) {
  const [profile, setProfile] = useState(undefined); // undefined = se nalaga, null = se ne obstaja
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
      if (!error) setProfile(data);
    } catch {
      // omrežna napaka — profil ostane neznan, uporabnik lahko poskusi znova
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveProfile = useCallback(
    async (fields) => {
      const payload = { user_id: userId, ...fields, updated_at: new Date().toISOString() };
      const { data, error } = await supabase.from("profiles").upsert(payload).select().maybeSingle();
      if (!error) setProfile(data);
      return { data, error };
    },
    [userId]
  );

  return { profile, loading, saveProfile, refresh };
}

/** Ali profil ima izpolnjena osnovna polja (za odločitev, ali prikazati obrazec)? */
export function isProfileComplete(profile) {
  if (!profile) return false;
  return Boolean(profile.ime && profile.priimek && profile.starost && profile.visina_cm && profile.teza_kg && profile.cilj_kalorij);
}
