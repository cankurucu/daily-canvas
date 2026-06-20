import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { IndexeddbPersistence } from 'y-indexeddb'
import type { NoteData, ShapeData } from './useCanvasStore'

// Room resolution priority:
//   1. ?team=<slug>  — admin-created permanent team room
//   2. ?room=<id>    — ad-hoc room (auto-generated on first visit)
// MUST run before creating IDB/WS providers so every room gets its own key.
function resolveRoom(): string {
  const params = new URLSearchParams(window.location.search)

  const team = params.get('team')
  if (team) return team

  let room = params.get('room')
  if (!room) {
    room = Math.random().toString(36).slice(2, 10)
    const url = new URL(window.location.href)
    url.searchParams.set('room', room)
    window.history.replaceState({}, '', url.toString())
  }
  return room
}

const ROOM = resolveRoom()

export const ydoc   = new Y.Doc()
export const yNotes = ydoc.getMap<NoteData>('notes')
export const yShapes = ydoc.getMap<ShapeData>('shapes')

// Each room gets its own IndexedDB store — prevents cross-team data leakage
export const idbProvider = new IndexeddbPersistence(`daily-canvas-yjs:${ROOM}`, ydoc)

// Smart WS URL default:
//   - Local dev:  set VITE_WS_URL=ws://localhost:1234 in .env  (Vite reads it at build time)
//   - Docker:     unset → auto-resolves to ws(s)://<host>/ws   (nginx proxies /ws/ → server)
const WS_URL = (import.meta.env.VITE_WS_URL as string | undefined)
  ?? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`

export const wsProvider = new WebsocketProvider(WS_URL, ROOM, ydoc, {
  connect: true,
  maxBackoffTime: 5000,
})

export const awareness = wsProvider.awareness

// Groups rapid successive changes into single undo steps (500 ms window)
export const undoManager = new Y.UndoManager([yNotes, yShapes], {
  captureTimeout: 500,
})

export type UserPresence = {
  user: { name: string; color: string }
  cursor: { x: number; y: number } | null
}

// Deterministic color per session, consistent across reconnects within session
const COLORS = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4']
export function clientColor(): string {
  return COLORS[ydoc.clientID % COLORS.length]
}

// ─── Date helpers (duplicated here to avoid circular import with store) ─────

function toDateStr(d: Date): string {
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function dateOffset(base: Date, days: number): string {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

function makeInitialNotes(): NoteData[] {
  const now = new Date()
  return [
    { id: 'n1', x: 80,  y: 60,  color: '#BBFAD4', text: 'Review auth flow for new onboarding — users dropping at step 3',  author: 'Sofia R.',  rotate: -1.5, pinned: true,  tag: 'Blocker',     date: toDateStr(now) },
    { id: 'n2', x: 285, y: 44,  color: '#FEF3A0', text: 'Ship dashboard redesign to staging by EOD',                        author: 'Marcus T.', rotate:  1.2, pinned: false, tag: 'In Progress', date: toDateStr(now) },
    { id: 'n3', x: 496, y: 68,  color: '#BAE6FD', text: 'Sync with design on new component tokens. Check Figma link.',     author: 'Priya K.',  rotate: -0.8, pinned: true,  tag: 'Todo',        date: toDateStr(now) },
    { id: 'n4', x: 706, y: 50,  color: '#FBCFE8', text: 'Post sprint retro summary to Slack before standup',               author: 'Jordan L.', rotate:  1.8, pinned: false, tag: 'Todo',        date: toDateStr(now) },
    { id: 'n5', x: 130, y: 290, color: '#E9D5FF', text: 'Idea: replace pagination with infinite scroll — run A/B test',    author: 'Sofia R.',  rotate: -2,   pinned: false, tag: 'Idea',        date: toDateStr(now) },
    { id: 'n6', x: 560, y: 316, color: '#FEF3A0', text: 'API latency up 40ms — dig into DB query plan for /users/feed',    author: 'Marcus T.', rotate:  1.1, pinned: false, tag: 'Blocker',     date: toDateStr(now) },
    { id: 'n7', x: 200, y: 130, color: '#BAE6FD', text: 'Write changelog for v2.4.1 — include dark mode fixes',            author: 'Priya K.',  rotate: -1,   pinned: true,                      date: dateOffset(now, -1) },
    { id: 'n8', x: 60,  y: 80,  color: '#BBFAD4', text: 'Kick off Q3 OKR planning session. Invite whole team.',            author: 'Jordan L.', rotate:  0.5, pinned: false,                     date: dateOffset(now, 1) },
    { id: 'n9', x: 280, y: 100, color: '#FBCFE8', text: 'Define acceptance criteria for the new notification system',      author: 'Sofia R.',  rotate: -1.2, pinned: false,                     date: dateOffset(now, 1) },
  ]
}

// ─── Seed data on first ever load ────────────────────────────────────────────

idbProvider.on('synced', () => {
  if (yNotes.size > 0 || yShapes.size > 0) return

  // Migrate existing Zustand localStorage data if present
  try {
    const raw = localStorage.getItem('daily-canvas-v1')
    if (raw) {
      const parsed = JSON.parse(raw)
      const { notes = [], shapes = [] } = (parsed?.state ?? {}) as { notes: NoteData[]; shapes: ShapeData[] }
      if (notes.length > 0 || shapes.length > 0) {
        ydoc.transact(() => {
          for (const n of notes) yNotes.set(n.id, n)
          for (const s of shapes) yShapes.set(s.id, s)
        })
        return
      }
    }
  } catch { /* ignore */ }

  // Fresh install — populate demo notes
  ydoc.transact(() => {
    for (const n of makeInitialNotes()) yNotes.set(n.id, n)
  })
})
