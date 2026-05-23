import { useCallback, useEffect, useState } from 'react'
import PropTypes from 'prop-types'

const API_BASE = 'http://localhost:3001'

export default function TimeTravelSlider({ onSelect, onClose }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [sliderVal, setSliderVal] = useState(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/dolt/history`)
      .then(r => r.json())
      .then(rows => {
        setHistory(Array.isArray(rows) ? rows : [])
        setSliderVal(rows.length) // start at LIVE (rightmost)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleChange = useCallback((e) => {
    setSliderVal(parseInt(e.target.value, 10))
  }, [])

  useEffect(() => {
    if (sliderVal === null || !history.length) return
    if (sliderVal >= history.length) {
      onSelect(null) // live
    } else {
      // sliderVal 0 = oldest (history[history.length-1]), sliderVal history.length-1 = most recent
      onSelect(history[history.length - 1 - sliderVal])
    }
  }, [sliderVal, history, onSelect])

  const isLive = sliderVal === null || sliderVal >= history.length
  const currentCommit = (!isLive && sliderVal !== null && history.length > 0)
    ? history[history.length - 1 - sliderVal]
    : null

  return (
    <div style={{
      borderTop: '1px solid #1a1a2e',
      background: '#09090e',
      padding: '7px 14px',
      fontFamily: 'monospace',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexShrink: 0,
      minHeight: 38,
    }}>
      <span style={{ color: '#ff9900', fontSize: 9, letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
        ◷ TIME TRAVEL
      </span>

      <button
        onClick={onClose}
        style={{
          background: 'none', border: '1px solid #1a1a2e', borderRadius: 3,
          color: isLive ? '#00ff88' : '#404050', cursor: 'pointer',
          fontSize: 9, padding: '2px 7px', fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ▸ LIVE
      </button>

      {loading ? (
        <span style={{ color: '#303040', fontSize: 10 }}>loading history…</span>
      ) : (
        <>
          <span style={{ color: '#252530', fontSize: 9 }}>oldest</span>
          <input
            type="range"
            min={0}
            max={history.length}
            value={sliderVal ?? history.length}
            onChange={handleChange}
            style={{ flex: 1, accentColor: isLive ? '#00ff88' : '#ff9900', cursor: 'pointer', minWidth: 80 }}
          />
          <span style={{ color: isLive ? '#00ff88' : '#252530', fontSize: 9 }}>now</span>
          <div style={{
            minWidth: 260, fontSize: 9,
            color: isLive ? '#00ff8844' : '#ff990099',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {isLive
              ? '▸ live view — showing current state'
              : currentCommit
                ? `${currentCommit.date?.slice(0, 16)} — ${currentCommit.message?.slice(0, 50)}${(currentCommit.message?.length ?? 0) > 50 ? '…' : ''}`
                : ''}
          </div>
          <span style={{ color: '#252530', fontSize: 9, whiteSpace: 'nowrap' }}>
            {history.length} commits
          </span>
        </>
      )}
    </div>
  )
}

TimeTravelSlider.propTypes = {
  onSelect: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
}
