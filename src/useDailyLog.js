import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** Današnji dnevni vnos (koraki/teža/spanec/počutje) trenutnega uporabnika. */
export function useDailyLog(userId) {
  const [log, setLog] = useState(undefined); // undefined = se nalaga, null = se ni vnesel
  const date = todayStr();

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase.from("daily_logs").select("*").eq("user_id", userId).eq("log_date", date).maybeSingle();
      if (!error) setLog(data);
    } catch {
      // omrežna napaka
    }
  }, [userId, date]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveLog = useCallback(
    async (fields) => {
      const payload = { user_id: userId, log_date: date, ...fields, updated_at: new Date().toISOString() };
      const { data, error } = await supabase.from("daily_logs").upsert(payload, { onConflict: "user_id,log_date" }).select().maybeSingle();
      if (!error) setLog(data);
      return { data, error };
    },
    [userId, date]
  );

  return { log, saveLog, refresh, date };
}
