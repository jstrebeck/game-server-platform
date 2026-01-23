'use client'

import { RefObject } from 'react'
import { ServerResult, ConsoleOutput, UploadMessage } from '@/app/lib/types'

interface OperationsTabProps {
  result: ServerResult
  opPlayerName: string
  opLoading: boolean
  opMessage: string | null
  consoleCommand: string
  consoleLoading: boolean
  consoleOutput: ConsoleOutput | null
  uploadLoading: boolean
  uploadMessage: UploadMessage | null
  fileInputRef: RefObject<HTMLInputElement | null>
  onOpPlayerNameChange: (name: string) => void
  onOpPlayer: () => void
  onConsoleCommandChange: (command: string) => void
  onConsoleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onExecuteConsole: () => void
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onUploadClick: () => void
  onClearUploadMessage: () => void
}

export function OperationsTab({
  result,
  opPlayerName,
  opLoading,
  opMessage,
  consoleCommand,
  consoleLoading,
  consoleOutput,
  uploadLoading,
  uploadMessage,
  fileInputRef,
  onOpPlayerNameChange,
  onOpPlayer,
  onConsoleCommandChange,
  onConsoleKeyDown,
  onExecuteConsole,
  onFileSelect,
  onUploadClick,
  onClearUploadMessage,
}: OperationsTabProps) {
  return (
    <div className="space-y-4 mb-4">
      {/* OP Player Section - only when server is running */}
      {result.status === 'ready' && (
        <div className="p-3 bg-slate-800/50 rounded-lg">
          <span className="text-slate-400 text-sm block mb-2">Give Operator Permissions</span>
          <div className="flex gap-2">
            <input
              type="text"
              value={opPlayerName}
              onChange={(e) => onOpPlayerNameChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onOpPlayer()}
              placeholder="Player name"
              className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500"
              disabled={opLoading}
            />
            <button
              onClick={onOpPlayer}
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
      )}

      {/* Console - only when server is running */}
      {result.status === 'ready' && (
        <div className="p-4 bg-slate-800/50 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-white font-medium">Server Console</span>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono">/</span>
              <input
                type="text"
                value={consoleCommand}
                onChange={(e) => onConsoleCommandChange(e.target.value)}
                onKeyDown={onConsoleKeyDown}
                placeholder="say Hello World"
                className="w-full pl-7 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:border-green-500"
                disabled={consoleLoading}
              />
            </div>
            <button
              onClick={onExecuteConsole}
              disabled={consoleLoading || !consoleCommand.trim()}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {consoleLoading ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              )}
              Send
            </button>
          </div>
          {consoleOutput && (
            <div className={`mt-3 p-2 rounded-lg font-mono text-sm ${
              consoleOutput.type === 'success' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
            }`}>
              {consoleOutput.text}
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Press Enter to send. Use Arrow Up/Down for command history.
          </p>
        </div>
      )}

      {/* World Upload Section */}
      <div className="p-4 bg-slate-800/50 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-white font-medium">Upload World Save</span>
        </div>
        <p className="text-slate-400 text-sm mb-3">
          Upload a .zip file containing your Minecraft world save. This will replace the current world data.
        </p>

        {result.status === 'stopped' ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={onFileSelect}
              className="hidden"
              disabled={uploadLoading}
            />
            <button
              onClick={onUploadClick}
              disabled={uploadLoading}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-amber-500/50 transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none flex items-center justify-center gap-2"
            >
              {uploadLoading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Uploading...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Select World File (.zip)
                </>
              )}
            </button>
            <p className="text-slate-500 text-xs mt-2 text-center">Maximum file size: 500MB</p>
            <div className="mt-3 p-2 bg-slate-900/50 rounded-lg border border-slate-700/50">
              <p className="text-slate-400 text-xs">
                <span className="text-amber-400 font-medium">Tip:</span> Your zip should contain a Minecraft world folder with a <code className="bg-slate-800 px-1 rounded">level.dat</code> file. Example structure:
              </p>
              <pre className="text-slate-500 text-xs mt-1 font-mono">world.zip/my-world/level.dat</pre>
            </div>
          </>
        ) : (
          <div className="py-3 px-4 bg-slate-900/50 rounded-lg text-center">
            <svg className="w-6 h-6 text-slate-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <p className="text-slate-400 text-sm">Stop the server to upload a world</p>
          </div>
        )}

        {/* Upload Message */}
        {uploadMessage && (
          <div className={`mt-3 p-3 rounded-lg flex items-start gap-2 ${
            uploadMessage.type === 'success'
              ? 'bg-green-500/10 border border-green-500/30'
              : 'bg-red-500/10 border border-red-500/30'
          }`}>
            {uploadMessage.type === 'success' ? (
              <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <p className={`text-sm ${uploadMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
              {uploadMessage.text}
            </p>
            <button
              onClick={onClearUploadMessage}
              className={`ml-auto ${uploadMessage.type === 'success' ? 'text-green-400 hover:text-green-300' : 'text-red-400 hover:text-red-300'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
