import { useState, useEffect, useRef } from 'react'
import { useConfig } from './hooks/useConfig'
import { useWindowSize } from './hooks/useWindowSize'
import { useAdapterStats } from './hooks/useAdapterStats'
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, rectSortingStrategy, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import * as LucideIcons from 'lucide-react'

// ─── Icon helper ──────────────────────────────────────────────────
// Renders a URL as <img> or falls back to emoji/text.
function renderIcon(icon, fallback, size = 24) {
  const val = icon || fallback || ''
  if (val.startsWith('http') || val.startsWith('/')) {
    return <img src={val} alt="" style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
  }
  return <span style={{ fontSize: size * 0.9, lineHeight: 1 }}>{val || fallback}</span>
}

// Renders a category/tab icon — supports lucide: prefix, emoji, or URL.
function renderCategoryIcon(icon, size = 16) {
  if (!icon) return null
  if (icon.startsWith('lucide:')) {
    const name = icon.slice(7)
    const LIcon = LucideIcons[name]
    if (LIcon) return <LIcon size={size} strokeWidth={1.75} style={{ flexShrink: 0 }} />
  }
  return <span style={{ fontSize: size * 0.9, lineHeight: 1 }}>{icon}</span>
}

// ─── Curated Lucide icon list for homelab use ─────────────────────
const LUCIDE_ICON_LIST = [
  'Server','Database','HardDrive','Cpu','Monitor','Laptop','Smartphone','Tablet',
  'Network','Wifi','Globe','Router','Shield','ShieldCheck','Lock','Key',
  'Cloud','CloudUpload','CloudDownload','Container','Box','Package','Layers',
  'FolderOpen','Folder','FileText','File','Archive','BookOpen','Book',
  'Home','Building','Building2','Warehouse','LayoutDashboard',
  'Settings','Settings2','Wrench','Tool','Hammer','Cog',
  'Activity','BarChart2','BarChart','TrendingUp','Gauge','Radio',
  'Camera','Video','Tv','Music','Headphones','Download','Upload',
  'Mail','Bell','Calendar','Clock','Search','Terminal','Code2','GitBranch',
  'Users','User','UserCheck','Star','Heart','Bookmark','Flag','Tag',
  'Play','Pause','RefreshCw','Power','Zap','Sun','Moon','Thermometer',
]

// ─── Lucide Icon Picker ───────────────────────────────────────────
function LucideIconPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = LUCIDE_ICON_LIST.filter(n => n.toLowerCase().includes(search.toLowerCase()))
  const currentIsLucide = value?.startsWith('lucide:')

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => { setOpen(o => !o); setSearch('') }}
        title="Pick Lucide icon"
        style={{
          padding: '6px 10px', background: 'var(--color-overlay-md)', border: '1px solid var(--color-border)',
          borderRadius: 8, cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 12,
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
        {currentIsLucide
          ? renderCategoryIcon(value, 16)
          : <LucideIcons.Shapes size={14} />}
        <span>Icons</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 200,
          background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)',
          borderRadius: 12, padding: 12, width: 280, boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}>
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search icons…"
            style={{
              width: '100%', padding: '6px 10px', background: 'var(--color-overlay-md)',
              border: '1px solid var(--color-border)', borderRadius: 7, color: 'var(--color-text-primary)',
              fontSize: 12, outline: 'none', fontFamily: 'inherit', marginBottom: 10,
            }} />
          {currentIsLucide && (
            <button type="button" onClick={() => { onChange(''); setOpen(false) }}
              style={{ width: '100%', padding: '5px', marginBottom: 8, background: 'var(--color-red-bg)', border: '1px solid var(--color-red-border)', borderRadius: 7, color: 'var(--color-red)', cursor: 'pointer', fontSize: 11 }}>
              Remove icon → use emoji
            </button>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
            {filtered.map(name => {
              const LIcon = LucideIcons[name]
              if (!LIcon) return null
              const isSelected = value === `lucide:${name}`
              return (
                <button key={name} type="button" title={name}
                  onClick={() => { onChange(`lucide:${name}`); setOpen(false) }}
                  style={{
                    padding: 7, borderRadius: 7, border: `1px solid ${isSelected ? 'var(--color-accent)' : 'transparent'}`,
                    background: isSelected ? 'var(--color-accent-bg-sm)' : 'var(--color-overlay-md)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: isSelected ? 'var(--color-accent-light)' : 'var(--color-text-secondary)',
                    transition: 'none',
                  }}>
                  <LIcon size={16} strokeWidth={1.75} />
                </button>
              )
            })}
            {filtered.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--color-text-ghost)', fontSize: 11, padding: '12px 0' }}>No results</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
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
      <div style={{ fontSize: 52, fontWeight: 300, letterSpacing: '-2px', color: 'var(--color-text-bright)', fontFamily: 'monospace', lineHeight: 1 }}>
        {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-text-dim)', marginTop: 6 }}>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--color-text-dim)' }}>
      <span style={{ fontSize: 20 }}>{WMO_ICONS[cur.weathercode] || '🌡️'}</span>
      <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>{Math.round(cur.temperature_2m)}°C</span>
      {tMax != null && tMin != null && (
        <span style={{ fontSize: 11 }}>
          <span style={{ color: 'var(--color-red)' }}>↑{Math.round(tMax)}°</span>
          {' '}
          <span style={{ color: 'var(--color-blue)' }}>↓{Math.round(tMin)}°</span>
        </span>
      )}
      {cfg.location_name && <span style={{ color: 'var(--color-text-muted)' }}>· {cfg.location_name}</span>}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>
        <span>{label}</span>
        <span>{valueLabel ?? `${used}${unit} / ${total}${unit}`}</span>
      </div>
      <div style={{ height: 3, background: 'var(--color-overlay-lg)', borderRadius: 2 }}>
        <div style={{
          height: '100%', borderRadius: 2, transition: 'width 0.4s',
          width: `${Math.min(percent, 100)}%`,
          background: percent > 90 ? 'var(--color-red)' : percent > 70 ? 'var(--color-yellow)' : 'var(--color-green)',
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
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{settings.greeting}</div>
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
      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>🔍</span>
      <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={handleKey}
        placeholder="Search or enter URL..."
        style={{
          width: '100%', padding: '10px 16px 10px 40px',
          background: 'var(--color-overlay-md2)', border: '1px solid var(--color-border)',
          borderRadius: 12, color: 'var(--color-text-bright)', fontSize: 14, outline: 'none', fontFamily: 'inherit',
        }} />
    </div>
  )
}

