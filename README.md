# ⬡ Snip — Full Stack URL Shortener

**Owner:** Niket Kumar

A full-stack URL shortener with click analytics, custom short codes, and a sleek dark-mode UI.

**Live Demo:** [snip.vercel.app](https://snip.vercel.app) <!-- update after deploy -->  
**Tech Stack:** React · Vite · Node.js · Express · MongoDB · Vercel

---

## Features

- 🔗 Shorten any URL instantly
- ✏️ Custom short codes (e.g. `/my-link`)
- 📊 Per-link click analytics with 7-day bar chart
- 🗑️ Delete links
- ⚡ Rate limiting (100 req / 15 min)
- 🌐 301 redirect with click tracking (referrer + user-agent)

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

## Deploy to Vercel

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "feat: full stack url shortener"
git remote add origin https://github.com/YOUR_USERNAME/url-shortener.git
git push -u origin main
```

### Step 2 — Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repo
3. Add these **Environment Variables** in Vercel dashboard:

| Key | Value |
|-----|-------|
| `MONGODB_URI` | your MongoDB Atlas URI |
| `BASE_URL` | `https://your-project.vercel.app` |
| `FRONTEND_URL` | `https://your-project.vercel.app` |
| `VITE_API_URL` | `https://your-project.vercel.app` |
| `VITE_BASE_URL` | `https://your-project.vercel.app` |

4. Click **Deploy** ✓

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

> **Snip — URL Shortener** · [GitHub](#) · [Live Demo](#)  
> Full-stack link shortening app with REST API, click analytics, and custom short codes. Built with React, Node.js/Express, MongoDB, and deployed on Vercel with GitHub CI/CD. Features rate limiting, 301 redirects, and a 7-day analytics dashboard.  
> `React` `Vite` `Node.js` `Express` `MongoDB` `REST API` `Vercel`
