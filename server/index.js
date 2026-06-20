/**
 * daily-canvas WebSocket + Admin server
 *
 * Env vars:
 *   PORT              WebSocket / HTTP port           (default: 1234)
 *   ADMIN_USERNAME    Admin login username            (default: admin)
 *   ADMIN_PASSWORD    Admin login password            (default: changeme)
 *   APP_URL           Frontend URL for team links     (default: http://localhost:5173)
 *   DATABASE_URL      PostgreSQL connection string    (omit → file storage)
 *   DATA_DIR          File storage directory          (default: ./data)
 */

import 'dotenv/config'
import http        from 'http'
import fs          from 'fs'
import path        from 'path'
import { randomBytes, timingSafeEqual } from 'crypto'
import { WebSocketServer } from 'ws'
import * as Y                 from 'yjs'
import * as syncProtocol      from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding          from 'lib0/encoding'
import * as decoding          from 'lib0/decoding'
import { getAdminHTML }       from './admin.js'

const PORT           = Number(process.env.PORT ?? 1234)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'changeme'
const APP_URL        = (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const WS_MAX_PAYLOAD = Number(process.env.WS_MAX_PAYLOAD ?? 50 * 1024 * 1024) // 50MB cap → bounds memory per message

// ── Security guard: refuse to run with a well-known default password in prod ──
const WEAK_PASSWORDS = new Set(['changeme', 'admin', 'password', ''])
if (WEAK_PASSWORDS.has(ADMIN_PASSWORD)) {
  const msg = 'ADMIN_PASSWORD is a well-known default — set a strong value via the ADMIN_PASSWORD env var.'
  if (process.env.NODE_ENV === 'production') {
    console.error(`[security] ${msg} Refusing to start in production.`)
    process.exit(1)
  }
  console.warn(`⚠  [security] ${msg}`)
}

const MSG_SYNC      = 0
const MSG_AWARENESS = 1
const MSG_QUERY_AWR = 3

// ─── Storage ─────────────────────────────────────────────────────────────────

async function createStorage() {
  if (process.env.DATABASE_URL) {
    const pg   = await import('pg')
    const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL })
    await pool.query('SELECT 1')

    await pool.query(`
      CREATE TABLE IF NOT EXISTS yjs_documents (
        name       TEXT PRIMARY KEY,
        data       BYTEA       NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        slug       TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    console.log('[storage] PostgreSQL →', process.env.DATABASE_URL.replace(/:\/\/.*@/, '://***@'))

    return {
      // ── Yjs docs ──
      async load(name) {
        const r = await pool.query('SELECT data FROM yjs_documents WHERE name=$1', [name])
        return r.rows[0]?.data ?? null
      },
      async save(name, data) {
        await pool.query(
          `INSERT INTO yjs_documents(name,data,updated_at) VALUES($1,$2,NOW())
           ON CONFLICT(name) DO UPDATE SET data=$2, updated_at=NOW()`,
          [name, Buffer.from(data)]
        )
      },
      // ── Teams ──
      async loadTeams() {
        const r = await pool.query('SELECT id, name, slug, created_at AS "createdAt" FROM teams ORDER BY created_at')
        return r.rows
      },
      async saveTeam(team) {
        await pool.query(
          'INSERT INTO teams(id,name,slug,created_at) VALUES($1,$2,$3,$4)',
          [team.id, team.name, team.slug, team.createdAt]
        )
      },
      async deleteTeam(id) {
        await pool.query('DELETE FROM teams WHERE id=$1', [id])
      },
    }
  }

  // ── File storage ──
  const DATA_DIR = process.env.DATA_DIR ?? './data'
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const teamsFile = path.join(DATA_DIR, 'teams.json')
  const docFile   = n => path.join(DATA_DIR, n.replace(/[^a-zA-Z0-9_-]/g, '_') + '.bin')

  console.log('[storage] Files →', path.resolve(DATA_DIR))

  const timers = new Map()

  return {
    async load(name) {
      const f = docFile(name)
      return fs.existsSync(f) ? fs.readFileSync(f) : null
    },
    save(name, data) {
      if (timers.has(name)) clearTimeout(timers.get(name))
      timers.set(name, setTimeout(() => {
        timers.delete(name)
        const f = docFile(name)
        try { fs.writeFileSync(f + '.tmp', data); fs.renameSync(f + '.tmp', f) }
        catch (e) { console.error('[storage] write error:', e.message) }
      }, 500))
    },
    async loadTeams() {
      try { return JSON.parse(fs.readFileSync(teamsFile, 'utf8')) } catch { return [] }
    },
    async saveTeam(team) {
      const teams = await this.loadTeams()
      teams.push(team)
      fs.writeFileSync(teamsFile, JSON.stringify(teams, null, 2))
    },
    async deleteTeam(id) {
      const teams = await this.loadTeams()
      fs.writeFileSync(teamsFile, JSON.stringify(teams.filter(t => t.id !== id), null, 2))
    },
  }
}

// ─── Sessions ────────────────────────────────────────────────────────────────

const sessions = new Map() // token → expiresAt

function createSession() {
  const token = randomBytes(32).toString('hex')
  sessions.set(token, Date.now() + 8 * 60 * 60 * 1000) // 8 hours
  return token
}

function validSession(token) {
  if (!token) return false
  const exp = sessions.get(token)
  if (!exp) return false
  if (Date.now() > exp) { sessions.delete(token); return false }
  return true
}

function bearerToken(req) {
  const h = req.headers.authorization ?? ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}

// Constant-time string comparison — avoids leaking credential length/content via timing.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ba.length !== bb.length) { timingSafeEqual(ba, ba); return false }
  return timingSafeEqual(ba, bb)
}

// ─── Login brute-force protection ──────────────────────────────────────────────

const MAX_ATTEMPTS = 5
const WINDOW_MS    = 15 * 60 * 1000
const BLOCK_MS     = 15 * 60 * 1000
const loginAttempts = new Map() // ip → { count, resetAt, blockedUntil }

function clientIP(req) {
  const xff = req.headers['x-forwarded-for']
  if (xff) return String(xff).split(',')[0].trim()
  return req.socket?.remoteAddress ?? 'unknown'
}

function loginBlocked(ip) {
  const rec = loginAttempts.get(ip)
  return !!(rec?.blockedUntil && Date.now() < rec.blockedUntil)
}

function recordLoginFailure(ip) {
  const now = Date.now()
  let rec = loginAttempts.get(ip)
  if (!rec || now > rec.resetAt) rec = { count: 0, resetAt: now + WINDOW_MS, blockedUntil: 0 }
  rec.count++
  if (rec.count >= MAX_ATTEMPTS) rec.blockedUntil = now + BLOCK_MS
  loginAttempts.set(ip, rec)
}

// Periodic sweep so sessions / attempt records don't grow unbounded.
setInterval(() => {
  const now = Date.now()
  for (const [t, exp] of sessions) if (now > exp) sessions.delete(t)
  for (const [ip, rec] of loginAttempts) {
    if (now > rec.resetAt && (!rec.blockedUntil || now > rec.blockedUntil)) loginAttempts.delete(ip)
  }
}, 60 * 60 * 1000).unref()

// ─── Slug generation ─────────────────────────────────────────────────────────

function slugify(name) {
  const base = name.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'team'
  const suffix = randomBytes(3).toString('hex')   // 6 hex chars
  return `${base}-${suffix}`
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = ''
    req.on('data', c => { buf += c; if (buf.length > 1e6) reject(new Error('too large')) })
    req.on('end', () => resolve(buf))
    req.on('error', reject)
  })
}

function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) })
  res.end(payload)
}

// ─── HTTP router ──────────────────────────────────────────────────────────────

async function handleHTTP(req, res, storage) {
  const url    = new URL(req.url, `http://localhost`)
  const method = req.method.toUpperCase()

  // ── Admin panel UI ────────────────────────────────────────────
  if (url.pathname === '/admin' && method === 'GET') {
    const html = getAdminHTML(APP_URL)
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
    return
  }

  // ── Login ─────────────────────────────────────────────────────
  if (url.pathname === '/admin/login' && method === 'POST') {
    const ip = clientIP(req)
    if (loginBlocked(ip)) { json(res, 429, { error: 'too many attempts, try again later' }); return }
    let body
    try { body = JSON.parse(await readBody(req)) } catch { json(res, 400, { error: 'bad request' }); return }
    const ok = safeEqual(body.username ?? '', ADMIN_USERNAME) & safeEqual(body.password ?? '', ADMIN_PASSWORD)
    if (ok) {
      loginAttempts.delete(ip)
      json(res, 200, { token: createSession() })
    } else {
      recordLoginFailure(ip)
      json(res, 401, { error: 'invalid credentials' })
    }
    return
  }

  // ── Require auth for all /admin/teams routes ──────────────────
  if (url.pathname.startsWith('/admin/teams')) {
    if (!validSession(bearerToken(req))) { json(res, 401, { error: 'unauthorized' }); return }

    // GET /admin/teams
    if (url.pathname === '/admin/teams' && method === 'GET') {
      json(res, 200, { teams: await storage.loadTeams() })
      return
    }

    // POST /admin/teams  { name }
    if (url.pathname === '/admin/teams' && method === 'POST') {
      let body
      try { body = JSON.parse(await readBody(req)) } catch { json(res, 400, { error: 'bad request' }); return }
      if (!body.name?.trim()) { json(res, 422, { error: 'name is required' }); return }
      const team = {
        id:        randomBytes(8).toString('hex'),
        name:      body.name.trim(),
        slug:      slugify(body.name.trim()),
        createdAt: new Date().toISOString(),
      }
      await storage.saveTeam(team)
      json(res, 201, { team })
      return
    }

    // DELETE /admin/teams/:id
    const deleteMatch = url.pathname.match(/^\/admin\/teams\/([^/]+)$/)
    if (deleteMatch && method === 'DELETE') {
      await storage.deleteTeam(deleteMatch[1])
      json(res, 200, { ok: true })
      return
    }
  }

  // ── Default ───────────────────────────────────────────────────
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('y-websocket')
}

// ─── Yjs rooms ───────────────────────────────────────────────────────────────

const rooms = new Map()

function createRoom(name, storage) {
  const doc       = new Y.Doc({ gc: true })
  const awareness = new awarenessProtocol.Awareness(doc)
  const conns     = new Set()

  doc.on('update', (update, origin) => {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MSG_SYNC)
    syncProtocol.writeUpdate(encoder, update)
    const msg = encoding.toUint8Array(encoder)
    conns.forEach(c => { if (c !== origin && c.readyState === 1) c.send(msg) })
    storage.save(name, Y.encodeStateAsUpdate(doc))
  })

  awareness.on('update', ({ added, updated, removed }) => {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MSG_AWARENESS)
    encoding.writeVarUint8Array(encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed])
    )
    const msg = encoding.toUint8Array(encoder)
    conns.forEach(c => { if (c.readyState === 1) c.send(msg) })
  })

  return { doc, awareness, conns }
}

