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
  danger: "#B5533C",
};

const MOOD_EMOJI = { 1: "😞", 2: "🙁", 3: "😐", 4: "🙂", 5: "😄" };
const WEEK_DAYS = [
  { key: "pon", label: "Pon" },
  { key: "tor", label: "Tor" },
  { key: "sre", label: "Sre" },
  { key: "cet", label: "Čet" },
  { key: "pet", label: "Pet" },
  { key: "sob", label: "Sob" },
  { key: "ned", label: "Ned" },
];
const JS_DAY_TO_INDEX = [6, 0, 1, 2, 3, 4, 5];

/** Datumi (YYYY-MM-DD) za vseh 7 dni TRENUTNEGA tedna (ponedeljek—nedelja). */
function currentWeekDates() {
  const now = new Date();
  const todayIdx = JS_DAY_TO_INDEX[now.getDay()];
  const monday = new Date(now);
  monday.setDate(now.getDate() - todayIdx);
  return WEEK_DAYS.map((d, i) => {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    return { key: d.key, label: d.label, date: dt.toISOString().slice(0, 10) };
  });
}

/** Preprost SVG "sparkline" graf trenda (teža ali počutje) čez zadnjih N dni. */
function TrendChart({ points, color, unit }) {
  if (points.length < 2) return <p style={{ fontSize: 11, color: COLOR.sage }}>Premalo podatkov za graf (vsaj 2 vnosa).</p>;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 280;
  const h = 60;
  const stepX = w / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = h - ((p.value - min) / range) * (h - 10) - 5;
    return `${x},${y}`;
  });
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{ display: "block" }}>
        <polyline points={coords.join(" ")} fill="none" stroke={color} strokeWidth="2" />
        {points.map((p, i) => (
          <circle key={i} cx={i * stepX} cy={h - ((p.value - min) / range) * (h - 10) - 5} r="2.5" fill={color} />
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: COLOR.sage, marginTop: 2 }}>
        <span>
          {points[0].date.slice(5)} · {points[0].value}
          {unit}
        </span>
        <span>
          {points[points.length - 1].date.slice(5)} · {points[points.length - 1].value}
          {unit}
        </span>
      </div>
    </div>
  );
}

/**
 * Nadzorna plošča za ponudnika aplikacije (admin) — vidna samo, če je
 * `profile.is_admin === true`. Prikaže vse stranke: profil, mesečni trend
 * teže/počutja z grafom, in tedenski (Pon–Ned) izbrani jedilnik.
 */
export function AdminDashboard() {
  const [profiles, setProfiles] = useState(null);
  const [logsByUser, setLogsByUser] = useState({});
  const [weekPlansByUser, setWeekPlansByUser] = useState({});
  const [openUser, setOpenUser] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const weekDates = currentWeekDates();
        const monthAgo = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const [{ data: profs, error: profErr }, { data: logs }, { data: plans }] = await Promise.all([
          supabase.from("profiles").select("*").order("updated_at", { ascending: false }),
          supabase.from("daily_logs").select("*").gte("log_date", monthAgo).order("log_date", { ascending: true }),
          supabase
            .from("day_plans")
            .select("*")
            .gte("plan_date", weekDates[0].date)
            .lte("plan_date", weekDates[6].date),
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

        const weekByUser = {};
        (plans || []).forEach((p) => {
          const dayInfo = weekDates.find((d) => d.date === p.plan_date);
          if (!dayInfo) return;
          if (!weekByUser[p.user_id]) weekByUser[p.user_id] = {};
          weekByUser[p.user_id][dayInfo.key] = p;
        });
        setWeekPlansByUser(weekByUser);
      } catch (e) {
        setError("Napaka pri nalaganju: " + e.message);
      }
    })();
  }, []);

  if (error) return <p style={{ fontSize: 13, color: COLOR.danger }}>{error}</p>;
  if (profiles === null) return <p style={{ fontSize: 13, color: COLOR.sage }}>Nalagam ...</p>;

  const weekDates = currentWeekDates();

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
        const monthLogs = (logsByUser[p.user_id] || []).slice(-30);
        const weekPlan = weekPlansByUser[p.user_id] || {};
        const isOpen = openUser === p.user_id;

        const weightPoints = monthLogs.filter((l) => l.teza_jutro != null).map((l) => ({ date: l.log_date, value: l.teza_jutro }));
        const moodPoints = monthLogs.filter((l) => l.pocutje != null).map((l) => ({ date: l.log_date, value: l.pocutje }));

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
                {/* Tedenski jedilnik Pon-Ned */}
                <div style={sectionLabel}>Tedenski jedilnik (ta teden)</div>
                <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${COLOR.line}`, marginBottom: 18 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: COLOR.paper }}>
                    {weekDates.map((d) => (
                      <div key={d.key} style={{ textAlign: "center", padding: "6px 2px", borderRight: `1px solid ${COLOR.line}` }}>
                        <div style={{ fontSize: 9, color: COLOR.sage }}>{d.label}</div>
                        <div style={{ fontSize: 9, color: COLOR.sage }}>{d.date.slice(5)}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                    {weekDates.map((d) => {
                      const dp = weekPlan[d.key];
                      return (
                        <div key={d.key} style={{ padding: "6px 3px", borderRight: `1px solid ${COLOR.line}`, borderTop: `1px solid ${COLOR.line}`, fontSize: 9, lineHeight: 1.5, color: COLOR.ink, minHeight: 54 }}>
                          {dp ? (
                            <>
                              {dp.zajtrk_koda && <div>Z: {dp.zajtrk_koda}</div>}
                              {dp.kosilo_koda && <div>K: {dp.kosilo_koda}</div>}
                              {dp.vecerja_koda && <div>V: {dp.vecerja_koda}</div>}
                            </>
                          ) : (
                            <span style={{ color: COLOR.line }}>—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Mesecni trend teze */}
                <div style={sectionLabel}>Trend teže (zadnjih {weightPoints.length} vnosov, do 30 dni)</div>
                <div style={{ marginBottom: 16 }}>
                  <TrendChart points={weightPoints} color={COLOR.forest} unit=" kg" />
                </div>

                {/* Mesecni trend pocutja */}
                <div style={sectionLabel}>Trend počutja (zadnjih {moodPoints.length} vnosov, do 30 dni)</div>
                <div style={{ marginBottom: 16 }}>
                  <TrendChart points={moodPoints} color={COLOR.amber} unit="/5" />
                </div>

                {/* Tabela zadnjih vnosov */}
                <div style={sectionLabel}>Vsi vnosi zadnjega meseca ({monthLogs.length})</div>
                {monthLogs.length === 0 ? (
                  <p style={{ fontSize: 12, color: COLOR.sage }}>Še ni dnevnih vnosov.</p>
                ) : (
                  <div style={{ maxHeight: 220, overflowY: "auto" }}>
                    <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ color: COLOR.sage, textAlign: "left", position: "sticky", top: 0, background: COLOR.card }}>
                          <th style={{ fontWeight: 400, paddingBottom: 4 }}>Dan</th>
                          <th style={{ fontWeight: 400, paddingBottom: 4 }}>Koraki</th>
                          <th style={{ fontWeight: 400, paddingBottom: 4 }}>Teža</th>
                          <th style={{ fontWeight: 400, paddingBottom: 4 }}>Spanec</th>
                          <th style={{ fontWeight: 400, paddingBottom: 4 }}>Počutje</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...monthLogs].reverse().map((l) => (
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
                  </div>
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
