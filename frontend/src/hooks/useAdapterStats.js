import { useState, useEffect, useRef } from 'react'

const POLL_INTERVAL = 60_000 // 60 seconds

/**
 * Fetches adapter stats for a service.
 * @param {string} adapter - adapter type (e.g. "gitlab")
 * @param {string} serviceName - service name as in config (e.g. "GitLab")
 * @returns {{ stats: Array, loading: boolean, error: string|null }}
 */
export function useAdapterStats(adapter, serviceName) {
  const [stats, setStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!adapter || !serviceName) {
      setLoading(false)
      return
    }

    const fetchStats = async () => {
      try {
        const params = new URLSearchParams({ service: serviceName })
        const res = await fetch(`/api/adapters/${encodeURIComponent(adapter)}?${params}`)
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
  }, [adapter, serviceName])

  return { stats, loading, error }
}
