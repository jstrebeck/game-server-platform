'use client'

import { Plugin } from '@/app/lib/types'

interface PluginsTabProps {
  availablePlugins: Plugin[]
  pluginLoading: string | null
  isPluginInstalled: (pluginId: string) => boolean
  onInstallPlugin: (pluginId: string) => void
  onUninstallPlugin: (pluginId: string) => void
}

export function PluginsTab({
  availablePlugins,
  pluginLoading,
  isPluginInstalled,
  onInstallPlugin,
  onUninstallPlugin,
}: PluginsTabProps) {
  return (
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
              onClick={() => installed ? onUninstallPlugin(plugin.id) : onInstallPlugin(plugin.id)}
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
  )
}
