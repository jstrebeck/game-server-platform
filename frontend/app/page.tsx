'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@auth0/nextjs-auth0/client'
import { useAccessToken } from '@/components/AccessTokenProvider'

import { MINECRAFT_VERSIONS } from '@/app/lib/constants'
import { isAdmin, sanitizeUserId } from '@/app/lib/utils'

import { useAuth } from '@/app/hooks/useAuth'
import { useServer } from '@/app/hooks/useServer'
import { useBilling } from '@/app/hooks/useBilling'
import { useLogs } from '@/app/hooks/useLogs'
import { useMetrics } from '@/app/hooks/useMetrics'
import { usePlugins } from '@/app/hooks/usePlugins'
import { useConsole } from '@/app/hooks/useConsole'
import { useOperations } from '@/app/hooks/useOperations'
import { useAdmin } from '@/app/hooks/useAdmin'
import { useConfig } from '@/app/hooks/useConfig'

import { DetailsTab, MonitoringTab, OperationsTab, PluginsTab, BillingTab, AdminTab } from '@/app/components/tabs'
import { LogViewer } from '@/app/components/LogViewer'
import { PaymentModal, CapacityModal, UpgradeModal } from '@/app/components/modals'
import { LandingPage } from '@/app/components/LandingPage'

type TabType = 'details' | 'monitoring' | 'operations' | 'plugins' | 'billing' | 'admin'

