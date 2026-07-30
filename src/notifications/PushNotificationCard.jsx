import React from "react";
import { Bell, BellOff } from "lucide-react";
import { usePushNotifications } from "./usePushNotifications";

const COLOR = {
  ink: "#20241D",
  card: "#FFFFFF",
  forest: "#1B3324",
  sage: "#557A62",
  sageSoft: "#E8EEE7",
  amber: "#C98A2C",
  line: "#E1D9C7",
  danger: "#B5533C",
};

const STATUS_COPY = {
  enabled: "Dnevni opomnik je vključen.",
  disabled: "Vključi opomnik, da te vsako jutro spomni na tehtanje.",
  denied: "Obvestila so blokirana v nastavitvah naprave ali brskalnika.",
  unsupported: "Ta brskalnik ne podpira PWA potisnih obvestil.",
  loading: "Preverjam nastavitev obvestil …",
};

export function PushNotificationCard({ userId }) {
  const { status, busy, error, enable, disable } = usePushNotifications(userId);
  const enabled = status === "enabled";
  const canEnable = status === "disabled" && Boolean(userId);

  return (
    <section
      style={{
        background: COLOR.card,
        border: `1px solid ${COLOR.line}`,
        borderRadius: 8,
        marginBottom: 16,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: 16 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
            color: enabled ? COLOR.forest : COLOR.amber,
            background: enabled ? COLOR.sageSoft : "#F8EDDD",
          }}
        >
          {enabled ? <Bell size={18} /> : <BellOff size={18} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, color: COLOR.forest, fontFamily: "Georgia, serif", fontSize: 15 }}>
            Jutranji opomnik ob 06:30
          </h2>
          <p style={{ margin: "5px 0 0", color: COLOR.sage, fontSize: 11, lineHeight: 1.5 }}>
            {STATUS_COPY[status]}
          </p>
          <p style={{ margin: "4px 0 0", color: COLOR.ink, fontSize: 12, lineHeight: 1.5 }}>
            »Ali si se danes že stehtal/a?«
          </p>
          {error && (
            <p role="alert" style={{ margin: "7px 0 0", color: COLOR.danger, fontSize: 11, lineHeight: 1.45 }}>
              {error}
            </p>
          )}
        </div>

        {(canEnable || enabled) && (
          <button
            type="button"
            onClick={enabled ? disable : enable}
            disabled={busy}
            style={{
              border: 0,
              borderRadius: 6,
              padding: "8px 11px",
              color: enabled ? COLOR.forest : "#FFFFFF",
              background: enabled ? COLOR.sageSoft : COLOR.forest,
              fontSize: 11,
              cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.65 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {busy ? "Trenutek …" : enabled ? "Izklopi" : "Vključi"}
          </button>
        )}
      </div>
    </section>
  );
}
