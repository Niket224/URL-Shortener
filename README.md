# ⬡ Snip — Full Stack URL Shortener

**Owner:** Niket Kumar

A full-stack URL shortener with click analytics, custom short codes, and a sleek dark-mode UI.

**Live Demo:** [urlshortener-sigma-pearl.vercel.app](https://urlshortener-sigma-pearl.vercel.app)
**Backend API:** [url-shortener-1-xxuc.onrender.com](https://url-shortener-1-xxuc.onrender.com)
**Tech Stack:** React · Vite · Node.js · Express · MongoDB · Vercel · Render

![Snip URL Shortener Screenshot](./Screenshot%20(2).png)

---

## Features

- **Accounts and ownership**: register/sign in, manage only your links, and revoke sessions by signing out.
- **Link lifecycle**: optional expiration, destination editing, and paginated lists.
- **Reliable analytics**: atomic seven-day UTC counters; redirects still work if recording a click fails.


- 🔗 **Instant URL Shortening** — Paste any long URL and get a clean short link
- ✏️ **Custom Short Codes** — Create branded links (e.g. `/promo`, `/sale2024`)
- 📊 **Click Analytics** — Track clicks with 7-day bar chart visualization
- 🗑️ **Link Management** — View, copy, and delete your links
- ⚡ **Rate Limiting** — 100 requests per 15 minutes to prevent abuse
- 🌐 **302 Redirects** — Uncached temporary redirects with click tracking
- 🔒 **Durable Storage** — Links persist across server restarts (MongoDB)
- ✅ **Production-Ready** — Bugfix ensures no 404s from non-durable storage or routing mismatches

---

## Project Structure

```
url-shortener/
├── backend/
│   ├── src/
│   │   ├── index.js          # Express app entry
│   │   ├── models/Url.js     # Mongoose schema
│   │   └── routes/
│   │       ├── url.js        # CRUD API routes
│   │       └── redirect.js   # Short code redirect
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Main UI
│   │   ├── api.js            # Axios service
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.mjs
│   └── package.json
└── README.md
```

---

## Local Development

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/url-shortener.git
cd url-shortener

# Install backend deps
cd backend && npm install

# Install frontend deps
cd ../frontend && npm install
```

### 2. Set Up MongoDB

- Go to [mongodb.com/atlas](https://mongodb.com/atlas) → Create a free cluster
- Get your connection string
- Create `backend/.env`:

```env
PORT=5001
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster0.mongodb.net/urlshortener
BASE_URL=http://localhost:5001
FRONTEND_URL=http://localhost:5173
```

### 3. Run

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Deployment

This project is deployed using a split architecture:
- **Frontend:** Vercel (React + Vite)
- **Backend:** Render (Node.js + Express)
- **Database:** MongoDB Atlas

Vercel hosts only the frontend; API requests and short-link redirects go to Render. No root Vercel backend routing configuration is needed. The API supplies every displayed/copied short URL.

Production requires `BASE_URL` and `FRONTEND_URL` on the backend, plus `MONGODB_URI`. Frontend builds require `VITE_API_URL`; missing configuration fails explicitly. Use origin URLs without paths. `VITE_BASE_URL` is no longer used.

### Deploy Backend to Render

1. Go to [render.com](https://render.com) → **New Web Service**
2. Connect your GitHub repo
3. Configure:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Add **Environment Variables**:

| Key | Value |
|-----|-------|
| `MONGODB_URI` | `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/urlshortener` |
| `PORT` | `5001` |
| `NODE_ENV` | `production` |
| `BASE_URL` | `https://your-backend.onrender.com` |
| `FRONTEND_URL` | `https://your-frontend.vercel.app` |

5. Deploy and note your backend URL (e.g., `https://url-shortener-1-xxuc.onrender.com`)

### Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repo
3. Configure:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Add **Environment Variables**:

| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://your-backend.onrender.com` (no trailing slash) |

5. Click **Deploy** ✓

### MongoDB Atlas Setup

1. Create a free cluster at [mongodb.com/atlas](https://mongodb.com/atlas)
2. **Database Access** → Create a database user (username + password)
3. **Network Access** → Add IP Address → **Allow Access from Anywhere** (`0.0.0.0/0`)
4. Get your connection string and set it as `MONGODB_URI` on Render only. Never add database credentials to Vercel or `VITE_*` variables

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/urls` | Shorten a URL |
| `GET` | `/api/urls?page=1&limit=12` | List your links; `X-Has-More` indicates another page |
| `GET` | `/api/urls/:id/stats` | Get click analytics |
| `PATCH` | `/api/urls/:id` | Edit destination and/or expiration |
| `DELETE` | `/api/urls/:id` | Delete a URL |
| `GET` | `/:code` | Redirect to original URL |

---

## Resume Blurb

> **Snip — URL Shortener** · [GitHub](https://github.com/Niket224/URL-Shortener) · [Live Demo](https://urlshortener-sigma-pearl.vercel.app)
> Full-stack link shortening app with REST API, click analytics, and custom short codes. Deployed on Vercel (frontend) and Render (backend) with MongoDB Atlas. Features rate limiting, 302 redirects, durable storage, and a 7-day analytics dashboard. Implemented comprehensive bugfix using property-based testing to resolve 404 errors from non-durable storage and routing mismatches.
> `React` `Vite` `Node.js` `Express` `MongoDB` `REST API` `Vercel` `Render` `Jest` `Property-Based Testing`

---

## License

MIT © Niket Kumar

## Accounts and existing data

The default is `AUTH_MODE=accounts`. Management endpoints require an Authorization Bearer token from `POST /api/auth/register` or `POST /api/auth/login`. Both accept `email` and `password` (12-128 characters). `POST /api/auth/logout` revokes that token. Sessions expire after 24 hours; only token hashes are stored on the server. Passwords use salted scrypt. The browser stores its token in sessionStorage, so closing the tab ends its local session. Use HTTPS in production.

Old links without an owner keep redirecting, but are not assigned to new accounts automatically. An administrator must explicitly map ownership in the database if those links need account management. Setting `AUTH_MODE=public` deliberately enables a shared demo: everyone can list, edit, and delete every link. Never use public mode for private links. Email verification and password recovery are not implemented.

Local memory mode also loses accounts and sessions on restart. MongoDB is mandatory in production. Never use a production database for tests.

## Link lifecycle and analytics

Creation accepts an optional future ISO timestamp in `expiresAt`; PATCH accepts a destination and/or expiration (null removes expiration). Expired links return 410; deleted links return 404. Custom codes remain reserved after deletion. Destinations allow HTTP/HTTPS only and cannot contain credentials.

Redirects now use 302 with Cache-Control: no-store so destination edits, deletion, expiration, and repeat-visit analytics remain effective. Old 301 responses already cached in browsers cannot be recalled. HEAD requests do not count as clicks. Analytics retain the lifetime count plus seven UTC daily counters. Existing embedded click history is consolidated on the next visit, preserving recent counts and lifetime totals while discarding raw referrer/user-agent history. Analytics are best-effort: a failed write permits the redirect and may undercount.

## Runtime configuration

On Render, set `NODE_ENV=production`, `MONGODB_URI`, `BASE_URL`, `FRONTEND_URL`, and `AUTH_MODE=accounts`. Set `TRUST_PROXY_HOPS` to the verified reverse-proxy hop count (typically 1 on Render; 0 locally). Rate limits are per process, so multiple replicas would need a shared limiter store. The health endpoint returns 503 when MongoDB is disconnected. Database credentials belong only on Render. Vercel needs only `VITE_API_URL` and the frontend root-directory settings above.

## Verification

- Backend: `cd backend && npm ci && npm test`. Tests use a disposable real MongoDB binary through mongodb-memory-server; the first run downloads it. Coverage includes a separate Node process reading persisted data, reconnects, concurrent click counts, account isolation, expiration, validation, and regression cases.
- Frontend: set `VITE_API_URL` to your Render origin, then `cd frontend && npm ci && npm run build`.
- Browser: `cd frontend && npx playwright install chromium && npm run test:e2e`. Tests launch isolated local servers on ports 5101/5179 with memory storage, and exercise desktop/mobile account and link workflows. Screenshots/results go to the OS temporary directory.
- GitHub Actions runs backend tests, the production build, and Chromium smoke tests on pushes and pull requests. It does not deploy.
