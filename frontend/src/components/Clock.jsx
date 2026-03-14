import { useState, useEffect } from 'react'

export default function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 56, fontWeight: 300, letterSpacing: '-2px', fontFamily: 'var(--mono)', color: '#F1F5F9', lineHeight: 1 }}>
        {now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 8, letterSpacing: '0.04em' }}>
        {now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
    </div>
  )
}
