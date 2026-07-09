'use client'

import { useState } from 'react'
import { fetchWithAuthRetry } from '@/lib/fetch-with-auth-retry'

export default function DashboardPage() {
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function callProtectedRoute() {
    setLoading(true)
    setResult(null)

    try {
      const res = await fetchWithAuthRetry('/api/protected-data?simulateAuthFailure=true')
      const data = await res.json()
      setResult(JSON.stringify(data, null, 2))
    } catch (err) {
      setResult(`Erro: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '4rem auto', padding: '1rem' }}>
      <h1>Dashboard — teste de resiliência a 401</h1>
      <button onClick={callProtectedRoute} disabled={loading}>
        {loading ? 'Chamando...' : 'Chamar rota protegida'}
      </button>
      {result && (
        <pre style={{ marginTop: '1rem', background: '#f5f5f5', padding: '1rem' }}>
          {result}
        </pre>
      )}
    </div>
  )
}
