# ⬡ Snip — Full Stack URL Shortener

**Owner:** Niket Kumar

A full-stack URL shortener with click analytics, custom short codes, and a sleek dark-mode UI.

**Live Demo:** [urlshortener-sigma-pearl.vercel.app](https://urlshortener-sigma-pearl.vercel.app)  
**Backend API:** [url-shortener-1-xxuc.onrender.com](https://url-shortener-1-xxuc.onrender.com)  
**Tech Stack:** React · Vite · Node.js · Express · MongoDB · Vercel · Render

![Snip URL Shortener Screenshot](./Screenshot%20(2).png)

---

## Features

- 🔗 **Instant URL Shortening** — Paste any long URL and get a clean short link
- ✏️ **Custom Short Codes** — Create branded links (e.g. `/promo`, `/sale2024`)
- 📊 **Click Analytics** — Track clicks with 7-day bar chart visualization
- 🗑️ **Link Management** — View, copy, and delete your links
- ⚡ **Rate Limiting** — 100 requests per 15 minutes to prevent abuse
- 🌐 **301 Redirects** — SEO-friendly permanent redirects with click tracking
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
│   ├── vite.config.js
│   └── package.json
├── vercel.json
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
4. Add **Environment Variables**:

| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://your-backend.onrender.com` (no trailing slash) |
| `VITE_BASE_URL` | `https://your-backend.onrender.com` (no trailing slash) |

5. Click **Deploy** ✓

### MongoDB Atlas Setup

1. Create a free cluster at [mongodb.com/atlas](https://mongodb.com/atlas)
2. **Database Access** → Create a database user (username + password)
3. **Network Access** → Add IP Address → **Allow Access from Anywhere** (`0.0.0.0/0`)
4. Get your connection string and add it to both Render and Vercel environment variables

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/urls` | Shorten a URL |
| `GET` | `/api/urls` | List all URLs |
| `GET` | `/api/urls/:id/stats` | Get click analytics |
| `DELETE` | `/api/urls/:id` | Delete a URL |
| `GET` | `/:code` | Redirect to original URL |

---

## Resume Blurb

> **Snip — URL Shortener** · [GitHub](https://github.com/Niket224/URL-Shortener) · [Live Demo](https://urlshortener-sigma-pearl.vercel.app)  
> Full-stack link shortening app with REST API, click analytics, and custom short codes. Deployed on Vercel (frontend) and Render (backend) with MongoDB Atlas. Features rate limiting, 301 redirects, durable storage, and a 7-day analytics dashboard. Implemented comprehensive bugfix using property-based testing to resolve 404 errors from non-durable storage and routing mismatches.  
> `React` `Vite` `Node.js` `Express` `MongoDB` `REST API` `Vercel` `Render` `Jest` `Property-Based Testing`

---

## License

MIT © Niket Kumar
