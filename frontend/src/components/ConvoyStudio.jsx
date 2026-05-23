import { useState, useCallback, useRef, useMemo } from 'react'
import PropTypes from 'prop-types'
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'
import TooltipHelp from './TooltipHelp'

const API_BASE = 'http://localhost:3001'

// ── Editable bead node ─────────────────────────────────────────────────────

function StudioBeadNode({ id, data, selected }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)

  const startEdit = (e) => {
    e.stopPropagation()
    setDraft(data.title)
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const commit = () => {
    setEditing(false)
    data.onTitleChange(id, draft)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(false)
  }

  return (
    <div
      style={{
        border: `1px solid ${selected ? '#00ff88' : '#1a3a2e'}`,
        background: selected ? '#15152a' : '#0f0f1a',
        borderRadius: 4,
        padding: '7px 10px',
        width: 182,
        fontFamily: 'monospace',
        cursor: 'default',
        boxSizing: 'border-box',
      }}
    >
      <Handle type="target" position={Position.Top}
        style={{ background: '#00ff88', width: 7, height: 7, top: -4 }} />

      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ color: '#2a4a3a', fontSize: 9, flex: 1 }}>◈ bead</span>
        <button
          onClick={(e) => { e.stopPropagation(); data.onDelete(id) }}
          title="Delete bead"
          style={{
            background: 'none', border: 'none', color: '#303040',
            cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1,
          }}
        >×</button>
      </div>

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          placeholder="Bead title…"
          style={{
            background: '#1a1a2a', border: '1px solid #00ff88', borderRadius: 2,
            color: '#d0d0e0', fontSize: 11, padding: '2px 5px', width: '100%',
            fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box',
          }}
        />
      ) : (
        <div
          onDoubleClick={startEdit}
          title="Double-click to edit"
          style={{
            fontSize: 11, lineHeight: 1.4, minHeight: 18, cursor: 'text',
            color: data.title ? '#d0d0e0' : '#2a3a2a',
          }}
        >
          {data.title || 'double-click to name…'}
        </div>
      )}

      <Handle type="source" position={Position.Bottom}
        style={{ background: '#00ff88', width: 7, height: 7, bottom: -4 }} />
    </div>
  )
}

StudioBeadNode.propTypes = {
  id: PropTypes.string.isRequired,
  data: PropTypes.shape({
    title: PropTypes.string.isRequired,
    onTitleChange: PropTypes.func.isRequired,
    onDelete: PropTypes.func.isRequired,
  }).isRequired,
  selected: PropTypes.bool,
}

const nodeTypes = { studioBeadNode: StudioBeadNode }

// ── Status banner ──────────────────────────────────────────────────────────

function StatusBanner({ status }) {
  if (!status) return null
  const colors = { idle: '#404050', slinging: '#00d4ff', done: '#00ff88', error: '#ff6b35' }
  const color = colors[status.state] || '#404050'
  return (
    <div style={{
      padding: '6px 14px',
      borderTop: `1px solid ${color}44`,
      background: '#09090e',
      fontFamily: 'monospace',
      fontSize: 10,
      color,
      lineHeight: 1.5,
      whiteSpace: 'pre-wrap',
      maxHeight: 100,
      overflowY: 'auto',
    }}>
      {status.state === 'slinging' && '⏳ '}
      {status.state === 'done' && '✓ '}
      {status.state === 'error' && '✗ '}
      {status.message}
    </div>
  )
}

StatusBanner.propTypes = {
  status: PropTypes.shape({ state: PropTypes.string, message: PropTypes.string }),
}

// ── ConvoyStudio ───────────────────────────────────────────────────────────

let nodeCounter = 0

