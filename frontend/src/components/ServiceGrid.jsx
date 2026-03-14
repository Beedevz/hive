import { useState } from 'react'

const STATUS_COLOR = { online: '#4ADE80', warning: '#F59E0B', offline: '#F87171', unknown: '#475569' }

function ServiceCard({ item, editMode, onRemove }) {
  const [hov, setHov] = useState(false)
  const status = item.status || 'unknown'

  return (
    <div style={{ position: 'relative' }}>
      <a
        href={editMode ? undefined : item.url}
        target="_blank" rel="noreferrer"
        style={{ textDecoration: 'none', display: 'block' }}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
      >
        <div style={{
          background: hov && !editMode ? 'var(--bg-hover)' : 'var(--bg-card)',
          border: `1px solid ${hov && !editMode ? 'rgba(99,102,241,0.35)' : 'var(--border)'}`,
          borderRadius: 12, padding: '13px 15px',
          display: 'flex', alignItems: 'center', gap: 12,
          cursor: editMode ? 'default' : 'pointer',
          transition: 'all 0.18s ease',
          transform: hov && !editMode ? 'translateY(-1px)' : 'none',
          boxShadow: hov && !editMode ? '0 6px 20px rgba(0,0,0,0.25)' : 'none',
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, flexShrink: 0,
          }}>{item.icon || '🔧'}</div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
              {item.name}
              {item.adapter && (
                <span style={{ fontSize: 9, color: 'var(--text-dim)', background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 4 }}>
                  {item.adapter}
                </span>
              )}
            </div>
            {item.description && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.description}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[status], boxShadow: `0 0 5px ${STATUS_COLOR[status]}` }} />
          </div>
        </div>
      </a>

      {editMode && (
        <button onClick={onRemove} style={{
          position: 'absolute', top: -6, right: -6,
          width: 20, height: 20, borderRadius: '50%',
          background: '#F87171', border: 'none',
          color: '#fff', fontSize: 11, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1,
        }}>✕</button>
      )}
    </div>
  )
}

export default function ServiceGrid({ services, editMode, onRemove }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
      {services.map((group, gi) => (
        <div key={gi}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
            <span style={{ fontSize: 14 }}>{group.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{group.category}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {group.items?.map((item, ii) => (
              <ServiceCard
                key={ii}
                item={item}
                editMode={editMode}
                onRemove={() => onRemove(gi, ii)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