async function getRoom(name, storage) {
  if (rooms.has(name)) return rooms.get(name)
  const room  = createRoom(name, storage)
  const saved = await storage.load(name)
  if (saved) { Y.applyUpdate(room.doc, saved); console.log(`[room] ${name} loaded ${saved.length}B`) }
  rooms.set(name, room)
  return room
}

function onMessage(conn, room, data) {
  const { doc, awareness } = room
  const decoder   = decoding.createDecoder(new Uint8Array(data))
  const msgType   = decoding.readVarUint(decoder)

  if (msgType === MSG_SYNC) {
    const encoder     = encoding.createEncoder()
    encoding.writeVarUint(encoder, MSG_SYNC)
    const syncMsgType = syncProtocol.readSyncMessage(decoder, encoder, doc, conn)
    if (syncMsgType === syncProtocol.messageYjsSyncStep1) {
      const reply = encoding.toUint8Array(encoder)
      if (reply.length > 1) conn.send(reply)
    }
  } else if (msgType === MSG_AWARENESS) {
    awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), conn)
  } else if (msgType === MSG_QUERY_AWR) {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MSG_AWARENESS)
    encoding.writeVarUint8Array(encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awareness.getStates().keys()))
    )
    conn.send(encoding.toUint8Array(encoder))
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

