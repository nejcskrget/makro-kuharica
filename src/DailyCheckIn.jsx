import React, { useState, useEffect } from "react";
import { Footprints, Moon, Scale, Smile } from "lucide-react";

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

const MOOD_OPTIONS = [
  { value: 1, emoji: "😞", label: "Slabo" },
  { value: 2, emoji: "🙁", label: "Nič posebnega" },
  { value: 3, emoji: "😐", label: "V redu" },
  { value: 4, emoji: "🙂", label: "Dobro" },
  { value: 5, emoji: "😄", label: "Odlično" },
];

/** Dnevni vnos: jutranja teža in ure spanca zjutraj, koraki in počutje zvečer. */
export function DailyCheckIn({ log, onSave }) {
  const [koraki, setKoraki] = useState("");
  const [teza, setTeza] = useState("");
  const [spanje, setSpanje] = useState("");
  const [pocutje, setPocutje] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (log) {
      setKoraki(log.koraki ?? "");
      setTeza(log.teza_jutro ?? "");
      setSpanje(log.ure_spanca ?? "");
      setPocutje(log.pocutje ?? null);
    }
  }, [log]);

  async function save(fields) {
    setSaved(false);
    await onSave(fields);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div style={{ borderRadius: 8, overflow: "hidden", background: COLOR.card, border: `1px solid ${COLOR.line}`, marginBottom: 20 }}>
      <div style={{ background: COLOR.forest, padding: "12px 16px" }}>
        <span style={{ color: "#FFFFFF", fontFamily: "Georgia, serif", fontSize: 14 }}>Dnevni vnos</span>
        <span style={{ color: "#CFE0D2", fontSize: 11, marginLeft: 8 }}>{saved ? "✓ Shranjeno" : ""}</span>
      </div>
      <div style={{ padding: 16 }}>
        <p style={{ fontSize: 11, color: COLOR.sage, marginBottom: 12 }}>
          Zjutraj vnesi težo in spanec, zvečer korake in počutje — vse skupaj vidi tudi tvoj ponudnik prehranskega
          načrta.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div>
            <label style={fieldLabel}>
              <Scale size={12} /> Teža zjutraj (kg)
            </label>
            <input
              type="number"
              step="0.1"
              value={teza}
              onChange={(e) => setTeza(e.target.value)}
              onBlur={() => teza !== "" && save({ teza_jutro: Number(teza) })}
              style={fieldInput}
              placeholder="npr. 72.4"
            />
          </div>
          <div>
            <label style={fieldLabel}>
              <Moon size={12} /> Ure spanca
            </label>
            <input
              type="number"
              step="0.5"
              value={spanje}
              onChange={(e) => setSpanje(e.target.value)}
              onBlur={() => spanje !== "" && save({ ure_spanca: Number(spanje) })}
              style={fieldInput}
              placeholder="npr. 7.5"
            />
          </div>
        </div>

        <label style={fieldLabel}>
          <Footprints size={12} /> Koraki danes
        </label>
        <input
          type="number"
          value={koraki}
          onChange={(e) => setKoraki(e.target.value)}
          onBlur={() => koraki !== "" && save({ koraki: Number(koraki) })}
          style={{ ...fieldInput, marginBottom: 12 }}
          placeholder="npr. 8400"
        />

        <label style={fieldLabel}>
          <Smile size={12} /> Počutje / energija ob koncu dneva
        </label>
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          {MOOD_OPTIONS.map((m) => (
            <button
              key={m.value}
              onClick={() => {
                setPocutje(m.value);
                save({ pocutje: m.value });
              }}
              title={m.label}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: 8,
                border: `1px solid ${pocutje === m.value ? COLOR.forest : COLOR.line}`,
                background: pocutje === m.value ? COLOR.sageSoft : COLOR.paper,
                fontSize: 18,
                cursor: "pointer",
              }}
            >
              {m.emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const fieldLabel = { display: "flex", alignItems: "center", gap: 4, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: COLOR.sage, marginBottom: 4 };
const fieldInput = { width: "100%", boxSizing: "border-box", padding: "9px 10px", borderRadius: 6, border: `1px solid ${COLOR.line}`, background: COLOR.paper, color: COLOR.ink, fontFamily: "'Courier New', monospace", fontSize: 13 };
