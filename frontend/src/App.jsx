import { useCallback, useState } from 'react'
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
} from 'reactflow'
import 'reactflow/dist/style.css'

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
    data: { label: 'polecat/nux' },
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

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [status, setStatus] = useState('idle')

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  )

  const fetchStatus = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/status')
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
          <span className="cyber-badge">Gas Town</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-cyber-dim text-xs font-mono">
            backend: <span className="text-cyber-accent">{status}</span>
          </span>
          <button className="cyber-btn" onClick={fetchStatus}>
            ping api
          </button>
        </div>
      </header>

      <main className="flex-1 relative">
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
      </main>

      <footer className="px-4 py-1 border-t border-cyber-border bg-cyber-surface text-cyber-dim text-xs font-mono">
        Vite + React 18 + ReactFlow + Tailwind CSS — Cyber/Terminal Theme
      </footer>
    </div>
  )
}

export default App
