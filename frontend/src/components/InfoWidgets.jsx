// Şimdilik mock data — ileride adapter'lardan beslenecek
const MOCK = [
  { label: 'CPU', value: '23%', icon: '⚙️', color: '#4ADE80' },
  { label: 'RAM', value: '61%', icon: '🧠', color: '#60A5FA' },
  { label: 'Disk', value: '44%', icon: '💿', color: '#F59E0B' },
  { label: 'Network', value: '↑ 12MB', icon: '📡', color: '#A78BFA' },
]

export default function InfoWidgets() {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
      {MOCK.map((w, i) => (
        <div key={i} style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 10, padding: '7px 16px',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 13 }}>{w.icon}</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{w.label}</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: w.color, fontFamily: 'var(--mono)' }}>{w.value}</span>
        </div>
      ))}
    </div>
  )
}