function StatusDot({ status }) {
  const colors = { online: 'var(--color-green)', warning: 'var(--color-yellow)', offline: 'var(--color-red)', unknown: 'var(--color-text-muted)' }
  const c = colors[status] || colors.unknown
  return <div style={{ width: 10, height: 10, borderRadius: '50%', background: c, boxShadow: `0 0 8px ${c}`, flexShrink: 0 }} />
}

const STAT_COLORS = {
  ok:    { bg: 'var(--color-green-bg)',  color: 'var(--color-green)' },
  warn:  { bg: 'var(--color-yellow-bg)',  color: 'var(--color-yellow)' },
  error: { bg: 'var(--color-red-bg)', color: 'var(--color-red)' },
  info:  { bg: 'var(--color-overlay-md2)', color: 'var(--color-text-dim)' },
}

function StatPill({ label, value, status }) {
  const c = STAT_COLORS[status] || STAT_COLORS.info
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 6, fontSize: 11,
      background: c.bg, color: c.color,
    }}>
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </span>
  )
}

function ServiceCard({ item, onEdit, onDelete, compact }) {
  const [hov, setHov] = useState(false)
  const [status, setStatus] = useState('unknown')
  const [latency, setLatency] = useState(null)
  const { stats: allStats, error: adapterError, loading: adapterLoading } = useAdapterStats(item.name, !!item.adapter)
  const versionStat = allStats.find(s => s.label === 'Version')
  const stats = allStats.filter(s => s.label !== 'Version')

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
          background: hov ? 'var(--color-overlay-lg2)' : 'var(--color-overlay-sm)',
          border: `1px solid ${hov ? 'var(--color-accent-border)' : 'var(--color-overlay-md3)'}`,
          borderRadius: 12, padding: compact ? '10px 12px' : '14px 16px',
          display: 'flex', flexDirection: 'column', gap: 8,
          transition: 'all 0.18s ease',
          transform: hov ? 'translateY(-1px)' : 'none',
        }}>
          {/* Main row: icon + name/desc + status dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, background: 'var(--color-overlay-md3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0,
            }}>{renderIcon(item.icon, '🔗', 22)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {item.name}
                {versionStat && (
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)', background: 'var(--color-overlay-md2)', padding: '1px 6px', borderRadius: 4, fontWeight: 400 }}>
                    {versionStat.value}
                  </span>
                )}
                {item.tag && (
                  <span style={{ fontSize: 10, color: 'var(--color-text-dim)', background: 'var(--color-overlay-md)', padding: '1px 6px', borderRadius: 4 }}>
                    {item.tag}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.description}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {status === 'online' && latency !== null && latency >= 0 && (
                <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>{latency}ms</span>
              )}
              <StatusDot status={status} />
            </div>
          </div>
          {/* Adapter stats pills */}
          {item.adapter && (
            <div style={{ paddingLeft: 50 }}>
              {adapterLoading && (
                <span style={{ fontSize: 10, color: 'var(--color-text-ghost)' }}>loading…</span>
              )}
              {!adapterLoading && adapterError && (
                <div style={{
                  fontSize: 11, color: 'var(--color-red)',
                  background: 'var(--color-red-bg-xs)',
                  border: '1px solid var(--color-red-border)',
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
            background: 'var(--color-scrim-md)', border: 'none', borderRadius: 6,
            color: 'var(--color-text-secondary)', fontSize: 11, padding: '2px 8px', cursor: 'pointer',
          }}>✏️</button>
      )}
      {hov && onDelete && (
        <button onClick={(e) => { e.preventDefault(); onDelete() }}
          style={{
            position: 'absolute', top: 8, right: onEdit ? 46 : 8,
            background: 'var(--color-scrim-md)', border: 'none', borderRadius: 6,
            color: 'var(--color-red)', fontSize: 11, padding: '2px 8px', cursor: 'pointer',
          }}>🗑</button>
      )}
    </div>
  )
}

// ─── Favicon helper ───────────────────────────────────────────────

function faviconUrls(url) {
  try {
    const domain = new URL(url).hostname
    return {
      primary:  `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
      fallback: `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    }
  } catch {
    return null
  }
}

