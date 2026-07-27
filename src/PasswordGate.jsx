import React, { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { verifyTOTP } from "./totp";

/**
 * ⚠️ ZAMENJAJ TA SKRIVNI KLJUČ, preden objaviš stran v pravo produkcijo!
 * Ta je bil generiran samo za predstavitev — jaz (Claude) sem ga videl,
 * zato ni varen za resnično uporabo. Nov ključ generiraš npr. z:
 *   python3 -c "import secrets,base64; print(base64.b32encode(secrets.token_bytes(20)).decode().rstrip('='))"
 * Nato isti ključ vneseš v svojo avtentikator aplikacijo (glej README.md).
 */
const TOTP_SECRET = "CPHPLQUQSJLM64CWFKVMSHXNU4PEJZ4Y";
const TOTP_PERIOD_SECONDS = 86400; // koda se spremeni enkrat na dan
const AUTH_STORAGE_KEY = "mk_auth_valid_until";
const AUTH_VALID_DAYS = 30; // ko je uporabnik enkrat potrjen, ostane prijavljen X dni na tej napravi

export function PasswordGate({ children }) {
  const [authed, setAuthed] = useState(null); // null = se še preverja
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const until = localStorage.getItem(AUTH_STORAGE_KEY);
    setAuthed(Boolean(until && Date.now() < Number(until)));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setChecking(true);
    setError("");
    const ok = await verifyTOTP(TOTP_SECRET, code, TOTP_PERIOD_SECONDS, 6);
    if (ok) {
      localStorage.setItem(AUTH_STORAGE_KEY, String(Date.now() + AUTH_VALID_DAYS * 24 * 60 * 60 * 1000));
      setAuthed(true);
    } else {
      setError("Napačna koda. Preveri današnjo kodo pri ponudniku aplikacije.");
    }
    setChecking(false);
  }

  if (authed === null) {
    return <div style={{ minHeight: "100vh", background: "#F6F2E9" }} />;
  }

  if (authed) return children;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F6F2E9",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 340,
          background: "#FFFFFF",
          border: "1px solid #E1D9C7",
          borderRadius: 12,
          padding: 28,
          textAlign: "center",
          fontFamily: "Georgia, serif",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            background: "#1B3324",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 14px",
          }}
        >
          <Lock size={20} color="#C98A2C" />
        </div>
        <h1 style={{ fontSize: 20, color: "#1B3324", marginBottom: 6 }}>Makro kuharica</h1>
        <p style={{ fontSize: 13, color: "#557A62", marginBottom: 18, lineHeight: 1.5 }}>
          Vnesi dnevno dostopno kodo, ki jo prejmeš od ponudnika aplikacije.
        </p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          inputMode="numeric"
          autoFocus
          style={{
            width: "100%",
            textAlign: "center",
            letterSpacing: 6,
            fontSize: 22,
            fontFamily: "monospace",
            padding: "12px 10px",
            borderRadius: 8,
            border: "1px solid #E1D9C7",
            background: "#F6F2E9",
            color: "#20241D",
            marginBottom: 12,
          }}
        />
        {error && (
          <p style={{ fontSize: 12, color: "#B5533C", marginBottom: 12 }}>{error}</p>
        )}
        <button
          type="submit"
          disabled={checking || code.length !== 6}
          style={{
            width: "100%",
            padding: "11px 0",
            borderRadius: 8,
            background: checking || code.length !== 6 ? "#9FB3A6" : "#1B3324",
            color: "#FFFFFF",
            fontFamily: "Georgia, serif",
            fontSize: 14,
            border: "none",
          }}
        >
          {checking ? "Preverjam ..." : "Vstopi"}
        </button>
      </form>
    </div>
  );
}
