'use client'

import { RefObject, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { ServerResult, ConsoleOutput, UploadMessage, ConfigFile } from '@/app/lib/types'

interface ConfigSaveMessage {
  type: 'success' | 'error'
  text: string
}

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
  // Config props
  configFiles: ConfigFile[]
  configSelectedFile: string | null
  configFileContent: string
  configLoading: boolean
  configSaving: boolean
  configError: string | null
  configSaveMessage: ConfigSaveMessage | null
  configHasUnsavedChanges: boolean
  onFetchConfigFiles: () => void
  onLoadConfigFile: (filename: string) => void
  onSaveConfigFile: () => void
  onConfigContentChange: (content: string) => void
  onClearConfigSaveMessage: () => void
  getConfigLanguage: (filename: string) => string
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
  // Config props
  configFiles,
  configSelectedFile,
  configFileContent,
  configLoading,
  configSaving,
  configError,
  configSaveMessage,
  configHasUnsavedChanges,
  onFetchConfigFiles,
  onLoadConfigFile,
  onSaveConfigFile,
  onConfigContentChange,
  onClearConfigSaveMessage,
  getConfigLanguage,
}: OperationsTabProps) {
  // Fetch config files when server is running
  useEffect(() => {
    if (result.status === 'ready') {
      onFetchConfigFiles()
    }
  }, [result.status, onFetchConfigFiles])

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

      {/* Config Files Section - only when server is running */}
      {result.status === 'ready' && (
        <div className="p-4 bg-slate-800/50 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-white font-medium">Configuration Files</span>
            </div>
            {configHasUnsavedChanges && (
              <span className="px-2 py-1 bg-amber-500/20 text-amber-400 text-xs rounded-full border border-amber-500/30">
                Unsaved Changes
              </span>
            )}
          </div>

          {/* Config Error */}
          {configError && (
            <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2">
              <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-400 text-sm">{configError}</p>
            </div>
          )}

          {/* File Selector */}
          <div className="flex gap-2 mb-3">
            <select
              value={configSelectedFile || ''}
              onChange={(e) => e.target.value && onLoadConfigFile(e.target.value)}
              disabled={configLoading || configFiles.length === 0}
              className="flex-1 py-2 px-3 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed appearance-none cursor-pointer"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}
            >
              <option value="">
                {configLoading ? 'Loading...' : configFiles.length === 0 ? 'No config files found' : 'Select a file...'}
              </option>
              {configFiles.map((file) => (
                <option key={file.name} value={file.name}>
                  {file.name}
                </option>
              ))}
            </select>
            <button
              onClick={onFetchConfigFiles}
              disabled={configLoading}
              className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed rounded-lg text-sm transition-colors"
              title="Refresh file list"
            >
              <svg className={`w-4 h-4 ${configLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {/* Editor */}
          {configSelectedFile && (
            <>
              <div className="rounded-lg overflow-hidden border border-slate-700 mb-3">
                <Editor
                  height="300px"
                  language={getConfigLanguage(configSelectedFile)}
                  value={configFileContent}
                  onChange={(value) => onConfigContentChange(value || '')}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    automaticLayout: true,
                    tabSize: 2,
                    padding: { top: 10 },
                  }}
                  loading={
                    <div className="h-[300px] flex items-center justify-center bg-slate-900">
                      <div className="text-slate-400 flex items-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Loading editor...
                      </div>
                    </div>
                  }
                />
              </div>

              {/* Save Button and Message */}
              <div className="flex items-center gap-3">
                <button
                  onClick={onSaveConfigFile}
                  disabled={configSaving || !configHasUnsavedChanges}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  {configSaving ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Saving...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                      </svg>
                      Save Changes
                    </>
                  )}
                </button>

                {configSaveMessage && (
                  <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg ${
                    configSaveMessage.type === 'success'
                      ? 'bg-green-500/10 border border-green-500/30'
                      : 'bg-red-500/10 border border-red-500/30'
                  }`}>
                    {configSaveMessage.type === 'success' ? (
                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    <span className={`text-sm ${configSaveMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                      {configSaveMessage.text}
                    </span>
                    <button
                      onClick={onClearConfigSaveMessage}
                      className={`ml-auto ${configSaveMessage.type === 'success' ? 'text-green-400 hover:text-green-300' : 'text-red-400 hover:text-red-300'}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* Warning about restart */}
              <p className="mt-2 text-xs text-slate-500">
                Some changes may require a server restart to take effect.
              </p>
            </>
          )}

          {/* Help text when no file selected */}
          {!configSelectedFile && configFiles.length > 0 && (
            <p className="text-slate-500 text-sm">
              Select a configuration file to edit.
            </p>
          )}
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
