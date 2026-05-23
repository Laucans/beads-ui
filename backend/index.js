import express from 'express'
import cors from 'cors'
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { createReadStream, statSync } from 'fs'
import { watch } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const execFileAsync = promisify(execFile)
const app = express()
const PORT = 3001
const DOLT_DATA_DIR = process.env.DOLT_DATA_DIR || `${process.env.HOME}/gastown/.dolt-data`
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const SSE_POLL_INTERVAL = parseInt(process.env.SSE_POLL_INTERVAL || '2000', 10)
const GT_HOME = process.env.GT_HOME || `${process.env.HOME}/gastown`
const LOG_FILES = {
  town: `${GT_HOME}/logs/town.log`,
  daemon: `${GT_HOME}/daemon/daemon.log`,
}

app.use(cors())
app.use(express.json())

// SSE clients: id -> res
const sseClients = new Map()
let sseClientId = 0
// Last known bead statuses: id -> status
let beadSnapshot = new Map()

function sendSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function broadcast(event, data) {
  for (const res of sseClients.values()) sendSSE(res, event, data)
}

async function pollBeads() {
  try {
    const rows = await doltQuery(
      'beads_ui',
      "SELECT id, status FROM issues WHERE issue_type NOT IN ('molecule', 'rig')"
    )
    const current = new Map(rows.map(r => [r.id, r.status]))
    const changes = []
    for (const [id, status] of current) {
      const prev = beadSnapshot.get(id)
      if (prev !== undefined && prev !== status) changes.push({ id, status, prev_status: prev })
      else if (prev === undefined) changes.push({ id, status, prev_status: null })
    }
    if (changes.length > 0) broadcast('bead-update', { changes, timestamp: new Date().toISOString() })
    beadSnapshot = current
  } catch (err) {
    console.error('[sse] poll error:', err.message)
  }
}

pollBeads()
setInterval(pollBeads, SSE_POLL_INTERVAL)

async function doltQuery(database, sql) {
  const fullSql = `USE ${database}; ${sql}`
  try {
    const { stdout, stderr } = await execFileAsync('dolt', [
      `--data-dir=${DOLT_DATA_DIR}`,
      'sql',
      '-q', fullSql,
      '-r', 'json'
    ])
    if (stderr) console.warn(`[dolt warn] ${database}: ${stderr}`)
    const trimmed = stdout.trim()
    if (!trimmed) return []
    const parsed = JSON.parse(trimmed)
    return parsed.rows || []
  } catch (err) {
    const msg = err.stderr || err.message || String(err)
    throw Object.assign(new Error(`dolt query failed: ${msg}`), { stderr: msg })
  }
}

async function runPs() {
  try {
    const { stdout } = await execFileAsync('ps', ['aux'])
    return stdout
  } catch {
    return ''
  }
}

app.get('/api/convoys', async (_req, res) => {
  try {
    const rows = await doltQuery(
      'hq',
      "SELECT id, title, status, created_at FROM issues WHERE issue_type = 'convoy' ORDER BY created_at DESC"
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message, stderr: err.stderr || null })
  }
})

app.get('/api/beads', async (_req, res) => {
  try {
    const [beads, deps, convoyDeps] = await Promise.all([
      doltQuery(
        'beads_ui',
        "SELECT id, title, description, status, assignee FROM issues WHERE issue_type NOT IN ('molecule', 'rig') ORDER BY created_at DESC"
      ),
      doltQuery(
        'beads_ui',
        "SELECT issue_id, depends_on_id FROM dependencies WHERE type = 'blocks'"
      ),
      doltQuery(
        'hq',
        "SELECT issue_id, depends_on_id FROM dependencies WHERE type = 'tracks'"
      )
    ])

    // parent_id: first non-wisp dependency for each bead
    const parentMap = {}
    for (const dep of deps) {
      if (!parentMap[dep.issue_id] && !dep.depends_on_id.includes('wisp')) {
        parentMap[dep.issue_id] = dep.depends_on_id
      }
    }

    // convoy_id: hq tracks beads via "external:bu:<id>"
    const convoyMap = {}
    for (const dep of convoyDeps) {
      const beadId = dep.depends_on_id.replace(/^external:[^:]+:/, '')
      if (!convoyMap[beadId]) convoyMap[beadId] = dep.issue_id
    }

    const beadList = beads.map(b => ({
      id: b.id,
      title: b.title,
      description: b.description,
      status: b.status,
      polecat_id: b.assignee || null,
      convoy_id: convoyMap[b.id] || null,
      parent_id: parentMap[b.id] || null
    }))

    const beadIdSet = new Set(beadList.map(b => b.id))
    const depEdges = deps
      .filter(d => beadIdSet.has(d.issue_id) && beadIdSet.has(d.depends_on_id))
      .map(d => ({ from: d.depends_on_id, to: d.issue_id }))

    res.json({ beads: beadList, deps: depEdges })
  } catch (err) {
    res.status(500).json({ error: err.message, stderr: err.stderr || null })
  }
})