const storage = await createStorage()

const server = http.createServer((req, res) => handleHTTP(req, res, storage).catch(err => {
  console.error('[http]', err.message)
  res.writeHead(500); res.end('Internal error')
}))

const wss = new WebSocketServer({ server, maxPayload: WS_MAX_PAYLOAD })

wss.on('connection', async (conn, req) => {
  const roomName = decodeURIComponent((req.url ?? '/').slice(1).split('?')[0]) || 'default'
  const room     = await getRoom(roomName, storage)
  room.conns.add(conn)
  console.log(`[+] ${roomName} (${room.conns.size} online)`)

  const syncEnc = encoding.createEncoder()
  encoding.writeVarUint(syncEnc, MSG_SYNC)
  syncProtocol.writeSyncStep1(syncEnc, room.doc)
  conn.send(encoding.toUint8Array(syncEnc))

  const states = room.awareness.getStates()
  if (states.size > 0) {
    const aEnc = encoding.createEncoder()
    encoding.writeVarUint(aEnc, MSG_AWARENESS)
    encoding.writeVarUint8Array(aEnc, awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(states.keys())))
    conn.send(encoding.toUint8Array(aEnc))
  }

  conn.on('message', data => onMessage(conn, room, data))
  conn.on('close', () => {
    room.conns.delete(conn)
    awarenessProtocol.removeAwarenessStates(room.awareness, [room.doc.clientID], null)
    console.log(`[-] ${roomName} (${room.conns.size} online)`)
    if (room.conns.size === 0) rooms.delete(roomName)
  })
  conn.on('error', err => console.error('[ws]', err.message))
})

server.listen(PORT, () => {
  console.log(`y-websocket  → ws://localhost:${PORT}`)
  console.log(`admin panel  → http://localhost:${PORT}/admin`)
})
