<div align="center">

<img src="https://raw.githubusercontent.com/cankurucu/daily-canvas/main/public/logo.png" width="96" height="96" alt="DailyCanvas Logo" />

# DailyCanvas

**A free, open-source, local-first multiplayer canvas for Agile teams.**

Built for daily standups, retrospectives, and refinement sessions — without the noise of infinite whiteboards.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Yjs](https://img.shields.io/badge/Yjs-CRDT-orange)](https://yjs.dev/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

</div>

---

## Why DailyCanvas?

Most collaborative whiteboard tools grow unbounded and get chaotic over time. DailyCanvas is different:

- **Every day starts with a clean slate.** The canvas is scoped to a single day. Yesterday's clutter is gone.
- **Critical insights survive via Pinboard.** Pin any sticky note to the sidebar — it persists across days and lets you navigate back to the exact moment it was created.
- **Honest hand-drawn aesthetic.** Custom seeded-jitter SVG rendering gives every shape a rough, sketch-like feel that removes the pressure to make things look perfect — freeing teams to focus on thinking.
- **100% private and self-hosted.** Your architecture diagrams and team decisions never leave your own infrastructure.

---

## Features

### Canvas & Drawing
| Feature | Details |
|---|---|
| **Sticky Notes** | Double-click to place; drag, rotate, color-code, tag (Blocker / Todo / In Progress / Idea) |
| **Shapes** | Rectangle, Circle, Arrow (with smart edge-snapping), Diamond, Cylinder, Cloud, Queue, Freehand Path, Text |
| **Hand-drawn style** | Seeded-jitter SVG rendering — no external dependency, deterministic per shape seed |
| **Arrow connections** | Arrows snap to shape edges; endpoints update automatically when shapes are moved |
| **Resize handles** | 8-point resize for all shape types |
| **Multi-select** | Marquee selection; drag moves all selected notes + shapes together |

### Organization
| Feature | Details |
|---|---|
| **Day-based navigation** | Weekly calendar in the sidebar; navigate to any past or future day |
| **Pinboard** | Pin notes and shapes to the left sidebar for permanent reference |
| **Time travel** | Click a pinned card to navigate back to the day and canvas position it was created |
| **Author attribution** | Sticky notes display the author's display name (or "Anonymous") |

### Multiplayer
| Feature | Details |
|---|---|
| **Real-time sync** | Yjs CRDT — conflict-free, works offline, merges automatically when reconnected |
| **Live cursors** | See teammates' cursors with name labels in real time |
| **Persistent rooms** | Each team has a permanent canvas URL — data survives server restarts |
| **Presence avatars** | Header shows all currently connected participants |
| **Share button** | One-click URL copy to invite teammates |

### Admin & Multi-team
| Feature | Details |
|---|---|
| **Organization layer** | Admin creates teams; each team gets a permanent canvas URL |
| **Admin panel** | Web UI at `/admin` — create/delete teams, copy team links |
| **Team isolation** | Each team's canvas is a separate Yjs room with separate IndexedDB cache |
| **Credential config** | Admin username and password set via environment variables |

### Deployment
| Feature | Details |
|---|---|
| **Docker Compose** | Single command deployment with nginx + Node.js |
| **File storage** | Default — no database needed; data written to `./data/*.bin` |
| **PostgreSQL** | Optional — set `DATABASE_URL` and run with `--profile postgres` |
| **HTTPS-ready** | Smart WebSocket URL detection (`ws://` vs `wss://`) |

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (User)                          │
│                                                                 │
│  React + Zustand + Yjs                                          │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Canvas   │  │  Zustand     │  │   Yjs (CRDT)             │  │
│  │ (SVG)    │←→│  Store       │←→│   Y.Map<notes|shapes>    │  │
│  └──────────┘  └──────────────┘  └─────────┬────────────────┘  │
│                                            │                    │
│                              ┌─────────────┴──────────────┐    │
│                              │  IndexeddbPersistence       │    │
│                              │  (per-room local cache)     │    │
│                              └─────────────────────────────┘    │
└──────────────────────────────┬──────────────────────────────────┘
                               │ WebSocket
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Node.js Server (port 1234)                    │
│                                                                  │
│  ┌─────────────────────────┐  ┌──────────────────────────────┐  │
│  │  Yjs WebSocket Server   │  │  Admin HTTP API              │  │
│  │                         │  │  POST /admin/login           │  │
│  │  Room: Y.Doc            │  │  GET  /admin/teams           │  │
│  │  + Awareness            │  │  POST /admin/teams           │  │
│  │  + Sync Protocol        │  │  DEL  /admin/teams/:id       │  │
│  └────────────┬────────────┘  └──────────────────────────────┘  │
│               │                                                  │
│  ┌────────────┴────────────────────────────┐                    │
│  │           Storage Backend               │                    │
│  │  File (default)   │  PostgreSQL (opt.)  │                    │
│  │  data/*.bin       │  yjs_documents      │                    │
│  │  data/teams.json  │  teams              │                    │
│  └─────────────────────────────────────────┘                    │
└──────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User Action (add note, move shape, draw…)
    │
    ▼
Zustand Action (addNote, updateShape…)
    │
    ▼
Yjs Y.Map mutation  ──────────────────────────────────┐
    │                                                  │
    ▼                                                  │
yNotes.observe / yShapes.observe                       │
    │                                                  │
    ▼                                                  ▼
Zustand state update            WebSocket → Server → Other clients
    │                                                  │
    ▼                                                  ▼
React re-render                               Yjs merge (CRDT)
                                                       │
                                                       ▼
                                              Remote observer fires
                                                       │
                                                       ▼
                                              Zustand state update
                                                       │
                                                       ▼
                                              React re-render
```

### Multiplayer Sync

```
Client A                    Server                    Client B
   │                           │                           │
   │── sync step 1 ──────────► │                           │
   │◄─ sync step 2 ────────── │                           │
   │                           │◄──────────── sync step 1 ─│
   │                           │─────────────  sync step 2 ►│
   │                           │                           │
   │  [User draws a shape]     │                           │
   │── Yjs update ───────────► │── broadcast update ──────►│
   │                           │  (doc.on('update'))       │
   │                           │     + persist to disk/DB  │
   │  [Moves mouse]            │                           │
   │── awareness update ─────► │── broadcast awareness ───►│
   │                           │                           │
```

### Docker Production Architecture

```
Internet
    │  :80
    ▼
┌──────────────────────────────────────┐
│  nginx (Dockerfile.app)              │
│                                      │
│  /          → Vite static build      │
│  /ws/*      → server:1234/*          │ (WebSocket proxy, strips /ws prefix)
│  /admin*    → server:1234/admin*     │ (Admin panel + API proxy)
└──────────┬───────────────────────────┘
           │ internal network
           ▼
┌──────────────────────────────────────┐
│  Node.js server (Dockerfile.server)  │
│  port 1234 (not exposed externally)  │
│                                      │
│  Volume: server-data → /app/data     │
└──────────────────────────────────────┘
           │ (optional, --profile postgres)
           ▼
┌──────────────────────────────────────┐
│  PostgreSQL 16                       │
│  Volume: db-data                     │
└──────────────────────────────────────┘
```

### Room & Team Model

```
Organization
├── Team: "Engineering"  →  room: "engineering-a1b2c3"  →  ?team=engineering-a1b2c3
├── Team: "Marketing"    →  room: "marketing-d4e5f6"    →  ?team=marketing-d4e5f6
└── Team: "Design"       →  room: "design-g7h8i9"       →  ?team=design-g7h8i9

Ad-hoc rooms (no admin needed):           →  ?room=xyz12345  (auto-generated)

Each room:
  - Separate Yjs Y.Doc on the server
  - Separate IndexedDB store in each browser
  - Separate file (data/<roomId>.bin) or PostgreSQL row
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, TypeScript 5, Vite 6 |
| **State** | Zustand 5 (Yjs-backed for synced state) |
| **Realtime** | [Yjs](https://yjs.dev/) CRDT, y-websocket (client), y-indexeddb |
| **Animations** | Framer Motion (Motion) |
| **Icons** | Lucide React |
| **Server** | Node.js 20 (ESM), custom y-websocket server, y-protocols, lib0 |
| **Database** | File system (default) or PostgreSQL via `pg` |
| **Production** | Docker, nginx |

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm 9+

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/your-org/daily-canvas.git
cd daily-canvas

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env — at minimum set ADMIN_USERNAME and ADMIN_PASSWORD

# 4. Start the WebSocket server (Terminal 1)
npm run server

# 5. Start the Vite dev server (Terminal 2)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) for the canvas.  
Open [http://localhost:1234/admin](http://localhost:1234/admin) for the admin panel.

---

## Docker Deployment

### File storage (default — no database required)

```bash
# 1. Copy and configure environment
cp .env.example .env
```

Edit `.env`:
```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password
APP_URL=http://your-server-ip-or-domain
```

```bash
# 2. Build and start
docker compose up -d

# 3. Check logs
docker compose logs -f
```

The application is now running at **http://your-server** (port 80).

---

### With PostgreSQL (optional)

```bash
cp .env.example .env
```

Edit `.env`:
```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password
APP_URL=http://your-server-ip-or-domain
DATABASE_URL=postgres://postgres:postgres@db:5432/dailycanvas
POSTGRES_PASSWORD=your-secure-db-password
```

```bash
docker compose --profile postgres up -d
```

Tables are created automatically on first start. No manual migration needed.

---

### HTTPS with a Reverse Proxy

To add SSL (e.g. with Caddy or Traefik in front):

1. Expose port 80 internally only (remove the `ports` mapping from `app` service).
2. Point your reverse proxy to the `app` container on port 80.
3. Caddy example:
```
your-domain.com {
    reverse_proxy app:80
}
```
The app auto-detects `https:` and switches to `wss://` for WebSocket — no additional config needed.

---

## Admin Panel

Access: `http://your-host/admin`

### Initial Setup

Set admin credentials in `.env` **before** first launch:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password
```

### Creating Teams

1. Log in to the admin panel.
2. Click **+ New Team** and enter a team name (e.g. "Engineering").
3. A permanent canvas URL is generated: `http://your-host/?team=engineering-a1b2c3`
4. Click **Copy link** and share it with the team leader via Slack, Teams, or email.

### Team Leader Workflow

1. Team leader opens the permanent team URL.
2. Uses the **Share** button in the canvas header to copy the URL.
3. Shares the same URL with all team members.
4. Everyone who opens the URL joins the same real-time canvas.

---

## Environment Variables

### Server

| Variable | Default | Description |
|---|---|---|
| `PORT` | `1234` | WebSocket server port |
| `ADMIN_USERNAME` | `admin` | Admin panel username |
| `ADMIN_PASSWORD` | `changeme` | Admin panel password — **change in production** |
| `APP_URL` | `http://localhost:5173` | Frontend URL used to generate team links in admin panel |
| `DATABASE_URL` | *(unset)* | PostgreSQL connection string. If unset, file storage is used |
| `DATA_DIR` | `./data` | Directory for file-based storage (ignored when `DATABASE_URL` is set) |

### Client (Vite build-time)

| Variable | Default | Description |
|---|---|---|
| `VITE_WS_URL` | *(auto)* | WebSocket server URL. Auto-detected as `ws(s)://host/ws` in production. Set to `ws://localhost:1234` for local dev |

---

## Project Structure

```
daily-canvas/
├── src/
│   └── app/
│       ├── components/
│       │   ├── CanvasShapes.tsx     # Hand-drawn SVG shape components
│       │   ├── DrawingLayer.tsx     # SVG drawing canvas, shape logic, resize
│       │   ├── FloatingToolbar.tsx  # Bottom tool palette
│       │   ├── LiveCursors.tsx      # Real-time remote cursor rendering
│       │   └── StickyNote.tsx       # Sticky note + pinboard card components
│       ├── store/
│       │   ├── useCanvasStore.ts    # Zustand store (Yjs-backed)
│       │   └── yjsProvider.ts       # Yjs doc, WebSocket provider, IndexedDB, awareness
│       ├── clipboard.ts
│       └── App.tsx                  # Root component, canvas layout, pan/zoom
├── server/
│   ├── index.js                     # WebSocket server + Admin HTTP API
│   └── admin.js                     # Admin panel HTML (vanilla JS SPA)
├── Dockerfile.app                   # Multi-stage: Vite build → nginx
├── Dockerfile.server                # Node.js server image
├── docker-compose.yml               # Orchestration (app + server + optional db)
├── nginx.conf                       # nginx: static files + /ws + /admin proxy
├── .env.example                     # Environment variable template
└── package.json
```

---

## How it Works

### Hand-drawn Rendering

DailyCanvas uses **no external drawing library**. All shapes are rendered as SVG paths with a seeded jitter function:

```typescript
function jitter(seed: number, index: number, magnitude = 3): number {
  const x = Math.sin(seed * 31 + index) * 10000
  return (x - Math.floor(x) - 0.5) * magnitude * 2
}
```

Each shape is drawn twice (shadow pass + main pass) with slightly different jitter offsets, creating the hand-drawn double-stroke aesthetic. The seed is stored per shape, so the jitter is deterministic — the shape looks the same across all clients and page reloads.

### CRDT Sync

All canvas state lives in Yjs `Y.Map` structures:
- `ydoc.getMap<NoteData>('notes')` — sticky notes
- `ydoc.getMap<ShapeData>('shapes')` — all drawing shapes

Zustand actions write to these maps. Yjs observers fire on any change (local or remote) and update Zustand state, which triggers React re-renders. Because Yjs uses CRDT (Conflict-free Replicated Data Types), concurrent edits from multiple users are merged automatically without conflicts.

### Offline Support

`y-indexeddb` persists the Yjs document to the browser's IndexedDB. Each team/room gets its own isolated store (`daily-canvas-yjs:<roomId>`). When the WebSocket is unavailable, the app works fully offline and syncs automatically when reconnected.

### Server Persistence

The server maintains a `Y.Doc` per room in memory. Every Yjs update triggers a debounced write (500ms) to disk or PostgreSQL. On server restart, the persisted state is loaded back — clients connecting to a room always receive the full current state.

---

## Contributing

Contributions are welcome. Please open an issue before starting significant work.

```bash
# Fork and clone
git clone https://github.com/your-org/daily-canvas.git

# Install dependencies
npm install

# Run dev servers
npm run server   # Terminal 1
npm run dev      # Terminal 2

# Type check
npx tsc --noEmit
```

---

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">
Built with React, Yjs, and a seeded random number generator.
</div>
