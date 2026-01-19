'use client'

import { useState, useEffect, useRef } from 'react'
import { useUser } from '@auth0/nextjs-auth0/client'
import { useAccessToken } from '@/components/AccessTokenProvider'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const WS_URL = API_URL.replace(/^http/, 'ws')

// Check if JWT token is expired
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    const exp = payload.exp * 1000 // Convert to milliseconds
    // Consider expired if less than 30 seconds remaining
    return Date.now() > exp - 30000
  } catch {
    return true
  }
}

export default function Home() {
  const { user, isLoading: authLoading } = useUser()
  const { getAccessToken } = useAccessToken()

  // Derive userId from Auth0 sub claim (sanitized for K8s namespace)
  const userId = user?.sub
    ? user.sub.replace(/[^a-z0-9-]/gi, '-').toLowerCase().slice(0, 40)
    : ''

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [serverExists, setServerExists] = useState<boolean | null>(null) // null = unknown, true = exists, false = doesn't exist
  const [logs, setLogs] = useState<string[]>([])
  const [wsConnected, setWsConnected] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [metrics, setMetrics] = useState<{ memory_bytes: number; memory_human: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'details' | 'monitoring' | 'operations' | 'plugins'>('details')
  const [availablePlugins, setAvailablePlugins] = useState<any[]>([])
  const [installedPlugins, setInstalledPlugins] = useState<any[]>([])
  const [pluginLoading, setPluginLoading] = useState<string | null>(null)
  const [opPlayerName, setOpPlayerName] = useState('')
  const [opLoading, setOpLoading] = useState(false)
  const [opMessage, setOpMessage] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const metricsIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (showLogs) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, showLogs])

  // Cleanup WebSocket and metrics interval on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (metricsIntervalRef.current) {
        clearInterval(metricsIntervalRef.current)
      }
    }
  }, [])

  // Auto-check for existing server when user is authenticated
  useEffect(() => {
    async function checkExistingServer() {
      if (!user || authLoading) return

      const token = await getAccessToken()
      if (!token) return

      try {
        const res = await fetch(`${API_URL}/gameserver`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (res.ok) {
          const data = await res.json()
          setResult(data)
          setServerExists(true)
          if (data.status === 'ready') {
            startMetricsPolling()
          }
          fetchAvailablePlugins()
          fetchInstalledPlugins()
        } else if (res.status === 404) {
          setServerExists(false)
        }
      } catch (err) {
        console.error('Error checking for existing server:', err)
      }
    }

    checkExistingServer()
  }, [user, authLoading])

  // Helper function for authenticated API calls
  async function fetchWithAuth(url: string, options: RequestInit = {}) {
    let token = await getAccessToken()

    if (!token) {
      // No token, redirect to login
      window.location.href = '/auth/login'
      throw new Error('Not authenticated')
    }

    // Check if token is expired
    if (isTokenExpired(token)) {
      console.log('Token expired, requesting fresh token...')
      // Token expired, force a fresh token fetch
      token = await getAccessToken(true)

      if (!token || isTokenExpired(token)) {
        // Still expired, redirect to login
        console.log('Could not refresh token, redirecting to login...')
        window.location.href = '/auth/login'
        throw new Error('Session expired')
      }
    }

    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    })
  }

  async function fetchMetrics() {
    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver/metrics`)
      if (res.ok) {
        const data = await res.json()
        console.log('Metrics response:', data)
        // Get the minecraft container metrics (first one)
        if (data.metrics && data.metrics.length > 0) {
          const mcMetrics = data.metrics.find((m: any) => m.container === 'minecraft') || data.metrics[0]
          setMetrics({
            memory_bytes: mcMetrics.memory_bytes,
            memory_human: mcMetrics.memory_human
          })
        } else {
          setMetrics({ memory_bytes: 0, memory_human: 'N/A' })
        }
      } else {
        console.log('Metrics fetch failed:', res.status)
        setMetrics({ memory_bytes: 0, memory_human: 'N/A' })
      }
    } catch (err) {
      console.log('Failed to fetch metrics:', err)
      setMetrics({ memory_bytes: 0, memory_human: 'N/A' })
    }
  }

  function startMetricsPolling() {
    // Clear any existing interval
    if (metricsIntervalRef.current) {
      clearInterval(metricsIntervalRef.current)
    }
    // Fetch immediately
    fetchMetrics()
    // Then poll every 10 seconds
    metricsIntervalRef.current = setInterval(fetchMetrics, 10000)
  }

  function stopMetricsPolling() {
    if (metricsIntervalRef.current) {
      clearInterval(metricsIntervalRef.current)
      metricsIntervalRef.current = null
    }
    setMetrics(null)
  }

  async function fetchAvailablePlugins() {
    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver/plugins/available`)
      if (res.ok) {
        const data = await res.json()
        setAvailablePlugins(data.plugins || [])
      }
    } catch (err) {
      console.log('Failed to fetch available plugins:', err)
    }
  }

  async function fetchInstalledPlugins() {
    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver/plugins`)
      if (res.ok) {
        const data = await res.json()
        setInstalledPlugins(data.plugins || [])
      }
    } catch (err) {
      console.log('Failed to fetch installed plugins:', err)
    }
  }

  async function installPlugin(pluginId: string) {
    setPluginLoading(pluginId)
    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver/plugins/${pluginId}`, {
        method: 'POST'
      })
      if (res.ok) {
        await fetchInstalledPlugins()
      } else {
        const data = await res.json()
        setError(data.detail || 'Failed to install plugin')
      }
    } catch (err) {
      console.error('Failed to install plugin:', err)
      setError('Failed to install plugin')
    } finally {
      setPluginLoading(null)
    }
  }

  async function uninstallPlugin(pluginId: string) {
    setPluginLoading(pluginId)
    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver/plugins/${pluginId}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        await fetchInstalledPlugins()
      } else {
        const data = await res.json()
        setError(data.detail || 'Failed to uninstall plugin')
      }
    } catch (err) {
      console.error('Failed to uninstall plugin:', err)
      setError('Failed to uninstall plugin')
    } finally {
      setPluginLoading(null)
    }
  }

  function isPluginInstalled(pluginId: string): boolean {
    return installedPlugins.some(p => p.id === pluginId)
  }

  async function opPlayer() {
    if (!opPlayerName.trim()) return

    setOpLoading(true)
    setOpMessage(null)
    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver/op/${encodeURIComponent(opPlayerName.trim())}`, {
        method: 'POST'
      })
      const data = await res.json()
      if (res.ok) {
        setOpMessage(`Successfully opped ${opPlayerName}`)
        setOpPlayerName('')
      } else {
        setOpMessage(data.detail || 'Failed to op player')
      }
    } catch (err) {
      console.error('Failed to op player:', err)
      setOpMessage('Failed to op player')
    } finally {
      setOpLoading(false)
      // Clear message after 5 seconds
      setTimeout(() => setOpMessage(null), 5000)
    }
  }

  async function connectToLogs(namespace: string, podName: string) {
    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close()
    }

    const token = await getAccessToken()
    if (!token) {
      setError('Authentication required for log streaming')
      return
    }

    setLogs([])
    setShowLogs(true)

    // Pass token as query parameter for WebSocket auth
    const ws = new WebSocket(`${WS_URL}/ws/logs/${namespace}/${podName}?token=${encodeURIComponent(token)}`)

    ws.onopen = () => {
      console.log('WebSocket connected')
      setWsConnected(true)
    }

    ws.onmessage = (event) => {
      setLogs(prev => [...prev, event.data])
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      setWsConnected(false)
    }

    ws.onclose = () => {
      console.log('WebSocket closed')
      setWsConnected(false)
    }

    wsRef.current = ws
  }

  function disconnectLogs() {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setWsConnected(false)
    setShowLogs(false)
  }

  async function fetchPodsAndConnect() {
    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver/pods`)
      if (!res.ok) {
        throw new Error(`Failed to fetch pods: ${res.status}`)
      }

      const data = await res.json()
      console.log('Pods:', data.pods)

      if (data.pods && data.pods.length > 0) {
        // Connect to the first pod (typically the minecraft server)
        const podName = data.pods[0].name
        const namespace = `server-${userId}`
        connectToLogs(namespace, podName)
      } else {
        alert('No pods found. The server might still be starting up.')
      }
    } catch (error) {
      console.error('Error fetching pods:', error)
      alert('Failed to fetch pod information. Please try again.')
    }
  }

  async function getExistingServer() {
    setLoading(true)
    setResult(null)
    setError(null)
    setShowLogs(false)
    disconnectLogs()
    stopMetricsPolling()

    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver`)

      if (!res.ok) {
        if (res.status === 404) {
          setServerExists(false)
          setError('No server found. Create a new server to get started.')
        } else if (res.status === 401) {
          setError('Authentication expired. Please log in again.')
        } else {
          setError(`Failed to fetch server info (Error ${res.status}). Please try again.`)
        }
        setLoading(false)
        return
      }

      const data = await res.json()
      console.log('Existing server:', data)
      setResult(data)
      setServerExists(true)
      setError(null)

      // Start metrics polling if server is ready
      if (data.status === 'ready') {
        startMetricsPolling()
      }

      // Fetch plugins
      fetchAvailablePlugins()
      fetchInstalledPlugins()
    } catch (err) {
      console.error('Error fetching server:', err)
      setError('Failed to connect to backend. Please ensure the backend server is running.')
    } finally {
      setLoading(false)
    }
  }

  async function startServer() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver/start`, {
        method: 'POST',
      })

      if (!res.ok) {
        setError(`Failed to start server (Error ${res.status})`)
        return
      }

      const data = await res.json()
      console.log('Start response:', data)
      // Refresh server info after starting
      await getExistingServer()
    } catch (err) {
      console.error('Error starting server:', err)
      setError('Failed to start server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function stopServer() {
    setLoading(true)
    setError(null)
    disconnectLogs()
    stopMetricsPolling()

    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver/stop`, {
        method: 'POST',
      })

      if (!res.ok) {
        setError(`Failed to stop server (Error ${res.status})`)
        return
      }

      const data = await res.json()
      console.log('Stop response:', data)
      // Refresh server info after stopping
      await getExistingServer()
    } catch (err) {
      console.error('Error stopping server:', err)
      setError('Failed to stop server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function deleteServer() {
    if (!confirm('Are you sure you want to delete your server? This action cannot be undone.')) {
      return
    }

    setLoading(true)
    setError(null)
    disconnectLogs()
    stopMetricsPolling()

    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        setError(`Failed to delete server (Error ${res.status})`)
        return
      }

      const data = await res.json()
      console.log('Delete response:', data)
      setResult(null)
      setServerExists(false)
      setError(null)
    } catch (err) {
      console.error('Error deleting server:', err)
      setError('Failed to delete server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function createServer() {
    setLoading(true)
    setResult(null)
    setError(null)
    setShowLogs(false)
    disconnectLogs()
    stopMetricsPolling()

    try {
      const res = await fetchWithAuth(
        `${API_URL}/gameserver?game=minecraft&memory=2G`,
        { method: 'POST' }
      )

      if (!res.ok) {
        // Handle specific error codes
        if (res.status === 409) {
          setServerExists(true)
          setError('Server already exists.')
          // Auto-fetch the existing server details
          await getExistingServer()
        } else if (res.status === 500) {
          setError('Server error occurred. Please try again later.')
        } else if (res.status === 401) {
          setError('Authentication expired. Please log in again.')
        } else {
          setError(`Failed to create server (Error ${res.status}). Please try again.`)
        }
        setLoading(false)
        return
      }

      const data = await res.json()
      console.log('API response:', data)
      setResult(data)
      setServerExists(true)
      setError(null)

      // Start metrics polling if server is ready
      if (data.status === 'ready') {
        startMetricsPolling()
      }
    } catch (err) {
      console.error('Error creating server:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Loading state while checking authentication
  if (authLoading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </main>
    )
  }

  // Login screen for unauthenticated users
  if (!user) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white">
        {/* Hero Section */}
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-4">
              Watch2Play
            </h1>
            <p className="text-slate-300 mb-2 text-xl md:text-2xl font-medium">On-Demand Minecraft Server Hosting</p>
            <p className="text-slate-400 mb-8 text-base md:text-lg max-w-2xl mx-auto">
              Your own private Minecraft server, ready in seconds. No technical knowledge required.
            </p>

            <a
              href="/auth/login"
              className="py-4 px-10 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 font-semibold shadow-lg hover:shadow-indigo-500/50 transition-all duration-200 transform hover:scale-[1.02] text-lg inline-block mb-16"
            >
              Get Started
            </a>

            {/* Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left mb-16">
              {/* Feature 1 */}
              <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-800 hover:border-indigo-500/50 transition-colors">
                <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Instant Setup</h3>
                <p className="text-slate-400 text-sm">
                  Your server is ready in seconds. No downloads, no configuration files, no command line. Just click and play.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-800 hover:border-indigo-500/50 transition-colors">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Play with Friends</h3>
                <p className="text-slate-400 text-sm">
                  Share your server address with friends and start playing together. Build, explore, and survive as a team.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-800 hover:border-indigo-500/50 transition-colors">
                <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">No Hardware Needed</h3>
                <p className="text-slate-400 text-sm">
                  Stop worrying about computer specs or leaving your PC running. We handle all the heavy lifting in the cloud.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-800 hover:border-indigo-500/50 transition-colors">
                <div className="w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Easy Management</h3>
                <p className="text-slate-400 text-sm">
                  Start, stop, and manage your server from any device. View live logs, monitor performance, and install plugins with one click.
                </p>
              </div>

              {/* Feature 5 */}
              <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-800 hover:border-indigo-500/50 transition-colors">
                <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">DDoS Protected</h3>
                <p className="text-slate-400 text-sm">
                  Your server is protected against attacks. Play without interruptions and keep griefers at bay.
                </p>
              </div>

              {/* Feature 6 */}
              <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-800 hover:border-indigo-500/50 transition-colors">
                <div className="w-12 h-12 bg-rose-500/20 rounded-xl flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Your World, Your Rules</h3>
                <p className="text-slate-400 text-sm">
                  Full control over your server. Add plugins, set permissions, whitelist players, and customize your experience.
                </p>
              </div>
            </div>

            {/* Why Host Section */}
            <div className="bg-slate-900/30 backdrop-blur-sm rounded-2xl p-8 border border-slate-800 mb-8">
              <h2 className="text-2xl font-bold text-white mb-4">Why Host Your Own Server?</h2>
              <div className="text-left text-slate-300 space-y-4">
                <p>
                  Playing on public Minecraft servers can be fun, but nothing beats having your own private world.
                  With your own server, you decide who can join, what plugins to use, and how the game is played.
                </p>
                <p>
                  Whether you want a peaceful survival world with close friends, an epic creative building project,
                  or a custom minigame server, having your own hosted server makes it possible without the technical hassle.
                </p>
                <p className="text-slate-400 text-sm">
                  Traditional self-hosting requires port forwarding, static IPs, and keeping your computer running 24/7.
                  We eliminate all of that complexity so you can focus on what matters: playing the game.
                </p>
              </div>
            </div>

            {/* CTA */}
            <a
              href="/auth/login"
              className="py-4 px-10 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 font-semibold shadow-lg hover:shadow-indigo-500/50 transition-all duration-200 transform hover:scale-[1.02] text-lg inline-block"
            >
              Start Playing Now
            </a>
            <p className="text-slate-500 text-sm mt-4">Free to get started. No credit card required.</p>
          </div>
        </div>
      </main>
    )
  }

  // Authenticated user view
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header with user info */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-2">
            Watch2Play
          </h1>
          <p className="text-slate-400 mb-4">On-Demand Minecraft Server Hosting</p>
          <div className="flex items-center justify-center gap-3">
            {user.picture && (
              <img src={user.picture} alt="Profile" className="w-8 h-8 rounded-full" />
            )}
            <span className="text-slate-300">{user.email || user.name || user.sub}</span>
            <a
              href="/auth/logout"
              className="text-sm text-slate-400 hover:text-white transition-colors px-3 py-1 rounded-lg hover:bg-slate-800"
            >
              Logout
            </a>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-slate-900/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-800 overflow-hidden">
          {/* Server Actions Section */}
          <div className="p-6 space-y-4">
            <div className="flex justify-center">
              {serverExists === null ? (
                <div className="py-3 px-4 text-slate-400">
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Checking server status...
                  </span>
                </div>
              ) : serverExists === false ? (
                <button
                  onClick={createServer}
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-indigo-500/50 transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Creating...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Create New Server
                    </span>
                  )}
                </button>
              ) : (
                <button
                  onClick={getExistingServer}
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-slate-500/50 transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none border border-slate-600"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Refreshing...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refresh Server Details
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
                <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-red-400 font-semibold mb-1">Error</h3>
                  <p className="text-red-200 text-sm">{error}</p>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="text-red-400 hover:text-red-300 transition-colors"
                  aria-label="Dismiss error"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Server Status Section */}
          {result && (
            <div className="border-t border-slate-800 bg-slate-900/50 p-6">
              {/* Tab Navigation */}
              <div className="flex items-center gap-1 mb-4 border-b border-slate-700">
                <button
                  onClick={() => setActiveTab('details')}
                  className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                    activeTab === 'details'
                      ? 'text-indigo-400'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Connect
                  {activeTab === 'details' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-400" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('monitoring')}
                  className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                    activeTab === 'monitoring'
                      ? 'text-indigo-400'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Monitoring
                  {activeTab === 'monitoring' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-400" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('operations')}
                  className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                    activeTab === 'operations'
                      ? 'text-indigo-400'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Operations
                  {activeTab === 'operations' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-400" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('plugins')}
                  className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                    activeTab === 'plugins'
                      ? 'text-indigo-400'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Plugins
                  {activeTab === 'plugins' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-400" />
                  )}
                </button>
                <div className="flex-1" />
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  result.status === 'ready'
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : result.status === 'stopped'
                    ? 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                    : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                }`}>
                  {result.status === 'ready' ? '● Ready' : result.status === 'stopped' ? '● Stopped' : '● Starting'}
                </span>
              </div>

              {/* Details Tab */}
              {activeTab === 'details' && (
                <div className="space-y-3 mb-4">
                  <div className="p-3 bg-slate-800/50 rounded-lg">
                    <span className="text-slate-400 text-sm block mb-1">Connect with</span>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-indigo-400 font-medium">{result.hostname}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(result.hostname)}
                        className="text-slate-400 hover:text-white transition-colors p-1"
                        title="Copy to clipboard"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Monitoring Tab */}
              {activeTab === 'monitoring' && (
                <div className="space-y-4 mb-4">
                  {/* RAM Usage */}
                  {result.status === 'ready' && (
                    <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                      <span className="text-slate-400 text-sm">RAM Usage</span>
                      <span className="font-mono text-sm text-cyan-400">
                        {metrics ? metrics.memory_human : 'Loading...'}
                      </span>
                    </div>
                  )}

                  {/* Start/Stop Buttons */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={startServer}
                      disabled={loading}
                      className="py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-emerald-500/50 transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                          Start
                        </>
                      )}
                    </button>

                    <button
                      onClick={stopServer}
                      disabled={loading}
                      className="py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-red-500/50 transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 6h12v12H6z" />
                          </svg>
                          Stop
                        </>
                      )}
                    </button>
                  </div>

                  {/* Server Logs Button */}
                  {!showLogs && (
                    <button
                      onClick={fetchPodsAndConnect}
                      className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-slate-700 to-slate-600 hover:from-slate-600 hover:to-slate-500 font-semibold shadow-lg transition-all duration-200 transform hover:scale-[1.02] flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      View Server Logs
                    </button>
                  )}

                  {/* Delete Button */}
                  <button
                    onClick={deleteServer}
                    disabled={loading}
                    className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-red-900/50 border border-slate-700 hover:border-red-500/50 disabled:bg-slate-800 disabled:cursor-not-allowed text-slate-400 hover:text-red-400 text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete Server
                  </button>
                </div>
              )}

              {/* Operations Tab */}
              {activeTab === 'operations' && (
                <div className="space-y-3 mb-4">
                  {result.status === 'ready' ? (
                    <div className="p-3 bg-slate-800/50 rounded-lg">
                      <span className="text-slate-400 text-sm block mb-2">Give Operator Permissions</span>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={opPlayerName}
                          onChange={(e) => setOpPlayerName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && opPlayer()}
                          placeholder="Player name"
                          className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500"
                          disabled={opLoading}
                        />
                        <button
                          onClick={opPlayer}
                          disabled={opLoading || !opPlayerName.trim()}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                          {opLoading ? (
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : 'OP'}
                        </button>
                      </div>
                      {opMessage && (
                        <p className={`mt-2 text-sm ${opMessage.includes('Successfully') ? 'text-green-400' : 'text-red-400'}`}>
                          {opMessage}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-500">
                      Start the server to access operations
                    </div>
                  )}
                </div>
              )}

              {/* Plugins Tab */}
              {activeTab === 'plugins' && (
                <div className="space-y-3 mb-4">
                  <p className="text-slate-400 text-sm mb-3">
                    Install popular plugins on your server. Restart required after changes.
                  </p>
                  {availablePlugins.map((plugin) => {
                    const installed = isPluginInstalled(plugin.id)
                    const isLoading = pluginLoading === plugin.id
                    return (
                      <div key={plugin.id} className="p-3 bg-slate-800/50 rounded-lg flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">{plugin.name}</span>
                            {installed && (
                              <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded-full">
                                Installed
                              </span>
                            )}
                          </div>
                          <p className="text-slate-400 text-sm truncate">{plugin.description}</p>
                        </div>
                        <button
                          onClick={() => installed ? uninstallPlugin(plugin.id) : installPlugin(plugin.id)}
                          disabled={isLoading}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
                            installed
                              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                              : 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 border border-indigo-500/30'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {isLoading ? (
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : installed ? 'Remove' : 'Install'}
                        </button>
                      </div>
                    )
                  })}
                  {availablePlugins.length === 0 && (
                    <div className="text-center py-8 text-slate-500">
                      Loading plugins...
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

          {/* Logs Section */}
          {showLogs && (
            <div className="border-t border-slate-800 bg-slate-950/50 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold">Server Logs</h3>
                  {wsConnected ? (
                    <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                      <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                      <span className="text-xs font-medium">Live</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                      <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                      <span className="text-xs font-medium">Disconnected</span>
                    </span>
                  )}
                </div>
                <button
                  onClick={disconnectLogs}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Close
                </button>
              </div>

              <div className="bg-black/50 rounded-xl border border-slate-800 p-4 h-96 overflow-y-auto font-mono text-xs shadow-inner">
                {logs.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <svg className="w-8 h-8 text-slate-600 mx-auto mb-2 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-slate-500">Waiting for logs...</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {logs.map((log, idx) => (
                      <div
                        key={idx}
                        className="text-emerald-400/90 whitespace-pre-wrap break-all leading-relaxed hover:bg-slate-900/30 px-2 py-0.5 rounded transition-colors"
                      >
                        {log}
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Logs update in real-time • {logs.length} line{logs.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-slate-500">
        </div>
      </div>
    </main>
  )
}
