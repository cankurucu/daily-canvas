export function getAdminHTML(appUrl) {
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DailyCanvas — Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F8FAFC;color:#0F172A;min-height:100vh}
a{color:inherit;text-decoration:none}

/* ── Login ── */
#login{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
.login-card{background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:40px;width:100%;max-width:360px;box-shadow:0 4px 24px rgba(0,0,0,.06)}
.brand{font-size:18px;font-weight:700;color:#4F46E5;display:flex;align-items:center;gap:8px;margin-bottom:28px}
.login-card h1{font-size:20px;font-weight:600;margin-bottom:24px}
.field{margin-bottom:14px}
.field label{display:block;font-size:11px;font-weight:700;color:#64748B;margin-bottom:6px;letter-spacing:.06em;text-transform:uppercase}
.field input{width:100%;padding:10px 12px;border:1.5px solid #E2E8F0;border-radius:8px;font-size:14px;outline:none;transition:border-color .15s;background:#FAFAFA}
.field input:focus{border-color:#6366F1;background:#fff}
.err{color:#DC2626;font-size:13px;margin-top:10px;min-height:18px}

/* ── Buttons ── */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s;font-family:inherit;white-space:nowrap}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn-primary{background:#1E293B;color:#fff;padding:10px 18px}
.btn-primary:hover:not(:disabled){background:#0F172A}
.btn-primary.full{width:100%;padding:11px}
.btn-secondary{background:#F1F5F9;color:#475569;padding:8px 14px;border:1px solid #E2E8F0}
.btn-secondary:hover{background:#E2E8F0;color:#1E293B}
.btn-danger{background:#FEF2F2;color:#DC2626;padding:6px 12px;border:1px solid #FECACA}
.btn-danger:hover{background:#FEE2E2}
.btn-sm{padding:7px 12px;font-size:12px}
.btn-ghost{background:transparent;color:#64748B;padding:7px 14px;border:1px solid #E2E8F0}
.btn-ghost:hover{background:#F8FAFC}

/* ── Dashboard ── */
#dash{display:none;min-height:100vh;flex-direction:column}
.topbar{height:56px;background:#fff;border-bottom:1px solid #E2E8F0;padding:0 28px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10}
.topbar-brand{font-size:15px;font-weight:700;color:#4F46E5;display:flex;align-items:center;gap:8px}
.topbar-brand .sep{color:#CBD5E1;font-weight:300;margin:0 2px}
.topbar-brand .sub{color:#64748B;font-weight:500}
.main{padding:36px 28px;max-width:960px;margin:0 auto;width:100%}
.page-header{margin-bottom:28px}
.page-title{font-size:24px;font-weight:700;letter-spacing:-.02em}
.page-sub{font-size:14px;color:#64748B;margin-top:4px}

/* ── Stats row ── */
.stats{display:flex;gap:14px;margin-bottom:28px;flex-wrap:wrap}
.stat-card{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:18px 22px;flex:1;min-width:140px}
.stat-num{font-size:28px;font-weight:700;letter-spacing:-.03em;color:#0F172A}
.stat-label{font-size:12px;color:#94A3B8;font-weight:500;margin-top:2px}

/* ── Section ── */
.section{background:#fff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden}
.section-head{padding:16px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #F1F5F9}
.section-head-left{display:flex;align-items:center;gap:10px}
.section-head h2{font-size:15px;font-weight:600}
.badge{background:#EEF2FF;color:#4F46E5;font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px}

/* ── Create form ── */
.create-form{padding:14px 20px;background:#F8FAFC;border-bottom:1px solid #E2E8F0;display:none;align-items:center;gap:10px}
.create-form input{flex:1;padding:9px 12px;border:1.5px solid #E2E8F0;border-radius:8px;font-size:14px;outline:none;background:#fff}
.create-form input:focus{border-color:#6366F1}

/* ── Team rows ── */
.empty{padding:48px 24px;text-align:center;color:#94A3B8;font-size:14px}
.team-row{padding:14px 20px;display:flex;align-items:center;gap:14px;border-bottom:1px solid #F8FAFC;transition:background .1s}
.team-row:last-child{border-bottom:none}
.team-row:hover{background:#FAFAFA}
.avatar{width:36px;height:36px;border-radius:9px;background:linear-gradient(135deg,#6366F1,#8B5CF6);color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;letter-spacing:.04em}
.team-info{flex:1;min-width:0}
.team-name{font-size:14px;font-weight:600;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.team-url{font-size:11.5px;color:#94A3B8;font-family:ui-monospace,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.team-date{font-size:12px;color:#CBD5E1;flex-shrink:0}
.copy-btn{background:#F1F5F9;border:none;border-radius:7px;padding:7px 12px;font-size:12px;font-weight:600;color:#475569;cursor:pointer;display:flex;align-items:center;gap:5px;transition:all .15s;flex-shrink:0}
.copy-btn:hover{background:#E2E8F0;color:#1E293B}
.copy-btn.ok{background:#DCFCE7;color:#15803D}
</style>
</head>
<body>

<!-- LOGIN -->
<div id="login">
  <div class="login-card">
    <div class="brand">
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none"><rect width="22" height="22" rx="7" fill="#4F46E5"/><path d="M7 11h8M11 7v8" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>
      DailyCanvas
    </div>
    <h1>Admin Panel</h1>
    <form id="login-form">
      <div class="field"><label>Username</label><input id="u" type="text" autocomplete="username" required></div>
      <div class="field"><label>Password</label><input id="p" type="password" autocomplete="current-password" required></div>
      <button class="btn btn-primary full" type="submit">Sign in</button>
    </form>
    <div class="err" id="login-err"></div>
  </div>
</div>

<!-- DASHBOARD -->
<div id="dash">
  <header class="topbar">
    <div class="topbar-brand">
      <svg width="18" height="18" viewBox="0 0 22 22" fill="none"><rect width="22" height="22" rx="7" fill="#4F46E5"/><path d="M7 11h8M11 7v8" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>
      DailyCanvas <span class="sep">/</span><span class="sub">Admin</span>
    </div>
    <button class="btn btn-ghost btn-sm" id="signout-btn">Sign out</button>
  </header>

  <div class="main">
    <div class="page-header">
      <div class="page-title">Organization</div>
      <div class="page-sub">Manage teams and share canvas links with team leaders.</div>
    </div>

    <div class="stats">
      <div class="stat-card">
        <div class="stat-num" id="stat-teams">—</div>
        <div class="stat-label">Teams</div>
      </div>
    </div>

    <div class="section">
      <div class="section-head">
        <div class="section-head-left">
          <h2>Teams</h2>
          <span class="badge" id="team-badge">0</span>
        </div>
        <button class="btn btn-primary btn-sm" id="new-team-btn">+ New Team</button>
      </div>

      <div class="create-form" id="create-form">
        <input id="team-name-input" type="text" placeholder="Team name  (e.g. Engineering, Marketing…)">
        <button class="btn btn-primary btn-sm" id="create-submit">Create</button>
        <button class="btn btn-ghost btn-sm" id="create-cancel">Cancel</button>
      </div>

      <div id="team-list"></div>
    </div>
  </div>
</div>

<script>
const APP_URL = ${JSON.stringify(appUrl)}
let token = localStorage.getItem('dc_admin_token')

// ── HTTP helper ────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  try {
    const res = await fetch(path, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      ...opts,
    })
    const data = await res.json().catch(() => ({}))
    if (res.status === 401) { doLogout(); return null }
    return { ok: res.ok, status: res.status, data }
  } catch {
    return null
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const teamURL = slug => APP_URL + '/?team=' + slug
const fmtDate = iso => new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
const initials = name => name.trim().split(/\\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase()

// ── Auth ───────────────────────────────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault()
  const errEl = document.getElementById('login-err')
  errEl.textContent = ''
  const r = await api('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username: document.getElementById('u').value, password: document.getElementById('p').value }),
  })
  if (!r) { errEl.textContent = 'Server unreachable.'; return }
  if (r.ok) {
    token = r.data.token
    localStorage.setItem('dc_admin_token', token)
    showDash()
  } else {
    errEl.textContent = 'Invalid username or password.'
  }
})

function doLogout() {
  token = null
  localStorage.removeItem('dc_admin_token')
  document.getElementById('dash').style.display = 'none'
  document.getElementById('login').style.display = 'flex'
  document.getElementById('u').value = ''
  document.getElementById('p').value = ''
}
document.getElementById('signout-btn').addEventListener('click', doLogout)

// ── Teams ──────────────────────────────────────────────────────────────────
async function loadTeams() {
  const r = await api('/admin/teams')
  if (!r || !r.ok) return
  renderTeams(r.data.teams ?? [])
}

function renderTeams(teams) {
  document.getElementById('stat-teams').textContent = teams.length
  document.getElementById('team-badge').textContent = teams.length
  const list = document.getElementById('team-list')
  if (teams.length === 0) {
    list.innerHTML = '<div class="empty">No teams yet — create your first team above.</div>'
    return
  }
  list.innerHTML = teams.map(t => \`
    <div class="team-row">
      <div class="avatar">\${esc(initials(t.name))}</div>
      <div class="team-info">
        <div class="team-name">\${esc(t.name)}</div>
        <div class="team-url">\${esc(teamURL(t.slug))}</div>
      </div>
      <div class="team-date">\${fmtDate(t.createdAt)}</div>
      <button class="copy-btn" data-slug="\${esc(t.slug)}">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="5" width="9" height="9" rx="2"/><path d="M11 5V3a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/></svg>
        Copy link
      </button>
      <button class="btn btn-danger btn-sm" data-delete="\${esc(t.id)}">✕</button>
    </div>
  \`).join('')

  list.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(teamURL(btn.dataset.slug))
      btn.textContent = '✓ Copied!'
      btn.classList.add('ok')
      setTimeout(() => {
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="5" width="9" height="9" rx="2"/><path d="M11 5V3a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/></svg> Copy link'
        btn.classList.remove('ok')
      }, 2000)
    })
  })

  list.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this team?\\n\\nThe canvas data will remain on the server.')) return
      const r = await api('/admin/teams/' + btn.dataset.delete, { method: 'DELETE' })
      if (r?.ok) loadTeams()
    })
  })
}

// ── Create team ────────────────────────────────────────────────────────────
document.getElementById('new-team-btn').addEventListener('click', () => {
  const f = document.getElementById('create-form')
  f.style.display = 'flex'
  document.getElementById('team-name-input').focus()
})
document.getElementById('create-cancel').addEventListener('click', () => {
  document.getElementById('create-form').style.display = 'none'
  document.getElementById('team-name-input').value = ''
})
document.getElementById('create-submit').addEventListener('click', createTeam)
document.getElementById('team-name-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') createTeam()
  if (e.key === 'Escape') document.getElementById('create-cancel').click()
})

async function createTeam() {
  const input = document.getElementById('team-name-input')
  const name = input.value.trim()
  if (!name) { input.focus(); return }
  const btn = document.getElementById('create-submit')
  btn.disabled = true
  const r = await api('/admin/teams', { method: 'POST', body: JSON.stringify({ name }) })
  btn.disabled = false
  if (r?.ok) {
    document.getElementById('create-form').style.display = 'none'
    input.value = ''
    loadTeams()
  }
}

// ── Init ───────────────────────────────────────────────────────────────────
function showDash() {
  document.getElementById('login').style.display = 'none'
  document.getElementById('dash').style.display = 'flex'
  loadTeams()
}

if (token) showDash()
</script>
</body>
</html>`
}
