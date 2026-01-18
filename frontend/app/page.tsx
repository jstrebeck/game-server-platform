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
  const [logs, setLogs] = useState<string[]>([])
  const [wsConnected, setWsConnected] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (showLogs) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, showLogs])

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

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

    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver`)

      if (!res.ok) {
        if (res.status === 404) {
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
      setError(null)
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

    try {
      const res = await fetchWithAuth(
        `${API_URL}/gameserver?game=minecraft&memory=2G`,
        { method: 'POST' }
      )

      if (!res.ok) {
        // Handle specific error codes
        if (res.status === 409) {
          setError('Server already exists. Click "View Existing Server" to access it.')
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
      setError(null)
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
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-4">
            Watch2Play
          </h1>
          <p className="text-slate-400 mb-8 text-lg">On-Demand Minecraft Server Hosting</p>
          <a
            href="/auth/login"
            className="py-4 px-10 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 font-semibold shadow-lg hover:shadow-indigo-500/50 transition-all duration-200 transform hover:scale-[1.02] text-lg inline-block"
          >
            Login with Auth0
          </a>
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
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={createServer}
                disabled={loading}
                className="py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-indigo-500/50 transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create New
                  </span>
                )}
              </button>

              <button
                onClick={getExistingServer}
                disabled={loading}
                className="py-3 px-4 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-slate-500/50 transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none border border-slate-600"
              >
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  View Existing
                </span>
              </button>
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Server Details</h2>
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

              <div className="space-y-3 mb-4">
                <div className="p-3 bg-slate-800/50 rounded-lg">
                  <span className="text-slate-400 text-sm block mb-1">Connect with</span>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-indigo-400 font-medium">{result.hostname}:{result.port}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(`${result.hostname}:${result.port}`)}
                      className="text-slate-400 hover:text-white transition-colors p-1"
                      title="Copy to clipboard"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                  <span className="text-slate-400 text-sm">Namespace</span>
                  <span className="font-mono text-xs text-slate-500">{result.namespace}</span>
                </div>
              </div>

              {/* Start/Stop Buttons */}
              <div className="grid grid-cols-2 gap-3 mb-4">
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

              {/* Delete Button */}
              <button
                onClick={deleteServer}
                disabled={loading}
                className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-red-900/50 border border-slate-700 hover:border-red-500/50 disabled:bg-slate-800 disabled:cursor-not-allowed text-slate-400 hover:text-red-400 text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 mb-4"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete Server
              </button>

              {!showLogs && (
                <button
                  onClick={fetchPodsAndConnect}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 font-semibold shadow-lg hover:shadow-emerald-500/50 transition-all duration-200 transform hover:scale-[1.02] flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  View Server Logs
                </button>
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
