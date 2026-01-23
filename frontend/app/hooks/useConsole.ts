'use client'

import { useState, useCallback } from 'react'
import { API_URL } from '@/app/lib/constants'
import { ConsoleOutput } from '@/app/lib/types'

interface UseConsoleProps {
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>
}

export function useConsole({ fetchWithAuth }: UseConsoleProps) {
  const [consoleCommand, setConsoleCommand] = useState('')
  const [consoleLoading, setConsoleLoading] = useState(false)
  const [consoleOutput, setConsoleOutput] = useState<ConsoleOutput | null>(null)
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const executeConsoleCommand = useCallback(async () => {
    const command = consoleCommand.trim()
    if (!command) return

    setConsoleLoading(true)
    setConsoleOutput(null)

    try {
      const res = await fetchWithAuth(`${API_URL}/gameserver/console`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command }),
      })

      const data = await res.json()

      if (res.ok) {
        setConsoleOutput({ type: 'success', text: data.output || 'Command executed' })
        setCommandHistory(prev => {
          const newHistory = prev.filter(cmd => cmd !== command)
          return [...newHistory, command].slice(-50)
        })
        setConsoleCommand('')
        setHistoryIndex(-1)
      } else {
        setConsoleOutput({ type: 'error', text: data.detail || 'Failed to execute command' })
      }
    } catch (err) {
      console.error('Failed to execute console command:', err)
      setConsoleOutput({ type: 'error', text: 'Failed to execute command' })
    } finally {
      setConsoleLoading(false)
    }
  }, [fetchWithAuth, consoleCommand])

  const handleConsoleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      executeConsoleCommand()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1)
        setHistoryIndex(newIndex)
        setConsoleCommand(commandHistory[newIndex])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1)
          setConsoleCommand('')
        } else {
          setHistoryIndex(newIndex)
          setConsoleCommand(commandHistory[newIndex])
        }
      }
    }
  }, [executeConsoleCommand, commandHistory, historyIndex])

  return {
    consoleCommand,
    consoleLoading,
    consoleOutput,
    setConsoleCommand,
    executeConsoleCommand,
    handleConsoleKeyDown,
  }
}
