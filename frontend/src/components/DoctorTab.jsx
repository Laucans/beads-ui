import { useCallback, useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'

const API_BASE = 'http://localhost:3001'

const FRIENDLY = {
  'patrol-not-stuck':          'Patrol wisp bloqué',
  'stalled-polecats':          'Polecats bloqués',
  'orphan-processes':          'Processus orphelins',
  'orphan-sessions':           'Sessions tmux orphelines',
  'wisp-gc':                   'Wisps abandonnés',
  'misclassified-wisps':       'Wisps mal classifiés',
  'dolt-server-reachable':     'Serveur Dolt inaccessible',
  'dolt-orphaned-databases':   'Bases de données orphelines',
  'clone-divergence':          'Clones divergents',
  'daemon':                    'Daemon Gas Town',
  'disk-space':                'Espace disque',
  'stale-binary':              'Binaire gt obsolète',
  'unregistered-beads-dirs':   'Répertoires beads non enregistrés',
  'jsonl-bloat':               'Fichier issues.jsonl surchargé',
}

const SEVERITY_META = {
  ok:       { color: '#00ff88', icon: '✓', label: 'OK' },
  warning:  { color: '#ffd700', icon: '⚠', label: 'Warning' },
  critical: { color: '#ff4444', icon: '✖', label: 'Critical' },
  info:     { color: '#00d4ff', icon: 'ℹ', label: 'Info' },
}

const WISP_CHECKS = new Set(['patrol-not-stuck', 'wisp-gc', 'misclassified-wisps'])

function HealthBadge({ summary }) {
  if (!summary) return null
  const { failed, warnings } = summary
  const [color, label, glow] =
    failed > 0   ? ['#ff4444', `${failed} CRITICAL`, '0 0 12px rgba(255,68,68,0.6)'] :
    warnings > 0 ? ['#ffd700', `${warnings} WARN`,   '0 0 12px rgba(255,215,0,0.5)'] :
                   ['#00ff88', 'HEALTHY',             '0 0 12px rgba(0,255,136,0.4)']

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '6px 16px', borderRadius: 4,
      border: `1px solid ${color}`, color,
      fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold',
      boxShadow: glow, letterSpacing: '0.08em',
    }}>
      <span style={{ fontSize: 16 }}>{failed > 0 ? '✖' : warnings > 0 ? '⚠' : '✓'}</span>
      {label}
      <span style={{ color: '#606060', fontSize: 11, fontWeight: 'normal' }}>
        · {summary.passed} passed
      </span>
    </div>
  )
}
HealthBadge.propTypes = { summary: PropTypes.object }