export default function Home() {
  const { user, isLoading: authLoading } = useUser()
  const { getAccessToken } = useAccessToken()

  const userId = user?.sub ? sanitizeUserId(user.sub) : ''

  const [activeTab, setActiveTab] = useState<TabType>('details')
  const [selectedVersion, setSelectedVersion] = useState('LATEST')

  // Admin hook (needs to be initialized first as impersonating state is used by other hooks)
  const admin = useAdmin({
    user,
    getAccessToken,
    setError: (error) => server.setError(error),
    onImpersonationChange: () => server.resetServerState(),
  })

  // Auth hook
  const { fetchWithAuth } = useAuth(admin.impersonating)

  // Metrics hook
  const metricsHook = useMetrics({ fetchWithAuth })

  // Billing hook
  const billing = useBilling({
    fetchWithAuth,
    setError: (error) => server.setError(error),
  })

  // Plugins hook
  const plugins = usePlugins({
    fetchWithAuth,
    setError: (error) => server.setError(error),
  })

  // Server hook
  const server = useServer({
    fetchWithAuth,
    onServerReady: metricsHook.startMetricsPolling,
    onServerStopped: () => {
      logsHook.disconnectLogs()
      metricsHook.stopMetricsPolling()
    },
    fetchPlugins: plugins.fetchPlugins,
    fetchBillingStatus: billing.fetchBillingStatus,
    setShowPaymentModal: billing.setShowPaymentModal,
    setPaymentError: billing.setPaymentError,
  })

  // Logs hook
  const logsHook = useLogs({
    fetchWithAuth,
    getAccessToken,
    userId,
    impersonating: admin.impersonating,
    setError: server.setError,
  })

  // Console hook
  const consoleHook = useConsole({ fetchWithAuth })

  // Operations hook
  const operations = useOperations({ fetchWithAuth, getAccessToken })

  // Config hook
  const configHook = useConfig({ fetchWithAuth })

  // Handle payment query params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const paymentStatus = params.get('payment')

    if (paymentStatus === 'success') {
      window.history.replaceState({}, '', window.location.pathname)
      setTimeout(() => billing.fetchBillingStatus(), 1000)
    } else if (paymentStatus === 'canceled') {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // Auto-check for existing server and billing status
  useEffect(() => {
    async function checkExistingServer() {
      if (!user || authLoading) return

      const token = await getAccessToken()
      if (!token) return

      billing.fetchBillingStatus()

      try {
        const headers: Record<string, string> = {
          'Authorization': `Bearer ${token}`,
        }
        if (admin.impersonating) {
          headers['X-Impersonate-User'] = admin.impersonating.userId
        }

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/gameserver`, { headers })

        if (res.ok) {
          const data = await res.json()
          server.setResult(data)
          server.setServerExists(true)
          if (data.status === 'ready') {
            metricsHook.startMetricsPolling()
          }
          plugins.fetchPlugins()
        } else if (res.status === 404) {
          server.setServerExists(false)
        }
      } catch (err) {
        console.error('Error checking for existing server:', err)
      }
    }

    checkExistingServer()
  }, [user, authLoading, admin.impersonating])

  // Default to admin tab for admins without a server
  useEffect(() => {
    if (isAdmin(user) && server.serverExists === false && !server.result) {
      setActiveTab('admin')
    }
  }, [user, server.serverExists, server.result])

  // Fetch cluster stats when admin tab is active
  useEffect(() => {
    if (isAdmin(user) && activeTab === 'admin' && !admin.clusterStats && !admin.clusterStatsLoading) {
      admin.fetchClusterStats()
    }
  }, [user, activeTab])

  // Loading state
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
    return <LandingPage />
  }

  // Authenticated user view
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white flex items-center justify-center p-4">
      {/* Impersonation Banner */}
      {admin.impersonating && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-black py-2 px-4 flex items-center justify-center gap-4 shadow-lg">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="font-medium">
            Impersonating: {admin.impersonating.email || admin.impersonating.userId}
          </span>
          <button
            onClick={admin.stopImpersonation}
            className="px-3 py-1 bg-black/20 hover:bg-black/30 rounded-lg text-sm font-medium transition-colors"
          >
            Exit Impersonation
          </button>
        </div>
      )}

      <div className={`w-full max-w-2xl ${admin.impersonating ? 'pt-12' : ''}`}>
        {/* Header */}
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="Minecraft Hosting" className="h-16 mx-auto mb-2" />
          <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-2">
            Minecraft Hosting
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
          {/* Subscription Banner */}
          {billing.billingStatus && !billing.billingStatus.can_access_server && server.serverExists && (
            <div className="bg-gradient-to-r from-amber-600/20 to-orange-600/20 border-b border-amber-500/30 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-amber-200 text-sm">
                    {billing.billingStatus.is_trial_expired
                      ? 'Your trial has expired. Subscribe to continue using your server.'
                      : billing.billingStatus.subscription_status === 'past_due'
                      ? 'Payment failed. Please update your payment method.'
                      : 'Subscription required to start your server.'}
                  </p>
                </div>
                <button
                  onClick={() => billing.handleSubscribe(billing.selectedPlan)}
                  disabled={billing.billingLoading}
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg text-black text-sm font-semibold transition-colors whitespace-nowrap"
                >
                  {billing.billingLoading ? 'Loading...' : 'Subscribe Now'}
                </button>
              </div>
            </div>
          )}

          {/* Trial Countdown Banner */}
          {billing.billingStatus && billing.billingStatus.subscription_status === 'trialing' && !billing.billingStatus.is_trial_expired && billing.billingStatus.trial_ends_at && (
            <div className="bg-gradient-to-r from-blue-600/20 to-indigo-600/20 border-b border-blue-500/30 p-3">
              <div className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-blue-200 text-sm">
                  Free trial ends: <span className="font-medium">{new Date(billing.billingStatus.trial_ends_at).toLocaleString()}</span>
                </p>
              </div>
            </div>
          )}

          {/* Server Actions Section */}
          <div className="p-6 space-y-4">
            <div className="flex justify-center">
              {server.serverExists === null ? (
                <div className="py-3 px-4 text-slate-400">
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Checking server status...
                  </span>
                </div>
              ) : server.serverExists === false ? (
                <div className="w-full space-y-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm text-slate-400 text-left">Minecraft Version</label>
                    <select
                      value={selectedVersion}
                      onChange={(e) => setSelectedVersion(e.target.value)}
                      disabled={server.loading}
                      className="w-full py-3 px-4 rounded-xl bg-slate-800 border border-slate-700 text-white font-medium focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed appearance-none cursor-pointer"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1.5rem' }}
                    >
                      {MINECRAFT_VERSIONS.map((v) => (
                        <option key={v.value} value={v.value}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => server.createServer(selectedVersion)}
                    disabled={server.loading}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-indigo-500/50 transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none"
                  >
                    {server.loading ? (
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
                </div>
              ) : (
                <button
                  onClick={server.getExistingServer}
                  disabled={server.loading}
                  className="w-full py-3 px-4 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-slate-500/50 transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none border border-slate-600"
                >
                  {server.loading ? (
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
            {server.error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
                <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-red-400 font-semibold mb-1">Error</h3>
                  <p className="text-red-200 text-sm">{server.error}</p>
                </div>
                <button
                  onClick={() => server.setError(null)}
                  className="text-red-400 hover:text-red-300 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Server Status Section with Tabs */}
          {(server.result || isAdmin(user)) && (
            <div className="border-t border-slate-800 bg-slate-900/50 p-6">
              {/* Tab Navigation */}
              <div className="flex items-center gap-1 mb-4 border-b border-slate-700">
                {server.result && (
                  <>
                    <TabButton active={activeTab === 'details'} onClick={() => setActiveTab('details')} color="indigo">Connect</TabButton>
                    <TabButton active={activeTab === 'monitoring'} onClick={() => setActiveTab('monitoring')} color="indigo">Monitoring</TabButton>
                    <TabButton active={activeTab === 'operations'} onClick={() => setActiveTab('operations')} color="indigo">Operations</TabButton>
                    <TabButton active={activeTab === 'plugins'} onClick={() => setActiveTab('plugins')} color="indigo">Plugins</TabButton>
                  </>
                )}
                <TabButton active={activeTab === 'billing'} onClick={() => setActiveTab('billing')} color="emerald">Billing</TabButton>
                {isAdmin(user) && (
                  <TabButton active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} color="amber">Admin</TabButton>
                )}
                <div className="flex-1" />
                {server.result && (
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    server.result.status === 'ready'
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : server.result.status === 'stopped'
                      ? 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                      : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  }`}>
                    {server.result.status === 'ready' ? '● Ready' : server.result.status === 'stopped' ? '● Stopped' : '● Starting'}
                  </span>
                )}
              </div>

              {/* Tab Content */}
              {activeTab === 'details' && server.result && (
                <DetailsTab result={server.result} />
              )}

              {activeTab === 'monitoring' && server.result && (
                <MonitoringTab
                  result={server.result}
                  billingStatus={billing.billingStatus}
                  metrics={metricsHook.metrics}
                  loading={server.loading}
                  showLogs={logsHook.showLogs}
                  onStartServer={server.startServer}
                  onStopServer={server.stopServer}
                  onDeleteServer={server.deleteServer}
                  onViewLogs={logsHook.fetchPodsAndConnect}
                />
              )}

              {activeTab === 'operations' && server.result && (
                <OperationsTab
                  result={server.result}
                  opPlayerName={operations.opPlayerName}
                  opLoading={operations.opLoading}
                  opMessage={operations.opMessage}
                  consoleCommand={consoleHook.consoleCommand}
                  consoleLoading={consoleHook.consoleLoading}
                  consoleOutput={consoleHook.consoleOutput}
                  uploadLoading={operations.uploadLoading}
                  uploadMessage={operations.uploadMessage}
                  fileInputRef={operations.fileInputRef}
                  onOpPlayerNameChange={operations.setOpPlayerName}
                  onOpPlayer={operations.opPlayer}
                  onConsoleCommandChange={consoleHook.setConsoleCommand}
                  onConsoleKeyDown={consoleHook.handleConsoleKeyDown}
                  onExecuteConsole={consoleHook.executeConsoleCommand}
                  onFileSelect={operations.handleFileSelect}
                  onUploadClick={() => operations.fileInputRef.current?.click()}
                  onClearUploadMessage={() => operations.setUploadMessage(null)}
                  configFiles={configHook.files}
                  configSelectedFile={configHook.selectedFile}
                  configFileContent={configHook.fileContent}
                  configLoading={configHook.loading}
                  configSaving={configHook.saving}
                  configError={configHook.error}
                  configSaveMessage={configHook.saveMessage}
                  configHasUnsavedChanges={configHook.hasUnsavedChanges}
                  onFetchConfigFiles={configHook.fetchConfigFiles}
                  onLoadConfigFile={configHook.loadFile}
                  onSaveConfigFile={configHook.saveFile}
                  onConfigContentChange={configHook.setFileContent}
                  onClearConfigSaveMessage={() => configHook.setSaveMessage(null)}
                  getConfigLanguage={configHook.getLanguageFromFilename}
                />
              )}

              {activeTab === 'plugins' && server.result && (
                <PluginsTab
                  availablePlugins={plugins.availablePlugins}
                  pluginLoading={plugins.pluginLoading}
                  isPluginInstalled={plugins.isPluginInstalled}
                  onInstallPlugin={plugins.installPlugin}
                  onUninstallPlugin={plugins.uninstallPlugin}
                />
              )}

              {activeTab === 'billing' && (
                <BillingTab
                  billingStatus={billing.billingStatus}
                  billingLoading={billing.billingLoading}
                  selectedPlan={billing.selectedPlan}
                  upgradeSuccess={billing.upgradeSuccess}
                  onSelectPlan={billing.setSelectedPlan}
                  onSubscribe={billing.handleSubscribe}
                  onManageSubscription={billing.handleManageSubscription}
                  onShowUpgradeModal={() => billing.setShowUpgradeModal(true)}
                  getNextPlan={billing.getNextPlan}
                />
              )}

              {activeTab === 'admin' && isAdmin(user) && (
                <AdminTab
                  impersonating={admin.impersonating}
                  clusterStats={admin.clusterStats}
                  clusterStatsLoading={admin.clusterStatsLoading}
                  adminUsers={admin.adminUsers}
                  userSearchQuery={admin.userSearchQuery}
                  usersLoading={admin.usersLoading}
                  usersTotal={admin.usersTotal}
                  onFetchClusterStats={admin.fetchClusterStats}
                  onUserSearchQueryChange={admin.setUserSearchQuery}
                  onSearchUsers={admin.searchUsers}
                  onStartImpersonation={admin.startImpersonation}
                  onStopImpersonation={admin.stopImpersonation}
                />
              )}
            </div>
          )}

          {/* Modals */}
          {billing.showPaymentModal && (
            <PaymentModal
              paymentError={billing.paymentError}
              selectedPlan={billing.selectedPlan}
              billingLoading={billing.billingLoading}
              onSelectPlan={billing.setSelectedPlan}
              onSubscribe={billing.handleSubscribe}
              onClose={() => {
                billing.setShowPaymentModal(false)
                billing.setPaymentError(null)
              }}
            />
          )}

          {billing.showCapacityModal && (
            <CapacityModal onClose={() => billing.setShowCapacityModal(false)} />
          )}

          {billing.showUpgradeModal && billing.billingStatus && (
            <UpgradeModal
              billingStatus={billing.billingStatus}
              billingLoading={billing.billingLoading}
              getCurrentPlan={billing.getCurrentPlan}
              getNextPlan={billing.getNextPlan}
              onUpgrade={billing.handleUpgrade}
              onClose={() => billing.setShowUpgradeModal(false)}
            />
          )}

          {/* Logs Section */}
          {logsHook.showLogs && (
            <LogViewer
              logs={logsHook.logs}
              wsConnected={logsHook.wsConnected}
              logsEndRef={logsHook.logsEndRef}
              onDisconnect={logsHook.disconnectLogs}
              onRetry={logsHook.fetchPodsAndConnect}
            />
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-slate-500"></div>
      </div>
    </main>
  )
}

// Tab Button Component
function TabButton({
  active,
  onClick,
  color,
  children
}: {
  active: boolean
  onClick: () => void
  color: 'indigo' | 'emerald' | 'amber'
  children: React.ReactNode
}) {
  const colorClasses = {
    indigo: active ? 'text-indigo-400' : 'text-slate-400 hover:text-white',
    emerald: active ? 'text-emerald-400' : 'text-slate-400 hover:text-white',
    amber: active ? 'text-amber-400' : 'text-slate-400 hover:text-white',
  }

  const underlineColors = {
    indigo: 'bg-indigo-400',
    emerald: 'bg-emerald-400',
    amber: 'bg-amber-400',
  }

  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition-colors relative ${colorClasses[color]}`}
    >
      {children}
      {active && <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${underlineColors[color]}`} />}
    </button>
  )
}
