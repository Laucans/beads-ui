import { useEffect, useState } from 'react'

const API_BASE = 'http://localhost:3001'

const STATUS_COLORS = {
  open: 'text-cyber-accent',
  in_progress: 'text-yellow-400',
  merged: 'text-cyber-accent2',
  rejected: 'text-red-400',
  closed: 'text-cyber-dim',
}

export default function MergeQueue() {
  const [data, setData] = useState({ queue: [], branches: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchMQ = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/mq`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMQ()
    const t = setInterval(fetchMQ, 5000)
    return () => clearInterval(t)
  }, [])

  const polecatColor = (name) => {
    const h = [...(name || '')].reduce((a, c) => a + c.charCodeAt(0), 0)
    const colors = ['text-cyber-accent', 'text-cyber-accent2', 'text-cyber-warn', 'text-yellow-400', 'text-purple-400']
    return colors[h % colors.length]
  }

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-auto">
      {/* Queue entries from gt mq */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-cyber-accent font-mono text-sm font-bold tracking-widest uppercase">
            ▸ Merge Queue
          </h2>
          <button onClick={fetchMQ} className="cyber-btn text-xs">↻ refresh</button>
        </div>

        {loading && <p className="text-cyber-dim text-xs font-mono">loading…</p>}
        {error && <p className="text-red-400 text-xs font-mono">error: {error}</p>}

        {!loading && data.queue.length === 0 && (
          <div className="cyber-panel p-4 text-center">
            <p className="text-cyber-dim text-xs font-mono">(queue empty)</p>
          </div>
        )}

        {data.queue.length > 0 && (
          <div className="cyber-panel overflow-hidden">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-cyber-border text-cyber-dim">
                  <th className="text-left p-2">ID</th>
                  <th className="text-left p-2">Branch</th>
                  <th className="text-left p-2">Worker</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Bead</th>
                </tr>
              </thead>
              <tbody>
                {data.queue.map((entry, i) => (
                  <tr key={i} className="border-b border-cyber-border hover:bg-cyber-border transition-colors">
                    <td className="p-2 text-cyber-dim">{entry.id || '—'}</td>
                    <td className="p-2 text-cyber-text">{entry.branch || entry.name || '—'}</td>
                    <td className={`p-2 ${polecatColor(entry.worker)}`}>{entry.worker || '—'}</td>
                    <td className={`p-2 ${STATUS_COLORS[entry.status] || 'text-cyber-text'}`}>{entry.status || '—'}</td>
                    <td className="p-2 text-cyber-accent2">{entry.bead_id || entry.issue_id || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Polecat branches */}
      <section>
        <h2 className="text-cyber-accent2 font-mono text-sm font-bold tracking-widest uppercase mb-2">
          ▸ Polecat Branches ({data.branches.length})
        </h2>

        {data.branches.length === 0 && (
          <div className="cyber-panel p-4 text-center">
            <p className="text-cyber-dim text-xs font-mono">(no polecat branches found)</p>
          </div>
        )}

        {data.branches.length > 0 && (
          <div className="cyber-panel overflow-hidden">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-cyber-border text-cyber-dim">
                  <th className="text-left p-2">Polecat</th>
                  <th className="text-left p-2">Bead</th>
                  <th className="text-left p-2">Session</th>
                  <th className="text-left p-2">Branch</th>
                </tr>
              </thead>
              <tbody>
                {data.branches.map((b, i) => (
                  <tr key={i} className="border-b border-cyber-border hover:bg-cyber-border transition-colors">
                    <td className={`p-2 font-bold ${polecatColor(b.polecat)}`}>{b.polecat || '—'}</td>
                    <td className="p-2 text-cyber-accent">{b.bead_id || '—'}</td>
                    <td className="p-2 text-cyber-dim">{b.session || '—'}</td>
                    <td className="p-2 text-cyber-dim truncate max-w-xs">{b.branch}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