app.get('/api/wisps', async (_req, res) => {
  try {
    const [dbWisps, psOutput] = await Promise.all([
      doltQuery(
        'beads_ui',
        "SELECT id, title, status, wisp_type, assignee FROM wisps ORDER BY created_at DESC"
      ),
      runPs()
    ])

    const processes = psOutput
      .split('\n')
      .slice(1)
      .filter(line => /wisp|polecat/i.test(line))
      .map(line => {
        const parts = line.trim().split(/\s+/)
        return {
          user: parts[0] || null,
          pid: parts[1] ? parseInt(parts[1], 10) : null,
          cpu: parts[2] || null,
          mem: parts[3] || null,
          command: parts.slice(10).join(' ') || null
        }
      })

    res.json({ db: dbWisps, processes })
  } catch (err) {
    res.status(500).json({ error: err.message, stderr: err.stderr || null })
  }
})

function parseDoctorOutput(stdout) {
  const lines = stdout.split('\n')
  const checks = []
  let summary = { passed: 0, warnings: 0, failed: 0 }

  for (const line of lines) {
    const m = line.match(/^\s+○\s+(\S+?)\.\.\.\s+([✓⚠✖])\s+(.+)/)
    if (m) {
      const [, id, sym, raw] = m
      const severity = sym === '✓' ? 'ok' : sym === '⚠' ? 'warning' : 'critical'
      const message = raw.startsWith(id) ? raw.slice(id.length).trim() : raw.trim()
      checks.push({ id, severity, message, detail: null })
      continue
    }
    const notice = line.match(/^\s+○\s+(\S+?)\.\.\.notice:\s*(.+)/)
    if (notice) {
      checks.push({ id: notice[1], severity: 'info', message: notice[2].trim(), detail: null })
      continue
    }
    const sum = line.match(/✓\s+(\d+) passed.*?⚠\s+(\d+) warning.*?✖\s+(\d+) failed/)
    if (sum) {
      summary = { passed: +sum[1], warnings: +sum[2], failed: +sum[3] }
      continue
    }
    const detail = line.match(/└[─-]\s+(.+)/)
    if (detail && checks.length > 0) {
      const last = checks[checks.length - 1]
      last.detail = last.detail ? `${last.detail} ${detail[1].trim()}` : detail[1].trim()
    }
  }

  return { checks, summary }
}

app.get('/api/doctor', async (_req, res) => {
  try {
    const { stdout, stderr } = await execFileAsync('gt', ['doctor'], { timeout: 60000 })
    const combined = stdout + (stderr || '')
    const { checks, summary } = parseDoctorOutput(combined)
    res.json({ checks, summary, timestamp: new Date().toISOString() })
  } catch (err) {
    const combined = (err.stdout || '') + (err.stderr || '')
    if (combined.length > 0) {
      const { checks, summary } = parseDoctorOutput(combined)
      res.json({ checks, summary, timestamp: new Date().toISOString() })
    } else {
      res.status(500).json({ error: err.message })
    }
  }
})

app.post('/api/doctor/fix', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const child = spawn('gt', ['doctor', '--fix', '--no-start'], { shell: false })
  const send = (type, text) => res.write(`data: ${JSON.stringify({ type, text })}\n\n`)

  child.stdout.on('data', d => send('output', d.toString()))
  child.stderr.on('data', d => send('output', d.toString()))
  child.on('close', code => { send('done', String(code)); res.end() })
  child.on('error', err => { send('error', err.message); res.end() })
  req.on('close', () => child.kill())
})

