import { useState, useEffect, useCallback } from "react";
import { shortenUrl, getUrls, deleteUrl, getStats } from "./api";

// Short links still point at the API host (redirects are served there).
const BASE_URL =
  import.meta.env.VITE_BASE_URL !== undefined && import.meta.env.VITE_BASE_URL !== ""
    ? import.meta.env.VITE_BASE_URL
    : import.meta.env.DEV
      ? "http://localhost:5001"
      : typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost:5001";

function normalizeUrlInput(raw) {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function apiErrorMessage(err) {
  const msg = err.response?.data?.error;
  if (typeof msg === "string") return msg;
  if (err.response?.status === 403) {
    return "Got 403 from port 5000 — that's usually macOS AirPlay, not this app. Restart the backend (npm start uses port 5001) and refresh the page.";
  }
  if (err.code === "ERR_NETWORK" || err.message === "Network Error") {
    return "Cannot reach the API. In one terminal run: cd backend && npm start (MongoDB is optional locally). In another: cd frontend && npm run dev. Then open http://localhost:5173";
  }
  if (err.response?.status === 429) {
    return "Too many requests. Wait a few minutes and try again.";
  }
  return err.message || "Something went wrong.";
}

function getDomain(url) {
  try { return new URL(url).hostname.replace("www.", ""); }
  catch { return url; }
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── StatsModal ────────────────────────────────────────────────────────────────
function StatsModal({ urlItem, onClose }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStats(urlItem._id)
      .then((r) => setStats(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [urlItem._id]);

  const maxClicks = stats ? Math.max(...stats.clicksByDay.map((d) => d.clicks), 1) : 1;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>Analytics</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div style={styles.loading}>Loading stats…</div>
        ) : stats ? (
          <>
            <div style={styles.statRow}>
              <div style={styles.statBox}>
                <span style={styles.statNum}>{stats.totalClicks}</span>
                <span style={styles.statLabel}>Total Clicks</span>
              </div>
              <div style={styles.statBox}>
                <span style={styles.statNum} title={stats.originalUrl}>
                  {getDomain(stats.originalUrl)}
                </span>
                <span style={styles.statLabel}>Destination</span>
              </div>
            </div>

            <div style={styles.chartLabel}>Last 7 Days</div>
            <div style={styles.chart}>
              {stats.clicksByDay.map((d) => (
                <div key={d.date} style={styles.barWrap}>
                  <span style={styles.barCount}>{d.clicks || ""}</span>
                  <div
                    style={{
                      ...styles.bar,
                      height: `${Math.max((d.clicks / maxClicks) * 100, 4)}%`,
                      background: d.clicks > 0 ? "var(--accent)" : "var(--border)",
                    }}
                  />
                  <span style={styles.barDate}>
                    {new Date(d.date).toLocaleDateString("en", { weekday: "short" })}
                  </span>
                </div>
              ))}
            </div>

            <div style={styles.shortUrlDisplay}>
              <span style={styles.monoText}>{BASE_URL}/{stats.shortCode}</span>
            </div>
          </>
        ) : (
          <div style={styles.loading}>Failed to load stats.</div>
        )}
      </div>
    </div>
  );
}

