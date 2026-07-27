import React, { useEffect, useRef, useState } from "react";
import { Lock, LogOut, AlertTriangle } from "lucide-react";
import { supabase, isSupabaseConfigured } from "./supabaseClient";

const DEVICE_ID_KEY = "mk_device_id";
const CHECK_INTERVAL_MS = 20000; // kako pogosto preveri, ali je "prevzela" druga naprava

function getOrCreateDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "iPhone/iPad";
  if (/Android/.test(ua)) return "Android naprava";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows računalnik";
  return "Neznana naprava";
}

/**
 * Prava avtentikacija (Supabase Auth) + izsiljena omejitev "ena naprava
 * naenkrat na uporabniški račun": ob vsaki prijavi ta naprava v tabeli
 * `device_sessions` PREPIŠE zapis za tega uporabnika. Vsaka druga naprava,
 * ki je bila prej prijavljena z istim računom, to zazna (periodično
 * preverjanje) in se samodejno odjavi.
 */
export function AuthGate({ children }) {
  const [session, setSession] = useState(undefined); // undefined = se nalaga, null = odjavljen
  const [mode, setMode] = useState("login"); // "login" | "forgot" | "forgot-sent"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [kickedOut, setKickedOut] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  // ob prijavi: registriraj TO napravo kot edino aktivno za tega uporabnika
  useEffect(() => {
    if (!session?.user?.id) return;
    const deviceId = getOrCreateDeviceId();
    supabase
      .from("device_sessions")
      .upsert({ user_id: session.user.id, device_id: deviceId, device_label: deviceLabel(), updated_at: new Date().toISOString() })
      .then(({ error: upsertError }) => {
        if (upsertError) console.error("[Makro kuharica] Napaka pri registraciji naprave:", upsertError.message);
      });
  }, [session?.user?.id]);

  // periodično preveri, ali se je nekdo drug prijavil na drugi napravi
  useEffect(() => {
    if (!session?.user?.id) return;
    const deviceId = getOrCreateDeviceId();

    async function check() {
      const { data } = await supabase.from("device_sessions").select("device_id").eq("user_id", session.user.id).maybeSingle();
      if (data && data.device_id !== deviceId) {
        setKickedOut(true);
        await supabase.auth.signOut();
      }
    }

    intervalRef.current = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [session?.user?.id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        if (signInError.message?.toLowerCase().includes("invalid login")) {
          setError("Napačen e-poštni naslov ali geslo.");
        } else {
          setError("Prijava ni uspela: " + signInError.message);
        }
      }
    } catch (networkErr) {
      setError("Ni internetne povezave ali strežnik ni dosegljiv. Preveri povezavo in poskusi znova.");
    }
    setBusy(false);
  }

  async function handleForgotSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (resetError) {
        setError("Napaka: " + resetError.message);
      } else {
        setMode("forgot-sent");
      }
    } catch (networkErr) {
      setError("Ni internetne povezave ali strežnik ni dosegljiv. Preveri povezavo in poskusi znova.");
    }
    setBusy(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  if (session === undefined) {
    return <div style={styles.blank} />;
  }

  if (!isSupabaseConfigured) {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={{ ...styles.iconCircle, background: "#B5533C" }}>
            <AlertTriangle size={20} color="#FFFFFF" />
          </div>
          <h1 style={styles.title}>Nastavitev ni dokončana</h1>
          <p style={{ ...styles.subtitle, marginBottom: 16 }}>
            Manjkata <code>VITE_SUPABASE_URL</code> in <code>VITE_SUPABASE_ANON_KEY</code>. Ustvari datoteko{" "}
            <code>.env</code> po vzoru <code>.env.example</code> in ponovno zaženi <code>npm run build</code>. Navodila
            so v README.md.
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    if (mode === "forgot" || mode === "forgot-sent") {
      return (
        <div style={styles.wrap}>
          <form onSubmit={handleForgotSubmit} style={styles.card}>
            <div style={styles.iconCircle}>
              <Lock size={20} color="#C98A2C" />
            </div>
            <h1 style={styles.title}>Pozabljeno geslo</h1>
            {mode === "forgot-sent" ? (
              <p style={styles.subtitle}>
                Če račun s tem e-poštnim naslovom obstaja, smo nanj poslali povezavo za ponastavitev gesla. Preveri
                nabiralnik (tudi mapo z vsiljeno pošto).
              </p>
            ) : (
              <>
                <p style={{ ...styles.subtitle, marginBottom: 16 }}>
                  Vpiši svoj e-poštni naslov — poslali ti bomo povezavo za nastavitev novega gesla.
                </p>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="E-poštni naslov"
                  autoComplete="username"
                  style={styles.input}
                />
                {error && <p style={styles.error}>{error}</p>}
                <button type="submit" disabled={busy || !email} style={{ ...styles.button, opacity: busy || !email ? 0.6 : 1 }}>
                  {busy ? "Pošiljam ..." : "Pošlji povezavo"}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
              }}
              style={styles.linkBtn}
            >
              ← Nazaj na prijavo
            </button>
          </form>
        </div>
      );
    }

    return (
      <div style={styles.wrap}>
        <form onSubmit={handleSubmit} style={styles.card}>
          <div style={styles.iconCircle}>
            <Lock size={20} color="#C98A2C" />
          </div>
          <h1 style={styles.title}>Makro kuharica</h1>
          <p style={styles.subtitle}>Prijava</p>
          {kickedOut && (
            <p style={styles.kickedNotice}>
              Odjavljen/-a si bil/-a, ker se je nekdo prijavil s tvojim računom na drugi napravi (dovoljena je samo
              ena naprava naenkrat).
            </p>
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-poštni naslov"
            autoComplete="username"
            style={styles.input}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Geslo"
            autoComplete="current-password"
            style={styles.input}
          />
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" disabled={busy || !email || !password} style={{ ...styles.button, opacity: busy || !email || !password ? 0.6 : 1 }}>
            {busy ? "Prijavljam ..." : "Prijava"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("forgot");
              setError("");
            }}
            style={styles.linkBtn}
          >
            Pozabljeno geslo?
          </button>
          <p style={styles.footnote}>Račun ti ustvari ponudnik aplikacije — sam registracija ni na voljo.</p>
        </form>
      </div>
    );
  }

  return (
    <div>
      <div style={styles.sessionBar}>
        <span style={styles.sessionEmail}>{session.user.email}</span>
        <button onClick={handleLogout} style={styles.logoutBtn}>
          <LogOut size={13} /> Odjava
        </button>
      </div>
      {children}
    </div>
  );
}

const styles = {
  blank: { minHeight: "100vh", background: "#F6F2E9" },
  wrap: { minHeight: "100vh", background: "#F6F2E9", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 340, background: "#FFFFFF", border: "1px solid #E1D9C7", borderRadius: 12, padding: 28, textAlign: "center", fontFamily: "Georgia, serif" },
  iconCircle: { width: 44, height: 44, borderRadius: 999, background: "#1B3324", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" },
  title: { fontSize: 20, color: "#1B3324", marginBottom: 2 },
  subtitle: { fontSize: 13, color: "#557A62", marginBottom: 16 },
  kickedNotice: { fontSize: 12, color: "#8A4B23", background: "#F3E3D3", borderRadius: 8, padding: "8px 10px", marginBottom: 14, lineHeight: 1.5 },
  input: { width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 8, border: "1px solid #E1D9C7", background: "#F6F2E9", color: "#20241D", fontFamily: "Georgia, serif", fontSize: 14, marginBottom: 10 },
  error: { fontSize: 12, color: "#B5533C", marginBottom: 10 },
  button: { width: "100%", padding: "11px 0", borderRadius: 8, background: "#1B3324", color: "#FFFFFF", fontFamily: "Georgia, serif", fontSize: 14, border: "none", marginTop: 4 },
  footnote: { fontSize: 11, color: "#557A62", marginTop: 14, lineHeight: 1.5 },
  linkBtn: { display: "block", width: "100%", textAlign: "center", fontSize: 12, color: "#557A62", background: "transparent", border: "none", marginTop: 10, textDecoration: "underline", cursor: "pointer" },
  sessionBar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 16px", background: "#1B3324" },
  sessionEmail: { fontSize: 11, color: "#CFE0D2", fontFamily: "Georgia, serif" },
  logoutBtn: { display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#CFE0D2", background: "transparent", border: "none", padding: "4px 6px" },
};
