import { useState } from 'react'

export default function EditModal({ type, categories, onSave, onClose }) {
  const [catIdx, setCatIdx] = useState(0)
  const [form, setForm] = useState({ name: '', url: '', icon: '', description: '' })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = () => {
    if (!form.name || !form.url) return
    onSave(catIdx, { ...form })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, backdropFilter: 'blur(4px)',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#111827', border: '1px solid var(--border)',
        borderRadius: 16, padding: 28, width: 420,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>
          {type === 'service' ? '🔧 Servis Ekle' : '🔗 Bookmark Ekle'}
        </div>

        {/* Category selector */}
        <div>
          <Label>Kategori</Label>
          <select value={catIdx} onChange={e => setCatIdx(+e.target.value)} style={inputStyle}>
            {categories?.map((c, i) => (
              <option key={i} value={i}>{c.category}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <Label>Ad *</Label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="GitLab" style={inputStyle} />
          </div>
          <div>
            <Label>İkon (emoji)</Label>
            <input value={form.icon} onChange={e => set('icon', e.target.value)} placeholder="🦊" style={inputStyle} />
          </div>
        </div>

        <div>
          <Label>URL *</Label>
          <input value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://..." style={inputStyle} />
        </div>

        <div>
          <Label>Açıklama</Label>
          <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Kısa açıklama" style={inputStyle} />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={{ ...btnStyle, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>İptal</button>
          <button onClick={handleSave} style={{ ...btnStyle, background: 'var(--accent)', border: 'none', color: '#fff' }}>Kaydet</button>
        </div>
      </div>
    </div>
  )
}

function Label({ children }) {
  return <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 5, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{children}</div>
}

const inputStyle = {
  width: '100%', padding: '8px 12px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text)',
  fontSize: 13, outline: 'none',
  fontFamily: 'var(--font)',
}

const btnStyle = {
  padding: '8px 18px', borderRadius: 8,
  fontSize: 13, cursor: 'pointer',
  fontFamily: 'var(--font)', fontWeight: 500,
}
