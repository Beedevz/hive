import { useState, useEffect, useCallback } from 'react'

const API = '/api'

export function useConfig() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API}/config`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setConfig(data)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const save = useCallback(async (newConfig, token) => {
    try {
      setSaving(true)
      const res = await fetch(`${API}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Hive-Token': token || '',
        },
        body: JSON.stringify(newConfig),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setConfig(newConfig)
      return true
    } catch (e) {
      setError(e.message)
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  const backup = useCallback(async (token) => {
    const res = await fetch(`${API}/config/backup`, {
      headers: { 'X-Hive-Token': token || '' },
    })
    if (!res.ok) return
    const blob = await res.blob()
    const cd = res.headers.get('Content-Disposition') || ''
    const match = cd.match(/filename="?([^"]+)"?/)
    const filename = match ? match[1] : `config_backup_${Date.now()}.yaml`
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const importConfig = useCallback(async (file, token) => {
    try {
      setSaving(true)
      const text = await file.text()
      const res = await fetch(`${API}/config/raw`, {
        method: 'PUT',
        headers: {
          'Content-Type': file.name.endsWith('.json') ? 'application/json' : 'application/x-yaml',
          'X-Hive-Token': token || '',
        },
        body: text,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await load()
      return true
    } catch (e) {
      setError(e.message)
      return false
    } finally {
      setSaving(false)
    }
  }, [load])

  const verifyToken = useCallback(async (token) => {
    try {
      const res = await fetch(`${API}/auth/verify`, {
        headers: { 'X-Hive-Token': token },
      })
      return res.ok
    } catch {
      return false
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { config, loading, error, saving, save, backup, importConfig, verifyToken, reload: load }
}
