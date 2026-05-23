import { useCallback, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
} from 'reactflow'
import 'reactflow/dist/style.css'
import TimeTravelSlider from './TimeTravelSlider'

const API_BASE = 'http://localhost:3001'

const STATUS_MAP = {
  closed:      { color: '#00ff88', label: 'landed',   pulse: false },
  in_progress: { color: '#00d4ff', label: 'running',  pulse: true  },
  hooked:      { color: '#00d4ff', label: 'hooked',   pulse: true  },
  open:        { color: '#505060', label: 'pending',  pulse: false },
  blocked:     { color: '#ff6b35', label: 'blocked',  pulse: false },
  deferred:    { color: '#505070', label: 'deferred', pulse: false },
  pinned:      { color: '#c0c0c0', label: 'pinned',   pulse: false },
}

function statusInfo(s) {
  return STATUS_MAP[s] || STATUS_MAP.open
}

// ── Custom node: bead ──────────────────────────────────────────────────────

function BeadNode({ data, selected }) {
  const { bead } = data
  const { color, label, pulse } = statusInfo(bead.status)
  const shortPolecat = bead.polecat_id ? bead.polecat_id.split('/').pop() : null
  return (
    <div
      className={pulse ? 'bead-pulse' : ''}
      style={{
        border: `1px solid ${color}`,
        background: selected ? '#15152a' : '#0f0f1a',
        borderRadius: 4,
        padding: '6px 10px',
        width: 182,
        fontFamily: 'monospace',
        color: '#c0c0c0',
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={Position.Top}
        style={{ background: color, width: 7, height: 7, top: -4 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ color, fontSize: 9, fontWeight: 'bold' }}>{bead.id}</span>
        <span style={{ color: '#404050', fontSize: 9 }}>{label}</span>
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.35, color: '#d0d0e0' }}>
        {bead.title.length > 38 ? bead.title.slice(0, 38) + '…' : bead.title}
      </div>
      {shortPolecat && (
        <div style={{ color: '#505060', fontSize: 9, marginTop: 3 }}>↳ {shortPolecat}</div>
      )}
      <Handle type="source" position={Position.Bottom}
        style={{ background: color, width: 7, height: 7, bottom: -4 }} />
    </div>
  )
}

BeadNode.propTypes = {
  data: PropTypes.shape({ bead: PropTypes.object.isRequired }).isRequired,
  selected: PropTypes.bool,
}

// ── Custom node: convoy group ──────────────────────────────────────────────

function ConvoyNode({ data }) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
      <div style={{
        padding: '5px 12px',
        borderBottom: '1px solid #1a3a2e',
        fontSize: 9,
        fontFamily: 'monospace',
        color: '#00ff8866',
        fontWeight: 'bold',
        letterSpacing: '0.1em',
        background: 'rgba(0,20,10,0.6)',
        borderRadius: '5px 5px 0 0',
      }}>
        ◈ {data.label}
      </div>
    </div>
  )
}

ConvoyNode.propTypes = {
  data: PropTypes.shape({ label: PropTypes.string }).isRequired,
}

const nodeTypes = { beadNode: BeadNode, convoyNode: ConvoyNode }

// ── Layout ─────────────────────────────────────────────────────────────────

const BEAD_W = 182
const BEAD_H = 72
const GAP_X = 14
const GAP_Y = 18
const PAD = 18
const HEADER = 32

