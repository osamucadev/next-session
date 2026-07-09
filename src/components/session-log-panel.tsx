'use client'

import { useEffect, useState } from 'react'
import { SESSION_SYNC_EVENT } from './session-sync'

interface LogEntry {
  message: string
  timestamp: string
}

export function SessionLogPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [tabId, setTabId] = useState<string | null>(null)

  useEffect(() => {
    // Gerado só no client, depois da montagem -- evita mismatch de
    // hidratação, já que Math.random() no server e no client
    // produziria valores diferentes se calculado durante o render inicial.
    setTabId(Math.random().toString(36).slice(2, 8))
  }, [])

  useEffect(() => {
    function handleLog(event: Event) {
      const custom = event as CustomEvent<LogEntry>
      setLogs((prev) => [...prev.slice(-19), custom.detail])
    }
    window.addEventListener(SESSION_SYNC_EVENT, handleLog)
    return () => window.removeEventListener(SESSION_SYNC_EVENT, handleLog)
  }, [])

  return (
    <div
      style={{
        marginTop: '2rem',
        border: '1px solid #ccc',
        borderRadius: 8,
        padding: '1rem',
        background: '#0a0a0a',
        color: '#0f0',
        fontFamily: 'monospace',
        fontSize: '0.85rem',
        maxHeight: 300,
        overflowY: 'auto',
      }}
    >
      <div style={{ color: '#fff', marginBottom: '0.5rem' }}>
        Aba ID: <strong>{tabId ?? '...'}</strong>
      </div>
      {logs.length === 0 && <div>Aguardando eventos de sincronização...</div>}
      {logs.map((log, i) => (
        <div key={i}>
          [{log.timestamp}] {log.message}
        </div>
      ))}
    </div>
  )
}