// ── UrlCard ───────────────────────────────────────────────────────────────────
function UrlCard({ item, onDelete, onStats }) {
  const [copied, setCopied] = useState(false);
  const shortUrl = `${BASE_URL}/${item.shortCode}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={styles.card}>
      <div style={styles.cardTop}>
        <div style={styles.domain}>{getDomain(item.originalUrl)}</div>
        <div style={styles.cardMeta}>
          <span style={styles.clickBadge}>↗ {item.clicks}</span>
          <span style={styles.timeAgo}>{timeAgo(item.createdAt)}</span>
        </div>
      </div>

      <div style={styles.shortCodeRow}>
        <span style={styles.shortCode}>/{item.shortCode}</span>
        <div style={styles.cardActions}>
          <button style={styles.iconBtn} onClick={handleCopy} title="Copy">
            {copied ? "✓" : "⎘"}
          </button>
          <button style={styles.iconBtn} onClick={() => onStats(item)} title="Stats">
            ▦
          </button>
          <button
            style={{ ...styles.iconBtn, ...styles.deleteBtn }}
            onClick={() => onDelete(item._id)}
            title="Delete"
          >
            ✕
          </button>
        </div>
      </div>

      <div style={styles.originalUrl} title={item.originalUrl}>
        {item.originalUrl.length > 60 ? item.originalUrl.slice(0, 60) + "…" : item.originalUrl}
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [inputUrl, setInputUrl] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [urls, setUrls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const [statsItem, setStatsItem] = useState(null);

  const fetchUrls = useCallback(() => {
    setFetching(true);
    getUrls()
      .then((r) => setUrls(r.data))
      .catch(console.error)
      .finally(() => setFetching(false));
  }, []);

  useEffect(() => { fetchUrls(); }, [fetchUrls]);

  const handleSubmit = async () => {
    setError("");
    setSuccess(null);

    if (!inputUrl.trim()) return setError("Please enter a URL.");
    const normalized = normalizeUrlInput(inputUrl);
    try {
      new URL(normalized);
    } catch {
      return setError("Enter a valid URL (e.g. example.com or https://example.com).");
    }

    setLoading(true);
    try {
      const res = await shortenUrl({
        originalUrl: normalized,
        customCode: customCode.trim() || undefined,
      });
      setSuccess(res.data);
      setInputUrl("");
      setCustomCode("");
      setShowCustom(false);
      fetchUrls();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteUrl(id);
      setUrls((prev) => prev.filter((u) => u._id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopySuccess = () => {
    if (success) {
      navigator.clipboard.writeText(success.shortUrl);
    }
  };

  return (
    <div style={styles.app}>
      {/* Background grid */}
      <div style={styles.gridBg} />

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.logo}>
          <span style={styles.logoMark}>⬡</span>
          <span style={styles.logoText}>snip</span>
        </div>
        <span style={styles.tagline}>URL Shortener</span>
      </header>

      <main style={styles.main}>
        {/* Hero */}
        <div style={styles.hero}>
          <h1 style={styles.h1}>
            Short links,<br />
            <span style={styles.accent}>big impact.</span>
          </h1>
          <p style={styles.sub}>Paste a long URL. Get a clean, trackable short link instantly.</p>
        </div>

        {/* Input card */}
        <div style={styles.inputCard}>
          <div style={styles.inputRow}>
            <input
              style={styles.input}
              type="text"
              placeholder="https://your-long-url.com/goes-here"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
            <button
              style={{ ...styles.btn, ...(loading ? styles.btnDisabled : {}) }}
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? "…" : "Shorten →"}
            </button>
          </div>

          <div style={styles.customRow}>
            <button
              style={styles.customToggle}
              onClick={() => setShowCustom(!showCustom)}
            >
              {showCustom ? "▲ Hide custom code" : "▼ Custom short code (optional)"}
            </button>
          </div>

          {showCustom && (
            <div style={styles.customInput}>
              <span style={styles.basePrefix}>{getDomain(BASE_URL)}/</span>
              <input
                style={styles.inputSmall}
                placeholder="my-custom-code"
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value)}
                maxLength={12}
              />
            </div>
          )}

          {error && <div style={styles.errorMsg}>{error}</div>}

          {success && (
            <div style={styles.successBox}>
              <span style={styles.successLabel}>✓ Your short link is ready</span>
              <div style={styles.successLink}>
                <span style={styles.successUrl}>{success.shortUrl}</span>
                <button style={styles.copyBtn} onClick={handleCopySuccess}>
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Links table */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.h2}>Your Links</h2>
            <span style={styles.count}>{urls.length} total</span>
          </div>

          {fetching ? (
            <div style={styles.emptyState}>Loading…</div>
          ) : urls.length === 0 ? (
            <div style={styles.emptyState}>No links yet. Shorten your first URL above.</div>
          ) : (
            <div style={styles.grid}>
              {urls.map((u) => (
                <UrlCard
                  key={u._id}
                  item={u}
                  onDelete={handleDelete}
                  onStats={setStatsItem}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <footer style={styles.footer}>
        Built with React + Node.js + MongoDB · Deployed on Vercel
      </footer>

      {statsItem && (
        <StatsModal urlItem={statsItem} onClose={() => setStatsItem(null)} />
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  app: {
    minHeight: "100vh",
    position: "relative",
    overflowX: "hidden",
  },
  gridBg: {
    position: "fixed",
    inset: 0,
    backgroundImage:
      "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
    backgroundSize: "48px 48px",
    pointerEvents: "none",
    zIndex: 0,
  },
  header: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "24px 40px",
    borderBottom: "1px solid var(--border)",
  },
  logo: { display: "flex", alignItems: "center", gap: 8 },
  logoMark: { fontSize: 22, color: "var(--accent)" },
  logoText: {
    fontFamily: "var(--font-display)",
    fontWeight: 800,
    fontSize: 22,
    letterSpacing: "-0.5px",
    color: "var(--text)",
  },
  tagline: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--muted)",
    letterSpacing: "0.1em",
  },
  main: {
    position: "relative",
    zIndex: 1,
    maxWidth: 860,
    margin: "0 auto",
    padding: "60px 24px 100px",
  },
  hero: { textAlign: "center", marginBottom: 48 },
  h1: {
    fontFamily: "var(--font-display)",
    fontWeight: 800,
    fontSize: "clamp(2.4rem, 6vw, 4rem)",
    lineHeight: 1.1,
    letterSpacing: "-2px",
    marginBottom: 16,
  },
  accent: { color: "var(--accent)" },
  sub: { color: "var(--muted)", fontSize: 16, fontFamily: "var(--font-mono)" },
  inputCard: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: "28px 28px 24px",
    marginBottom: 48,
  },
  inputRow: { display: "flex", gap: 12, marginBottom: 12 },
  input: {
    flex: 1,
    background: "var(--surface2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "14px 18px",
    color: "var(--text)",
    fontFamily: "var(--font-mono)",
    fontSize: 14,
    outline: "none",
    transition: "border-color 0.2s",
  },
  btn: {
    background: "var(--accent)",
    color: "#000",
    border: "none",
    borderRadius: "var(--radius)",
    padding: "14px 24px",
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 15,
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "opacity 0.2s",
  },
  btnDisabled: { opacity: 0.5, cursor: "not-allowed" },
  customRow: { marginBottom: 4 },
  customToggle: {
    background: "none",
    border: "none",
    color: "var(--muted)",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    cursor: "pointer",
    padding: "4px 0",
  },
  customInput: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  basePrefix: {
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    color: "var(--muted)",
  },
  inputSmall: {
    background: "var(--surface2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "10px 14px",
    color: "var(--text)",
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    outline: "none",
    width: 200,
  },
  errorMsg: {
    marginTop: 12,
    color: "#ff6b6b",
    fontFamily: "var(--font-mono)",
    fontSize: 13,
  },
  successBox: {
    marginTop: 16,
    background: "rgba(232,255,71,0.07)",
    border: "1px solid rgba(232,255,71,0.25)",
    borderRadius: "var(--radius)",
    padding: "14px 18px",
  },
  successLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--accent)",
    display: "block",
    marginBottom: 8,
  },
  successLink: { display: "flex", alignItems: "center", gap: 12 },
  successUrl: {
    fontFamily: "var(--font-mono)",
    fontSize: 15,
    fontWeight: 500,
    color: "var(--text)",
    flex: 1,
  },
  copyBtn: {
    background: "var(--accent)",
    color: "#000",
    border: "none",
    borderRadius: 6,
    padding: "6px 14px",
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  section: { marginTop: 8 },
  sectionHeader: {
    display: "flex",
    alignItems: "baseline",
    gap: 12,
    marginBottom: 20,
  },
  h2: {
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 22,
    letterSpacing: "-0.5px",
  },
  count: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--muted)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
    gap: 16,
  },
  emptyState: {
    textAlign: "center",
    color: "var(--muted)",
    fontFamily: "var(--font-mono)",
    fontSize: 14,
    padding: "48px 0",
    borderRadius: 12,
    border: "1px dashed var(--border)",
  },
  card: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "18px 20px",
    transition: "border-color 0.2s",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  domain: {
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    fontSize: 14,
    color: "var(--text)",
  },
  cardMeta: { display: "flex", gap: 10, alignItems: "center" },
  clickBadge: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--accent)",
    background: "rgba(232,255,71,0.08)",
    padding: "2px 8px",
    borderRadius: 20,
  },
  timeAgo: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--muted)",
  },
  shortCodeRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  shortCode: {
    fontFamily: "var(--font-mono)",
    fontSize: 20,
    fontWeight: 500,
    color: "var(--accent)",
    letterSpacing: "-0.5px",
  },
  cardActions: { display: "flex", gap: 6 },
  iconBtn: {
    background: "var(--surface2)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    color: "var(--text)",
    width: 32,
    height: 32,
    cursor: "pointer",
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtn: { color: "#ff6b6b" },
  originalUrl: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--muted)",
    wordBreak: "break-all",
  },
  footer: {
    position: "relative",
    zIndex: 1,
    textAlign: "center",
    padding: "24px",
    borderTop: "1px solid var(--border)",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--muted)",
  },
  // Modal
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    backdropFilter: "blur(4px)",
  },
  modal: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: "28px",
    width: "min(500px, 90vw)",
    maxHeight: "80vh",
    overflowY: "auto",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: {
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 20,
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--muted)",
    fontSize: 18,
    cursor: "pointer",
  },
  statRow: { display: "flex", gap: 16, marginBottom: 24 },
  statBox: {
    flex: 1,
    background: "var(--surface2)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  statNum: {
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 22,
    color: "var(--accent)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  statLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--muted)",
  },
  chartLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--muted)",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
  chart: {
    display: "flex",
    gap: 6,
    height: 100,
    alignItems: "flex-end",
    marginBottom: 20,
  },
  barWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    height: "100%",
    justifyContent: "flex-end",
  },
  barCount: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--muted)",
    minHeight: 14,
  },
  bar: {
    width: "100%",
    borderRadius: "4px 4px 0 0",
    transition: "height 0.3s",
    minHeight: 4,
  },
  barDate: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--muted)",
  },
  shortUrlDisplay: {
    background: "var(--surface2)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 14px",
  },
  monoText: {
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    color: "var(--text)",
  },
  loading: {
    textAlign: "center",
    padding: 32,
    fontFamily: "var(--font-mono)",
    fontSize: 14,
    color: "var(--muted)",
  },
};
