import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Save,
  UserRound,
} from "lucide-react";
import { fetchAdminRecipes, fetchWeekPlan, hasPlanContent, saveWeekPlan } from "./adminData";
import { clientName, currentWeekDates } from "./adminUtils";

const SLOTS = [
  { key: "zajtrk_koda", label: "Zajtrk", type: "zajtrk-vecerja" },
  { key: "kosilo_koda", label: "Kosilo", type: "kosilo" },
  { key: "vecerja_koda", label: "Večerja", type: "zajtrk-vecerja" },
];

export function AdminMealPlanner({ clients }) {
  const [selectedClientId, setSelectedClientId] = useState(clients[0]?.user_id || "");
  const [weekOffset, setWeekOffset] = useState(0);
  const [recipes, setRecipes] = useState([]);
  const [plan, setPlan] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const weekDates = useMemo(() => shiftedWeekDates(weekOffset), [weekOffset]);
  const selectedClient = clients.find((client) => client.user_id === selectedClientId);

  useEffect(() => {
    let cancelled = false;
    fetchAdminRecipes()
      .then((loadedRecipes) => {
        if (!cancelled) {
          setRecipes(loadedRecipes.filter((recipe) => recipe.status === "published"));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedClientId) {
      setPlan({});
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setMessage(null);
    fetchWeekPlan(selectedClientId, weekDates[0].date, weekDates[6].date)
      .then((rows) => {
        if (!cancelled) setPlan(Object.fromEntries(rows.map((row) => [row.plan_date, row])));
      })
      .catch((error) => {
        if (!cancelled) setMessage({ type: "error", text: error.message });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedClientId, weekDates]);

  function updateDay(date, field, value) {
    setPlan((current) => ({
      ...current,
      [date]: { ...current[date], plan_date: date, [field]: value },
    }));
    setMessage(null);
  }

  function copyPreviousDay(index) {
    if (index === 0) return;
    const previous = plan[weekDates[index - 1].date];
    if (!previous) return;
    const date = weekDates[index].date;
    setPlan((current) => ({
      ...current,
      [date]: {
        ...current[date],
        plan_date: date,
        zajtrk_koda: previous.zajtrk_koda || "",
        kosilo_koda: previous.kosilo_koda || "",
        vecerja_koda: previous.vecerja_koda || "",
        malice: previous.malice || [],
      },
    }));
  }

  async function handleSave() {
    if (!selectedClientId) return;
    setSaving(true);
    setMessage(null);
    try {
      const days = weekDates.map((day) => ({ ...plan[day.date], date: day.date }));
      await saveWeekPlan(selectedClientId, days);
      const refreshed = await fetchWeekPlan(selectedClientId, weekDates[0].date, weekDates[6].date);
      setPlan(Object.fromEntries(refreshed.map((row) => [row.plan_date, row])));
      setMessage({ type: "success", text: `Jedilnik za ${clientName(selectedClient)} je shranjen.` });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  const filledDays = weekDates.filter((day) => hasPlanContent(plan[day.date] || {})).length;

  return (
    <div className="admin-workspace">
      <header className="admin-workspace__header">
        <div>
          <span>JEDILNIKI / TEDENSKI NAČRT</span>
          <h3>Načrtovalnik za stranke</h3>
          <p>Izberi stranko, sestavi sedem dni in objavi načrt neposredno v njen račun.</p>
        </div>
        <button className="admin-primary-button" disabled={!selectedClientId || saving} onClick={handleSave}><Save size={16} /> {saving ? "Shranjujem ..." : "Shrani jedilnik"}</button>
      </header>

      <section className="admin-planner-toolbar">
        <label className="admin-planner-client">
          <span><UserRound size={15} /> Stranka</span>
          <select value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)}>
            {!clients.length ? <option value="">Ni strank</option> : null}
            {clients.map((client) => <option key={client.user_id} value={client.user_id}>{clientName(client)} · {client.cilj_kalorij || "—"} kcal</option>)}
          </select>
        </label>
        <div className="admin-week-switcher">
          <button aria-label="Prejšnji teden" onClick={() => setWeekOffset((offset) => offset - 1)}><ChevronLeft size={17} /></button>
          <div><CalendarDays size={16} /><span>{formatWeekRange(weekDates)}</span><small>{weekOffset === 0 ? "Trenutni teden" : weekOffset > 0 ? "Prihodnji teden" : "Pretekli teden"}</small></div>
          <button aria-label="Naslednji teden" onClick={() => setWeekOffset((offset) => offset + 1)}><ChevronRight size={17} /></button>
        </div>
        <div className="admin-plan-progress">
          <span><strong>{filledDays}/7</strong> dni</span>
          <div><i style={{ width: `${(filledDays / 7) * 100}%` }} /></div>
        </div>
      </section>

      {loading ? <div className="admin-planner-loading">Nalagam jedilnik ...</div> : (
        <div className="admin-planner-grid">
          {weekDates.map((day, index) => {
            const dayPlan = plan[day.date] || {};
            const filled = hasPlanContent(dayPlan);
            return (
              <article className={`admin-plan-day ${filled ? "is-filled" : ""}`} key={day.date}>
                <header>
                  <div><span>{day.label}</span><strong>{formatDayDate(day.date)}</strong></div>
                  {index > 0 ? <button title="Kopiraj prejšnji dan" aria-label={`Kopiraj jedilnik v ${day.label}`} onClick={() => copyPreviousDay(index)}><Copy size={13} /></button> : null}
                </header>
                {SLOTS.map((slot) => (
                  <label key={slot.key}>
                    <span>{slot.label}</span>
                    <select value={dayPlan[slot.key] || ""} onChange={(event) => updateDay(day.date, slot.key, event.target.value)}>
                      <option value="">— Dodaj —</option>
                      {recipes.filter((recipe) => recipe.meal_type === slot.type).map((recipe) => (
                        <option key={recipe.id || recipe.code} value={recipe.code}>{recipe.code} · {recipe.title}</option>
                      ))}
                    </select>
                  </label>
                ))}
                <footer>{filled ? <><Check size={13} /> Dan je načrtovan</> : "Čaka na izbor obrokov"}</footer>
              </article>
            );
          })}
        </div>
      )}

      <aside className="admin-planner-summary">
        <div><span>Cilj stranke</span><strong>{selectedClient?.cilj_kalorij || "—"} kcal / dan</strong></div>
        <p>Stranka bo dodeljene recepte videla v svojem dnevnem jedilniku. Spremembe začnejo veljati po shranjevanju.</p>
        {message ? <div className={`admin-form-message is-${message.type}`}>{message.type === "success" ? <Check size={15} /> : null}{message.text}</div> : null}
      </aside>
    </div>
  );
}

function shiftedWeekDates(offset) {
  return currentWeekDates().map((day) => {
    const shifted = new Date(`${day.date}T12:00:00`);
    shifted.setDate(shifted.getDate() + offset * 7);
    return { ...day, date: shifted.toISOString().slice(0, 10) };
  });
}

function formatWeekRange(days) {
  const formatter = new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "short" });
  return `${formatter.format(new Date(days[0].date))}–${formatter.format(new Date(days[6].date))}`;
}

function formatDayDate(date) {
  return new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "short" }).format(new Date(date));
}
