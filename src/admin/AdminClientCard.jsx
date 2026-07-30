import React from "react";
import { ChevronDown, ChevronUp, CircleGauge, Footprints, Moon, Scale } from "lucide-react";
import { AdminTrendChart } from "./AdminTrendChart";
import { hasPlanContent } from "./adminData";
import { clientName, daysSince, formatRelativeDate, initials } from "./adminUtils";

const MOOD_EMOJI = { 1: "😞", 2: "🙁", 3: "😐", 4: "🙂", 5: "😄" };

export function AdminClientCard({ profile, logs, weekPlan, weekDates, isOpen, onToggle }) {
  const recentLogs = logs.slice(-30);
  const latestLog = recentLogs.at(-1);
  const plannedDays = Object.values(weekPlan).filter(hasPlanContent).length;
  const adherence = Math.round((plannedDays / 7) * 100);
  const isActive = daysSince(latestLog?.log_date) <= 7;
  const weightPoints = recentLogs
    .filter((log) => log.teza_jutro != null)
    .map((log) => ({ date: log.log_date, value: log.teza_jutro }));
  const moodPoints = recentLogs
    .filter((log) => log.pocutje != null)
    .map((log) => ({ date: log.log_date, value: log.pocutje }));

  return (
    <article className={`admin-client ${isOpen ? "is-open" : ""}`}>
      <button className="admin-client__summary" onClick={onToggle} aria-expanded={isOpen}>
        <span className="admin-avatar">{initials(profile)}</span>
        <span className="admin-client__identity">
          <strong>{clientName(profile)}</strong>
          <small>{profile.is_admin ? "Administrator" : `${profile.starost || "—"} let · ${profile.cilj_kalorij || "—"} kcal cilj`}</small>
        </span>
        <span className={`admin-status ${isActive ? "is-active" : "is-quiet"}`}>
          <i />
          {isActive ? "Aktivna" : "Potrebuje pozornost"}
        </span>
        <span className="admin-client__metric">
          <small>Zadnja aktivnost</small>
          <strong>{formatRelativeDate(latestLog?.log_date)}</strong>
        </span>
        <span className="admin-client__metric">
          <small>Jedilnik</small>
          <strong>{adherence} %</strong>
        </span>
        <span className="admin-client__chevron">
          {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </span>
      </button>

      {isOpen && (
        <div className="admin-client__details">
          <div className="admin-profile-strip">
            <ProfileFact icon={Scale} label="Začetna teža" value={profile.teza_kg ? `${profile.teza_kg} kg` : "—"} />
            <ProfileFact icon={Footprints} label="Zadnji koraki" value={latestLog?.koraki?.toLocaleString("sl-SI") || "—"} />
            <ProfileFact icon={Moon} label="Zadnji spanec" value={latestLog?.ure_spanca ? `${latestLog.ure_spanca} h` : "—"} />
            <ProfileFact icon={CircleGauge} label="Počutje" value={latestLog?.pocutje ? `${MOOD_EMOJI[latestLog.pocutje]} ${latestLog.pocutje}/5` : "—"} />
          </div>

          <section className="admin-detail-section">
            <div className="admin-section-heading">
              <div>
                <span>TEDENSKI JEDILNIK</span>
                <h4>Načrt trenutnega tedna</h4>
              </div>
              <span className="admin-adherence">{plannedDays}/7 dni načrtovanih</span>
            </div>
            <div className="admin-week-grid">
              {weekDates.map((day) => {
                const plan = weekPlan[day.key];
                const hasPlan = hasPlanContent(plan || {});
                return (
                  <div className={hasPlan ? "has-plan" : ""} key={day.key}>
                    <small>{day.label} · {day.date.slice(8)}</small>
                    {hasPlan ? (
                      <>
                        <span>Z {plan.zajtrk_koda || "—"}</span>
                        <span>K {plan.kosilo_koda || "—"}</span>
                        <span>V {plan.vecerja_koda || "—"}</span>
                      </>
                    ) : (
                      <em>Ni vnosa</em>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="admin-chart-grid">
            <section className="admin-detail-section">
              <div className="admin-section-heading">
                <div><span>NAPREDEK</span><h4>Trend teže</h4></div>
                <b>{weightPoints.at(-1)?.value ? `${weightPoints.at(-1).value} kg` : "—"}</b>
              </div>
              <AdminTrendChart points={weightPoints} color="#174c3a" unit=" kg" />
            </section>
            <section className="admin-detail-section">
              <div className="admin-section-heading">
                <div><span>DOBRO POČUTJE</span><h4>Trend energije</h4></div>
                <b>{moodPoints.at(-1)?.value ? `${moodPoints.at(-1).value}/5` : "—"}</b>
              </div>
              <AdminTrendChart points={moodPoints} color="#c98a2c" unit="/5" />
            </section>
          </div>

          <section className="admin-detail-section">
            <div className="admin-section-heading">
              <div><span>DNEVNI VNOSI</span><h4>Zadnja aktivnost</h4></div>
              <small>{recentLogs.length} vnosov v zadnjih 30 dneh</small>
            </div>
            {recentLogs.length === 0 ? (
              <div className="admin-empty-chart">Stranka še nima dnevnih vnosov.</div>
            ) : (
              <div className="admin-log-table-wrap">
                <table className="admin-log-table">
                  <thead><tr><th>Datum</th><th>Koraki</th><th>Teža</th><th>Spanec</th><th>Počutje</th></tr></thead>
                  <tbody>
                    {[...recentLogs].reverse().slice(0, 8).map((log) => (
                      <tr key={log.log_date}>
                        <td>{log.log_date}</td>
                        <td>{log.koraki?.toLocaleString("sl-SI") || "—"}</td>
                        <td>{log.teza_jutro ? `${log.teza_jutro} kg` : "—"}</td>
                        <td>{log.ure_spanca ? `${log.ure_spanca} h` : "—"}</td>
                        <td>{log.pocutje ? MOOD_EMOJI[log.pocutje] : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </article>
  );
}

function ProfileFact({ icon: Icon, label, value }) {
  return (
    <div className="admin-profile-fact">
      <span><Icon size={17} /></span>
      <div><small>{label}</small><strong>{value}</strong></div>
    </div>
  );
}
