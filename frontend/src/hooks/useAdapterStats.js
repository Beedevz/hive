import { useState, useEffect, useRef } from 'react'

const POLL_INTERVAL = 60_000 // 60 seconds

/**
 * Fetches adapter stats for a service via /api/probe/{name}/details.
 * The backend resolves the adapter type from config — no need to pass it here.
 * @param {string|null} serviceName - service name as in config (e.g. "GitLab")
 * @param {boolean} hasAdapter - only fetch if the service has an adapter configured
 * @returns {{ stats: Array, loading: boolean, error: string|null }}
 */
export function useAdapterStats(serviceName, hasAdapter) {
  const [stats, setStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!serviceName || !hasAdapter) {
      setLoading(false)
      return
    }

    const fetchStats = async () => {
      try {
        const res = await fetch(`/api/probe/${encodeURIComponent(serviceName)}/details`)
        const data = await res.json()
        if (data.ok) {
          setStats(data.stats || [])
          setError(null)
        } else {
          setError(data.error || 'adapter error')
          setStats([])
        }
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
    timerRef.current = setInterval(fetchStats, POLL_INTERVAL)
    return () => clearInterval(timerRef.current)
  }, [serviceName, hasAdapter])

  return { stats, loading, error }
}