function CheckCard({ check, wisps, onBurn }) {
  const [open, setOpen] = useState(false)
  const meta = SEVERITY_META[check.severity] || SEVERITY_META.info
  const friendly = FRIENDLY[check.id] || check.id
  const isWisp = WISP_CHECKS.has(check.id)

  const stuckWisps = isWisp
    ? (wisps?.processes || []).filter(p => /wisp|patrol/i.test(p.command || ''))
    : []

  return (
    <div style={{
      border: `1px solid ${meta.color}22`,
      borderLeft: `3px solid ${meta.color}`,
      borderRadius: 4, marginBottom: 6,
      background: '#0f0f1a', overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left', fontFamily: 'monospace',
        }}
      >
        <span style={{ color: meta.color, fontSize: 14, flexShrink: 0 }}>{meta.icon}</span>
        <span style={{ color: '#c0c0c0', fontSize: 12, flex: 1 }}>{friendly}</span>
        <span style={{ color: '#404040', fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 12px 38px' }}>
          <p style={{ color: '#909090', fontSize: 11, fontFamily: 'monospace', margin: '0 0 6px' }}>
            {check.message}
          </p>
          {check.detail && (
            <p style={{ color: '#606060', fontSize: 11, fontFamily: 'monospace', margin: '0 0 8px' }}>
              └─ {check.detail}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: '#404040', fontFamily: 'monospace' }}>
              id: {check.id}
            </span>
          </div>
          {isWisp && stuckWisps.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {stuckWisps.map(p => (
                <div key={p.pid} style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginTop: 4,
                  padding: '6px 8px', background: '#1a0a0a',
                  border: '1px solid #ff444433', borderRadius: 3,
                }}>
                  <span style={{ color: '#ff4444', fontSize: 10, fontFamily: 'monospace', flex: 1 }}>
                    pid:{p.pid} {(p.command || '').slice(0, 50)}
                  </span>
                  <button
                    onClick={() => onBurn(p.pid)}
                    style={{
                      padding: '2px 10px', fontSize: 10, fontFamily: 'monospace',
                      background: '#2a0a0a', border: '1px solid #ff4444',
                      color: '#ff4444', borderRadius: 3, cursor: 'pointer',
                    }}
                  >
                    🔥 Brûler ce Wisp
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
CheckCard.propTypes = {
  check: PropTypes.object.isRequired,
  wisps: PropTypes.object,
  onBurn: PropTypes.func.isRequired,
}

function FixLog({ lines, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [lines])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        width: 640, maxHeight: '70vh', display: 'flex', flexDirection: 'column',
        background: '#0f0f1a', border: '1px solid #00d4ff', borderRadius: 6,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderBottom: '1px solid #1a1a2e',
        }}>
          <span style={{ color: '#00d4ff', fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold' }}>
            ▸ gt doctor --fix
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#606060', cursor: 'pointer', fontSize: 16,
          }}>✕</button>
        </div>
        <div ref={ref} style={{
          flex: 1, overflowY: 'auto', padding: 14,
          fontFamily: 'monospace', fontSize: 11, color: '#c0c0c0', lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
        }}>
          {lines.join('')}
          {lines.length === 0 && <span style={{ color: '#404040' }}>Lancement en cours…</span>}
        </div>
      </div>
    </div>
  )
}
FixLog.propTypes = {
  lines: PropTypes.arrayOf(PropTypes.string).isRequired,
  onClose: PropTypes.func.isRequired,
}

export default function DoctorTab() {
  const [data, setData] = useState(null)
  const [wisps, setWisps] = useState(null)
  const [loading, setLoading] = useState(false)
  const [fixing, setFixing] = useState(false)
  const [fixLines, setFixLines] = useState([])
  const [showFixLog, setShowFixLog] = useState(false)
  const [burnResult, setBurnResult] = useState(null)

  const fetchDoctor = useCallback(async () => {
    setLoading(true)
    try {
      const [drRes, wsRes] = await Promise.all([
        fetch(`${API_BASE}/api/doctor`),
        fetch(`${API_BASE}/api/wisps`),
      ])
      setData(await drRes.json())
      setWisps(await wsRes.json())
    } catch {
      setData({ checks: [], summary: { passed: 0, warnings: 0, failed: 0 }, error: 'Backend unreachable' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDoctor() }, [fetchDoctor])

  const runFix = useCallback(() => {
    setFixing(true)
    setFixLines([])
    setShowFixLog(true)

    const es = new EventSource(`${API_BASE}/api/doctor/fix`)
    // EventSource is GET-only; use fetch for POST streaming instead
    es.close()

    fetch(`${API_BASE}/api/doctor/fix`, { method: 'POST' }).then(async res => {
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop()
        for (const part of parts) {
          const dataLine = part.split('\n').find(l => l.startsWith('data:'))
          if (dataLine) {
            const payload = JSON.parse(dataLine.slice(5))
            if (payload.type === 'done') { setFixing(false); fetchDoctor() }
            else setFixLines(prev => [...prev, payload.text])
          }
        }
      }
      setFixing(false)
    }).catch(() => setFixing(false))
  }, [fetchDoctor])

  const burnWisp = useCallback(async (pid) => {
    setBurnResult(null)
    try {
      const res = await fetch(`${API_BASE}/api/wisps/burn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid }),
      })
      const json = await res.json()
      setBurnResult(json.ok ? `PID ${pid} tué.` : `Erreur: ${json.error}`)
      if (json.ok) setTimeout(fetchDoctor, 2000)
    } catch {
      setBurnResult('Erreur réseau')
    }
  }, [fetchDoctor])

  const alerts = (data?.checks || []).filter(c => c.severity !== 'ok')
  const notices = (data?.checks || []).filter(c => c.severity === 'info')
  const problems = alerts.filter(c => c.severity !== 'info')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {showFixLog && (
        <FixLog lines={fixLines} onClose={() => setShowFixLog(false)} />
      )}

      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '10px 16px', borderBottom: '1px solid #1a1a2e',
        background: '#0f0f1a', flexShrink: 0,
      }}>
        <span style={{ color: '#00d4ff', fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold' }}>
          ▸ DOCTOR
        </span>
        <HealthBadge summary={data?.summary} />
        {burnResult && (
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#ffd700' }}>{burnResult}</span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={runFix}
          disabled={fixing || loading}
          style={{
            padding: '5px 14px', fontSize: 11, fontFamily: 'monospace',
            background: fixing ? '#0a1a0a' : '#0a1a2a',
            border: `1px solid ${fixing ? '#00ff88' : '#00d4ff'}`,
            color: fixing ? '#00ff88' : '#00d4ff',
            borderRadius: 3, cursor: fixing ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {fixing && <span className="spin" style={{ display: 'inline-block' }}>⟳</span>}
          Auto-Fix
        </button>
        <button
          onClick={fetchDoctor}
          disabled={loading}
          style={{
            padding: '5px 14px', fontSize: 11, fontFamily: 'monospace',
            background: '#0f0f1a', border: '1px solid #1a1a2e',
            color: loading ? '#404040' : '#606060',
            borderRadius: 3, cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? <span className="spin" style={{ display: 'inline-block' }}>⟳</span> : '↺'} Refresh
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {data?.error && (
          <div style={{
            padding: 12, border: '1px solid #ff4444', borderRadius: 4,
            color: '#ff4444', fontFamily: 'monospace', fontSize: 12, marginBottom: 12,
          }}>
            {data.error}
          </div>
        )}

        {!data && !loading && (
          <div style={{ color: '#404040', fontFamily: 'monospace', fontSize: 12 }}>
            Chargement…
          </div>
        )}

        {loading && !data && (
          <div style={{ color: '#606060', fontFamily: 'monospace', fontSize: 12 }}>
            <span className="spin" style={{ display: 'inline-block', marginRight: 8 }}>⟳</span>
            Lancement de gt doctor…
          </div>
        )}

        {problems.length === 0 && data && !loading && (
          <div style={{
            padding: 12, border: '1px solid #00ff8833', borderRadius: 4,
            color: '#00ff88', fontFamily: 'monospace', fontSize: 12, marginBottom: 12,
          }}>
            ✓ Aucun problème détecté — {data.summary.passed} vérifications passées.
          </div>
        )}

        {problems.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: '#404040', fontFamily: 'monospace', fontSize: 10, marginBottom: 8, letterSpacing: '0.1em' }}>
              ALERTES ({problems.length})
            </div>
            {problems.map(c => (
              <CheckCard key={c.id} check={c} wisps={wisps} onBurn={burnWisp} />
            ))}
          </div>
        )}

        {notices.length > 0 && (
          <div>
            <div style={{ color: '#404040', fontFamily: 'monospace', fontSize: 10, marginBottom: 8, letterSpacing: '0.1em' }}>
              NOTICES ({notices.length})
            </div>
            {notices.map((c, i) => (
              <div key={i} style={{
                padding: '6px 12px', marginBottom: 4,
                border: '1px solid #00d4ff22', borderLeft: '3px solid #00d4ff44',
                borderRadius: 4, fontFamily: 'monospace', fontSize: 11, color: '#606060',
              }}>
                <span style={{ color: '#00d4ff', marginRight: 8 }}>ℹ</span>
                {c.message}
              </div>
            ))}
          </div>
        )}
      </div>

      {data && (
        <div style={{
          padding: '6px 16px', borderTop: '1px solid #1a1a2e',
          fontFamily: 'monospace', fontSize: 10, color: '#404040', flexShrink: 0,
        }}>
          {data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : ''} ·
          {data.summary.passed} ok · {data.summary.warnings} warn · {data.summary.failed} critical
        </div>
      )}
    </div>
  )
}
