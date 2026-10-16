# ◎ Life OS

**A personal system for everything that matters.**

Life OS helps you capture, organize, prioritize and track *everything* you want to do in life — from 200 to 1,000+ goals, ideas and experiences — in a modern, fast, local-first web app.

🔗 **Live app:** https://abdullahbinfahad.github.io/life-os/

---

## ✨ Features

| Section | What it does |
|---|---|
| **Overview** | Your current life at a glance — stats, life-balance by category, upcoming deadlines, goals in motion |
| **Today** | Immediate priorities, suggestions picked from your library, due project tasks, overdue items, today's habits, daily progress ring |
| **Life Library** | All goals, ideas and experiences. Handles 1,000+ items with search, filters (status, priority, horizon, starred), grouping (category / status / priority / horizon / type), sorting, list & grid views, **bulk select & bulk edit**, and paste-many-lines add |
| **Idea templates** | 400+ ready-made life ideas across 12 categories — tick the ones you want and add them in one click |
| **Goals** | Outcomes with milestones, target dates, countdowns and progress rings; link library items and projects |
| **Projects** | Kanban board (drag & drop), tasks with due dates and **task dependencies** (blocked tasks are locked) |
| **Calendar & Timeline** | Month calendar of every deadline, chronological timeline, and a 5-level **life horizons** board (this year → lifetime) |
| **Habits** | Daily / weekly habits, 7-day check-in grid, streaks, best streak, 30-day consistency, 12-week heatmaps |
| **Insights** | Completions per week, pipeline, category progress, automatic patterns (best day, neglected areas…) |
| **Journal** | Reflections with mood, tags, prompts, and full-text search of memories |
| **Settings** | Custom categories (icon/color), JSON backup & restore, CSV import/export, demo data, privacy, shortcuts |

### ⚡ Super-fast adding
Press **N** anywhere (or the + button) and type one item per line — paste hundreds at once. Smart syntax:

```
Learn guitar #learning !2 ~1-3y
Call mom #family +today
Visit Iceland #travel @2027-06-01 *
```
`#category` · `!1–!4` priority · `@YYYY-MM-DD` due date · `+today` pin to Today · `~this-year|1-3y|3-5y|5-10y|lifetime` horizon · `*` star

### ⌨️ Shortcuts
- `N` — quick add
- `⌘/Ctrl + K` — search everything / command palette
- `G` then `O T L G P C H I J S` — jump to a page

## 🔒 Privacy
Local-first: all data lives in your browser's localStorage. No account, no server, no tracking. Use **Settings → Full backup** to export and move between devices.

## 🧱 Tech stack
- **React 18 + TypeScript** with **Vite**
- **Tailwind CSS** for the modern UI (dark & light mode)
- **Zustand** (persisted) as the state store / local database
- **React Router** (hash routing, works on GitHub Pages)
- **lucide-react** icons
- **GitHub Actions** → GitHub Pages auto-deploy

## 🚀 Run locally
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## 🗺️ Roadmap ideas
- Optional cloud sync (Supabase) & multi-device login
- PWA / offline install
- Recurring items and reminders
- AI suggestions for next steps

---
Built for Abdullah Bin Fahad · MIT License
