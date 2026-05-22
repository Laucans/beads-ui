import express from 'express'
import cors from 'cors'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const app = express()
const PORT = 3001
const DOLT_DATA_DIR = process.env.DOLT_DATA_DIR || `${process.env.HOME}/gastown/.dolt-data`
const SSE_POLL_INTERVAL = parseInt(process.env.SSE_POLL_INTERVAL || '2000', 10)

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

    const result = beads.map(b => ({
      id: b.id,
      title: b.title,
      description: b.description,
      status: b.status,
      polecat_id: b.assignee || null,
      convoy_id: convoyMap[b.id] || null,
      parent_id: parentMap[b.id] || null
    }))

    res.json(result)
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

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})
