import React, { useState } from "react";
import { User } from "lucide-react";

const COLOR = {
  ink: "#20241D",
  paper: "#F6F2E9",
  card: "#FFFFFF",
  forest: "#1B3324",
  sage: "#557A62",
  amber: "#C98A2C",
  line: "#E1D9C7",
  danger: "#B5533C",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${COLOR.line}`,
  background: COLOR.paper,
  color: COLOR.ink,
  fontFamily: "Georgia, serif",
  fontSize: 14,
  marginBottom: 10,
};

const labelStyle = { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: COLOR.sage, display: "block", marginBottom: 4 };

/**
 * Enkraten obrazec ob prvi prijavi — osnovni podatki stranke, ki jih vidi
 * tudi ponudnik aplikacije (trener/nutricionist) v svoji nadzorni plošči.
 */
export function ProfileOnboarding({ onSave, saving }) {
  const [ime, setIme] = useState("");
  const [priimek, setPriimek] = useState("");
  const [starost, setStarost] = useState("");
  const [visina, setVisina] = useState("");
  const [teza, setTeza] = useState("");
  const [ciljKalorij, setCiljKalorij] = useState("1600");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!ime || !priimek || !starost || !visina || !teza || !ciljKalorij) {
      setError("Prosim, izpolni vsa polja.");
      return;
    }
    setError("");
    const { error: saveError } = await onSave({
      ime,
      priimek,
      starost: Number(starost),
      visina_cm: Number(visina),
      teza_kg: Number(teza),
      cilj_kalorij: Number(ciljKalorij),
    });
    if (saveError) setError("Napaka pri shranjevanju: " + saveError.message);
  }

  return (
    <div style={{ minHeight: "100vh", background: COLOR.paper, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <form
        onSubmit={handleSubmit}
        style={{ width: "100%", maxWidth: 380, background: COLOR.card, border: `1px solid ${COLOR.line}`, borderRadius: 12, padding: 28, fontFamily: "Georgia, serif" }}
      >
        <div style={{ width: 44, height: 44, borderRadius: 999, background: COLOR.forest, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <User size={20} color={COLOR.amber} />
        </div>
        <h1 style={{ fontSize: 20, color: COLOR.forest, textAlign: "center", marginBottom: 4 }}>Dobrodošel/-la!</h1>
        <p style={{ fontSize: 13, color: COLOR.sage, textAlign: "center", marginBottom: 20 }}>
          Preden začneš, izpolni nekaj osnovnih podatkov — to potrebuje tvoj ponudnik prehranskega načrta.
        </p>

        <label style={labelStyle}>Ime</label>
        <input style={inputStyle} value={ime} onChange={(e) => setIme(e.target.value)} placeholder="Ime" />

        <label style={labelStyle}>Priimek</label>
        <input style={inputStyle} value={priimek} onChange={(e) => setPriimek(e.target.value)} placeholder="Priimek" />

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Starost</label>
            <input style={inputStyle} type="number" value={starost} onChange={(e) => setStarost(e.target.value)} placeholder="let" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Višina (cm)</label>
            <input style={inputStyle} type="number" value={visina} onChange={(e) => setVisina(e.target.value)} placeholder="cm" />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Teža (kg)</label>
            <input style={inputStyle} type="number" step="0.1" value={teza} onChange={(e) => setTeza(e.target.value)} placeholder="kg" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Ciljne kalorije/dan</label>
            <input style={inputStyle} type="number" value={ciljKalorij} onChange={(e) => setCiljKalorij(e.target.value)} placeholder="kcal" />
          </div>
        </div>

        {error && <p style={{ fontSize: 12, color: COLOR.danger, marginBottom: 10 }}>{error}</p>}

        <button
          type="submit"
          disabled={saving}
          style={{ width: "100%", padding: "11px 0", borderRadius: 8, background: COLOR.forest, color: "#FFFFFF", fontFamily: "Georgia, serif", fontSize: 14, border: "none", marginTop: 6, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "Shranjujem ..." : "Nadaljuj"}
        </button>
      </form>
    </div>
  );
}