app.post('/api/wisps/burn', (req, res) => {
  const { pid } = req.body
  if (!pid || typeof pid !== 'number') {
    return res.status(400).json({ error: 'numeric pid required' })
  }
  try {
    process.kill(pid, 'SIGKILL')
    res.json({ ok: true, pid })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/deps', async (_req, res) => {
  try {
    const deps = await doltQuery(
      'beads_ui',
      "SELECT issue_id, depends_on_id FROM dependencies WHERE type = 'blocks' AND issue_id NOT LIKE '%wisp%' AND depends_on_id NOT LIKE '%wisp%'"
    )
    res.json(deps)
  } catch (err) {
    res.status(500).json({ error: err.message, stderr: err.stderr || null })
  }
})

app.get('/api/bead/:id/commits', async (req, res) => {
  const { id } = req.params
  try {
    const { stdout } = await execFileAsync('git', [
      '-C', REPO_ROOT,
      'log', '--oneline', '--all', `--grep=${id}`, '-10'
    ])
    const commits = stdout.trim().split('\n').filter(Boolean).map(line => {
      const sp = line.indexOf(' ')
      return { hash: line.slice(0, sp), message: line.slice(sp + 1) }
    })
    res.json(commits)
  } catch {
    res.json([])
  }
})

app.get('/api/status', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('/api/health', (_req, res) => {
  res.json({ healthy: true })
})

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const id = ++sseClientId
  sseClients.set(id, res)
  sendSSE(res, 'connected', { clientId: id, pollInterval: SSE_POLL_INTERVAL, timestamp: new Date().toISOString() })

  req.on('close', () => sseClients.delete(id))
})

app.get('/api/mq', async (_req, res) => {
  try {
    const { stdout } = await execFileAsync('gt', ['mq', 'list', 'beads_ui', '--json'], {
      env: { ...process.env, HOME: process.env.HOME },
    })
    const trimmed = stdout.trim()
    const entries = (trimmed && trimmed !== 'null') ? JSON.parse(trimmed) : []

    // Augment with polecat branch info from git
    let branches = []
    try {
      const { stdout: brOut } = await execFileAsync('git', ['branch', '--list', 'polecat/*'], {
        cwd: GT_HOME,
      })
      branches = brOut.split('\n')
        .map(b => b.replace(/^\s*[+*]?\s*/, '').trim())
        .filter(Boolean)
        .map(name => {
          const m = name.match(/polecat\/([^/]+)\/([^@]+)(@.*)?$/)
          return m ? { branch: name, polecat: m[1], bead_id: m[2], session: m[3] || '' } : { branch: name, polecat: null, bead_id: null, session: '' }
        })
    } catch {
      // git not available in GT_HOME context — skip
    }

    res.json({ queue: entries || [], branches })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// SSE: stream lines from log files in real-time
const logSseClients = new Set()

function broadcastLog(source, line) {
  const msg = JSON.stringify({ source, line, ts: new Date().toISOString() })
  for (const r of logSseClients) r.write(`data: ${msg}\n\n`)
}

function tailLogFile(source, filepath) {
  let fileSize = 0
  try { fileSize = statSync(filepath).size } catch { return }

  // Stream last 80 lines at startup via tail, then watch for appends
  const tailProc = spawn('tail', ['-n', '80', filepath])
  tailProc.stdout.on('data', (chunk) => {
    const lines = chunk.toString().split('\n').filter(Boolean)
    for (const l of lines) broadcastLog(source, l)
  })
  tailProc.on('close', () => {
    // After initial tail, watch for new bytes
    try { fileSize = statSync(filepath).size } catch { fileSize = 0 }
    watch(filepath, { persistent: false }, () => {
      let newSize = 0
      try { newSize = statSync(filepath).size } catch { return }
      if (newSize <= fileSize) return
      const stream = createReadStream(filepath, { start: fileSize, end: newSize - 1 })
      let buf = ''
      stream.on('data', (chunk) => { buf += chunk.toString() })
      stream.on('end', () => {
        fileSize = newSize
        const lines = buf.split('\n').filter(Boolean)
        for (const l of lines) broadcastLog(source, l)
      })
    })
  })
}

// Start tailing logs at startup
for (const [source, filepath] of Object.entries(LOG_FILES)) {
  tailLogFile(source, filepath)
}

app.get('/api/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  logSseClients.add(res)
  res.write(`data: ${JSON.stringify({ source: 'system', line: '[log stream connected]', ts: new Date().toISOString() })}\n\n`)

  req.on('close', () => logSseClients.delete(res))
})

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})
