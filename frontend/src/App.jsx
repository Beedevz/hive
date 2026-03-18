import { useState, useEffect, useRef } from 'react'
import { useConfig } from './hooks/useConfig'
import { useWindowSize } from './hooks/useWindowSize'
import { useAdapterStats } from './hooks/useAdapterStats'
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, rectSortingStrategy, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ─── Icon helper ──────────────────────────────────────────────────
// Renders a URL as <img> or falls back to emoji/text.
function renderIcon(icon, fallback, size = 24) {
  const val = icon || fallback || ''
  if (val.startsWith('http') || val.startsWith('/')) {
    return <img src={val} alt="" style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
  }
  return <span style={{ fontSize: size * 0.9, lineHeight: 1 }}>{val || fallback}</span>
}

// ─── Sub Components ───────────────────────────────────────────────

function ClockWidget() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 52, fontWeight: 300, letterSpacing: '-2px', color: '#F1F5F9', fontFamily: 'monospace', lineHeight: 1 }}>
        {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div style={{ fontSize: 13, color: '#64748B', marginTop: 6 }}>
        {now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
    </div>
  )
}

const WMO_ICONS = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '❄️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
}

function WeatherWidget({ widget }) {
  const [weather, setWeather] = useState(null)
  const cfg = widget?.config || {}

  useEffect(() => {
    const fetchWeather = async (lat, lon) => {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          `&current=temperature_2m,weathercode,windspeed_10m` +
          `&daily=temperature_2m_max,temperature_2m_min&timezone=auto`
        )
        const data = await res.json()
        setWeather(data)
      } catch {}
    }

    const resolveAndFetch = async () => {
      const name = cfg.location_name?.trim()
      if (name) {
        try {
          const geo = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1`
          )
          const geoData = await geo.json()
          const loc = geoData.results?.[0]
          if (loc) { fetchWeather(loc.latitude, loc.longitude); return }
        } catch {}
      }
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => fetchWeather(pos.coords.latitude, pos.coords.longitude),
          () => {}
        )
      }
    }

    resolveAndFetch()
  }, [cfg.location_name])

  if (!weather?.current) return null
  const cur = weather.current
  const daily = weather.daily
  const tMax = daily?.temperature_2m_max?.[0]
  const tMin = daily?.temperature_2m_min?.[0]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#64748B' }}>
      <span style={{ fontSize: 20 }}>{WMO_ICONS[cur.weathercode] || '🌡️'}</span>
      <span style={{ color: '#94A3B8', fontWeight: 500 }}>{Math.round(cur.temperature_2m)}°C</span>
      {tMax != null && tMin != null && (
        <span style={{ fontSize: 11 }}>
          <span style={{ color: '#F87171' }}>↑{Math.round(tMax)}°</span>
          {' '}
          <span style={{ color: '#60A5FA' }}>↓{Math.round(tMin)}°</span>
        </span>
      )}
      {cfg.location_name && <span style={{ color: '#475569' }}>· {cfg.location_name}</span>}
    </div>
  )
}

function ResourcesWidget() {
  const [stats, setStats] = useState(null)
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/system')
        setStats(await res.json())
      } catch {}
    }
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [])
  if (!stats) return null

  const Bar = ({ label, used, total, unit, percent, valueLabel }) => (
    <div style={{ width: 180 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569', marginBottom: 4 }}>
        <span>{label}</span>
        <span>{valueLabel ?? `${used}${unit} / ${total}${unit}`}</span>
      </div>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
        <div style={{
          height: '100%', borderRadius: 2, transition: 'width 0.4s',
          width: `${Math.min(percent, 100)}%`,
          background: percent > 90 ? '#F87171' : percent > 70 ? '#F59E0B' : '#4ADE80',
        }} />
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', gap: 24 }}>
      {stats.cpu_percent != null && (
        <Bar
          label="CPU"
          percent={stats.cpu_percent}
          valueLabel={`${stats.cpu_percent}%`}
        />
      )}
      {stats.ram?.total_mb > 0 && (
        <Bar
          label="RAM"
          used={(stats.ram.used_mb / 1024).toFixed(1)}
          total={(stats.ram.total_mb / 1024).toFixed(1)}
          unit="GB"
          percent={stats.ram.percent}
        />
      )}
      {stats.disk?.total_gb > 0 && (
        <Bar
          label="Disk"
          used={stats.disk.used_gb}
          total={stats.disk.total_gb}
          unit="GB"
          percent={stats.disk.percent}
        />
      )}
    </div>
  )
}

function WidgetBar({ config, settings }) {
  const widgets = (config?.widgets || []).filter(w => w.enabled !== false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      {settings?.show_greeting && settings?.greeting && (
        <div style={{ fontSize: 13, color: '#475569' }}>{settings.greeting}</div>
      )}
      {widgets.map((widget, i) => {
        switch (widget.type) {
          case 'clock':     return <ClockWidget key={i} />
          case 'search':    return <SearchBar key={i} config={config} />
          case 'resources': return <ResourcesWidget key={i} />
          case 'weather':   return <WeatherWidget key={i} widget={widget} />
          default:          return null
        }
      })}
    </div>
  )
}

const SEARCH_ENGINES = {
  google:     'https://www.google.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  bing:       'https://www.bing.com/search?q=',
  startpage:  'https://www.startpage.com/search?q=',
}

function SearchBar({ config }) {
  const [q, setQ] = useState('')

  const searchUrl = () => {
    const cfg = config?.widgets?.find(w => w.type === 'search')?.config
    const engine = cfg?.engine || 'google'
    if (engine === 'custom') return cfg?.url || SEARCH_ENGINES.google
    return SEARCH_ENGINES[engine] || SEARCH_ENGINES.google
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && q.trim()) {
      window.open(searchUrl() + encodeURIComponent(q), '_blank')
      setQ('')
    }
  }

  return (
    <div style={{ position: 'relative', width: 360 }}>
      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#475569' }}>🔍</span>
      <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={handleKey}
        placeholder="Search or enter URL..."
        style={{
          width: '100%', padding: '10px 16px 10px 40px',
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12, color: '#F1F5F9', fontSize: 14, outline: 'none', fontFamily: 'inherit',
        }} />
    </div>
  )
}

function StatusDot({ status }) {
  const colors = { online: '#4ADE80', warning: '#F59E0B', offline: '#F87171', unknown: '#475569' }
  const c = colors[status] || colors.unknown
  return <div style={{ width: 7, height: 7, borderRadius: '50%', background: c, boxShadow: `0 0 6px ${c}`, flexShrink: 0 }} />
}

const STAT_COLORS = {
  ok:    { bg: 'rgba(74,222,128,0.1)',  color: '#4ADE80' },
  warn:  { bg: 'rgba(245,158,11,0.1)',  color: '#F59E0B' },
  error: { bg: 'rgba(248,113,113,0.1)', color: '#F87171' },
  info:  { bg: 'rgba(255,255,255,0.06)', color: '#64748B' },
}

function StatPill({ label, value, status }) {
  const c = STAT_COLORS[status] || STAT_COLORS.info
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 7px', borderRadius: 5, fontSize: 10,
      background: c.bg, color: c.color,
    }}>
      <span style={{ color: '#475569' }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </span>
  )
}

function ServiceCard({ item, onEdit, onDelete, compact }) {
  const [hov, setHov] = useState(false)
  const [status, setStatus] = useState('unknown')
  const [latency, setLatency] = useState(null)
  const { stats, error: adapterError, loading: adapterLoading } = useAdapterStats(item.name, !!item.adapter)

  useEffect(() => {
    const check = async () => {
      if (!item.name) { setStatus('unknown'); return }
      try {
        const res = await fetch(`/api/probe/${encodeURIComponent(item.name)}/status`)
        const data = await res.json()
        setStatus(data.status)
        setLatency(data.latency_ms)
      } catch {
        setStatus('offline')
      }
    }
    check()
    const t = setInterval(check, 30000)
    return () => clearInterval(t)
  }, [item.name])

  return (
    <div style={{ position: 'relative' }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      <a href={item.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}
        title={[item.name, item.description].filter(Boolean).join('\n')}>
        <div style={{
          background: hov ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${hov ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)'}`,
          borderRadius: 12, padding: compact ? '10px 12px' : '14px 16px',
          display: 'flex', flexDirection: 'column', gap: 8,
          transition: 'all 0.18s ease',
          transform: hov ? 'translateY(-1px)' : 'none',
        }}>
          {/* Main row: icon + name/desc + status dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.07)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0,
            }}>{renderIcon(item.icon, '🔗', 22)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#E2E8F0', display: 'flex', alignItems: 'center', gap: 6 }}>
                {item.name}
                {item.tag && (
                  <span style={{ fontSize: 10, color: '#64748B', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 4 }}>
                    {item.tag}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#475569', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.description}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {status === 'online' && latency !== null && (
                <span style={{ fontSize: 10, color: '#334155' }}>{latency}ms</span>
              )}
              <StatusDot status={status} />
            </div>
          </div>
          {/* Adapter stats pills */}
          {item.adapter && (
            <div style={{ paddingLeft: 50 }}>
              {adapterLoading && (
                <span style={{ fontSize: 10, color: '#334155' }}>loading…</span>
              )}
              {!adapterLoading && adapterError && (
                <div style={{
                  fontSize: 11, color: '#F87171',
                  background: 'rgba(248,113,113,0.08)',
                  border: '1px solid rgba(248,113,113,0.2)',
                  borderRadius: 6, padding: '4px 8px',
                  display: 'flex', alignItems: 'flex-start', gap: 5,
                }}>
                  <span style={{ flexShrink: 0, marginTop: 1 }}>⚠</span>
                  <span style={{ wordBreak: 'break-all' }}>{adapterError}</span>
                </div>
              )}
              {!adapterLoading && !adapterError && stats.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {stats.map((s, i) => (
                    <StatPill key={i} label={s.label} value={s.value} status={s.status} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </a>
      {hov && onEdit && (
        <button onClick={(e) => { e.preventDefault(); onEdit(item) }}
          style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: 6,
            color: '#94A3B8', fontSize: 11, padding: '2px 8px', cursor: 'pointer',
          }}>✏️</button>
      )}
      {hov && onDelete && (
        <button onClick={(e) => { e.preventDefault(); onDelete() }}
          style={{
            position: 'absolute', top: 8, right: onEdit ? 46 : 8,
            background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: 6,
            color: '#F87171', fontSize: 11, padding: '2px 8px', cursor: 'pointer',
          }}>🗑</button>
      )}
    </div>
  )
}

function BookmarkCard({ item, onEdit, onDelete }) {
  const [hov, setHov] = useState(false)
  return (
    <div style={{ position: 'relative' }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      <a href={item.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'block' }}
        title={[item.name, item.description].filter(Boolean).join('\n')}>
        <div style={{
          background: hov ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10, padding: '0 14px',
          display: 'flex', alignItems: 'center', gap: 10,
          height: 52, overflow: 'hidden',
          transition: 'all 0.15s',
        }}>
          {renderIcon(item.icon, '🔖', 18)}
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#CBD5E1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
            {item.description && <div style={{ fontSize: 11, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>}
          </div>
        </div>
      </a>
      {hov && (
        <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
          {onEdit && (
            <button onClick={(e) => { e.preventDefault(); onEdit(item) }}
              style={{ background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: 5, color: '#94A3B8', fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}>✏️</button>
          )}
          {onDelete && (
            <button onClick={(e) => { e.preventDefault(); onDelete() }}
              style={{ background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: 5, color: '#94A3B8', fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}>🗑️</button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Modal: Add/Edit Bookmark ─────────────────────────────────────

function BookmarkModal({ bookmark, onSave, onClose }) {
  const [form, setForm] = useState(bookmark || { name: '', url: '', icon: '', description: '' })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 28, width: 420, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ color: '#F1F5F9', fontSize: 16, fontWeight: 600 }}>{bookmark ? 'Edit Bookmark' : 'New Bookmark'}</h3>
        {[['name','Name'],['url','URL'],['icon','Icon (emoji)'],['description','Description']].map(([k,l]) => (
          <div key={k}>
            <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>{l}</div>
            <input value={form[k] || ''} onChange={e => set(k, e.target.value)}
              style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#F1F5F9', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#94A3B8', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={() => onSave(form)} style={{ padding: '8px 20px', background: '#6366F1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Add/Edit/Rename Category ─────────────────────────────

function CategoryModal({ category, section, onSave, onClose }) {
  const defaults = { category: '', icon: section === 'services' ? '📦' : '🔖' }
  const [form, setForm] = useState(category ? { category: category.category, icon: category.icon || '' } : defaults)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 28, width: 360, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ color: '#F1F5F9', fontSize: 16, fontWeight: 600 }}>{category ? 'Rename Category' : 'New Category'}</h3>
        {[['category', 'Name'], ['icon', 'Icon (emoji)']].map(([k, l]) => (
          <div key={k}>
            <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>{l}</div>
            <input value={form[k] || ''} onChange={e => set(k, e.target.value)}
              style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#F1F5F9', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#94A3B8', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={() => form.category.trim() && onSave(form)} style={{ padding: '8px 20px', background: '#6366F1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Add/Edit Section (Tab) ───────────────────────────────

function SectionModal({ section, onSave, onClose }) {
  const [form, setForm] = useState({
    label: section?.label || '',
    icon: section?.icon || '',
    type: section?.type || 'services',
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const inputStyle = { width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#F1F5F9', fontSize: 13, outline: 'none', fontFamily: 'inherit' }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 28, width: 360, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ color: '#F1F5F9', fontSize: 16, fontWeight: 600 }}>{section ? 'Edit Tab' : 'New Tab'}</h3>
        <div>
          <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>Label</div>
          <input value={form.label} onChange={e => set('label', e.target.value)} placeholder="e.g. DevOps" style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>Icon (emoji)</div>
          <input value={form.icon} onChange={e => set('icon', e.target.value)} placeholder="e.g. ⚙️" style={inputStyle} />
        </div>
        {!section && (
          <div>
            <div style={{ fontSize: 11, color: '#64748B', marginBottom: 6 }}>Type</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['services', '🖥️ Services'], ['bookmarks', '🔖 Bookmarks']].map(([v, l]) => (
                <button key={v} onClick={() => set('type', v)} style={{
                  flex: 1, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                  background: form.type === v ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${form.type === v ? '#6366F1' : 'rgba(255,255,255,0.08)'}`,
                  color: form.type === v ? '#818CF8' : '#94A3B8',
                }}>{l}</button>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#94A3B8', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={() => form.label.trim() && onSave(form)} style={{ padding: '8px 20px', background: '#6366F1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Add/Edit Service ──────────────────────────────────────

const SI = 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/'
const ADAPTER_DEFS = {
  '':               { label: 'None',                icon: '',                                   fields: [] },
  // ── Monitoring ──────────────────────────────────────────────────
  adguard:          { label: 'AdGuard Home',        icon: SI+'adguard-home.svg',                fields: [{ key: 'username', label: 'Username', placeholder: '${ADGUARD_USER}' }, { key: 'password', label: 'Password', placeholder: '${ADGUARD_PASS}' }] },
  pihole:           { label: 'Pi-hole',             icon: SI+'pi-hole.svg',                     fields: [{ key: 'token', label: 'API Token (optional)', placeholder: '${PIHOLE_TOKEN}' }] },
  grafana:          { label: 'Grafana',             icon: SI+'grafana.svg',                     fields: [{ key: 'token', label: 'Service Account Token', placeholder: '${GRAFANA_TOKEN}' }] },
  netdata:          { label: 'Netdata',             icon: SI+'netdata.svg',                     fields: [] },
  'uptime-kuma':    { label: 'Uptime Kuma',         icon: SI+'uptime-kuma.svg',                 fields: [{ key: 'username', label: 'Username', placeholder: '${UPTIMEKUMA_USER}' }, { key: 'password', label: 'Password', placeholder: '${UPTIMEKUMA_PASS}', type: 'password' }] },
  // ── Infrastructure ───────────────────────────────────────────────
  proxmox:          { label: 'Proxmox',             icon: SI+'proxmox.svg',                     fields: [{ key: 'token', label: 'API Token', placeholder: '${PROXMOX_TOKEN}', hint: 'Format: USER@REALM!TOKENID=SECRET' }] },
  portainer:        { label: 'Portainer',           icon: SI+'portainer.svg',                   fields: [{ key: 'token', label: 'API Key', placeholder: '${PORTAINER_TOKEN}' }] },
  traefik:          { label: 'Traefik',             icon: SI+'traefik.svg',                     fields: [{ key: 'username', label: 'Username (optional)', placeholder: '${TRAEFIK_USER}' }, { key: 'password', label: 'Password (optional)', placeholder: '${TRAEFIK_PASS}' }] },
  npm:              { label: 'Nginx Proxy Manager', icon: SI+'nginx-proxy-manager.svg',         fields: [{ key: 'username', label: 'Username / E-mail', placeholder: '${NPM_USER}' }, { key: 'password', label: 'Password', placeholder: '${NPM_PASS}' }] },
  // ── Media ────────────────────────────────────────────────────────
  jellyfin:         { label: 'Jellyfin',            icon: SI+'jellyfin.svg',                    fields: [{ key: 'token', label: 'API Key', placeholder: '${JELLYFIN_TOKEN}' }] },
  plex:             { label: 'Plex',                icon: SI+'plex.svg',                        fields: [{ key: 'token', label: 'X-Plex-Token', placeholder: '${PLEX_TOKEN}' }] },
  sonarr:           { label: 'Sonarr',              icon: SI+'sonarr.svg',                      fields: [{ key: 'apikey', label: 'API Key', placeholder: '${SONARR_APIKEY}' }] },
  radarr:           { label: 'Radarr',              icon: SI+'radarr.svg',                      fields: [{ key: 'apikey', label: 'API Key', placeholder: '${RADARR_APIKEY}' }] },
  qbittorrent:      { label: 'qBittorrent',         icon: SI+'qbittorrent.svg',                 fields: [{ key: 'username', label: 'Username', placeholder: '${QB_USER}' }, { key: 'password', label: 'Password', placeholder: '${QB_PASS}', type: 'password' }] },
  // ── Services ─────────────────────────────────────────────────────
  nextcloud:        { label: 'Nextcloud',           icon: SI+'nextcloud.svg',                   fields: [{ key: 'username', label: 'Admin Username', placeholder: '${NC_USER}' }, { key: 'password', label: 'Password', placeholder: '${NC_PASS}', type: 'password' }] },
  immich:           { label: 'Immich',              icon: SI+'immich.svg',                      fields: [{ key: 'apikey', label: 'API Key', placeholder: '${IMMICH_APIKEY}' }] },
  vaultwarden:      { label: 'Vaultwarden',         icon: SI+'vaultwarden.svg',                 fields: [] },
  homeassistant:    { label: 'Home Assistant',      icon: SI+'home-assistant.svg',              fields: [{ key: 'token', label: 'Long-Lived Access Token', placeholder: '${HASS_TOKEN}' }] },
  // ── Arr stack ────────────────────────────────────────────────────
  lidarr:           { label: 'Lidarr',              icon: SI+'lidarr.svg',                      fields: [{ key: 'apikey', label: 'API Key', placeholder: '${LIDARR_APIKEY}' }] },
  readarr:          { label: 'Readarr',             icon: SI+'readarr.svg',                     fields: [{ key: 'apikey', label: 'API Key', placeholder: '${READARR_APIKEY}' }] },
  prowlarr:         { label: 'Prowlarr',            icon: SI+'prowlarr.svg',                    fields: [{ key: 'apikey', label: 'API Key', placeholder: '${PROWLARR_APIKEY}' }] },
  bazarr:           { label: 'Bazarr',              icon: SI+'bazarr.svg',                      fields: [{ key: 'apikey', label: 'API Key', placeholder: '${BAZARR_APIKEY}' }] },
  emby:             { label: 'Emby',                icon: SI+'emby.svg',                        fields: [{ key: 'token', label: 'API Key', placeholder: '${EMBY_TOKEN}' }] },
  overseerr:        { label: 'Overseerr',           icon: SI+'overseerr.svg',                   fields: [{ key: 'apikey', label: 'API Key', placeholder: '${OVERSEERR_APIKEY}' }] },
  jellyseerr:       { label: 'Jellyseerr',          icon: SI+'jellyseerr.svg',                  fields: [{ key: 'apikey', label: 'API Key', placeholder: '${JELLYSEERR_APIKEY}' }] },
  // ── Download ─────────────────────────────────────────────────────
  sabnzbd:          { label: 'SABnzbd',             icon: SI+'sabnzbd.svg',                     fields: [{ key: 'apikey', label: 'API Key', placeholder: '${SABNZBD_APIKEY}' }] },
  nzbget:           { label: 'NZBGet',              icon: SI+'nzbget.svg',                      fields: [{ key: 'username', label: 'Username', placeholder: '${NZBGET_USER}' }, { key: 'password', label: 'Password', placeholder: '${NZBGET_PASS}', type: 'password' }] },
  transmission:     { label: 'Transmission',        icon: SI+'transmission.svg',                fields: [{ key: 'username', label: 'Username', placeholder: '${TR_USER}' }, { key: 'password', label: 'Password', placeholder: '${TR_PASS}', type: 'password' }] },
  deluge:           { label: 'Deluge',              icon: SI+'deluge.svg',                      fields: [{ key: 'password', label: 'Password', placeholder: '${DELUGE_PASS}', type: 'password' }] },
  // ── System ───────────────────────────────────────────────────────
  glances:          { label: 'Glances',             icon: SI+'glances.svg',                     fields: [] },
  truenas:          { label: 'TrueNAS',             icon: SI+'truenas.svg',                     fields: [{ key: 'apikey', label: 'API Key', placeholder: '${TRUENAS_APIKEY}' }] },
  scrutiny:         { label: 'Scrutiny',            icon: SI+'scrutiny.svg',                    fields: [] },
  synology:         { label: 'Synology DSM',        icon: SI+'synology.svg',                    fields: [{ key: 'username', label: 'Username', placeholder: '${SYNO_USER}' }, { key: 'password', label: 'Password', placeholder: '${SYNO_PASS}', type: 'password' }] },
  unifi:            { label: 'UniFi',               icon: SI+'ubiquiti.svg',                    fields: [{ key: 'username', label: 'Username', placeholder: '${UNIFI_USER}' }, { key: 'password', label: 'Password', placeholder: '${UNIFI_PASS}', type: 'password' }, { key: 'site', label: 'Site (default: default)', placeholder: 'default' }] },
  opnsense:         { label: 'OPNsense',            icon: SI+'opnsense.svg',                    fields: [{ key: 'apikey', label: 'API Key', placeholder: '${OPNS_KEY}' }, { key: 'apisecret', label: 'API Secret', placeholder: '${OPNS_SECRET}', type: 'password' }] },
  frigate:          { label: 'Frigate NVR',         icon: SI+'frigate.svg',                     fields: [] },
  watchtower:       { label: 'Watchtower',          icon: SI+'watchtower.svg',                  fields: [{ key: 'token', label: 'HTTP API Token', placeholder: '${WATCHTOWER_TOKEN}' }] },
  // ── Storage ───────────────────────────────────────────────────────
  wdmycloud:        { label: 'WD My Cloud',         icon: SI+'western-digital.svg',             fields: [{ key: 'username', label: 'Username', placeholder: '${WD_USER}' }, { key: 'password', label: 'Password', placeholder: '${WD_PASS}', type: 'password' }] },
  // ── Dev & Tools ──────────────────────────────────────────────────
  gitlab:           { label: 'GitLab',              icon: SI+'gitlab.svg',                      fields: [{ key: 'token', label: 'Token', placeholder: '${GITLAB_TOKEN}' }] },
  gitea:            { label: 'Gitea',               icon: SI+'gitea.svg',                       fields: [{ key: 'token', label: 'API Token', placeholder: '${GITEA_TOKEN}' }] },
  forgejo:          { label: 'Forgejo',             icon: SI+'forgejo.svg',                     fields: [{ key: 'token', label: 'API Token', placeholder: '${FORGEJO_TOKEN}' }] },
  paperless:        { label: 'Paperless-ngx',       icon: SI+'paperless-ngx.svg',               fields: [{ key: 'token', label: 'API Token', placeholder: '${PAPERLESS_TOKEN}' }] },
  firefly:          { label: 'Firefly III',         icon: SI+'firefly-iii.svg',                 fields: [{ key: 'token', label: 'Personal Access Token', placeholder: '${FIREFLY_TOKEN}' }] },
  speedtest:        { label: 'Speedtest Tracker',   icon: SI+'speedtest-tracker.svg',           fields: [] },
  // ── Network ──────────────────────────────────────────────────────
  cloudflare:       { label: 'Cloudflare Tunnels',  icon: SI+'cloudflare.svg',                  fields: [{ key: 'apikey', label: 'API Token', placeholder: '${CF_TOKEN}' }, { key: 'accountid', label: 'Account ID', placeholder: '${CF_ACCOUNT_ID}' }] },
  tailscale:        { label: 'Tailscale',           icon: SI+'tailscale.svg',                   fields: [{ key: 'apikey', label: 'API Key', placeholder: '${TS_APIKEY}' }, { key: 'tailnet', label: 'Tailnet', placeholder: '${TS_TAILNET}' }] },
}

// ─── Secret Field Picker ──────────────────────────────────────────

function SecretFieldPicker({ token, onSelect }) {
  const [open, setOpen] = useState(false)
  const [keys, setKeys] = useState([])
  const [newMode, setNewMode] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')

  const load = async () => {
    const res = await fetch('/api/secrets', { headers: { 'X-Hive-Token': token } })
    if (res.ok) { const d = await res.json(); setKeys((d.keys || []).sort()) }
  }

  const toggle = () => { if (!open) load(); setOpen(v => !v); setNewMode(false) }

  const saveNew = async () => {
    if (!newKey.trim() || !newVal.trim()) return
    await fetch('/api/secrets', {
      method: 'PUT',
      headers: { 'X-Hive-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: newKey.trim(), value: newVal.trim() }),
    })
    onSelect(`\${secret:${newKey.trim()}}`)
    setOpen(false); setNewMode(false); setNewKey(''); setNewVal('')
  }

  const iStyle = { padding: '5px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#F1F5F9', fontSize: 11, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={toggle} title="Insert secret reference"
        style={{ padding: '6px 8px', background: open ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${open ? '#6366F1' : 'rgba(255,255,255,0.1)'}`, borderRadius: 7, color: '#818CF8', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>
        🔑
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', background: '#0F172A', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 8, width: 220, zIndex: 200, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {!newMode ? (
            <>
              {keys.length === 0 && <div style={{ fontSize: 11, color: '#475569', padding: '4px 6px' }}>No secrets yet</div>}
              {keys.map(k => (
                <button key={k} type="button" onClick={() => { onSelect(`\${secret:${k}}`); setOpen(false) }}
                  style={{ padding: '6px 10px', background: 'none', border: 'none', borderRadius: 6, color: '#94A3B8', fontSize: 11, textAlign: 'left', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <code>{k}</code>
                </button>
              ))}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '2px 0' }} />
              <button type="button" onClick={() => setNewMode(true)}
                style={{ padding: '6px 10px', background: 'none', border: 'none', borderRadius: 6, color: '#6366F1', fontSize: 11, textAlign: 'left', cursor: 'pointer' }}>
                + New secret
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10, color: '#64748B', padding: '2px 2px' }}>New secret</div>
              <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="KEY_NAME" style={iStyle} />
              <input value={newVal} onChange={e => setNewVal(e.target.value)} placeholder="value" type="password" style={iStyle} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => setNewMode(false)}
                  style={{ flex: 1, padding: '5px 0', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: 11 }}>Back</button>
                <button type="button" onClick={saveNew}
                  style={{ flex: 1, padding: '5px 0', background: '#6366F1', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 11 }}>Save</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ServiceModal({ service, onSave, onClose, token }) {
  const [form, setForm] = useState(service || { name: '', url: '', icon: '', description: '', tag: '', adapter: '', adapter_config: {} })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const setAdapterCfg = (k, v) => setForm(p => ({ ...p, adapter_config: { ...(p.adapter_config || {}), [k]: v } }))

  const adapterDef = ADAPTER_DEFS[form.adapter || ''] || ADAPTER_DEFS['']
  const inputStyle = { width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#F1F5F9', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 28, width: 440, maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ color: '#F1F5F9', fontSize: 16, fontWeight: 600 }}>{service ? 'Edit Service' : 'New Service'}</h3>

        {/* Basic fields */}
        {[['name','Name'],['url','URL'],['description','Description'],['tag','Tag (e.g. v1.0)']].map(([k,l]) => (
          <div key={k}>
            <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>{l}</div>
            <input value={form[k] || ''} onChange={e => set(k, e.target.value)} style={inputStyle} />
          </div>
        ))}
        <div>
          <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>Icon <span style={{ color: '#334155' }}>— emoji or image URL</span></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={form.icon || ''} onChange={e => set('icon', e.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder="🔗 or https://..." />
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {renderIcon(form.icon, '🔗', 22)}
            </div>
          </div>
        </div>

        {/* Adapter selector */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>
          <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>Adapter <span style={{ color: '#334155' }}>— live stats integration</span></div>
          <select
            value={form.adapter || ''}
            onChange={e => {
              const def = ADAPTER_DEFS[e.target.value] || ADAPTER_DEFS['']
              const adapterIcons = new Set(Object.values(ADAPTER_DEFS).map(d => d.icon).filter(Boolean))
              setForm(p => {
                const isAutoIcon = !p.icon || adapterIcons.has(p.icon)
                return { ...p, adapter: e.target.value, icon: isAutoIcon ? (def.icon || '') : p.icon }
              })
            }}
            style={{ ...inputStyle, appearance: 'none' }}>
            {Object.entries(ADAPTER_DEFS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        {/* Adapter config fields */}
        {adapterDef.fields.map(field => (
          <div key={field.key}>
            <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>
              {field.label}
              {field.hint && <span style={{ color: '#334155', marginLeft: 6 }}>({field.hint})</span>}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                value={(form.adapter_config || {})[field.key] || ''}
                onChange={e => setAdapterCfg(field.key, e.target.value)}
                placeholder={field.placeholder}
                style={{ ...inputStyle, flex: 1 }}
              />
              {token && <SecretFieldPicker token={token} onSelect={v => setAdapterCfg(field.key, v)} />}
            </div>
            <div style={{ fontSize: 10, color: '#334155', marginTop: 3 }}>
              Use <code style={{ color: '#475569' }}>${'{'}ENV_VAR{'}'}</code> or <code style={{ color: '#475569' }}>${'{'}secret:KEY{'}'}</code>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#94A3B8', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={() => onSave(form)} style={{ padding: '8px 20px', background: '#6366F1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ─── Widgets Panel ────────────────────────────────────────────────

const WIDGET_DEFS = [
  { type: 'clock',     label: 'Clock',     icon: '🕐', fields: [] },
  { type: 'search',    label: 'Search',    icon: '🔍', fields: [
    { key: 'engine', label: 'Engine', type: 'select',
      options: ['google','duckduckgo','bing','startpage','custom'] },
    { key: 'url', label: 'Custom URL', type: 'text', showIf: cfg => cfg?.engine === 'custom',
      placeholder: 'https://searxng.example.com/search?q=' },
  ]},
  { type: 'resources', label: 'Resources', icon: '📊', fields: [] },
  { type: 'weather',   label: 'Weather',   icon: '🌤️', fields: [
    { key: 'location_name', label: 'City / Location', type: 'text', placeholder: 'Istanbul  (leave empty to auto-detect)' },
  ]},
]

function WidgetsPanel({ config, onSave, onClose }) {
  const widgets = config?.widgets || []

  const getWidget = (type) =>
    widgets.find(w => w.type === type) || { type, enabled: false, config: {} }

  const [draft, setDraft] = useState(() =>
    WIDGET_DEFS.map(def => getWidget(def.type))
  )

  const toggle = (i) => {
    setDraft(d => d.map((w, idx) => idx === i ? { ...w, enabled: !w.enabled } : w))
  }

  const setField = (i, key, value) => {
    setDraft(d => d.map((w, idx) =>
      idx === i ? { ...w, config: { ...(w.config || {}), [key]: value } } : w
    ))
  }

  const save = () => {
    const newConfig = { ...config, widgets: draft }
    onSave(newConfig)
    onClose()
  }

  const inputStyle = {
    width: '100%', padding: '6px 10px', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
    color: '#F1F5F9', fontSize: 12, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 90,
      }} />
      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, width: 340, height: '100vh',
        background: '#0F172A', borderLeft: '1px solid rgba(255,255,255,0.08)',
        zIndex: 100, display: 'flex', flexDirection: 'column',
        animation: 'slideIn 0.22s ease',
      }}>
        <style>{`@keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>

        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#F1F5F9' }}>Widgets</span>
          <button type="button" onClick={onClose} style={{
            background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 18, lineHeight: 1,
          }}>✕</button>
        </div>

        {/* Widget list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {WIDGET_DEFS.map((def, i) => {
            const w = draft[i]
            return (
              <div key={def.type} style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 10, padding: '12px 14px',
              }}>
                {/* Row: icon + label + toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: def.fields.length && w.enabled ? 12 : 0 }}>
                  <span style={{ fontSize: 18 }}>{def.icon}</span>
                  <span style={{ flex: 1, fontSize: 13, color: '#CBD5E1', fontWeight: 500 }}>{def.label}</span>
                  {/* Toggle */}
                  <div onClick={() => toggle(i)} style={{
                    width: 36, height: 20, borderRadius: 10, cursor: 'pointer', position: 'relative',
                    background: w.enabled ? '#6366F1' : 'rgba(255,255,255,0.1)',
                    transition: 'background 0.2s',
                  }}>
                    <div style={{
                      position: 'absolute', top: 3, left: w.enabled ? 18 : 3,
                      width: 14, height: 14, borderRadius: '50%', background: '#fff',
                      transition: 'left 0.2s',
                    }} />
                  </div>
                </div>

                {/* Config fields — only when enabled */}
                {w.enabled && def.fields.map(field => {
                  if (field.showIf && !field.showIf(w.config)) return null
                  return (
                    <div key={field.key} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>{field.label}</div>
                      {field.type === 'select' ? (
                        <select
                          value={w.config?.[field.key] || field.options[0]}
                          onChange={e => setField(i, field.key, e.target.value)}
                          style={{ ...inputStyle, appearance: 'none' }}>
                          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input
                          type={field.type}
                          value={w.config?.[field.key] || ''}
                          placeholder={field.placeholder}
                          onChange={e => setField(i, field.key, field.type === 'number' ? parseFloat(e.target.value) || '' : e.target.value)}
                          style={inputStyle}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8 }}>
          <button type="button" onClick={onClose} style={{
            flex: 1, padding: '8px 0', background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
            color: '#94A3B8', cursor: 'pointer', fontSize: 13,
          }}>Cancel</button>
          <button type="button" onClick={save} style={{
            flex: 2, padding: '8px 0', background: '#6366F1', border: 'none',
            borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500,
          }}>Save</button>
        </div>
      </div>
    </>
  )
}

// ─── Secrets Panel ────────────────────────────────────────────────

function SecretsPanel({ token, onClose }) {
  const [keys, setKeys] = useState([])
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const importRef = useRef(null)

  const headers = { 'X-Hive-Token': token, 'Content-Type': 'application/json' }

  const fetchKeys = async () => {
    const res = await fetch('/api/secrets', { headers })
    if (res.ok) {
      const data = await res.json()
      setKeys((data.keys || []).sort())
    }
    setLoading(false)
  }

  useEffect(() => { fetchKeys() }, [])

  const addSecret = async () => {
    if (!newKey.trim() || !newVal.trim()) return
    await fetch('/api/secrets', { method: 'PUT', headers, body: JSON.stringify({ key: newKey.trim(), value: newVal.trim() }) })
    setNewKey(''); setNewVal('')
    fetchKeys()
  }

  const deleteSecret = async (key) => {
    if (!confirm(`Delete secret "${key}"?`)) return
    await fetch(`/api/secrets?key=${encodeURIComponent(key)}`, { method: 'DELETE', headers })
    fetchKeys()
  }

  const exportSecrets = async () => {
    const res = await fetch('/api/secrets/backup', { headers })
    if (!res.ok) return alert('No secrets to export.')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'secrets.yaml'; a.click()
    URL.revokeObjectURL(url)
  }

  const importSecrets = async (file) => {
    setImporting(true)
    const text = await file.text()
    const res = await fetch('/api/secrets/import', {
      method: 'POST',
      headers: { 'X-Hive-Token': token, 'Content-Type': 'application/x-yaml' },
      body: text,
    })
    setImporting(false)
    if (res.ok) fetchKeys()
    else alert('Import failed: ' + await res.text())
  }

  const inputStyle = {
    padding: '7px 10px', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7,
    color: '#F1F5F9', fontSize: 12, outline: 'none', fontFamily: 'inherit',
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 90 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 360,
        background: '#0F172A', borderLeft: '1px solid rgba(255,255,255,0.08)',
        zIndex: 100, display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: '#F1F5F9', fontSize: 14, fontWeight: 600 }}>🔑 Secrets</div>
            <div style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>Use <code style={{ color: '#818CF8', background: 'rgba(99,102,241,0.1)', padding: '1px 4px', borderRadius: 3 }}>{'${secret:KEY}'}</code> in adapter fields</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        {/* Key list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {loading ? (
            <div style={{ color: '#475569', fontSize: 12, textAlign: 'center', paddingTop: 24 }}>Loading…</div>
          ) : keys.length === 0 ? (
            <div style={{ color: '#475569', fontSize: 12, textAlign: 'center', paddingTop: 24 }}>No secrets yet</div>
          ) : keys.map(key => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
              <code style={{ flex: 1, fontSize: 12, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{key}</code>
              <span style={{ fontSize: 11, color: '#1E293B', letterSpacing: 2 }}>••••••</span>
              <button onClick={() => deleteSecret(key)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 13, padding: '0 2px', lineHeight: 1 }}>🗑️</button>
            </div>
          ))}
        </div>

        {/* Add secret */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: '#64748B', fontWeight: 500 }}>Add / Update Secret</div>
          <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="KEY_NAME" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
          <input value={newVal} onChange={e => setNewVal(e.target.value)} placeholder="value" type="password" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
            onKeyDown={e => e.key === 'Enter' && addSecret()} />
          <button onClick={addSecret} style={{ padding: '8px 0', background: '#6366F1', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
            Save Secret
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={exportSecrets} style={{ flex: 1, padding: '7px 0', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#94A3B8', cursor: 'pointer', fontSize: 12 }}>
              ⬇ Export
            </button>
            <button onClick={() => importRef.current.click()} style={{ flex: 1, padding: '7px 0', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#94A3B8', cursor: 'pointer', fontSize: 12 }}>
              {importing ? 'Importing…' : '⬆ Import'}
            </button>
            <input ref={importRef} type="file" accept=".yaml,.yml" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files[0]; if (f) { importSecrets(f); e.target.value = '' } }} />
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Config Menu (Export / Import) ───────────────────────────────

function ConfigMenu({ onExport, onImport, onWidgets, onSecrets }) {
  const [open, setOpen] = useState(false)
  const fileRef = useRef(null)

  const menuBtnStyle = {
    display: 'block', width: '100%', padding: '8px 14px', background: 'none',
    border: 'none', borderRadius: 6, color: '#CBD5E1', fontSize: 12,
    textAlign: 'left', cursor: 'pointer',
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          padding: '6px 14px', background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
          color: '#94A3B8', cursor: 'pointer', fontSize: 12,
        }}>
        ⚙ Config
      </button>
      {open && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)',
            background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10, padding: 4, minWidth: 140, zIndex: 200,
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
          <button type="button" style={menuBtnStyle}
            onMouseEnter={e => e.target.style.background = 'rgba(255,255,255,0.06)'}
            onMouseLeave={e => e.target.style.background = 'none'}
            onClick={() => { onWidgets(); setOpen(false) }}>
            🧩 Widgets
          </button>
          <button type="button" style={menuBtnStyle}
            onMouseEnter={e => e.target.style.background = 'rgba(255,255,255,0.06)'}
            onMouseLeave={e => e.target.style.background = 'none'}
            onClick={() => { onSecrets(); setOpen(false) }}>
            🔑 Secrets
          </button>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '2px 8px' }} />
          <button type="button" style={menuBtnStyle}
            onMouseEnter={e => e.target.style.background = 'rgba(255,255,255,0.06)'}
            onMouseLeave={e => e.target.style.background = 'none'}
            onClick={() => { onExport(); setOpen(false) }}>
            ⬇ Export
          </button>
          <button type="button" style={menuBtnStyle}
            onMouseEnter={e => e.target.style.background = 'rgba(255,255,255,0.06)'}
            onMouseLeave={e => e.target.style.background = 'none'}
            onClick={() => fileRef.current.click()}>
            ⬆ Import
          </button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".yaml,.yml,.json"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files[0]
          if (f) { onImport(f); setOpen(false); e.target.value = '' }
        }}
      />
    </div>
  )
}

// ─── Token Gate ──────────────────────────────────────────────────

function TokenGate({ onUnlock, isUnlocked, onLock }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [err, setErr] = useState(false)
  const [checking, setChecking] = useState(false)

  const verify = async () => {
    setChecking(true)
    setErr(false)
    const ok = await onUnlock(input)
    setChecking(false)
    if (ok) {
      setOpen(false)
      setInput('')
    } else {
      setErr(true)
    }
  }

  const lock = () => {
    onLock()
    setOpen(false)
    setInput('')
    setErr(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => isUnlocked ? lock() : setOpen(v => !v)}
        title={isUnlocked ? 'Lock (click to log out)' : 'Enter token to enable editing'}
        style={{
          background: isUnlocked ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${isUnlocked ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 8, color: isUnlocked ? '#818CF8' : '#475569',
          fontSize: 14, padding: '5px 10px', cursor: 'pointer',
        }}>
        {isUnlocked ? '🔓' : '🔒'}
      </button>
      {open && !isUnlocked && (
        <form
          onSubmit={e => { e.preventDefault(); e.stopPropagation(); verify() }}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 8px)',
            background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12, padding: 16, width: 240, zIndex: 200,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
          <div style={{ fontSize: 11, color: '#64748B' }}>Enter your Hive token</div>
          <input
            type="password"
            value={input}
            onChange={e => { setInput(e.target.value); setErr(false) }}
            autoFocus
            placeholder="token"
            style={{
              padding: '7px 10px', background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${err ? '#F87171' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 7, color: '#F1F5F9', fontSize: 13, outline: 'none',
            }}
          />
          {err && <div style={{ fontSize: 11, color: '#F87171' }}>Invalid token</div>}
          <button
            type="submit"
            disabled={checking || !input.trim()}
            style={{
              padding: '7px 0', background: '#6366F1', border: 'none',
              borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', opacity: checking || !input.trim() ? 0.5 : 1,
            }}>
            {checking ? 'Checking…' : 'Unlock'}
          </button>
        </form>
      )}
    </div>
  )
}

// ─── Sortable category wrapper ───────────────────────────────────

function SortableItem({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 10 : 'auto' }}>
      {children(listeners, attributes)}
    </div>
  )
}

function TabSortableItem({ id, disabled, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, display: 'flex', alignItems: 'center' }}>
      {children(listeners, attributes, isDragging)}
    </div>
  )
}

// ─── Main App ────────────────────────────────────────────────────

export default function App() {
  const { config, loading, error, saving, save, backup, importConfig, verifyToken } = useConfig()
  const { width } = useWindowSize()
  const [editModal, setEditModal] = useState(null)
  const [visible, setVisible] = useState(false)
  const [token, setToken] = useState(() => localStorage.getItem('hive_token') || '')
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [widgetsPanelOpen, setWidgetsPanelOpen] = useState(false)
  const [secretsPanelOpen, setSecretsPanelOpen] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [logoVer, setLogoVer] = useState(Date.now())
  const [activeTab, setActiveTab] = useState('services')
  const [collapsedCategories, setCollapsedCategories] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('hive_collapsed') || '[]')) }
    catch { return new Set() }
  })
  const [searchQuery, setSearchQuery] = useState('')
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  )

  // Re-validate stored token on load
  useEffect(() => {
    if (token) {
      verifyToken(token).then(ok => setIsUnlocked(ok))
    }
  }, [])

  useEffect(() => {
    fetch('/api/version').then(r => r.json()).then(d => setAppVersion(d.version || '')).catch(() => {})
  }, [])

  const handleUnlock = async (t) => {
    const ok = await verifyToken(t)
    if (ok) {
      setToken(t)
      setIsUnlocked(true)
      localStorage.setItem('hive_token', t)
    }
    return ok
  }

  const handleLock = () => {
    setIsUnlocked(false)
    setToken('')
    localStorage.removeItem('hive_token')
  }

  const authSave = (newConfig) => save(newConfig, token)
  const authBackup = () => backup(token)
  const authImport = (file) => importConfig(file, token)

  const isMobile = width < 768
  const getColumns = () => {
    if (width < 768) return 1
    if (width < 1100) return 2
    return Math.min(config?.settings?.columns || 2, 4)
  }

  useEffect(() => { if (!loading) setTimeout(() => setVisible(true), 50) }, [loading])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0A0F1E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontFamily: 'system-ui' }}>
      Loading...
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', background: '#0A0F1E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#F87171', fontFamily: 'system-ui' }}>
      <div>Failed to load config: {error}</div>
      <div style={{ fontSize: 13, color: '#475569' }}>Is config-api running? (/api/config)</div>
    </div>
  )

  const { settings = {} } = config

  const tabs = config.sections?.length
    ? config.sections
    : [
        { key: 'services', label: 'Services', icon: '', type: 'services' },
        { key: 'bookmarks', label: 'Bookmarks', icon: '', type: 'bookmarks' },
      ]
  const activeSection = tabs.find(t => t.key === activeTab) || tabs[0]

  // ── Handlers ──
  const handleSaveService = async (form) => {
    const { categoryIdx, itemIdx, section } = editModal
    const sectionKey = section || 'services'
    const newConfig = JSON.parse(JSON.stringify(config))
    const cleaned = { ...form }
    if (!cleaned.adapter) {
      delete cleaned.adapter
      delete cleaned.adapter_config
    } else {
      const cfg = { ...(cleaned.adapter_config || {}) }
      Object.keys(cfg).forEach(k => { if (!cfg[k]) delete cfg[k] })
      cleaned.adapter_config = Object.keys(cfg).length ? cfg : undefined
      if (!cleaned.adapter_config) delete cleaned.adapter_config
    }
    if (itemIdx !== undefined) {
      newConfig[sectionKey][categoryIdx].items[itemIdx] = { ...newConfig[sectionKey][categoryIdx].items[itemIdx], ...cleaned }
    } else {
      newConfig[sectionKey][categoryIdx].items.push(cleaned)
    }
    await authSave(newConfig)
    setEditModal(null)
  }

  const handleDeleteService = async (sectionKey, catIdx, itemIdx) => {
    if (!confirm('Delete this service?')) return
    const newConfig = JSON.parse(JSON.stringify(config))
    newConfig[sectionKey][catIdx].items.splice(itemIdx, 1)
    await authSave(newConfig)
  }

  const handleSaveBookmark = async (form) => {
    const { categoryIdx, itemIdx, section } = editModal
    const sectionKey = section || 'bookmarks'
    const newConfig = JSON.parse(JSON.stringify(config))
    if (itemIdx !== undefined) {
      newConfig[sectionKey][categoryIdx].items[itemIdx] = { ...newConfig[sectionKey][categoryIdx].items[itemIdx], ...form }
    } else {
      newConfig[sectionKey][categoryIdx].items.push(form)
    }
    await authSave(newConfig)
    setEditModal(null)
  }

  const handleDeleteBookmark = async (sectionKey, catIdx, itemIdx) => {
    if (!confirm('Delete this bookmark?')) return
    const newConfig = JSON.parse(JSON.stringify(config))
    newConfig[sectionKey][catIdx].items.splice(itemIdx, 1)
    await authSave(newConfig)
  }

  const handleSaveCategory = async (form) => {
    const { section, categoryIdx } = editModal
    const newConfig = JSON.parse(JSON.stringify(config))
    const list = newConfig[section]
    if (categoryIdx !== undefined) {
      list[categoryIdx] = { ...list[categoryIdx], category: form.category.trim(), icon: form.icon }
    } else {
      list.push({ category: form.category.trim(), icon: form.icon, items: [] })
    }
    await authSave(newConfig)
    setEditModal(null)
  }

  const handleDeleteCategory = async (section, catIdx) => {
    const list = config[section]
    const hasItems = (list[catIdx].items || []).length > 0
    if (hasItems && !confirm(`"${list[catIdx].category}" contains items. Delete anyway?`)) return
    const newConfig = JSON.parse(JSON.stringify(config))
    newConfig[section].splice(catIdx, 1)
    await authSave(newConfig)
  }


  const handleLogoUpload = async (file) => {
    if (!file) return
    const fd = new FormData()
    fd.append('logo', file)
    const res = await fetch('/api/logo', {
      method: 'POST',
      headers: { 'X-Hive-Token': token },
      body: fd,
    })
    if (res.ok) setLogoVer(Date.now())
    else alert('Logo upload failed: ' + (await res.text()))
  }

  const handleLogoDelete = async () => {
    const res = await fetch('/api/logo', {
      method: 'DELETE',
      headers: { 'X-Hive-Token': token },
    })
    if (res.ok) setLogoVer(Date.now())
  }

  const handleSaveSection = async (form) => {
    const { sectionIdx } = editModal
    const newConfig = JSON.parse(JSON.stringify(config))
    if (sectionIdx !== undefined) {
      newConfig.sections[sectionIdx] = { ...newConfig.sections[sectionIdx], label: form.label, icon: form.icon }
    } else {
      const newKey = form.label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || `tab_${Date.now()}`
      const baseSections = config.sections?.length
        ? [...config.sections]
        : [
            { key: 'services', label: 'Services', icon: '', type: 'services' },
            { key: 'bookmarks', label: 'Bookmarks', icon: '', type: 'bookmarks' },
          ]
      newConfig.sections = [...baseSections, { key: newKey, label: form.label.trim(), icon: form.icon, type: form.type }]
      newConfig[newKey] = []
      setActiveTab(newKey)
    }
    await authSave(newConfig)
    setEditModal(null)
  }

  const handleReorderTabs = async (activeId, overId) => {
    const oldIndex = tabs.findIndex(t => t.key === activeId)
    const newIndex = tabs.findIndex(t => t.key === overId)
    if (oldIndex === newIndex) return
    const newConfig = JSON.parse(JSON.stringify(config))
    const baseSections = config.sections?.length
      ? config.sections
      : [
          { key: 'services', label: 'Services', icon: '', type: 'services' },
          { key: 'bookmarks', label: 'Bookmarks', icon: '', type: 'bookmarks' },
        ]
    newConfig.sections = arrayMove(baseSections, oldIndex, newIndex)
    await authSave(newConfig)
  }

  const handleDeleteSection = async (sectionIdx) => {
    const section = tabs[sectionIdx]
    if (!confirm(`Delete tab "${section.label}"?\nAll categories and items in it will be lost.`)) return
    const newConfig = JSON.parse(JSON.stringify(config))
    newConfig.sections = tabs.filter((_, i) => i !== sectionIdx)
    delete newConfig[section.key]
    if (activeTab === section.key) setActiveTab(newConfig.sections[0]?.key || 'services')
    await authSave(newConfig)
  }

  const handleReorder = async (section, activeId, overId) => {
    const prefix = `${section}-`
    const oldIndex = parseInt(activeId.replace(prefix, ''))
    const newIndex = parseInt(overId.replace(prefix, ''))
    if (oldIndex === newIndex) return
    const newConfig = JSON.parse(JSON.stringify(config))
    newConfig[section] = arrayMove(newConfig[section], oldIndex, newIndex)
    await authSave(newConfig)
  }

  const toggleCollapse = (key) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      localStorage.setItem('hive_collapsed', JSON.stringify([...next]))
      return next
    })
  }

  const filterGroups = (groups) => {
    const q = searchQuery.trim().toLowerCase()
    return groups
      .map((group, i) => ({
        ...group,
        _origIdx: i,
        items: q
          ? (group.items || []).filter(item =>
              item.name?.toLowerCase().includes(q) ||
              item.description?.toLowerCase().includes(q) ||
              group.category?.toLowerCase().includes(q)
            )
          : (group.items || []),
      }))
      .filter(group => group.items.length > 0)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A0F1E', fontFamily: "'Outfit', 'Segoe UI', sans-serif", color: '#F1F5F9', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .fade { opacity: 0; transform: translateY(16px); transition: opacity 0.5s ease, transform 0.5s ease; }
        .fade.show { opacity: 1; transform: translateY(0); }
        input::placeholder { color: #334155; }
        button:hover { opacity: 0.85; }
      `}</style>

      {/* BG Orbs */}
      <div style={{ position: 'fixed', top: '-20%', left: '-10%', width: 600, height: 600, background: 'radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '-20%', right: '-10%', width: 500, height: 500, background: 'radial-gradient(circle, rgba(16,185,129,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Top-left logo */}
      <div className={`fade ${visible ? 'show' : ''}`} style={{ position: 'fixed', top: 16, left: 20, zIndex: 50 }}>
        <div style={{ position: 'relative', width: 120, height: 120 }}>
          <img src={`/api/logo?v=${logoVer}`} alt="Hive" style={{ width: 120, height: 120, objectFit: 'contain' }} />
          {isUnlocked && (
            <>
              <label title="Upload logo" style={{
                position: 'absolute', inset: 0, borderRadius: 12,
                background: 'rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 4,
                cursor: 'pointer', opacity: 0, transition: 'opacity 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0}
              >
                <span style={{ fontSize: 22 }}>🖼️</span>
                <span style={{ fontSize: 10, color: '#fff', fontWeight: 600 }}>Change</span>
                <input type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => handleLogoUpload(e.target.files[0])} />
              </label>
              <button title="Reset to default" onClick={handleLogoDelete} style={{
                position: 'absolute', top: -6, right: -6,
                width: 20, height: 20, borderRadius: '50%',
                background: '#475569', border: 'none',
                color: '#fff', fontSize: 11, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>↺</button>
            </>
          )}
        </div>
      </div>

      {/* Top-right controls */}
      <div className={`fade ${visible ? 'show' : ''}`} style={{ position: 'fixed', top: 20, right: 24, display: 'flex', alignItems: 'center', gap: 8, zIndex: 50 }}>
        {isUnlocked && (
          <ConfigMenu onExport={authBackup} onImport={authImport} onWidgets={() => setWidgetsPanelOpen(true)} onSecrets={() => setSecretsPanelOpen(true)} />
        )}
        <TokenGate isUnlocked={isUnlocked} onUnlock={handleUnlock} onLock={handleLock} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto', padding: isMobile ? '32px 16px 48px' : '48px 24px 64px' }}>

        {/* Header */}
        <div className={`fade ${visible ? 'show' : ''}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, marginBottom: 24 }}>
          <WidgetBar config={config} settings={settings} />
        </div>

        {/* Tab bar */}
        <div className={`fade ${visible ? 'show' : ''}`}
          style={{ display: 'flex', alignItems: 'center', marginBottom: 28, borderBottom: '1px solid rgba(255,255,255,0.06)', transitionDelay: '60ms', gap: 4 }}>
          {/* Scrollable tabs with DnD */}
          <DndContext sensors={sensors} collisionDetection={closestCenter}
            onDragEnd={({ active, over }) => over && handleReorderTabs(active.id, over.id)}>
            <SortableContext items={tabs.map(t => t.key)} strategy={horizontalListSortingStrategy}>
              <div style={{ display: 'flex', overflowX: 'auto', scrollbarWidth: 'none', marginBottom: -1, flex: 1 }}>
                {tabs.map((tab, ti) => {
                  const count = (config[tab.key] || []).flatMap(s => s.items || []).length
                  const isActive = activeTab === tab.key
                  return (
                    <TabSortableItem key={tab.key} id={tab.key} disabled={!isUnlocked}>
                      {(dragListeners, dragAttrs, isDragging) => (
                        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, opacity: isDragging ? 0.4 : 1 }}>
                          {isUnlocked && (
                            <span {...dragListeners} {...dragAttrs}
                              style={{ cursor: 'grab', color: '#1E293B', fontSize: 11, padding: '0 2px', lineHeight: 1, userSelect: 'none' }}>⠿</span>
                          )}
                          <button onClick={() => { setActiveTab(tab.key); setSearchQuery('') }} style={{
                            padding: '8px 10px', background: 'none', border: 'none',
                            borderBottom: `2px solid ${isActive ? '#6366F1' : 'transparent'}`,
                            cursor: 'pointer', fontSize: 12, fontWeight: 500,
                            color: isActive ? '#E2E8F0' : '#475569',
                            display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s', whiteSpace: 'nowrap',
                          }}>
                            {tab.icon && <span style={{ fontSize: 13 }}>{tab.icon}</span>}
                            {tab.label}
                            <span style={{
                              fontSize: 10, padding: '1px 5px', borderRadius: 8,
                              background: isActive ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
                              color: isActive ? '#818CF8' : '#334155',
                            }}>{count}</span>
                          </button>
                          {isUnlocked && (
                            <div style={{ display: 'flex', gap: 1, paddingRight: 4 }}>
                              <button title="Edit tab" onClick={() => setEditModal({ type: 'section', sectionIdx: ti, section: tab })}
                                style={{ fontSize: 10, color: '#334155', background: 'none', border: 'none', cursor: 'pointer', padding: '0 3px', lineHeight: 1 }}>✏️</button>
                              {tabs.length > 1 && (
                                <button title="Delete tab" onClick={() => handleDeleteSection(ti)}
                                  style={{ fontSize: 10, color: '#334155', background: 'none', border: 'none', cursor: 'pointer', padding: '0 3px', lineHeight: 1 }}>🗑️</button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </TabSortableItem>
                  )
                })}
                {isUnlocked && (
                  <button onClick={() => setEditModal({ type: 'section' })}
                    style={{ padding: '8px 10px', background: 'none', border: 'none', borderBottom: '2px solid transparent', marginBottom: -1, cursor: 'pointer', fontSize: 11, color: '#334155', whiteSpace: 'nowrap' }}>
                    + Tab
                  </button>
                )}
              </div>
            </SortableContext>
          </DndContext>
          {/* Filter + Category */}
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Filter…"
            style={{ padding: '5px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: '#E2E8F0', fontSize: 12, outline: 'none', width: 150, flexShrink: 0 }} />
          {isUnlocked && (
            <button onClick={() => setEditModal({ type: 'category', section: activeTab })}
              style={{ fontSize: 11, color: '#334155', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', flexShrink: 0 }}>
              + Category
            </button>
          )}
        </div>

        {/* Active section content */}
        {activeSection && (() => {
          const sKey = activeSection.key
          const sType = activeSection.type
          const sData = config[sKey] || []
          const itemModalType = sType === 'services' ? 'service' : 'bookmark'
          const emptyLabel = sType === 'services' ? 'No services yet' : 'No bookmarks yet'
          const noMatchLabel = sType === 'services' ? `No services match "${searchQuery}"` : `No bookmarks match "${searchQuery}"`

          const renderItems = (group, origIdx) => sType === 'services'
            ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.items.map((item, ii) => (
                  <ServiceCard key={ii} item={item} compact={isMobile}
                    onEdit={isUnlocked ? (it) => setEditModal({ type: 'service', section: sKey, categoryIdx: origIdx, itemIdx: ii, item: it }) : null}
                    onDelete={isUnlocked ? () => handleDeleteService(sKey, origIdx, ii) : null} />
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {group.items.map((item, ii) => (
                  <BookmarkCard key={ii} item={item}
                    onEdit={isUnlocked ? (it) => setEditModal({ type: 'bookmark', section: sKey, categoryIdx: origIdx, itemIdx: ii, item: it }) : null}
                    onDelete={isUnlocked ? () => handleDeleteBookmark(sKey, origIdx, ii) : null} />
                ))}
              </div>
            )

          const wrapperStyle = sType === 'services'
            ? { display: 'grid', gridTemplateColumns: `repeat(${getColumns()}, 1fr)`, gap: isMobile ? 16 : 28 }
            : {}

          return (
            <div>
              {sData.length > 0 ? (
                searchQuery ? (
                  filterGroups(sData).length > 0 ? (
                    <div style={wrapperStyle}>
                      {filterGroups(sData).map((group) => {
                        const origIdx = group._origIdx
                        const key = `${sKey}-${origIdx}`
                        return (
                          <div key={origIdx} style={sType === 'bookmarks' ? { marginBottom: 24 } : {}}>
                            <div onClick={() => toggleCollapse(key)}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', userSelect: 'none' }}>
                              <span style={{ fontSize: 8, color: '#334155', width: 10, flexShrink: 0 }}>▼</span>
                              <span>{group.icon}</span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#475569', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{group.category}</span>
                              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
                            </div>
                            {renderItems(group, origIdx)}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', color: '#334155', fontSize: 13, padding: '48px 0' }}>{noMatchLabel}</div>
                  )
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter}
                    onDragEnd={({ active, over }) => over && handleReorder(sKey, active.id, over.id)}>
                    <SortableContext items={sData.map((_, i) => `${sKey}-${i}`)} strategy={rectSortingStrategy}>
                      <div style={wrapperStyle}>
                        {sData.map((group, origIdx) => {
                          const key = `${sKey}-${origIdx}`
                          const isCollapsed = collapsedCategories.has(key)
                          return (
                            <SortableItem key={origIdx} id={`${sKey}-${origIdx}`}>
                              {(dragListeners, dragAttrs) => (
                                <div className={`fade ${visible ? 'show' : ''}`}
                                  style={{ transitionDelay: `${80 + origIdx * 50}ms`, ...(sType === 'bookmarks' ? { marginBottom: 24 } : {}) }}>
                                  <div onClick={() => toggleCollapse(key)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isCollapsed ? 0 : 12, cursor: 'pointer', userSelect: 'none' }}>
                                    <span {...dragListeners} {...dragAttrs} onClick={e => e.stopPropagation()}
                                      style={{ cursor: 'grab', color: '#1E293B', fontSize: 13, padding: '0 2px', flexShrink: 0, lineHeight: 1 }}>⠿</span>
                                    <span style={{ fontSize: 8, color: '#334155', width: 10, flexShrink: 0 }}>{isCollapsed ? '▶' : '▼'}</span>
                                    <span>{group.icon}</span>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: '#475569', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{group.category}</span>
                                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
                                    {isUnlocked && (
                                      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 2 }}>
                                        <button onClick={() => setEditModal({ type: 'category', section: sKey, categoryIdx: origIdx, category: group })}
                                          style={{ fontSize: 11, color: '#334155', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>✏️</button>
                                        <button onClick={() => handleDeleteCategory(sKey, origIdx)}
                                          style={{ fontSize: 11, color: '#334155', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>🗑️</button>
                                        <button onClick={() => setEditModal({ type: itemModalType, section: sKey, categoryIdx: origIdx })}
                                          style={{ fontSize: 11, color: '#334155', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>+ Add</button>
                                      </div>
                                    )}
                                  </div>
                                  {!isCollapsed && renderItems(group, origIdx)}
                                </div>
                              )}
                            </SortableItem>
                          )
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>
                )
              ) : (
                <div style={{ textAlign: 'center', color: '#334155', fontSize: 13, padding: '48px 0' }}>{emptyLabel}</div>
              )}
            </div>
          )
        })()}

        {/* Footer */}
        <div style={{ marginTop: 52, textAlign: 'center', fontSize: 11, color: '#1E293B', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
          <span>{settings.title || 'hive'} · {saving ? 'saving...' : 'ready'}</span>
          {appVersion && (
            <span style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', color: '#334155', fontSize: 10 }}>
              {appVersion}
            </span>
          )}
        </div>
      </div>

      {/* Widgets Panel */}
      {secretsPanelOpen && (
        <SecretsPanel token={token} onClose={() => setSecretsPanelOpen(false)} />
      )}
      {widgetsPanelOpen && (
        <WidgetsPanel config={config} onSave={authSave} onClose={() => setWidgetsPanelOpen(false)} />
      )}

      {/* Modals */}
      {editModal?.type === 'section' && (
        <SectionModal
          section={editModal.section}
          onSave={handleSaveSection}
          onClose={() => setEditModal(null)} />
      )}
      {editModal?.type === 'category' && (
        <CategoryModal
          category={editModal.category}
          section={editModal.section}
          onSave={handleSaveCategory}
          onClose={() => setEditModal(null)} />
      )}
      {editModal?.type === 'service' && (
        <ServiceModal
          service={editModal.item}
          token={token}
          onSave={handleSaveService}
          onClose={() => setEditModal(null)} />
      )}
      {editModal?.type === 'bookmark' && (
        <BookmarkModal
          bookmark={editModal.item}
          onSave={handleSaveBookmark}
          onClose={() => setEditModal(null)} />
      )}
    </div>
  )
}
