import { useEffect, useRef, useState } from 'react'

const API_BASE = 'http://localhost:3001'

const MAX_LINES = 500

const SOURCE_COLORS = {
  town: 'text-cyber-accent',
  daemon: 'text-cyber-accent2',
  system: 'text-cyber-dim',
}

function colorizeLogLine(line) {
  if (/\[done\]/.test(line)) return 'text-cyber-accent'
  if (/\[nudge\]/.test(line)) return 'text-yellow-400'
  if (/\[handoff\]/.test(line)) return 'text-purple-400'
  if (/error|ERROR|CRITICAL/i.test(line)) return 'text-red-400'
  if (/warn|WARNING/i.test(line)) return 'text-orange-400'
  if (/Convoy|convoy/i.test(line)) return 'text-cyber-accent2'
  return 'text-cyber-text'
}

export default function LiveTerminal() {
  const [lines, setLines] = useState([])
  const [connected, setConnected] = useState(false)
  const [filter, setFilter] = useState('')
  const [sources, setSources] = useState({ town: true, daemon: true, system: true })
  const [paused, setPaused] = useState(false)
  const bottomRef = useRef(null)
  const pausedRef = useRef(false)
  const pendingRef = useRef([])

  pausedRef.current = paused

  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/logs/stream`)

    es.onmessage = (e) => {
      try {
        const entry = JSON.parse(e.data)
        const newLine = { ...entry, id: Date.now() + Math.random() }
        if (pausedRef.current) {
          pendingRef.current.push(newLine)
          return
        }
        setLines((prev) => {
          const next = [...prev, newLine]
          return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next
        })
      } catch { /* ignore malformed SSE data */ }
    }

    es.onopen = () => setConnected(true)
    es.onerror = () => { setConnected(false) }

    return () => es.close()
  }, [])

  // Auto-scroll when not paused
  useEffect(() => {
    if (!paused) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines, paused])

  const resume = () => {
    setPaused(false)
    if (pendingRef.current.length > 0) {
      setLines((prev) => {
        const next = [...prev, ...pendingRef.current]
        pendingRef.current = []
        return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next
      })
    }
  }

  const clear = () => {
    setLines([])
    pendingRef.current = []
  }

  const filteredLines = lines.filter((l) => {
    if (!sources[l.source]) return false
    if (filter && !l.line.toLowerCase().includes(filter.toLowerCase())) return false
    return true
  })

  return (
    <div className="flex flex-col h-full bg-cyber-bg font-mono text-xs">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-cyber-border bg-cyber-surface flex-wrap">
        <span className="font-bold tracking-widest text-cyber-accent">▸ LIVE TERMINAL</span>

        <span className={`text-xs ${connected ? 'text-cyber-accent' : 'text-red-400'}`}>
          ● {connected ? 'connected' : 'disconnected'}
        </span>

        {/* Source toggles */}
        {Object.entries(sources).map(([src, on]) => (
          <button
            key={src}
            onClick={() => setSources((s) => ({ ...s, [src]: !s[src] }))}
            className={`px-2 py-0.5 rounded border text-xs transition-colors ${
              on
                ? `border-current ${SOURCE_COLORS[src] || 'text-cyber-text'}`
                : 'border-cyber-border text-cyber-dim'
            }`}
          >
            {src}
          </button>
        ))}

        {/* Filter */}
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter…"
          className="flex-1 min-w-[100px] max-w-[200px] bg-cyber-bg border border-cyber-border rounded px-2 py-0.5 text-cyber-text placeholder-cyber-dim outline-none focus:border-cyber-accent transition-colors"
        />

        <span className="text-cyber-dim ml-auto">
          {filteredLines.length}{paused && pendingRef.current.length > 0 ? `+${pendingRef.current.length} pending` : ''} lines
        </span>

        {paused ? (
          <button onClick={resume} className="cyber-btn bg-yellow-900 border-yellow-600 text-yellow-300 text-xs">
            ▶ resume
          </button>
        ) : (
          <button onClick={() => setPaused(true)} className="cyber-btn text-xs">⏸ pause</button>
        )}

        <button onClick={clear} className="cyber-btn text-xs text-cyber-warn">✕ clear</button>
      </div>

      {/* Log output */}
      <div
        className="flex-1 overflow-y-auto p-2 space-y-0.5"
        onWheel={() => { if (!paused) setPaused(true) }}
      >
        {filteredLines.length === 0 && (
          <p className="text-cyber-dim p-4 text-center">
            {connected ? 'waiting for log lines…' : 'connecting to log stream…'}
          </p>
        )}
        {filteredLines.map((entry) => (
          <div key={entry.id} className="flex gap-2 leading-5 group hover:bg-cyber-surface px-1 rounded">
            <span className="text-cyber-dim shrink-0 select-none">
              {entry.ts ? entry.ts.slice(11, 19) : ''}
            </span>
            <span className={`shrink-0 w-12 ${SOURCE_COLORS[entry.source] || 'text-cyber-dim'}`}>
              [{entry.source}]
            </span>
            <span className={colorizeLogLine(entry.line)}>{entry.line}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
