import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BookOpen,
  CalendarCheck,
  ChefHat,
  ClipboardCheck,
  LayoutDashboard,
  Search,
  SlidersHorizontal,
  Sparkles,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { AdminClientCard } from "./AdminClientCard";
import { AdminMealPlanner } from "./AdminMealPlanner";
import { AdminRecipeManager } from "./AdminRecipeManager";
import { hasPlanContent } from "./adminData";
import { clientName, currentWeekDates, daysSince } from "./adminUtils";
import "./admin-dashboard.css";
import "./admin-editor.css";

export function AdminDashboard() {
  const [profiles, setProfiles] = useState(null);
  const [logsByUser, setLogsByUser] = useState({});
  const [weekPlansByUser, setWeekPlansByUser] = useState({});
  const [openUser, setOpenUser] = useState(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView] = useState("overview");
  const [error, setError] = useState("");
  const weekDates = useMemo(currentWeekDates, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        const monthAgo = new Date(Date.now() - 32 * 86400000).toISOString().slice(0, 10);
        const [{ data: loadedProfiles, error: profileError }, { data: logs }, { data: plans }] = await Promise.all([
          supabase.from("profiles").select("*").order("updated_at", { ascending: false }),
          supabase.from("daily_logs").select("*").gte("log_date", monthAgo).order("log_date", { ascending: true }),
          supabase.from("day_plans").select("*").gte("plan_date", weekDates[0].date).lte("plan_date", weekDates[6].date),
        ]);
        if (profileError) throw profileError;
        if (cancelled) return;

        setProfiles(loadedProfiles || []);
        setLogsByUser(groupByUser(logs || []));
        setWeekPlansByUser(groupPlansByUser(plans || [], weekDates));
      } catch (loadError) {
        if (!cancelled) setError(`Nadzorne plošče ni bilo mogoče naložiti: ${loadError.message}`);
      }
    }

    loadDashboard();
    return () => { cancelled = true; };
  }, [weekDates]);

  const clients = useMemo(() => (profiles || []).filter((profile) => !profile.is_admin), [profiles]);
  const filteredClients = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("sl");
    return clients.filter((profile) => {
      const latestLog = logsByUser[profile.user_id]?.at(-1);
      const active = daysSince(latestLog?.log_date) <= 7;
      const matchesQuery = !normalizedQuery || clientName(profile).toLocaleLowerCase("sl").includes(normalizedQuery);
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? active : !active);
      return matchesQuery && matchesStatus;
    });
  }, [clients, logsByUser, query, statusFilter]);

  if (error) return <div className="admin-state admin-state--error">{error}</div>;
  if (profiles === null) return <AdminLoading />;

  const activeClients = clients.filter((profile) => daysSince(logsByUser[profile.user_id]?.at(-1)?.log_date) <= 7).length;
  const plannedDays = Object.values(weekPlansByUser).reduce(
    (sum, plan) => sum + Object.values(plan).filter(hasPlanContent).length,
    0
  );
  const adherence = clients.length ? Math.round((plannedDays / (clients.length * 7)) * 100) : 0;
  const needsAttention = Math.max(clients.length - activeClients, 0);
  const dailyActivity = weekDates.map((day) =>
    Object.values(logsByUser).flat().filter((log) => log.log_date === day.date).length
  );

  return (
    <div className="admin-dashboard">
      <header className="admin-hero">
        <div className="admin-hero__brand">
          <span className="admin-hero__icon"><ChefHat size={27} /></span>
          <div>
            <span>MAKRO KUHARICA · ADMIN</span>
            <h2>Inštruktorjev pregled</h2>
            <p>Stranke, jedilniki in napredek na enem mestu.</p>
          </div>
        </div>
        <div className="admin-hero__promise">
          <Sparkles size={18} />
          <div><strong>Pametno spremljanje</strong><small>Od podatkov do jasne naslednje poteze</small></div>
        </div>
      </header>

      <nav className="admin-subnav" aria-label="Administratorska navigacija">
        <button className={view === "overview" ? "is-active" : ""} onClick={() => setView("overview")}><LayoutDashboard size={16} /> Pregled</button>
        <button className={view === "recipes" ? "is-active" : ""} onClick={() => setView("recipes")}><BookOpen size={16} /> Recepti</button>
        <button className={view === "plans" ? "is-active" : ""} onClick={() => setView("plans")}><CalendarCheck size={16} /> Jedilniki</button>
        <button className={view === "clients" ? "is-active" : ""} onClick={() => setView("clients")}><Users size={16} /> Stranke</button>
      </nav>

      {view === "overview" ? (
        <>
          <section className="admin-stat-grid" aria-label="Ključni podatki">
            <StatCard icon={Users} value={clients.length} label="Strank" note="Vseh aktivnih profilov" />
            <StatCard icon={UserRoundCheck} value={activeClients} label="Aktivnih ta teden" note={`${clients.length ? Math.round((activeClients / clients.length) * 100) : 0} % vseh strank`} positive />
            <StatCard icon={ClipboardCheck} value={`${adherence} %`} label="Upoštevanje jedilnikov" note={`${plannedDays} načrtovanih dni`} />
            <StatCard icon={Activity} value={needsAttention} label="Za pregled" note="Brez vnosa več kot 7 dni" warning={needsAttention > 0} />
          </section>

          <section className="admin-overview-grid" id="admin-activity">
            <div className="admin-panel admin-activity-panel">
              <div className="admin-panel__heading">
                <div><span>AKTIVNOST V APLIKACIJI</span><h3>Dnevni vnosi ta teden</h3></div>
                <span className="admin-live-badge"><i /> V živo</span>
              </div>
              <div className="admin-bars">
                {dailyActivity.map((value, index) => {
                  const max = Math.max(...dailyActivity, 1);
                  return (
                    <div className="admin-bar" key={weekDates[index].key}>
                      <span className="admin-bar__value">{value}</span>
                      <div><i style={{ height: `${Math.max((value / max) * 100, value ? 14 : 3)}%` }} /></div>
                      <small>{weekDates[index].label}</small>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="admin-panel admin-review-panel">
              <div className="admin-panel__heading">
                <div><span>HITER PREGLED</span><h3>Stanje strank</h3></div>
              </div>
              <div className="admin-ring-row">
                <div className="admin-ring" style={{ "--progress": `${clients.length ? (activeClients / clients.length) * 360 : 0}deg` }}>
                  <span><strong>{activeClients}</strong><small>aktivnih</small></span>
                </div>
                <div className="admin-review-copy">
                  <strong>{needsAttention ? `${needsAttention} ${needsAttention === 1 ? "stranka potrebuje" : "stranke potrebujejo"} pregled` : "Vse stranke so aktivne"}</strong>
                  <p>Status temelji na dnevnih vnosih v zadnjih sedmih dneh.</p>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {view === "recipes" ? <AdminRecipeManager /> : null}
      {view === "plans" ? <AdminMealPlanner clients={clients} /> : null}

      {view === "clients" ? (
        <section className="admin-clients-section" id="admin-clients">
          <div className="admin-clients-header">
            <div><span>STRANKE / UPORABNIKI</span><h3>Pregled napredka</h3><p>Odpri stranko za tedenski jedilnik, trende in dnevne vnose.</p></div>
            <div className="admin-client-tools">
              <label className="admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Poišči stranko ..." /></label>
              <label className="admin-filter"><SlidersHorizontal size={15} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Vsi statusi</option><option value="active">Aktivne</option><option value="quiet">Za pregled</option></select></label>
            </div>
          </div>

          <div className="admin-client-list">
            {filteredClients.length ? filteredClients.map((profile) => (
              <AdminClientCard
                key={profile.user_id}
                profile={profile}
                logs={logsByUser[profile.user_id] || []}
                weekPlan={weekPlansByUser[profile.user_id] || {}}
                weekDates={weekDates}
                isOpen={openUser === profile.user_id}
                onToggle={() => setOpenUser(openUser === profile.user_id ? null : profile.user_id)}
              />
            )) : <div className="admin-empty-list">Ni strank, ki bi ustrezale izbranemu filtru.</div>}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StatCard({ icon: Icon, value, label, note, positive, warning }) {
  return (
    <div className={`admin-stat-card ${warning ? "is-warning" : ""}`}>
      <span className="admin-stat-card__icon"><Icon size={20} /></span>
      <div><strong>{value}</strong><span>{label}</span><small className={positive ? "is-positive" : ""}>{note}</small></div>
    </div>
  );
}

function AdminLoading() {
  return <div className="admin-loading">{[1, 2, 3, 4].map((item) => <i key={item} />)}</div>;
}

function groupByUser(items) {
  return items.reduce((grouped, item) => {
    if (!grouped[item.user_id]) grouped[item.user_id] = [];
    grouped[item.user_id].push(item);
    return grouped;
  }, {});
}

function groupPlansByUser(plans, weekDates) {
  return plans.reduce((grouped, plan) => {
    const day = weekDates.find((candidate) => candidate.date === plan.plan_date);
    if (!day) return grouped;
    if (!grouped[plan.user_id]) grouped[plan.user_id] = {};
    grouped[plan.user_id][day.key] = plan;
    return grouped;
  }, {});
}
