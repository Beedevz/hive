import { useState, useEffect, useRef } from 'react'
import { useConfig } from './hooks/useConfig'
import { useWindowSize } from './hooks/useWindowSize'
import { useAdapterStats } from './hooks/useAdapterStats'

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
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`
        )
        const data = await res.json()
        setWeather(data.current_weather)
      } catch {}
    }
    if (cfg.lat != null && cfg.lon != null) {
      fetchWeather(cfg.lat, cfg.lon)
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => {}
      )
    }
  }, [])

  if (!weather) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#64748B' }}>
      <span style={{ fontSize: 20 }}>{WMO_ICONS[weather.weathercode] || '🌡️'}</span>
      <span>{Math.round(weather.temperature)}°C</span>
      {cfg.location_name && <span style={{ color: '#334155' }}>· {cfg.location_name}</span>}
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
      <a href={item.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
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
      <a href={item.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
        <div style={{
          background: hov ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10, padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
          transition: 'all 0.15s',
        }}>
          {renderIcon(item.icon, '🔖', 18)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#CBD5E1' }}>{item.name}</div>
            {item.description && <div style={{ fontSize: 11, color: '#475569' }}>{item.description}</div>}
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

function ServiceModal({ service, onSave, onClose }) {
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
            <input
              value={(form.adapter_config || {})[field.key] || ''}
              onChange={e => setAdapterCfg(field.key, e.target.value)}
              placeholder={field.placeholder}
              style={inputStyle}
            />
            <div style={{ fontSize: 10, color: '#334155', marginTop: 3 }}>
              Use <code style={{ color: '#475569' }}>${'{'}ENV_VAR{'}'}</code> to reference an environment variable
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
    { key: 'lat',           label: 'Latitude',      type: 'number', placeholder: '41.01' },
    { key: 'lon',           label: 'Longitude',     type: 'number', placeholder: '28.98' },
    { key: 'location_name', label: 'Location name', type: 'text',   placeholder: 'Istanbul' },
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

// ─── Config Menu (Export / Import) ───────────────────────────────

function ConfigMenu({ onExport, onImport, onWidgets }) {
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

// ─── Main App ────────────────────────────────────────────────────

export default function App() {
  const { config, loading, error, saving, save, backup, importConfig, verifyToken } = useConfig()
  const { width } = useWindowSize()
  const [editModal, setEditModal] = useState(null)
  const [visible, setVisible] = useState(false)
  const [token, setToken] = useState(() => localStorage.getItem('hive_token') || '')
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [widgetsPanelOpen, setWidgetsPanelOpen] = useState(false)
  const [appVersion, setAppVersion] = useState('')

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

  const { settings = {}, services = [], bookmarks = [], widgets = [] } = config

  // ── Handlers ──
  const handleSaveService = async (form) => {
    const { categoryIdx, itemIdx } = editModal
    const newConfig = JSON.parse(JSON.stringify(config))
    // Clean up empty adapter fields before saving
    const cleaned = { ...form }
    if (!cleaned.adapter) {
      delete cleaned.adapter
      delete cleaned.adapter_config
    } else {
      // Remove empty adapter_config values
      const cfg = { ...(cleaned.adapter_config || {}) }
      Object.keys(cfg).forEach(k => { if (!cfg[k]) delete cfg[k] })
      cleaned.adapter_config = Object.keys(cfg).length ? cfg : undefined
      if (!cleaned.adapter_config) delete cleaned.adapter_config
    }
    if (itemIdx !== undefined) {
      newConfig.services[categoryIdx].items[itemIdx] = { ...newConfig.services[categoryIdx].items[itemIdx], ...cleaned }
    } else {
      newConfig.services[categoryIdx].items.push(cleaned)
    }
    await authSave(newConfig)
    setEditModal(null)
  }

  const handleDeleteService = async (catIdx, itemIdx) => {
    if (!confirm('Delete this service?')) return
    const newConfig = JSON.parse(JSON.stringify(config))
    newConfig.services[catIdx].items.splice(itemIdx, 1)
    await authSave(newConfig)
  }

  const handleSaveBookmark = async (form) => {
    const { categoryIdx, itemIdx } = editModal
    const newConfig = JSON.parse(JSON.stringify(config))
    if (itemIdx !== undefined) {
      newConfig.bookmarks[categoryIdx].items[itemIdx] = { ...newConfig.bookmarks[categoryIdx].items[itemIdx], ...form }
    } else {
      newConfig.bookmarks[categoryIdx].items.push(form)
    }
    await authSave(newConfig)
    setEditModal(null)
  }

  const handleDeleteBookmark = async (catIdx, itemIdx) => {
    if (!confirm('Delete this bookmark?')) return
    const newConfig = JSON.parse(JSON.stringify(config))
    newConfig.bookmarks[catIdx].items.splice(itemIdx, 1)
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

  const onlineCount = services.flatMap(s => s.items || []).length

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
        <img src="/logo.png" alt="Hive" style={{ width: 120, height: 120, objectFit: 'contain' }} />
      </div>

      {/* Top-right controls */}
      <div className={`fade ${visible ? 'show' : ''}`} style={{ position: 'fixed', top: 20, right: 24, display: 'flex', alignItems: 'center', gap: 8, zIndex: 50 }}>
        {isUnlocked && (
          <ConfigMenu onExport={authBackup} onImport={authImport} onWidgets={() => setWidgetsPanelOpen(true)} />
        )}
        <TokenGate isUnlocked={isUnlocked} onUnlock={handleUnlock} onLock={handleLock} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto', padding: isMobile ? '32px 16px 48px' : '48px 24px 64px' }}>

        {/* Header */}
        <div className={`fade ${visible ? 'show' : ''}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, marginBottom: 24 }}>
          <WidgetBar config={config} settings={settings} />
        </div>

        {/* Toolbar */}
        <div className={`fade ${visible ? 'show' : ''}`}
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 32, transitionDelay: '60ms' }}>
          <div style={{ fontSize: 11, color: '#334155', display: 'flex', alignItems: 'center', gap: 4, marginRight: 'auto' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ADE80', display: 'inline-block' }} />
            {onlineCount} services
          </div>
        </div>

        {/* Services */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase', marginRight: 'auto' }}>Services</div>
            {isUnlocked && (
              <button
                onClick={() => setEditModal({ type: 'category', section: 'services' })}
                style={{ fontSize: 11, color: '#334155', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
                + Category
              </button>
            )}
          </div>
          {services.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${getColumns()}, 1fr)`, gap: isMobile ? 16 : 28 }}>
              {services.map((group, gi) => (
                <div key={gi} className={`fade ${visible ? 'show' : ''}`} style={{ transitionDelay: `${80 + gi * 50}ms` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span>{group.icon}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#475569', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{group.category}</span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
                    {isUnlocked && (<>
                      <button onClick={() => setEditModal({ type: 'category', section: 'services', categoryIdx: gi, category: group })}
                        style={{ fontSize: 11, color: '#334155', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>✏️</button>
                      <button onClick={() => handleDeleteCategory('services', gi)}
                        style={{ fontSize: 11, color: '#334155', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>🗑️</button>
                      <button onClick={() => setEditModal({ type: 'service', categoryIdx: gi })}
                        style={{ fontSize: 11, color: '#334155', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>+ Add</button>
                    </>)}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(group.items || []).map((item, ii) => (
                      <ServiceCard key={ii} item={item} compact={isMobile}
                        onEdit={isUnlocked ? (it) => setEditModal({ type: 'service', categoryIdx: gi, itemIdx: ii, item: it }) : null}
                        onDelete={isUnlocked ? () => handleDeleteService(gi, ii) : null} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bookmarks */}
        <div className={`fade ${visible ? 'show' : ''}`} style={{ transitionDelay: '300ms' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase', marginRight: 'auto' }}>Bookmarks</div>
            {isUnlocked && (
              <button
                onClick={() => setEditModal({ type: 'category', section: 'bookmarks' })}
                style={{ fontSize: 11, color: '#334155', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
                + Category
              </button>
            )}
          </div>
          {bookmarks.map((group, gi) => (
            <div key={gi} style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span>{group.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#475569', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{group.category}</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
                {isUnlocked && (<>
                  <button onClick={() => setEditModal({ type: 'category', section: 'bookmarks', categoryIdx: gi, category: group })}
                    style={{ fontSize: 11, color: '#334155', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>✏️</button>
                  <button onClick={() => handleDeleteCategory('bookmarks', gi)}
                    style={{ fontSize: 11, color: '#334155', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>🗑️</button>
                  <button onClick={() => setEditModal({ type: 'bookmark', categoryIdx: gi })}
                    style={{ fontSize: 11, color: '#334155', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>+ Add</button>
                </>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {(group.items || []).map((item, ii) => (
                  <BookmarkCard key={ii} item={item}
                    onEdit={isUnlocked ? (it) => setEditModal({ type: 'bookmark', categoryIdx: gi, itemIdx: ii, item: it }) : null}
                    onDelete={isUnlocked ? () => handleDeleteBookmark(gi, ii) : null} />
                ))}
              </div>
            </div>
          ))}
        </div>

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
      {widgetsPanelOpen && (
        <WidgetsPanel config={config} onSave={authSave} onClose={() => setWidgetsPanelOpen(false)} />
      )}

      {/* Modals */}
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