function FaviconIcon({ url, size = 24 }) {
  const fav = faviconUrls(url)
  const [src, setSrc] = useState(fav?.primary || null)
  const [failed, setFailed] = useState(!fav)

  if (failed || !src) {
    return <span style={{ fontSize: size * 0.9, lineHeight: 1 }}>🔖</span>
  }
  return (
    <img src={src} alt="" width={size} height={size}
      style={{ objectFit: 'contain', flexShrink: 0, borderRadius: 3 }}
      onError={() => {
        if (fav && src === fav.primary) { setSrc(fav.fallback) }
        else { setFailed(true) }
      }}
    />
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
          background: hov ? 'var(--color-overlay-lg2)' : 'var(--color-overlay-sm)',
          border: `1px solid ${hov ? 'var(--color-accent-border)' : 'var(--color-overlay-md3)'}`,
          borderRadius: 10, padding: '0 14px',
          display: 'flex', alignItems: 'center', gap: 12,
          height: 64, overflow: 'hidden',
          transition: 'all 0.15s',
          transform: hov ? 'translateY(-1px)' : 'none',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, background: 'var(--color-overlay-md3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {item.icon
              ? renderIcon(item.icon, '🔖', 20)
              : <FaviconIcon url={item.url} size={20} />
            }
          </div>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
            {item.description && <div style={{ fontSize: 11, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>}
          </div>
        </div>
      </a>
      {hov && (
        <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
          {onEdit && (
            <button onClick={(e) => { e.preventDefault(); onEdit(item) }}
              style={{ background: 'var(--color-scrim-md)', border: 'none', borderRadius: 5, color: 'var(--color-text-secondary)', fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}>✏️</button>
          )}
          {onDelete && (
            <button onClick={(e) => { e.preventDefault(); onDelete() }}
              style={{ background: 'var(--color-scrim-md)', border: 'none', borderRadius: 5, color: 'var(--color-text-secondary)', fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}>🗑️</button>
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

  const previewIcon = form.icon
    ? renderIcon(form.icon, '🔖', 28)
    : <FaviconIcon url={form.url} size={28} />

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--color-scrim-xl)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 16, padding: 28, width: 420, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--color-overlay-md3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {previewIcon}
          </div>
          <h3 style={{ color: 'var(--color-text-bright)', fontSize: 16, fontWeight: 600 }}>{bookmark ? 'Edit Bookmark' : 'New Bookmark'}</h3>
        </div>
        {[['name','Name'],['url','URL'],['description','Description']].map(([k,l]) => (
          <div key={k}>
            <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginBottom: 4 }}>{l}</div>
            <input value={form[k] || ''} onChange={e => set(k, e.target.value)}
              style={{ width: '100%', padding: '8px 12px', background: 'var(--color-overlay-md)', border: '1px solid var(--color-border)', borderRadius: 8, color: 'var(--color-text-bright)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
          </div>
        ))}
        <div>
          <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginBottom: 4 }}>
            Icon <span style={{ color: 'var(--color-text-ghost)' }}>— emoji or URL (leave empty for auto favicon)</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={form.icon || ''} onChange={e => set('icon', e.target.value)} placeholder="auto"
              style={{ flex: 1, padding: '8px 12px', background: 'var(--color-overlay-md)', border: '1px solid var(--color-border)', borderRadius: 8, color: 'var(--color-text-bright)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
            <IconPicker value={form.icon || ''} onChange={v => set('icon', v)} />
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--color-overlay-md3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {form.icon ? renderIcon(form.icon, '🔖', 22) : <FaviconIcon url={form.url} size={22} />}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'var(--color-overlay-md)', border: '1px solid var(--color-border)', borderRadius: 8, color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={() => onSave(form)} style={{ padding: '8px 20px', background: 'var(--color-accent)', border: 'none', borderRadius: 8, color: 'var(--color-white)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Save</button>
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
  const inputStyle = { width: '100%', padding: '8px 12px', background: 'var(--color-overlay-md)', border: '1px solid var(--color-border)', borderRadius: 8, color: 'var(--color-text-bright)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--color-scrim-xl)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 16, padding: 28, width: 380, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ color: 'var(--color-text-bright)', fontSize: 16, fontWeight: 600 }}>{category ? 'Rename Category' : 'New Category'}</h3>
        <div>
          <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginBottom: 4 }}>Name</div>
          <input value={form.category || ''} onChange={e => set('category', e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginBottom: 4 }}>Icon</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={form.icon?.startsWith('lucide:') ? '' : (form.icon || '')}
              onChange={e => set('icon', e.target.value)}
              placeholder={form.icon?.startsWith('lucide:') ? '— Lucide icon selected —' : 'emoji e.g. 📦'}
              disabled={form.icon?.startsWith('lucide:')}
              style={{ ...inputStyle, flex: 1, opacity: form.icon?.startsWith('lucide:') ? 0.5 : 1 }} />
            <LucideIconPicker value={form.icon || ''} onChange={v => set('icon', v)} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--color-text-ghost)', marginTop: 4 }}>
            Type an emoji or use the icon picker →
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'var(--color-overlay-md)', border: '1px solid var(--color-border)', borderRadius: 8, color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={() => form.category.trim() && onSave(form)} style={{ padding: '8px 20px', background: 'var(--color-accent)', border: 'none', borderRadius: 8, color: 'var(--color-white)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Save</button>
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
  const inputStyle = { width: '100%', padding: '8px 12px', background: 'var(--color-overlay-md)', border: '1px solid var(--color-border)', borderRadius: 8, color: 'var(--color-text-bright)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--color-scrim-xl)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 16, padding: 28, width: 360, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ color: 'var(--color-text-bright)', fontSize: 16, fontWeight: 600 }}>{section ? 'Edit Tab' : 'New Tab'}</h3>
        <div>
          <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginBottom: 4 }}>Label</div>
          <input value={form.label} onChange={e => set('label', e.target.value)} placeholder="e.g. DevOps" style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginBottom: 4 }}>Icon</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={form.icon?.startsWith('lucide:') ? '' : form.icon}
              onChange={e => set('icon', e.target.value)}
              placeholder={form.icon?.startsWith('lucide:') ? '— Lucide icon selected —' : 'emoji e.g. ⚙️'}
              disabled={form.icon?.startsWith('lucide:')}
              style={{ ...inputStyle, flex: 1, opacity: form.icon?.startsWith('lucide:') ? 0.5 : 1 }} />
            <LucideIconPicker value={form.icon || ''} onChange={v => set('icon', v)} />
          </div>
        </div>
        {!section && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginBottom: 6 }}>Type</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['services', '🖥️ Services'], ['bookmarks', '🔖 Bookmarks']].map(([v, l]) => (
                <button key={v} onClick={() => set('type', v)} style={{
                  flex: 1, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                  background: form.type === v ? 'var(--color-accent-bg-md)' : 'var(--color-overlay-sm)',
                  border: `1px solid ${form.type === v ? 'var(--color-accent)' : 'var(--color-overlay-lg)'}`,
                  color: form.type === v ? 'var(--color-accent-light)' : 'var(--color-text-secondary)',
                }}>{l}</button>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'var(--color-overlay-md)', border: '1px solid var(--color-border)', borderRadius: 8, color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={() => form.label.trim() && onSave(form)} style={{ padding: '8px 20px', background: 'var(--color-accent)', border: 'none', borderRadius: 8, color: 'var(--color-white)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Add/Edit Service ──────────────────────────────────────

const SI = 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/'

// ─── Icon Picker ──────────────────────────────────────────────────

const ICON_LIST = [
  // Monitoring & Uptime
  ['adguard-home','AdGuard'],['pi-hole','Pi-hole'],['grafana','Grafana'],['netdata','Netdata'],
  ['uptime-kuma','Uptime Kuma'],['prometheus','Prometheus'],['alertmanager','Alertmanager'],
  // Infrastructure
  ['proxmox','Proxmox'],['portainer','Portainer'],['traefik','Traefik'],
  ['nginx-proxy-manager','NPM'],['nginx','NGINX'],['caddy','Caddy'],
  ['docker','Docker'],['kubernetes','Kubernetes'],['ansible','Ansible'],['terraform','Terraform'],
  // Media
  ['jellyfin','Jellyfin'],['plex','Plex'],['emby','Emby'],['kodi','Kodi'],
  ['sonarr','Sonarr'],['radarr','Radarr'],['lidarr','Lidarr'],['readarr','Readarr'],
  ['prowlarr','Prowlarr'],['bazarr','Bazarr'],['overseerr','Overseerr'],['jellyseerr','Jellyseerr'],
  // Downloads
  ['qbittorrent','qBittorrent'],['transmission','Transmission'],['deluge','Deluge'],
  ['sabnzbd','SABnzbd'],['nzbget','NZBGet'],
  // Services
  ['nextcloud','Nextcloud'],['immich','Immich'],['vaultwarden','Vaultwarden'],
  ['home-assistant','Home Assistant'],['homebridge','Homebridge'],
  ['paperless-ngx','Paperless'],['firefly-iii','Firefly III'],
  ['freshrss','FreshRSS'],['miniflux','Miniflux'],['wallabag','Wallabag'],
  // Storage & NAS
  ['truenas','TrueNAS'],['synology','Synology'],['western-digital','WD'],['minio','MinIO'],
  // Dev & Tools
  ['gitlab','GitLab'],['gitea','Gitea'],['forgejo','Forgejo'],['github','GitHub'],
  ['jenkins','Jenkins'],['drone','Drone'],
  // Network
  ['cloudflare','Cloudflare'],['tailscale','Tailscale'],['wireguard','WireGuard'],
  ['opnsense','OPNsense'],['pfsense','pfSense'],['ubiquiti','UniFi'],
  // System
  ['glances','Glances'],['scrutiny','Scrutiny'],['frigate','Frigate'],['watchtower','Watchtower'],
  ['speedtest-tracker','Speedtest'],
].map(([slug, name]) => ({ slug, name, url: SI + slug + '.svg' }))

function IconPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = ICON_LIST.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.slug.toLowerCase().includes(search.toLowerCase())
  )

  const select = (url) => { onChange(url); setOpen(false); setSearch('') }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={() => { setOpen(v => !v); setSearch('') }} title="Browse icons"
        style={{ padding: '6px 8px', background: open ? 'var(--color-accent-bg-md)' : 'var(--color-overlay-md)', border: `1px solid ${open ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: 7, color: 'var(--color-accent-light)', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>
        🔍
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-strong)', borderRadius: 12, padding: 10, width: 280, zIndex: 300, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search icons…"
            style={{ padding: '6px 10px', background: 'var(--color-overlay-md)', border: '1px solid var(--color-border)', borderRadius: 7, color: 'var(--color-text-bright)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
            {filtered.map(icon => (
              <button key={icon.slug} type="button" title={icon.name} onClick={() => select(icon.url)}
                style={{ padding: 6, background: value === icon.url ? 'var(--color-accent-bg-lg)' : 'none', border: `1px solid ${value === icon.url ? 'var(--color-accent)' : 'transparent'}`, borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => { if (value !== icon.url) e.currentTarget.style.background = 'var(--color-overlay-md2)' }}
                onMouseLeave={e => { if (value !== icon.url) e.currentTarget.style.background = 'none' }}>
                <img src={icon.url} alt={icon.name} style={{ width: 24, height: 24, objectFit: 'contain' }}
                  onError={e => { e.target.style.opacity = '0.2' }} />
              </button>
            ))}
          </div>
          {filtered.length === 0 && <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center', padding: 8 }}>No icons found</div>}
        </div>
      )}
    </div>
  )
}

// ─── Secret Field Picker ──────────────────────────────────────────

function SecretFieldPicker({ token, onSelect }) {
  const [open, setOpen] = useState(false)
  const [keys, setKeys] = useState([])
  const [search, setSearch] = useState('')
  const [newMode, setNewMode] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')

  const load = async () => {
    const res = await fetch('/api/secrets', { headers: { 'X-Hive-Token': token } })
    if (res.ok) { const d = await res.json(); setKeys((d.keys || []).sort()) }
  }

  const toggle = () => { if (!open) load(); setOpen(v => !v); setNewMode(false); setSearch('') }

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

  const iStyle = { padding: '5px 8px', background: 'var(--color-overlay-md)', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text-bright)', fontSize: 11, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={toggle} title="Insert secret reference"
        style={{ padding: '6px 8px', background: open ? 'var(--color-accent-bg-md)' : 'var(--color-overlay-md)', border: `1px solid ${open ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: 7, color: 'var(--color-accent-light)', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>
        🔑
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-strong)', borderRadius: 10, padding: 8, width: 220, zIndex: 200, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {!newMode ? (
            <>
              {keys.length > 0 && (
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search secrets…"
                  style={{ ...iStyle, marginBottom: 2 }}
                />
              )}
              {keys.length === 0 && <div style={{ fontSize: 11, color: 'var(--color-text-muted)', padding: '4px 6px' }}>No secrets yet</div>}
              {keys.filter(k => k.toLowerCase().includes(search.toLowerCase())).map(k => (
                <button key={k} type="button" onClick={() => { onSelect(`\${secret:${k}}`); setOpen(false) }}
                  style={{ padding: '6px 10px', background: 'none', border: 'none', borderRadius: 6, color: 'var(--color-text-secondary)', fontSize: 11, textAlign: 'left', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-overlay-md2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <code>{k}</code>
                </button>
              ))}
              <div style={{ height: 1, background: 'var(--color-overlay-md2)', margin: '2px 0' }} />
              <button type="button" onClick={() => setNewMode(true)}
                style={{ padding: '6px 10px', background: 'none', border: 'none', borderRadius: 6, color: 'var(--color-accent)', fontSize: 11, textAlign: 'left', cursor: 'pointer' }}>
                + New secret
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--color-text-dim)', padding: '2px 2px' }}>New secret</div>
              <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="KEY_NAME" style={iStyle} />
              <input value={newVal} onChange={e => setNewVal(e.target.value)} placeholder="value" type="password" style={iStyle} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => setNewMode(false)}
                  style={{ flex: 1, padding: '5px 0', background: 'var(--color-overlay-md)', border: '1px solid var(--color-overlay-lg)', borderRadius: 6, color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 11 }}>Back</button>
                <button type="button" onClick={saveNew}
                  style={{ flex: 1, padding: '5px 0', background: 'var(--color-accent)', border: 'none', borderRadius: 6, color: 'var(--color-white)', cursor: 'pointer', fontSize: 11 }}>Save</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ServiceModal({ service, onSave, onClose, token, adapterCatalog }) {
  const [form, setForm] = useState(service || { name: '', url: '', icon: '', description: '', tag: '', adapter: '', adapter_config: {} })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const setAdapterCfg = (k, v) => setForm(p => ({ ...p, adapter_config: { ...(p.adapter_config || {}), [k]: v } }))

  const adapterDef = adapterCatalog[form.adapter || ''] || adapterCatalog[''] || { fields: [] }
  const inputStyle = { width: '100%', padding: '8px 12px', background: 'var(--color-overlay-md)', border: '1px solid var(--color-border)', borderRadius: 8, color: 'var(--color-text-bright)', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--color-scrim-xl)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 16, padding: 28, width: 440, maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ color: 'var(--color-text-bright)', fontSize: 16, fontWeight: 600 }}>{service ? 'Edit Service' : 'New Service'}</h3>

        {/* Basic fields */}
        {[['name','Name'],['url','URL'],['description','Description'],['tag','Tag (e.g. v1.0)']].map(([k,l]) => (
          <div key={k}>
            <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginBottom: 4 }}>{l}</div>
            <input value={form[k] || ''} onChange={e => set(k, e.target.value)} style={inputStyle} />
          </div>
        ))}
        <div>
          <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginBottom: 4 }}>Icon <span style={{ color: 'var(--color-text-ghost)' }}>— emoji or image URL</span></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={form.icon || ''} onChange={e => set('icon', e.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder="🔗 or https://..." />
            <IconPicker value={form.icon || ''} onChange={v => set('icon', v)} />
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--color-overlay-md3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {renderIcon(form.icon, '🔗', 22)}
            </div>
          </div>
        </div>

        {/* Adapter selector */}
        <div style={{ borderTop: '1px solid var(--color-overlay-md2)', paddingTop: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginBottom: 4 }}>Adapter <span style={{ color: 'var(--color-text-ghost)' }}>— live stats integration</span></div>
          <select
            value={form.adapter || ''}
            onChange={e => {
              const def = adapterCatalog[e.target.value] || adapterCatalog[''] || {}
              const adapterIcons = new Set(Object.values(adapterCatalog).map(d => d.icon).filter(Boolean))
              setForm(p => {
                const isAutoIcon = !p.icon || adapterIcons.has(p.icon)
                return { ...p, adapter: e.target.value, icon: isAutoIcon ? (def.icon || '') : p.icon }
              })
            }}
            style={{ ...inputStyle, appearance: 'none' }}>
            {Object.entries(adapterCatalog).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        {/* Adapter config fields */}
        {adapterDef.fields.map(field => (
          <div key={field.key}>
            <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginBottom: 4 }}>
              {field.label}
              {field.hint && <span style={{ color: 'var(--color-text-ghost)', marginLeft: 6 }}>({field.hint})</span>}
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
            <div style={{ fontSize: 10, color: 'var(--color-text-ghost)', marginTop: 3 }}>
              Use <code style={{ color: 'var(--color-text-muted)' }}>${'{'}ENV_VAR{'}'}</code> or <code style={{ color: 'var(--color-text-muted)' }}>${'{'}secret:KEY{'}'}</code>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'var(--color-overlay-md)', border: '1px solid var(--color-border)', borderRadius: 8, color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={() => onSave(form)} style={{ padding: '8px 20px', background: 'var(--color-accent)', border: 'none', borderRadius: 8, color: 'var(--color-white)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Save</button>
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
    width: '100%', padding: '6px 10px', background: 'var(--color-overlay-md)',
    border: '1px solid var(--color-border)', borderRadius: 6,
    color: 'var(--color-text-bright)', fontSize: 12, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'var(--color-scrim-sm)', zIndex: 90,
      }} />
      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, width: 340, height: '100vh',
        background: 'var(--color-bg-surface)', borderLeft: '1px solid var(--color-overlay-lg)',
        zIndex: 100, display: 'flex', flexDirection: 'column',
        animation: 'slideIn 0.22s ease',
      }}>
        <style>{`@keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>

        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--color-overlay-md2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-bright)' }}>Widgets</span>
          <button type="button" onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1,
          }}>✕</button>
        </div>

        {/* Widget list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {WIDGET_DEFS.map((def, i) => {
            const w = draft[i]
            return (
              <div key={def.type} style={{
                background: 'var(--color-overlay-xs)', border: '1px solid var(--color-overlay-md3)',
                borderRadius: 10, padding: '12px 14px',
              }}>
                {/* Row: icon + label + toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: def.fields.length && w.enabled ? 12 : 0 }}>
                  <span style={{ fontSize: 18 }}>{def.icon}</span>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>{def.label}</span>
                  {/* Toggle */}
                  <div onClick={() => toggle(i)} style={{
                    width: 36, height: 20, borderRadius: 10, cursor: 'pointer', position: 'relative',
                    background: w.enabled ? 'var(--color-accent)' : 'var(--color-border)',
                    transition: 'background 0.2s',
                  }}>
                    <div style={{
                      position: 'absolute', top: 3, left: w.enabled ? 18 : 3,
                      width: 14, height: 14, borderRadius: '50%', background: 'var(--color-white)',
                      transition: 'left 0.2s',
                    }} />
                  </div>
                </div>

                {/* Config fields — only when enabled */}
                {w.enabled && def.fields.map(field => {
                  if (field.showIf && !field.showIf(w.config)) return null
                  return (
                    <div key={field.key} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>{field.label}</div>
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
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--color-overlay-md2)', display: 'flex', gap: 8 }}>
          <button type="button" onClick={onClose} style={{
            flex: 1, padding: '8px 0', background: 'var(--color-overlay-md)',
            border: '1px solid var(--color-overlay-lg)', borderRadius: 8,
            color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 13,
          }}>Cancel</button>
          <button type="button" onClick={save} style={{
            flex: 2, padding: '8px 0', background: 'var(--color-accent)', border: 'none',
            borderRadius: 8, color: 'var(--color-white)', cursor: 'pointer', fontSize: 13, fontWeight: 500,
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
    padding: '7px 10px', background: 'var(--color-overlay-md)',
    border: '1px solid var(--color-border)', borderRadius: 7,
    color: 'var(--color-text-bright)', fontSize: 12, outline: 'none', fontFamily: 'inherit',
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--color-scrim-lg)', zIndex: 90 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 360,
        background: 'var(--color-bg-surface)', borderLeft: '1px solid var(--color-overlay-lg)',
        zIndex: 100, display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-overlay-md2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: 'var(--color-text-bright)', fontSize: 14, fontWeight: 600 }}>🔑 Secrets</div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 11, marginTop: 2 }}>Use <code style={{ color: 'var(--color-accent-light)', background: 'var(--color-accent-bg-xs)', padding: '1px 4px', borderRadius: 3 }}>{'${secret:KEY}'}</code> in adapter fields</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        {/* Key list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {loading ? (
            <div style={{ color: 'var(--color-text-muted)', fontSize: 12, textAlign: 'center', paddingTop: 24 }}>Loading…</div>
          ) : keys.length === 0 ? (
            <div style={{ color: 'var(--color-text-muted)', fontSize: 12, textAlign: 'center', paddingTop: 24 }}>No secrets yet</div>
          ) : keys.map(key => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--color-overlay-xs)', border: '1px solid var(--color-overlay-md2)', borderRadius: 8 }}>
              <code style={{ flex: 1, fontSize: 12, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{key}</code>
              <span style={{ fontSize: 11, color: 'var(--color-bg-subtle)', letterSpacing: 2 }}>••••••</span>
              <button onClick={() => deleteSecret(key)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 13, padding: '0 2px', lineHeight: 1 }}>🗑️</button>
            </div>
          ))}
        </div>

        {/* Add secret */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--color-overlay-md2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-dim)', fontWeight: 500 }}>Add / Update Secret</div>
          <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="KEY_NAME" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
          <input value={newVal} onChange={e => setNewVal(e.target.value)} placeholder="value" type="password" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
            onKeyDown={e => e.key === 'Enter' && addSecret()} />
          <button onClick={addSecret} style={{ padding: '8px 0', background: 'var(--color-accent)', border: 'none', borderRadius: 8, color: 'var(--color-white)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
            Save Secret
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={exportSecrets} style={{ flex: 1, padding: '7px 0', background: 'var(--color-overlay-md)', border: '1px solid var(--color-overlay-lg)', borderRadius: 8, color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12 }}>
              ⬇ Export
            </button>
            <button onClick={() => importRef.current.click()} style={{ flex: 1, padding: '7px 0', background: 'var(--color-overlay-md)', border: '1px solid var(--color-overlay-lg)', borderRadius: 8, color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12 }}>
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

// ─── Theme Toggle ─────────────────────────────────────────────────

const THEME_CYCLE = ['dark', 'light', 'auto']
const THEME_META = {
  dark:  { icon: '🌙', label: 'Dark',  next: 'light' },
  light: { icon: '☀️',  label: 'Light', next: 'auto'  },
  auto:  { icon: '⬡',  label: 'Auto',  next: 'dark'  },
}

function ThemeToggle({ theme, onCycle }) {
  const meta = THEME_META[theme] || THEME_META.dark
  return (
    <button
      type="button"
      onClick={onCycle}
      title={`Theme: ${meta.label} — click for ${THEME_META[meta.next].label}`}
      style={{
        padding: '6px 10px',
        background: 'var(--color-overlay-md)',
        border: '1px solid var(--color-overlay-lg)',
        borderRadius: 8,
        color: 'var(--color-text-secondary)',
        cursor: 'pointer',
        fontSize: 14,
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
      }}
    >
      <span>{meta.icon}</span>
      <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{meta.label}</span>
    </button>
  )
}

// ─── Config Menu (Export / Import) ───────────────────────────────

function ConfigMenu({ onExport, onImport, onWidgets, onSecrets }) {
  const [open, setOpen] = useState(false)
  const fileRef = useRef(null)

  const menuBtnStyle = {
    display: 'block', width: '100%', padding: '8px 14px', background: 'none',
    border: 'none', borderRadius: 6, color: 'var(--color-text-tertiary)', fontSize: 12,
    textAlign: 'left', cursor: 'pointer',
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          padding: '6px 14px', background: 'var(--color-overlay-md)',
          border: '1px solid var(--color-overlay-lg)', borderRadius: 8,
          color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12,
        }}>
        ⚙ Config
      </button>
      {open && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)',
            background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)',
            borderRadius: 10, padding: 4, minWidth: 140, zIndex: 200,
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
          <button type="button" style={menuBtnStyle}
            onMouseEnter={e => e.target.style.background = 'var(--color-overlay-md2)'}
            onMouseLeave={e => e.target.style.background = 'none'}
            onClick={() => { onWidgets(); setOpen(false) }}>
            🧩 Widgets
          </button>
          <button type="button" style={menuBtnStyle}
            onMouseEnter={e => e.target.style.background = 'var(--color-overlay-md2)'}
            onMouseLeave={e => e.target.style.background = 'none'}
            onClick={() => { onSecrets(); setOpen(false) }}>
            🔑 Secrets
          </button>
          <div style={{ height: 1, background: 'var(--color-overlay-md2)', margin: '2px 8px' }} />
          <button type="button" style={menuBtnStyle}
            onMouseEnter={e => e.target.style.background = 'var(--color-overlay-md2)'}
            onMouseLeave={e => e.target.style.background = 'none'}
            onClick={() => { onExport(); setOpen(false) }}>
            ⬇ Export
          </button>
          <button type="button" style={menuBtnStyle}
            onMouseEnter={e => e.target.style.background = 'var(--color-overlay-md2)'}
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
          background: isUnlocked ? 'var(--color-accent-bg-sm)' : 'var(--color-overlay-md)',
          border: `1px solid ${isUnlocked ? 'var(--color-accent-border)' : 'var(--color-overlay-lg)'}`,
          borderRadius: 8, color: isUnlocked ? 'var(--color-accent-light)' : 'var(--color-text-muted)',
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
            background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)',
            borderRadius: 12, padding: 16, width: 240, zIndex: 200,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>Enter your Hive token</div>
          <input
            type="password"
            value={input}
            onChange={e => { setInput(e.target.value); setErr(false) }}
            autoFocus
            placeholder="token"
            style={{
              padding: '7px 10px', background: 'var(--color-overlay-md)',
              border: `1px solid ${err ? 'var(--color-red)' : 'var(--color-border)'}`,
              borderRadius: 7, color: 'var(--color-text-bright)', fontSize: 13, outline: 'none',
            }}
          />
          {err && <div style={{ fontSize: 11, color: 'var(--color-red)' }}>Invalid token</div>}
          <button
            type="submit"
            disabled={checking || !input.trim()}
            style={{
              padding: '7px 0', background: 'var(--color-accent)', border: 'none',
              borderRadius: 7, color: 'var(--color-white)', fontSize: 13, fontWeight: 500,
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
  const [adapterCatalog, setAdapterCatalog] = useState({})
  const [activeTab, setActiveTab] = useState('services')
  const [collapsedCategories, setCollapsedCategories] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('hive_collapsed') || '[]')) }
    catch { return new Set() }
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [theme, setTheme] = useState(() => localStorage.getItem('hive-theme') || 'dark')
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  )

  // Apply theme to <html> and listen to system preference in auto mode
  useEffect(() => {
    const mq = globalThis.matchMedia('(prefers-color-scheme: dark)')
    const resolve = (t) => {
      if (t === 'auto') return mq.matches ? 'dark' : 'light'
      return t
    }
    document.documentElement.dataset.theme = resolve(theme)
    if (theme === 'auto') {
      const handler = () => { document.documentElement.dataset.theme = resolve('auto') }
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])

  const cycleTheme = () => setTheme(prev => {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(prev) + 1) % THEME_CYCLE.length]
    localStorage.setItem('hive-theme', next)
    return next
  })

  // Re-validate stored token on load
  useEffect(() => {
    if (token) {
      verifyToken(token).then(ok => setIsUnlocked(ok))
    }
  }, [])

  useEffect(() => {
    fetch('/api/version').then(r => r.json()).then(d => setAppVersion(d.version || '')).catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/adapters-catalog')
      .then(r => r.json())
      .then(list => {
        const map = {}
        list.forEach(d => { map[d.key] = d })
        setAdapterCatalog(map)
      })
      .catch(() => {})
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
    <div style={{ minHeight: '100vh', background: 'var(--color-bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontFamily: 'system-ui' }}>
      Loading...
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--color-red)', fontFamily: 'system-ui' }}>
      <div>Failed to load config: {error}</div>
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Is config-api running? (/api/config)</div>
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
    <div style={{ minHeight: '100vh', background: 'var(--color-bg-page)', fontFamily: "'Outfit', 'Segoe UI', sans-serif", color: 'var(--color-text-bright)', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .fade { opacity: 0; transform: translateY(16px); transition: opacity 0.5s ease, transform 0.5s ease; }
        .fade.show { opacity: 1; transform: translateY(0); }
        input::placeholder { color: var(--color-text-ghost); }
        button:hover { opacity: 0.85; }
      `}</style>

      {/* BG Orbs */}
      <div style={{ position: 'fixed', top: '-20%', left: '-10%', width: 600, height: 600, background: 'radial-gradient(circle, var(--color-accent-bg-xs) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '-20%', right: '-10%', width: 500, height: 500, background: 'radial-gradient(circle, var(--color-teal-bg) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Top-left logo */}
      <div className={`fade ${visible ? 'show' : ''}`} style={{ position: 'fixed', top: 16, left: 20, zIndex: 50 }}>
        <div style={{ position: 'relative' }}>
          <img src={`/api/logo?v=${logoVer}&theme=${theme === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme}`} alt="Hive" style={{ height: 48, width: 'auto', objectFit: 'contain' }} />
          {isUnlocked && (
            <>
              <label title="Upload logo" style={{
                position: 'absolute', inset: 0, borderRadius: 12,
                background: 'var(--color-scrim-md2)', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 4,
                cursor: 'pointer', opacity: 0, transition: 'opacity 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0}
              >
                <span style={{ fontSize: 22 }}>🖼️</span>
                <span style={{ fontSize: 10, color: 'var(--color-white)', fontWeight: 600 }}>Change</span>
                <input type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => handleLogoUpload(e.target.files[0])} />
              </label>
              <button title="Reset to default" onClick={handleLogoDelete} style={{
                position: 'absolute', top: -6, right: -6,
                width: 20, height: 20, borderRadius: '50%',
                background: 'var(--color-text-muted)', border: 'none',
                color: 'var(--color-white)', fontSize: 11, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>↺</button>
            </>
          )}
        </div>
      </div>

      {/* Top-right controls */}
      <div className={`fade ${visible ? 'show' : ''}`} style={{ position: 'fixed', top: 20, right: 24, display: 'flex', alignItems: 'center', gap: 8, zIndex: 50 }}>
        <ThemeToggle theme={theme} onCycle={cycleTheme} />
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
          style={{ display: 'flex', alignItems: 'center', marginBottom: 28, borderBottom: '1px solid var(--color-overlay-md2)', transitionDelay: '60ms', gap: 4 }}>
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
                              style={{ cursor: 'grab', color: 'var(--color-bg-subtle)', fontSize: 11, padding: '0 2px', lineHeight: 1, userSelect: 'none' }}>⠿</span>
                          )}
                          <button onClick={() => { setActiveTab(tab.key); setSearchQuery('') }} style={{
                            padding: '8px 10px', background: 'none', border: 'none',
                            borderBottom: `2px solid ${isActive ? 'var(--color-accent)' : 'transparent'}`,
                            cursor: 'pointer', fontSize: 12, fontWeight: 500,
                            color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                            display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s', whiteSpace: 'nowrap',
                          }}>
                            {tab.icon && renderCategoryIcon(tab.icon, 13)}
                            {tab.label}
                            <span style={{
                              fontSize: 10, padding: '1px 5px', borderRadius: 8,
                              background: isActive ? 'var(--color-accent-bg-md)' : 'var(--color-overlay-md)',
                              color: isActive ? 'var(--color-accent-light)' : 'var(--color-text-ghost)',
                            }}>{count}</span>
                          </button>
                          {isUnlocked && (
                            <div style={{ display: 'flex', gap: 1, paddingRight: 4 }}>
                              <button title="Edit tab" onClick={() => setEditModal({ type: 'section', sectionIdx: ti, section: tab })}
                                style={{ fontSize: 10, color: 'var(--color-text-ghost)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 3px', lineHeight: 1 }}>✏️</button>
                              {tabs.length > 1 && (
                                <button title="Delete tab" onClick={() => handleDeleteSection(ti)}
                                  style={{ fontSize: 10, color: 'var(--color-text-ghost)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 3px', lineHeight: 1 }}>🗑️</button>
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
                    style={{ padding: '8px 10px', background: 'none', border: 'none', borderBottom: '2px solid transparent', marginBottom: -1, cursor: 'pointer', fontSize: 11, color: 'var(--color-text-ghost)', whiteSpace: 'nowrap' }}>
                    + Tab
                  </button>
                )}
              </div>
            </SortableContext>
          </DndContext>
          {/* Filter + Category */}
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Filter…"
            style={{ padding: '5px 10px', background: 'var(--color-overlay-sm)', border: '1px solid var(--color-overlay-lg)', borderRadius: 6, color: 'var(--color-text-primary)', fontSize: 12, outline: 'none', width: 150, flexShrink: 0 }} />
          {isUnlocked && (
            <button onClick={() => setEditModal({ type: 'category', section: activeTab })}
              style={{ fontSize: 11, color: 'var(--color-text-ghost)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', flexShrink: 0 }}>
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
                              <span style={{ fontSize: 8, color: 'var(--color-text-ghost)', width: 10, flexShrink: 0 }}>▼</span>
                              {renderCategoryIcon(group.icon, 15)}
                              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{group.category}</span>
                              <div style={{ flex: 1, height: 1, background: 'var(--color-overlay-sm)' }} />
                            </div>
                            {renderItems(group, origIdx)}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--color-text-ghost)', fontSize: 13, padding: '48px 0' }}>{noMatchLabel}</div>
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
                                      style={{ cursor: 'grab', color: 'var(--color-bg-subtle)', fontSize: 13, padding: '0 2px', flexShrink: 0, lineHeight: 1 }}>⠿</span>
                                    <span style={{ fontSize: 8, color: 'var(--color-text-ghost)', width: 10, flexShrink: 0 }}>{isCollapsed ? '▶' : '▼'}</span>
                                    {renderCategoryIcon(group.icon, 15)}
                                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{group.category}</span>
                                    <div style={{ flex: 1, height: 1, background: 'var(--color-overlay-sm)' }} />
                                    {isUnlocked && (
                                      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 2 }}>
                                        <button onClick={() => setEditModal({ type: 'category', section: sKey, categoryIdx: origIdx, category: group })}
                                          style={{ fontSize: 11, color: 'var(--color-text-ghost)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>✏️</button>
                                        <button onClick={() => handleDeleteCategory(sKey, origIdx)}
                                          style={{ fontSize: 11, color: 'var(--color-text-ghost)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>🗑️</button>
                                        <button onClick={() => setEditModal({ type: itemModalType, section: sKey, categoryIdx: origIdx })}
                                          style={{ fontSize: 11, color: 'var(--color-text-ghost)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>+ Add</button>
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
                <div style={{ textAlign: 'center', color: 'var(--color-text-ghost)', fontSize: 13, padding: '48px 0' }}>{emptyLabel}</div>
              )}
            </div>
          )
        })()}

        {/* Footer */}
        <div style={{ marginTop: 52, textAlign: 'center', fontSize: 11, color: 'var(--color-bg-subtle)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
          <span>{settings.title || 'hive'} · {saving ? 'saving...' : 'ready'}</span>
          {appVersion && (
            <span style={{ padding: '1px 6px', borderRadius: 4, background: 'var(--color-overlay-sm)', color: 'var(--color-text-ghost)', fontSize: 10 }}>
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
          adapterCatalog={adapterCatalog}
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
