import { useState } from "react";
import { updateUrl } from "./api";
import Dialog from "./Dialog";

export function localDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export default function EditLink({ item, onClose, onSaved }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await updateUrl(item._id, { originalUrl: data.originalUrl, expiresAt: data.expiresAt ? new Date(data.expiresAt).toISOString() : null });
      onSaved(); onClose();
    } catch (err) { setError(err.response?.data?.error || "Could not save changes."); }
    finally { setBusy(false); }
  }
  return <Dialog title="Edit link" onClose={onClose}><form onSubmit={submit}>
    <label>Destination URL<input name="originalUrl" type="url" defaultValue={item.originalUrl} required /></label>
    <label>Expiration (local time)<input name="expiresAt" type="datetime-local" defaultValue={localDate(item.expiresAt)} /></label>
    <small>Leave expiration empty for a link that does not expire.</small>
    {error && <p role="alert">{error}</p>}
    <button disabled={busy}>{busy ? "Saving..." : "Save changes"}</button>
  </form></Dialog>;
}