export default function ConvoyStudio() {
  const [convoyName, setConvoyName] = useState('')
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [status, setStatus] = useState(null)

  // Stable callback refs so node data callbacks don't trigger re-renders
  const callbacksRef = useRef({})

  const handleTitleChange = useCallback((nodeId, newTitle) => {
    setNodes(nds => nds.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, title: newTitle } } : n
    ))
  }, [setNodes])

  const handleDeleteNode = useCallback((nodeId) => {
    setNodes(nds => nds.filter(n => n.id !== nodeId))
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId))
  }, [setNodes, setEdges])

  callbacksRef.current = { handleTitleChange, handleDeleteNode }

  const stableCallbacks = useMemo(() => ({
    onTitleChange: (...args) => callbacksRef.current.handleTitleChange(...args),
    onDelete: (...args) => callbacksRef.current.handleDeleteNode(...args),
  }), [])

  const addBead = useCallback(() => {
    const id = `studio-${++nodeCounter}`
    const col = nodes.length % 3
    const row = Math.floor(nodes.length / 3)
    setNodes(nds => [...nds, {
      id,
      type: 'studioBeadNode',
      position: { x: 60 + col * 210, y: 60 + row * 130 },
      data: { title: '', ...stableCallbacks },
    }])
  }, [nodes.length, setNodes, stableCallbacks])

  const onConnect = useCallback((params) => {
    setEdges(eds => addEdge({
      ...params,
      style: { stroke: '#1a4a2e', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#1a4a2e', width: 14, height: 14 },
      animated: false,
    }, eds))
  }, [setEdges])

  const clearAll = useCallback(() => {
    setNodes([])
    setEdges([])
    setStatus(null)
    nodeCounter = 0
  }, [setNodes, setEdges])

  const slingConvoy = useCallback(async () => {
    if (!convoyName.trim()) {
      setStatus({ state: 'error', message: 'Give your convoy a name first.' })
      return
    }
    if (nodes.length === 0) {
      setStatus({ state: 'error', message: 'Add at least one bead to the canvas.' })
      return
    }
    const unnamed = nodes.filter(n => !n.data.title.trim())
    if (unnamed.length > 0) {
      setStatus({ state: 'error', message: `${unnamed.length} bead(s) are missing a title. Double-click to name them.` })
      return
    }

    setStatus({ state: 'slinging', message: 'Creating beads and convoy…' })

    try {
      const payload = {
        name: convoyName.trim(),
        beads: nodes.map(n => ({ id: n.id, title: n.data.title.trim() })),
        edges: edges.map(e => ({ source: e.source, target: e.target })),
      }
      const res = await fetch(`${API_BASE}/api/convoy/sling`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) {
        setStatus({ state: 'error', message: data.error || 'Unknown error' })
        return
      }

      const ids = Object.values(data.beadIds || {}).join(', ')
      setStatus({
        state: 'done',
        message: `Convoy created!\nBeads: ${ids}\n${data.convoyOutput || ''}`,
      })
    } catch (err) {
      setStatus({ state: 'error', message: err.message })
    }
  }, [convoyName, nodes, edges])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
        borderBottom: '1px solid #1a1a2e', background: '#09090e', flexShrink: 0,
      }}>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#404050', letterSpacing: '0.08em' }}>
          CONVOY NAME
        </span>
        <input
          value={convoyName}
          onChange={(e) => setConvoyName(e.target.value)}
          placeholder="e.g. Deploy v2.0"
          style={{
            flex: 1, maxWidth: 280,
            background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: 3,
            color: '#d0d0e0', fontFamily: 'monospace', fontSize: 11,
            padding: '4px 8px', outline: 'none',
          }}
          onFocus={(e) => e.target.style.borderColor = '#00ff8866'}
          onBlur={(e) => e.target.style.borderColor = '#1a1a2e'}
        />

        <button onClick={addBead} style={btnStyle('#00ff88')}>+ Add Bead</button>

        <div style={{ flex: 1 }} />

        <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#2a3a2a' }}>
          {nodes.length} bead{nodes.length !== 1 ? 's' : ''} · {edges.length} dep{edges.length !== 1 ? 's' : ''}
        </span>

        <span style={{ display: 'inline-flex', alignItems: 'center', fontFamily: 'monospace', fontSize: 10, color: '#404050' }}>
          Convoy <TooltipHelp term="Convoy" />
        </span>

        <button
          onClick={slingConvoy}
          disabled={status?.state === 'slinging'}
          style={btnStyle('#00d4ff', status?.state === 'slinging')}
        >
          {status?.state === 'slinging' ? '⏳ slinging…' : '▸ Sling Convoy'}
        </button>

        <button onClick={clearAll} style={btnStyle('#404050')}>✕ Clear</button>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative' }}>
        {nodes.length === 0 && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 1,
          }}>
            <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#1a2a1a', textAlign: 'center', lineHeight: 2 }}>
              Click <span style={{ color: '#2a4a2a' }}>+ Add Bead</span> to add work items<br />
              Double-click a bead to name it<br />
              Drag from ● (bottom) to ● (top) to set dependencies<br />
              Then click <span style={{ color: '#1a3a4a' }}>▸ Sling Convoy</span> to dispatch
            </div>
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView={nodes.length > 0}
          style={{ background: '#0a0a0f' }}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode="Delete"
          connectionLineStyle={{ stroke: '#1a4a2e', strokeWidth: 1.5 }}
          defaultEdgeOptions={{
            style: { stroke: '#1a4a2e', strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#1a4a2e', width: 14, height: 14 },
          }}
        >
          <Controls style={{ background: '#0f0f1a', border: '1px solid #1a1a2e' }} />
          <Background color="#12121e" gap={24} />
        </ReactFlow>
      </div>

      {/* Status */}
      <StatusBanner status={status} />
    </div>
  )
}

function btnStyle(color, disabled = false) {
  return {
    padding: '4px 12px',
    background: 'none',
    border: `1px solid ${disabled ? '#303040' : color + '66'}`,
    borderRadius: 3,
    color: disabled ? '#303040' : color,
    fontFamily: 'monospace',
    fontSize: 10,
    cursor: disabled ? 'default' : 'pointer',
    letterSpacing: '0.06em',
    whiteSpace: 'nowrap',
  }
}
