'use client'

import { ServerResult } from '@/app/lib/types'
import { LATEST_MC_VERSION } from '@/app/lib/constants'

interface DetailsTabProps {
  result: ServerResult
}

export function DetailsTab({ result }: DetailsTabProps) {
  const displayVersion = result.version === 'LATEST' ? LATEST_MC_VERSION : result.version

  return (
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
      <div className="p-3 bg-slate-800/50 rounded-lg">
        <span className="text-slate-400 text-sm block mb-1">Minecraft Version</span>
        <span className="text-white font-medium">{displayVersion || 'Unknown'}</span>
      </div>
    </div>
  )
}
