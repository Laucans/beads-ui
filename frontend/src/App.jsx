import { useCallback, useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
} from 'reactflow'
import 'reactflow/dist/style.css'
import TooltipHelp from './components/TooltipHelp'
import MergeQueue from './components/MergeQueue'
import LiveTerminal from './components/LiveTerminal'
import DoctorTab from './components/DoctorTab'

const initialNodes = [
  {
    id: '1',
    position: { x: 100, y: 100 },
    data: { label: 'beads_ui' },
    style: {
      background: '#0f0f1a',
      border: '1px solid #00ff88',
      color: '#00ff88',
      fontFamily: 'monospace',
      fontSize: '12px',
      borderRadius: '4px',
      padding: '8px 12px',
    },
  },
  {
    id: '2',
    position: { x: 300, y: 100 },
    data: { label: 'witness' },
    style: {
      background: '#0f0f1a',
      border: '1px solid #00d4ff',
      color: '#00d4ff',
      fontFamily: 'monospace',
      fontSize: '12px',
      borderRadius: '4px',
      padding: '8px 12px',
    },
  },
  {
    id: '3',
    position: { x: 200, y: 220 },
    data: { label: 'polecat/furiosa' },
    style: {
      background: '#0f0f1a',
      border: '1px solid #ff6b35',
      color: '#ff6b35',
      fontFamily: 'monospace',
      fontSize: '12px',
      borderRadius: '4px',
      padding: '8px 12px',
    },
  },
]

const initialEdges = [
  { id: 'e1-3', source: '1', target: '3', animated: true, style: { stroke: '#00ff88' } },
  { id: 'e2-3', source: '2', target: '3', animated: true, style: { stroke: '#00d4ff' } },
]

const API_BASE = 'http://localhost:3001'

const TABS = [
  { id: 'map',      label: '① Map Room' },
  { id: 'doctor',   label: '② Doctor'   },
  { id: 'mq',       label: '③ File d\'attente' },
  { id: 'terminal', label: '④ Terminal Live' },
]

function useSSE(onBeadUpdate) {
  const [sseState, setSseState] = useState('disconnected')
  const esRef = useRef(null)

  useEffect(() => {
    function connect() {
      const es = new EventSource(`${API_BASE}/api/events`)
      esRef.current = es
      es.addEventListener('connected', () => setSseState('connected'))
      es.addEventListener('bead-update', (e) => {
        const payload = JSON.parse(e.data)
        onBeadUpdate(payload)
      })
      es.onerror = () => {
        setSseState('reconnecting')
        es.close()
        setTimeout(connect, 3000)
      }
    }
    connect()
    return () => { esRef.current?.close() }
  }, [onBeadUpdate])

  return sseState
}

function MapRoom({ nodes, edges, onNodesChange, onEdgesChange, onConnect }) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      fitView
      style={{ background: '#0a0a0f' }}
    >
      <Controls style={{ background: '#0f0f1a', border: '1px solid #1a1a2e' }} />
      <MiniMap
        style={{ background: '#0f0f1a', border: '1px solid #1a1a2e' }}
        nodeColor={(n) => n.style?.border?.includes('00ff88') ? '#00ff88' : '#00d4ff'}
      />
      <Background color="#1a1a2e" gap={24} />
    </ReactFlow>
  )
}

MapRoom.propTypes = {
  nodes: PropTypes.array.isRequired,
  edges: PropTypes.array.isRequired,
  onNodesChange: PropTypes.func.isRequired,
  onEdgesChange: PropTypes.func.isRequired,
  onConnect: PropTypes.func.isRequired,
}

function App() {
  const [activeTab, setActiveTab] = useState('map')
  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [status, setStatus] = useState('idle')
  const [lastBeadUpdate, setLastBeadUpdate] = useState(null)

  const handleBeadUpdate = useCallback((payload) => {
    setLastBeadUpdate(payload)
  }, [])

  const sseState = useSSE(handleBeadUpdate)

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  )

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
      <header className="flex items-center justify-between px-4 py-2 border-b border-cyber-border bg-cyber-surface">
        <div className="flex items-center gap-3">
          <span className="text-cyber-accent font-mono text-sm font-bold tracking-widest">
            ▸ BEADS UI
          </span>
          <span className="cyber-badge inline-flex items-center">
            Gas Town
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-cyber-dim">
          <span className="inline-flex items-center gap-0.5">
            Mayor <TooltipHelp term="Mayor" />
          </span>
          <span className="inline-flex items-center gap-0.5">
            Convoy <TooltipHelp term="Convoy" />
          </span>
          <span className="inline-flex items-center gap-0.5">
            Bead <TooltipHelp term="Bead" />
          </span>
          <span className="inline-flex items-center gap-0.5">
            Polecat <TooltipHelp term="Polecat" />
          </span>
          <span className="inline-flex items-center gap-0.5">
            Refinery <TooltipHelp term="Refinery" />
          </span>
          <span className="inline-flex items-center gap-0.5">
            Wisp <TooltipHelp term="Wisp" />
          </span>
          <span className="inline-flex items-center gap-0.5">
            Witness <TooltipHelp term="Witness" />
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-cyber-dim text-xs font-mono">
            sse:{' '}
            <span className={sseState === 'connected' ? 'text-cyber-accent' : 'text-yellow-400'}>
              {sseState}
            </span>
          </span>
          {lastBeadUpdate && (
            <span className="text-cyber-dim text-xs font-mono">
              upd: <span className="text-cyber-accent">{lastBeadUpdate.changes.length} bead(s)</span>
            </span>
          )}
          <span className="text-cyber-dim text-xs font-mono">
            api: <span className="text-cyber-accent">{status}</span>
          </span>
          <button className="cyber-btn" onClick={fetchStatus}>
            ping
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <nav className="flex border-b border-cyber-border bg-cyber-surface px-4">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'px-4 py-2 text-xs font-mono border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-cyber-accent text-cyber-accent'
                : 'border-transparent text-cyber-dim hover:text-cyber-text',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'map' && (
          <MapRoom
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
          />
        )}
        {activeTab === 'doctor' && <DoctorTab />}
        {activeTab === 'mq' && <MergeQueue />}
        {activeTab === 'terminal' && <LiveTerminal />}
      </main>

      <footer className="px-4 py-1 border-t border-cyber-border bg-cyber-surface text-cyber-dim text-xs font-mono flex items-center gap-1">
        Vite + React 18 + ReactFlow + Tailwind CSS — Cyber/Terminal Theme · hover
        <span className="text-cyber-accent2">?</span>
        icons for Gas Town glossary
      </footer>
    </div>
  )
}

export default App
