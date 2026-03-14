import { useState } from 'react'

const PROVIDERS = {
  google: 'https://www.google.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  brave: 'https://search.brave.com/search?q=',
}

export default function SearchBar({ provider = 'google' }) {
  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(false)

  const handleKey = (e) => {
    if (e.key === 'Enter' && q.trim()) {
      const base = PROVIDERS[provider] || PROVIDERS.google
      window.open(base + encodeURIComponent(q.trim()), '_blank')
      setQ('')
    }
  }

  return (
    <div style={{ position: 'relative', width: 400 }}>
      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text-dim)' }}>🔍</span>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={handleKey}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Ara..."
        style={{
          width: '100%', padding: '10px 16px 10px 40px',
          background: 'rgba(255,255,255,0.05)',
          border: `1px solid ${focused ? 'var(--border-focus)' : 'var(--border)'}`,
          borderRadius: 12, color: 'var(--text)', fontSize: 14,
          outline: 'none', backdropFilter: 'blur(8px)',
          transition: 'border-color 0.2s',
        }}
      />
    </div>
  )
}
