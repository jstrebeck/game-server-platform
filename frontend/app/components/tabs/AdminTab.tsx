'use client'

import { Impersonation, ClusterStats, AdminUser, MaintenanceBanner } from '@/app/lib/types'

interface AdminTabProps {
  impersonating: Impersonation | null
  clusterStats: ClusterStats | null
  clusterStatsLoading: boolean
  adminUsers: AdminUser[]
  userSearchQuery: string
  usersLoading: boolean
  usersTotal: number
  maintenanceBanner: MaintenanceBanner | null
  maintenanceLoading: boolean
  maintenanceMessage: string
  onFetchClusterStats: () => void
  onUserSearchQueryChange: (query: string) => void
  onSearchUsers: (query: string) => void
  onStartImpersonation: (userId: string) => void
  onStopImpersonation: () => void
  onMaintenanceMessageChange: (message: string) => void
  onUpdateMaintenance: (enabled: boolean, message: string) => void
}

export function AdminTab({
  impersonating,
  clusterStats,
  clusterStatsLoading,
  adminUsers,
  userSearchQuery,
  usersLoading,
  usersTotal,
  maintenanceBanner,
  maintenanceLoading,
  maintenanceMessage,
  onFetchClusterStats,
  onUserSearchQueryChange,
  onSearchUsers,
  onStartImpersonation,
  onStopImpersonation,
  onMaintenanceMessageChange,
  onUpdateMaintenance,
}: AdminTabProps) {
  return (
    <div className="space-y-4 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <span className="text-amber-400 font-medium">Admin Panel</span>
      </div>

      {/* Cluster RAM Stats */}
      <div className="p-4 bg-slate-800/50 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-white font-medium">Cluster Resources</h4>
          <button
            onClick={onFetchClusterStats}
            disabled={clusterStatsLoading}
            className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 rounded text-slate-300 transition-colors"
          >
            {clusterStatsLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        {clusterStats ? (
          <div className="space-y-3">
            {/* RAM Progress Bar */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">RAM Allocated</span>
                <span className="text-white">{clusterStats.total_allocated_gb} GB / {clusterStats.cluster_capacity_gb} GB</span>
              </div>
              <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    clusterStats.usage_percent >= 90
                      ? 'bg-rose-500'
                      : clusterStats.usage_percent >= 70
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(clusterStats.usage_percent, 100)}%` }}
                />
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-3 bg-slate-900/50 rounded-lg">
                <p className="text-slate-400 text-xs mb-1">Remaining Capacity</p>
                <p className={`text-lg font-semibold ${
                  clusterStats.remaining_gb <= 8 ? 'text-rose-400' : 'text-emerald-400'
                }`}>
                  {clusterStats.remaining_gb} GB
                </p>
              </div>
              <div className="p-3 bg-slate-900/50 rounded-lg">
                <p className="text-slate-400 text-xs mb-1">Active Servers</p>
                <p className="text-lg font-semibold text-cyan-400">{clusterStats.active_servers}</p>
              </div>
              <div className="p-3 bg-slate-900/50 rounded-lg">
                <p className="text-slate-400 text-xs mb-1">Currently Used</p>
                <p className="text-lg font-semibold text-slate-300">{clusterStats.total_used_gb} GB</p>
              </div>
              <div className="p-3 bg-slate-900/50 rounded-lg">
                <p className="text-slate-400 text-xs mb-1">Usage</p>
                <p className={`text-lg font-semibold ${
                  clusterStats.usage_percent >= 90
                    ? 'text-rose-400'
                    : clusterStats.usage_percent >= 70
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}>
                  {clusterStats.usage_percent}%
                </p>
              </div>
            </div>
          </div>
        ) : clusterStatsLoading ? (
          <div className="flex items-center justify-center py-4">
            <svg className="animate-spin h-5 w-5 text-slate-400 mr-2" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-slate-400 text-sm">Loading cluster stats...</span>
          </div>
        ) : (
          <p className="text-slate-500 text-sm text-center py-2">
            Failed to load cluster stats
          </p>
        )}
      </div>

      {/* Maintenance Banner */}
      <div className="p-4 bg-slate-800/50 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-white font-medium">Maintenance Banner</h4>
          <span className={`px-2 py-1 text-xs rounded-full ${
            maintenanceBanner?.enabled
              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
              : 'bg-slate-600/20 text-slate-400 border border-slate-600/30'
          }`}>
            {maintenanceBanner?.enabled ? 'Active' : 'Inactive'}
          </span>
        </div>
        <p className="text-slate-400 text-sm mb-3">
          Display a maintenance banner to all users at the top of the page.
        </p>

        <div className="space-y-3">
          {/* Toggle Switch */}
          <div className="flex items-center justify-between">
            <span className="text-slate-300 text-sm">Enable Banner</span>
            <button
              onClick={() => onUpdateMaintenance(!maintenanceBanner?.enabled, maintenanceMessage)}
              disabled={maintenanceLoading}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                maintenanceBanner?.enabled ? 'bg-orange-500' : 'bg-slate-600'
              } ${maintenanceLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  maintenanceBanner?.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Message Input */}
          <div>
            <label className="text-slate-400 text-sm block mb-1">Message</label>
            <input
              type="text"
              value={maintenanceMessage}
              onChange={(e) => onMaintenanceMessageChange(e.target.value)}
              placeholder="Enter maintenance message..."
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500"
            />
          </div>

          {/* Save Button */}
          <button
            onClick={() => onUpdateMaintenance(maintenanceBanner?.enabled ?? false, maintenanceMessage)}
            disabled={maintenanceLoading}
            className="w-full py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
          >
            {maintenanceLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Current Impersonation Status */}
      {impersonating && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-amber-200 text-sm font-medium">Currently Impersonating</p>
              <p className="text-amber-100">{impersonating.email || impersonating.userId}</p>
            </div>
            <button
              onClick={onStopImpersonation}
              className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded-lg text-amber-200 text-sm font-medium transition-colors"
            >
              Exit
            </button>
          </div>
        </div>
      )}

      {/* User Search */}
      <div className="p-4 bg-slate-800/50 rounded-lg">
        <h4 className="text-white font-medium mb-3">User Impersonation</h4>
        <p className="text-slate-400 text-sm mb-3">
          Search for a user to impersonate and view their server as them.
        </p>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={userSearchQuery}
            onChange={(e) => onUserSearchQueryChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearchUsers(userSearchQuery)}
            placeholder="Search by email or name..."
            className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500"
          />
          <button
            onClick={() => onSearchUsers(userSearchQuery)}
            disabled={usersLoading}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
          >
            {usersLoading ? 'Loading...' : 'Search'}
          </button>
        </div>

        <button
          onClick={() => onSearchUsers('')}
          disabled={usersLoading}
          className="w-full py-2 mb-4 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
        >
          {usersLoading ? 'Loading...' : 'Load All Users'}
        </button>

        {/* User List */}
        {adminUsers.length > 0 && (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            <p className="text-slate-500 text-xs mb-2">
              Showing {adminUsers.length} of {usersTotal} users
            </p>
            {adminUsers.map((u) => (
              <div
                key={u.user_id}
                className="p-3 bg-slate-900/50 rounded-lg flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {u.picture && (
                    <img
                      src={u.picture}
                      alt=""
                      className="w-8 h-8 rounded-full flex-shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-medium truncate">
                        {u.name || u.email || u.user_id}
                      </span>
                      {u.is_admin && (
                        <span className="px-2 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded-full flex-shrink-0">
                          Admin
                        </span>
                      )}
                    </div>
                    <p className="text-slate-400 text-xs truncate">{u.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => onStartImpersonation(u.user_id)}
                  disabled={u.is_admin || impersonating?.userId === u.user_id}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
                    u.is_admin
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : impersonating?.userId === u.user_id
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 border border-indigo-500/30'
                  }`}
                >
                  {impersonating?.userId === u.user_id
                    ? 'Active'
                    : u.is_admin
                    ? 'Admin'
                    : 'Impersonate'}
                </button>
              </div>
            ))}
          </div>
        )}

        {adminUsers.length === 0 && !usersLoading && (
          <p className="text-slate-500 text-sm text-center py-4">
            Click "Load All Users" or search to see users
          </p>
        )}
      </div>
    </div>
  )
}
