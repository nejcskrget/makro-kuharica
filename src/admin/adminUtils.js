export const WEEK_DAYS = [
  { key: "pon", label: "Pon" },
  { key: "tor", label: "Tor" },
  { key: "sre", label: "Sre" },
  { key: "cet", label: "Čet" },
  { key: "pet", label: "Pet" },
  { key: "sob", label: "Sob" },
  { key: "ned", label: "Ned" },
];

const JS_DAY_TO_INDEX = [6, 0, 1, 2, 3, 4, 5];

export function currentWeekDates() {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - JS_DAY_TO_INDEX[now.getDay()]);

  return WEEK_DAYS.map((day, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return { ...day, date: date.toISOString().slice(0, 10) };
  });
}

export function daysSince(date) {
  if (!date) return Infinity;
  const [year, month, day] = date.split("-").map(Number);
  const loggedDay = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - loggedDay.getTime()) / 86400000));
}

export function clientName(profile) {
  return `${profile.ime || "Brez imena"} ${profile.priimek || ""}`.trim();
}

export function initials(profile) {
  return `${profile.ime?.[0] || ""}${profile.priimek?.[0] || ""}`.toUpperCase() || "?";
}

export function formatRelativeDate(date) {
  const difference = daysSince(date);
  if (difference === 0) return "Danes";
  if (difference === 1) return "Včeraj";
  if (difference < 7) return `Pred ${difference} dnevi`;
  return date ? new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "short" }).format(new Date(date)) : "Brez vnosa";
}