function buildGraph(beads, convoys, deps) {
  const beadIds = new Set(beads.map(b => b.id))

  const rfEdges = deps
    .filter(d => beadIds.has(d.issue_id) && beadIds.has(d.depends_on_id))
    .map(d => ({
      id: `e-${d.depends_on_id}-${d.issue_id}`,
      source: d.depends_on_id,
      target: d.issue_id,
      style: { stroke: '#1a4a2e', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#1a4a2e', width: 14, height: 14 },
    }))

  // BFS depth for topological row placement
  const adj = {}
  const inDeg = {}
  for (const b of beads) { adj[b.id] = []; inDeg[b.id] = 0 }
  for (const e of rfEdges) {
    adj[e.source].push(e.target)
    inDeg[e.target] = (inDeg[e.target] || 0) + 1
  }
  const depth = {}
  const queue = beads.filter(b => (inDeg[b.id] || 0) === 0).map(b => b.id)
  for (const id of queue) depth[id] = 0
  let qi = 0
  while (qi < queue.length) {
    const id = queue[qi++]
    for (const next of adj[id]) {
      const d = (depth[id] || 0) + 1
      if (depth[next] === undefined || depth[next] < d) depth[next] = d
      if (!queue.includes(next)) queue.push(next)
    }
  }
  for (const b of beads) if (depth[b.id] === undefined) depth[b.id] = 0

  // Group beads by convoy
  const convoyBeads = {}
  const orphans = []
  for (const c of convoys) convoyBeads[c.id] = []
  for (const b of beads) {
    if (b.convoy_id && convoyBeads[b.convoy_id]) convoyBeads[b.convoy_id].push(b)
    else orphans.push(b)
  }

  const rfNodes = []
  let convoyX = 0

  for (const convoy of convoys) {
    const members = convoyBeads[convoy.id] || []
    if (!members.length) continue

    // sort by depth then id for stable ordering
    members.sort((a, b) => (depth[a.id] || 0) - (depth[b.id] || 0) || a.id.localeCompare(b.id))

    // bucket into rows by depth
    const rows = {}
    for (const b of members) {
      const d = depth[b.id] || 0
      if (!rows[d]) rows[d] = []
      rows[d].push(b)
    }
    const rowKeys = Object.keys(rows).map(Number).sort((a, b) => a - b)
    const maxCols = Math.max(...rowKeys.map(k => rows[k].length))

    const groupW = maxCols * BEAD_W + (maxCols - 1) * GAP_X + PAD * 2
    const groupH = rowKeys.length * BEAD_H + (rowKeys.length - 1) * GAP_Y + HEADER + PAD * 2

    rfNodes.push({
      id: convoy.id,
      type: 'convoyNode',
      position: { x: convoyX, y: 0 },
      style: {
        width: groupW,
        height: groupH,
        background: 'rgba(0,255,136,0.018)',
        border: '1px solid #1a3a2e',
        borderRadius: 6,
      },
      data: { label: convoy.title },
      selectable: false,
    })

    rowKeys.forEach((rk, ri) => {
      const rowBeads = rows[rk]
      const rowW = rowBeads.length * BEAD_W + (rowBeads.length - 1) * GAP_X
      const startX = (groupW - rowW) / 2
      const rowY = HEADER + PAD + ri * (BEAD_H + GAP_Y)
      rowBeads.forEach((b, ci) => {
        rfNodes.push({
          id: b.id,
          type: 'beadNode',
          parentNode: convoy.id,
          extent: 'parent',
          position: { x: startX + ci * (BEAD_W + GAP_X), y: rowY },
          data: { bead: b },
        })
      })
    })

    convoyX += groupW + 60
  }

  return { rfNodes, rfEdges, orphans }
}

// ── Inspector sidebar ──────────────────────────────────────────────────────

function Inspector({ bead, commits, loading, onClose }) {
  const { color } = statusInfo(bead.status)
  const shortPolecat = bead.polecat_id ? bead.polecat_id.split('/').pop() : null
  return (
    <div style={{
      width: 280, flexShrink: 0, borderLeft: '1px solid #1a1a2e',
      background: '#09090e', overflowY: 'auto', padding: '12px 14px',
      fontFamily: 'monospace',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color, fontSize: 10, fontWeight: 'bold' }}>{bead.id}</span>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#404050', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>
          ×
        </button>
      </div>
      <div style={{ color: '#d0d0e0', fontSize: 11, marginBottom: 8, lineHeight: 1.4 }}>
        {bead.title}
      </div>
      {bead.description && (
        <div style={{ color: '#505060', fontSize: 10, marginBottom: 10, lineHeight: 1.4 }}>
          {bead.description}
        </div>
      )}
      <Row label="STATUS"><span style={{ color }}>{bead.status}</span></Row>
      {shortPolecat && <Row label="AGENT"><span style={{ color: '#00d4ff' }}>{shortPolecat}</span></Row>}
      {bead.polecat_id && (
        <Row label="BRANCH">
          <span style={{ color: '#404050', fontSize: 9 }}>
            polecat/{shortPolecat}/{bead.id}…
          </span>
        </Row>
      )}
      <div style={{ borderTop: '1px solid #1a1a2e', paddingTop: 8, marginTop: 8 }}>
        <div style={{ color: '#303040', fontSize: 9, marginBottom: 6, letterSpacing: '0.08em' }}>COMMITS</div>
        {loading && <div style={{ color: '#303040', fontSize: 10 }}>loading…</div>}
        {!loading && commits.length === 0 && <div style={{ color: '#303040', fontSize: 10 }}>none found</div>}
        {commits.map((c, i) => (
          <div key={i} style={{ marginBottom: 6 }}>
            <span style={{ color: '#00ff8844', fontSize: 9 }}>{c.hash} </span>
            <div style={{ color: '#606070', fontSize: 10, lineHeight: 1.3 }}>{c.message}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

Inspector.propTypes = {
  bead: PropTypes.object.isRequired,
  commits: PropTypes.arrayOf(PropTypes.shape({ hash: PropTypes.string, message: PropTypes.string })).isRequired,
  loading: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
}

function Row({ label, children }) {
  return (
    <div style={{ marginBottom: 5 }}>
      <span style={{ color: '#303040', fontSize: 9, marginRight: 6 }}>{label}</span>
      <span style={{ fontSize: 10 }}>{children}</span>
    </div>
  )
}

Row.propTypes = {
  label: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
}

// ── MapRoom ────────────────────────────────────────────────────────────────

export default function MapRoom({ lastBeadUpdate }) {
  const [beads, setBeads] = useState([])
  const [convoys, setConvoys] = useState([])
  const [deps, setDeps] = useState([])
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [orphans, setOrphans] = useState([])
  const [selectedBead, setSelectedBead] = useState(null)
  const [commits, setCommits] = useState([])
  const [loadingCommits, setLoadingCommits] = useState(false)
  const [error, setError] = useState(null)

  // Time-travel state
  const [timeTravelActive, setTimeTravelActive] = useState(false)
  const [snapshotCommit, setSnapshotCommit] = useState(null)
  const [snapshotBeads, setSnapshotBeads] = useState(null)
  const [snapshotDeps, setSnapshotDeps] = useState(null)
  const [snapshotLoading, setSnapshotLoading] = useState(false)

  const fetchAll = useCallback(async () => {
    try {
      setError(null)
      const [b, c, d] = await Promise.all([
        fetch(`${API_BASE}/api/beads`).then(r => r.json()),
        fetch(`${API_BASE}/api/convoys`).then(r => r.json()),
        fetch(`${API_BASE}/api/deps`).then(r => r.json()),
      ])
      const beadData = b.beads ?? b
      setBeads(Array.isArray(beadData) ? beadData : [])
      setConvoys(Array.isArray(c) ? c : [])
      setDeps(Array.isArray(d) ? d : [])
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Apply SSE bead-status updates without re-fetching (skip during time-travel)
  useEffect(() => {
    if (timeTravelActive) return
    if (!lastBeadUpdate?.changes?.length) return
    setBeads(prev => {
      const next = [...prev]
      for (const ch of lastBeadUpdate.changes) {
        const i = next.findIndex(b => b.id === ch.id)
        if (i !== -1) next[i] = { ...next[i], status: ch.status }
      }
      return next
    })
  }, [lastBeadUpdate, timeTravelActive])

  // Fetch snapshot when commit selection changes
  useEffect(() => {
    if (!snapshotCommit) {
      setSnapshotBeads(null)
      setSnapshotDeps(null)
      return
    }
    setSnapshotLoading(true)
    fetch(`${API_BASE}/api/dolt/snapshot/${snapshotCommit.commit_hash}`)
      .then(r => r.json())
      .then(data => {
        setSnapshotBeads(Array.isArray(data.beads) ? data.beads : [])
        setSnapshotDeps(Array.isArray(data.deps) ? data.deps : [])
        setSnapshotLoading(false)
      })
      .catch(() => setSnapshotLoading(false))
  }, [snapshotCommit])

  // Rebuild graph whenever data changes
  useEffect(() => {
    const activeBeads = (snapshotCommit && snapshotBeads) ? snapshotBeads : beads
    const activeDeps = (snapshotCommit && snapshotDeps) ? snapshotDeps : deps
    if (!activeBeads.length && !convoys.length) return
    const { rfNodes, rfEdges, orphans: o } = buildGraph(activeBeads, convoys, activeDeps)
    setNodes(rfNodes)
    setEdges(rfEdges)
    setOrphans(o)
  }, [beads, convoys, deps, snapshotBeads, snapshotDeps, snapshotCommit, setNodes, setEdges])

  const onNodeClick = useCallback(async (_, node) => {
    if (node.type !== 'beadNode') return
    const bead = node.data.bead
    setSelectedBead(bead)
    setCommits([])
    setLoadingCommits(true)
    try {
      const c = await fetch(`${API_BASE}/api/bead/${bead.id}/commits`).then(r => r.json())
      setCommits(Array.isArray(c) ? c : [])
    } catch {
      setCommits([])
    } finally {
      setLoadingCommits(false)
    }
  }, [])

  const onPaneClick = useCallback(() => setSelectedBead(null), [])

  const handleTimeTravelSelect = useCallback((commit) => {
    setSnapshotCommit(commit)
  }, [])

  const handleTimeTravelClose = useCallback(() => {
    setTimeTravelActive(false)
    setSnapshotCommit(null)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left panel: orphans */}
        <div style={{
          width: 210, flexShrink: 0, borderRight: '1px solid #1a1a2e',
          background: '#09090e', overflowY: 'auto', padding: '10px 8px',
        }}>
          <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#2a2a3a', letterSpacing: '0.1em', marginBottom: 8 }}>
            ORPHANS ({orphans.length})
          </div>
          {orphans.length === 0
            ? <div style={{ fontSize: 10, color: '#252530', fontFamily: 'monospace' }}>none</div>
            : orphans.map(b => {
              const { color } = statusInfo(b.status)
              return (
                <div key={b.id} onClick={() => { setSelectedBead(b); setCommits([]) }}
                  style={{
                    border: `1px solid ${color}44`, borderRadius: 4, padding: '6px 8px',
                    marginBottom: 6, background: '#0f0f1a', cursor: 'pointer', fontFamily: 'monospace',
                  }}>
                  <div style={{ color, fontSize: 9 }}>{b.id}</div>
                  <div style={{ color: '#b0b0c0', fontSize: 10, marginTop: 2 }}>
                    {b.title.length > 28 ? b.title.slice(0, 28) + '…' : b.title}
                  </div>
                </div>
              )
            })
          }
          <div style={{ marginTop: 16, borderTop: '1px solid #1a1a2e', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={fetchAll}
              style={{
                width: '100%', padding: '5px 0', background: 'none',
                border: '1px solid #1a1a2e', borderRadius: 3, color: '#404050',
                fontSize: 9, fontFamily: 'monospace', cursor: 'pointer', letterSpacing: '0.08em',
              }}>
              ↺ refresh
            </button>
            <button
              onClick={() => setTimeTravelActive(v => !v)}
              style={{
                width: '100%', padding: '5px 0', background: 'none',
                border: `1px solid ${timeTravelActive ? '#ff990066' : '#1a1a2e'}`, borderRadius: 3,
                color: timeTravelActive ? '#ff9900' : '#404050',
                fontSize: 9, fontFamily: 'monospace', cursor: 'pointer', letterSpacing: '0.08em',
              }}>
              ◷ time travel
            </button>
            {error && <div style={{ color: '#ff6b35', fontSize: 9, marginTop: 2, wordBreak: 'break-word' }}>{error}</div>}
          </div>
        </div>

        {/* Main canvas */}
        <div style={{ flex: 1, position: 'relative' }}>
          {/* Historical view banner */}
          {snapshotCommit && (
            <div style={{
              position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
              zIndex: 10, background: 'rgba(9,9,14,0.92)', border: '1px solid #ff990055',
              borderRadius: 4, padding: '4px 12px', fontFamily: 'monospace',
              display: 'flex', alignItems: 'center', gap: 8,
              pointerEvents: 'none',
            }}>
              {snapshotLoading
                ? <span style={{ color: '#ff9900', fontSize: 9 }}>◷ loading snapshot…</span>
                : <>
                  <span style={{ color: '#ff9900', fontSize: 9, letterSpacing: '0.08em' }}>HISTORICAL VIEW</span>
                  <span style={{ color: '#ff990066', fontSize: 9 }}>
                    {snapshotCommit.date?.slice(0, 16)}
                  </span>
                  <span style={{ color: '#505060', fontSize: 9 }}>
                    {snapshotCommit.message?.slice(0, 48)}{(snapshotCommit.message?.length ?? 0) > 48 ? '…' : ''}
                  </span>
                </>
              }
            </div>
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            nodesConnectable={false}
            style={{ background: '#0a0a0f' }}
            proOptions={{ hideAttribution: true }}
          >
            <Controls style={{ background: '#0f0f1a', border: '1px solid #1a1a2e' }} />
            <MiniMap
              style={{ background: '#0f0f1a', border: '1px solid #1a1a2e' }}
              nodeColor={n => {
                if (n.type === 'convoyNode') return '#1a3a2e'
                return statusInfo(n.data?.bead?.status).color
              }}
              maskColor="rgba(10,10,15,0.85)"
            />
            <Background color="#12121e" gap={24} />
          </ReactFlow>
        </div>

        {/* Right panel: inspector */}
        {selectedBead && (
          <Inspector
            bead={selectedBead}
            commits={commits}
            loading={loadingCommits}
            onClose={() => setSelectedBead(null)}
          />
        )}
      </div>

      {/* Time-travel slider */}
      {timeTravelActive && (
        <TimeTravelSlider
          onSelect={handleTimeTravelSelect}
          onClose={handleTimeTravelClose}
        />
      )}
    </div>
  )
}

MapRoom.propTypes = {
  lastBeadUpdate: PropTypes.shape({
    changes: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string, status: PropTypes.string })),
  }),
}
