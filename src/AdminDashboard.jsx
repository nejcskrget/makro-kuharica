import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Users } from "lucide-react";
import { supabase } from "./supabaseClient";

const COLOR = {
  ink: "#20241D",
  paper: "#F6F2E9",
  card: "#FFFFFF",
  forest: "#1B3324",
  sage: "#557A62",
  sageSoft: "#E8EEE7",
  amber: "#C98A2C",
  line: "#E1D9C7",
};

const MOOD_EMOJI = { 1: "😞", 2: "🙁", 3: "😐", 4: "🙂", 5: "😄" };

/**
 * Nadzorna plošča za ponudnika aplikacije (admin) — vidna samo, če je
 * `profile.is_admin === true` (glej supabase-schema-tracking.sql).
 * Prikaže vse stranke, njihove osnovne podatke, zadnje dnevne vnose in
 * zadnji izbrani dnevni jedilnik.
 */
export function AdminDashboard() {
  const [profiles, setProfiles] = useState(null);
  const [logsByUser, setLogsByUser] = useState({});
  const [plansByUser, setPlansByUser] = useState({});
  const [openUser, setOpenUser] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [{ data: profs, error: profErr }, { data: logs }, { data: plans }] = await Promise.all([
          supabase.from("profiles").select("*").order("updated_at", { ascending: false }),
          supabase
            .from("daily_logs")
            .select("*")
            .gte("log_date", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
            .order("log_date", { ascending: false }),
          supabase.from("day_plans").select("*").order("plan_date", { ascending: false }),
        ]);
        if (profErr) {
          setError(profErr.message);
          return;
        }
        setProfiles(profs || []);
        const byUser = {};
        (logs || []).forEach((l) => {
          if (!byUser[l.user_id]) byUser[l.user_id] = [];
          byUser[l.user_id].push(l);
        });
        setLogsByUser(byUser);
        const plansMap = {};
        (plans || []).forEach((p) => {
          if (!plansMap[p.user_id]) plansMap[p.user_id] = p; // najnovejsi (ker je razvrscen padajoce)
        });
        setPlansByUser(plansMap);
      } catch (e) {
        setError("Napaka pri nalaganju: " + e.message);
      }
    })();
  }, []);

  if (error) {
    return <p style={{ fontSize: 13, color: "#B5533C" }}>{error}</p>;
  }
  if (profiles === null) {
    return <p style={{ fontSize: 13, color: COLOR.sage }}>Nalagam ...</p>;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Users size={18} color={COLOR.amber} />
        <h2 style={{ fontSize: 15, color: COLOR.forest, fontFamily: "Georgia, serif" }}>
          Nadzorna plošča — {profiles.length} {profiles.length === 1 ? "stranka" : "strank"}
        </h2>
      </div>

      {profiles.length === 0 && <p style={{ fontSize: 13, color: COLOR.sage }}>Še ni registriranih strank.</p>}

      {profiles.map((p) => {
        const logs = (logsByUser[p.user_id] || []).slice(0, 7);
        const plan = plansByUser[p.user_id];
        const isOpen = openUser === p.user_id;
        return (
          <div key={p.user_id} style={{ borderRadius: 8, overflow: "hidden", background: COLOR.card, border: `1px solid ${COLOR.line}`, marginBottom: 10 }}>
            <button
              onClick={() => setOpenUser(isOpen ? null : p.user_id)}
              style={{ width: "100%", textAlign: "left", padding: "12px 16px", background: COLOR.forest, border: "none", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
            >
              <div>
                <div style={{ color: "#FFFFFF", fontFamily: "Georgia, serif", fontSize: 14 }}>
                  {p.ime || "—"} {p.priimek || ""}
                  {p.is_admin && <span style={{ color: COLOR.amber, fontSize: 10, marginLeft: 6 }}>(admin)</span>}
                </div>
                <div style={{ color: "#CFE0D2", fontSize: 11, marginTop: 2 }}>
                  {p.starost ? `${p.starost} let · ` : ""}
                  {p.visina_cm ? `${p.visina_cm} cm · ` : ""}
                  {p.teza_kg ? `${p.teza_kg} kg · ` : ""}
                  cilj {p.cilj_kalorij || "?"} kcal
                </div>
              </div>
              {isOpen ? <ChevronUp size={16} color="#CFE0D2" /> : <ChevronDown size={16} color="#CFE0D2" />}
            </button>

            {isOpen && (
              <div style={{ padding: 16 }}>
                {plan && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={sectionLabel}>Zadnji izbrani jedilnik ({plan.plan_date})</div>
                    <div style={{ fontSize: 12, color: COLOR.ink, lineHeight: 1.7 }}>
                      Zajtrk: <b>{plan.zajtrk_koda || "—"}</b> · Kosilo: <b>{plan.kosilo_koda || "—"}</b> · Večerja:{" "}
                      <b>{plan.vecerja_koda || "—"}</b>
                      {plan.malice && Array.isArray(plan.malice) && plan.malice.length > 0 && (
                        <>
                          <br />
                          Malice: {plan.malice.map((m) => m.name).join(", ")}
                        </>
                      )}
                    </div>
                  </div>
                )}
                {!plan && <p style={{ fontSize: 12, color: COLOR.sage, marginBottom: 14 }}>Stranka še ni izbrala jedilnika.</p>}

                <div style={sectionLabel}>Zadnjih {logs.length} dni</div>
                {logs.length === 0 ? (
                  <p style={{ fontSize: 12, color: COLOR.sage }}>Še ni dnevnih vnosov.</p>
                ) : (
                  <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ color: COLOR.sage, textAlign: "left" }}>
                        <th style={{ fontWeight: 400, paddingBottom: 4 }}>Dan</th>
                        <th style={{ fontWeight: 400, paddingBottom: 4 }}>Koraki</th>
                        <th style={{ fontWeight: 400, paddingBottom: 4 }}>Teža</th>
                        <th style={{ fontWeight: 400, paddingBottom: 4 }}>Spanec</th>
                        <th style={{ fontWeight: 400, paddingBottom: 4 }}>Počutje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((l) => (
                        <tr key={l.log_date} style={{ borderTop: `1px dashed ${COLOR.line}` }}>
                          <td style={{ padding: "4px 0", fontFamily: "'Courier New', monospace" }}>{l.log_date}</td>
                          <td style={{ padding: "4px 0" }}>{l.koraki ?? "—"}</td>
                          <td style={{ padding: "4px 0" }}>{l.teza_jutro ? `${l.teza_jutro} kg` : "—"}</td>
                          <td style={{ padding: "4px 0" }}>{l.ure_spanca ? `${l.ure_spanca} h` : "—"}</td>
                          <td style={{ padding: "4px 0" }}>{l.pocutje ? MOOD_EMOJI[l.pocutje] : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const sectionLabel = { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: COLOR.sage, marginBottom: 6 };
