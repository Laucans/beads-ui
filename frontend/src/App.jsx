import { useCallback, useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import TooltipHelp from './components/TooltipHelp'
import MapRoom from './components/MapRoom'
import MergeQueue from './components/MergeQueue'
import LiveTerminal from './components/LiveTerminal'
import DoctorTab from './components/DoctorTab'

const API_BASE = 'http://localhost:3001'

const TABS = [
  { id: 'map',      label: '◈ Map Room'        },
  { id: 'doctor',   label: '⚕ Doctor'          },
  { id: 'mq',       label: '▦ File d\'attente' },
  { id: 'terminal', label: '⚡ Terminal Live'   },
]

function useSSE(onBeadUpdate) {
  const [sseState, setSseState] = useState('disconnected')
  const esRef = useRef(null)

  useEffect(() => {
    function connect() {
      const es = new EventSource(`${API_BASE}/api/events`)
      esRef.current = es
      es.addEventListener('connected', () => setSseState('connected'))
      es.addEventListener('bead-update', (e) => onBeadUpdate(JSON.parse(e.data)))
      es.onerror = () => {
        setSseState('reconnecting')
        es.close()
        setTimeout(connect, 3000)
      }
    }
    connect()
    return () => esRef.current?.close()
  }, [onBeadUpdate])

  return sseState
}

export default function App() {
  const [activeTab, setActiveTab] = useState('map')
  const [status, setStatus] = useState('idle')
  const [lastBeadUpdate, setLastBeadUpdate] = useState(null)

  const handleBeadUpdate = useCallback((payload) => setLastBeadUpdate(payload), [])
  const sseState = useSSE(handleBeadUpdate)

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/status`)
      const data = await res.json()
      setStatus(data.status)
    } catch {
      setStatus('backend unreachable')
    }
  }

  return (
    <div className="flex flex-col h-screen bg-cyber-bg">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-cyber-border bg-cyber-surface">
        <div className="flex items-center gap-3">
          <span className="text-cyber-accent font-mono text-sm font-bold tracking-widest">
            ▸ BEADS UI
          </span>
          <span className="cyber-badge inline-flex items-center">Gas Town</span>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-cyber-dim">
          {['Mayor','Convoy','Bead','Polecat','Refinery','Wisp','Witness'].map(term => (
            <span key={term} className="inline-flex items-center gap-0.5">
              {term} <TooltipHelp term={term} />
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-cyber-dim text-xs font-mono">
            sse: <span className={sseState === 'connected' ? 'text-cyber-accent' : 'text-yellow-400'}>{sseState}</span>
          </span>
          {lastBeadUpdate && (
            <span className="text-cyber-dim text-xs font-mono">
              upd: <span className="text-cyber-accent">{lastBeadUpdate.changes.length} bead(s)</span>
            </span>
          )}
          <span className="text-cyber-dim text-xs font-mono">
            api: <span className="text-cyber-accent">{status}</span>
          </span>
          <button className="cyber-btn" onClick={fetchStatus}>ping</button>
        </div>
      </header>

      {/* Tab nav */}
      <nav className="flex border-b border-cyber-border bg-cyber-surface" style={{ paddingLeft: 12 }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '6px 16px',
              fontFamily: 'monospace',
              fontSize: 11,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #00ff88' : '2px solid transparent',
              color: activeTab === tab.id ? '#00ff88' : '#808090',
              cursor: 'pointer',
              letterSpacing: '0.04em',
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden">
        {activeTab === 'map'      && <MapRoom lastBeadUpdate={lastBeadUpdate} />}
        {activeTab === 'doctor'   && <DoctorTab />}
        {activeTab === 'mq'       && <MergeQueue />}
        {activeTab === 'terminal' && <LiveTerminal />}
      </main>

      <footer className="px-4 py-1 border-t border-cyber-border bg-cyber-surface text-cyber-dim text-xs font-mono flex items-center gap-1">
        Vite + React 18 + ReactFlow + Tailwind CSS — Cyber/Terminal Theme · hover
        <span className="text-cyber-accent2">?</span> icons for Gas Town glossary
      </footer>
    </div>
  )
}

App.propTypes = {}
