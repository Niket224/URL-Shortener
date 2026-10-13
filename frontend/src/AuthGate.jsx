import { useEffect, useState } from "react";
import api, { setToken } from "./api";

export default function AuthGate({ children }) {
  const [mode, setMode] = useState(null);
  const [signedIn, setSignedIn] = useState(Boolean(sessionStorage.getItem("snip-token")));
  const [register, setRegister] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const loadMode = () => {
    setError("");
    api.get("/api/auth/mode").then(r => setMode(r.data.mode)).catch(() => setError("Cannot reach the service. Please retry."));
  };
  useEffect(() => {
    loadMode();
    const expire = () => { setSignedIn(false); setError("Your session expired. Please sign in again."); };
    window.addEventListener("snip-session-expired", expire);
    return () => window.removeEventListener("snip-session-expired", expire);
  }, []);
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await api.post(`/api/auth/${register ? "register" : "login"}`, data);
      setToken(result.data.token); setRegister(false); setSignedIn(true);
    } catch (err) { setError(err.response?.data?.error || "Sign in failed. Please retry."); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try { await api.post("/api/auth/logout"); setToken(""); setSignedIn(false); }
    catch { setError("Could not sign out. Please retry."); }
    finally { setBusy(false); }
  }
  if (!mode) return <main className="account"><h1>Snip</h1><p role="status">{error || "Connecting..."}</p>{error && <button onClick={loadMode}>Retry</button>}</main>;
  if (mode === "public" || signedIn) return <>
    <div className="account-bar">{mode === "public" ? <span>Public demo: links are shared with everyone.</span> : <button disabled={busy} onClick={logout}>Sign out</button>}{error && <p role="alert">{error}</p>}</div>
    {children}
  </>;
  return <main className="account">
    <h1>{register ? "Create your Snip account" : "Sign in to Snip"}</h1>
    <p>Manage your short links and analytics.</p>
    <form onSubmit={submit}>
      <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
      <label>Password<input name="password" type="password" autoComplete={register ? "new-password" : "current-password"} required minLength={12} maxLength={128} /></label>
      <small>Use 12 to 128 characters.</small>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy}>{busy ? "Please wait..." : register ? "Create account" : "Sign in"}</button>
    </form>
    <button disabled={busy} onClick={() => { setRegister(!register); setError(""); }}>{register ? "Already have an account? Sign in" : "Create an account"}</button>
  </main>;
}
