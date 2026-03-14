import { useState } from 'react'

function BookmarkCard({ item, editMode, onRemove }) {
  const [hov, setHov] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <a href={editMode ? undefined : item.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
        <div style={{
          padding: '9px 14px',
          background: hov && !editMode ? 'var(--bg-hover)' : 'var(--bg-card)',
          border: `1px solid ${hov && !editMode ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
          borderRadius: 10,
          display: 'flex', alignItems: 'center', gap: 10,
          cursor: editMode ? 'default' : 'pointer',
          transition: 'all 0.15s',
        }}>
          <span style={{ fontSize: 18 }}>{item.icon || '🔗'}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{item.name}</div>
            {item.description && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.description}
              </div>
            )}
          </div>
        </div>
      </a>
      {editMode && (
        <button onClick={onRemove} style={{
          position: 'absolute', top: -5, right: -5,
          width: 18, height: 18, borderRadius: '50%',
          background: '#F87171', border: 'none',
          color: '#fff', fontSize: 10, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>✕</button>
      )}
    </div>
  )
}

export default function BookmarkGrid({ bookmarks, editMode, onRemove }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
      {bookmarks.map((group, gi) => (
        <div key={gi}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
            <span style={{ fontSize: 13 }}>{group.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{group.category}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {group.items?.map((item, ii) => (
              <BookmarkCard key={ii} item={item} editMode={editMode} onRemove={() => onRemove(gi, ii)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
