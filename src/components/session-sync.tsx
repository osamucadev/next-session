'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

const CHANNEL_NAME = 'supabase-session-sync'
const LOCK_NAME = 'supabase-refresh-lock'

// Fração da vida útil do token em que disparamos o refresh proativo.
// Ex: 0.75 significa "renove quando 75% do tempo de vida já passou".
const REFRESH_THRESHOLD_RATIO = 0.75
// Piso mínimo entre agendamentos, para nunca cair num loop de refresh
// instantâneo mesmo com expirações muito curtas (ex.: testes).
const MIN_REFRESH_DELAY_MS = 5000

export function SessionSync() {
  const channelRef = useRef<BroadcastChannel | null>(null)
  const lastIssuedAtRef = useRef<number | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channelRef.current = channel

    let refreshTimer: ReturnType<typeof setTimeout> | null = null

    channel.onmessage = async (event) => {
      if (event.data === 'session-refreshed') {
        const { data } = await supabase.auth.getSession()
        scheduleNextRefresh(data.session?.expires_at)
      }
      if (event.data === 'signed-out') {
        window.location.href = '/login'
      }
    }

    async function performRefresh() {
      await navigator.locks.request(LOCK_NAME, async () => {
        const { data: sessionData } = await supabase.auth.getSession()
        const expiresAt = sessionData.session?.expires_at

        const stillNeedsRefresh =
          expiresAt !== undefined &&
          expiresAt - Math.floor(Date.now() / 1000) < 30

        if (!stillNeedsRefresh) {
          scheduleNextRefresh(expiresAt)
          return
        }

        const { data, error } = await supabase.auth.refreshSession()

        if (error) {
          channel.postMessage('signed-out')
          return
        }

        channel.postMessage('session-refreshed')
        scheduleNextRefresh(data.session?.expires_at)
      })
    }

    function scheduleNextRefresh(expiresAt?: number) {
      if (refreshTimer) clearTimeout(refreshTimer)
      if (!expiresAt) return

      const nowSeconds = Math.floor(Date.now() / 1000)
      const secondsUntilExpiry = expiresAt - nowSeconds

      // Estima a vida útil total do token com base em quando foi emitido,
      // já que não temos "issued_at" direto -- usamos o próprio delta atual
      // na primeira vez, e o resultado se estabiliza nas renovações seguintes.
      const estimatedLifetime = lastIssuedAtRef.current
        ? expiresAt - lastIssuedAtRef.current
        : secondsUntilExpiry
      lastIssuedAtRef.current = nowSeconds

      const refreshAtSecondsRemaining =
        estimatedLifetime * (1 - REFRESH_THRESHOLD_RATIO)

      const delaySeconds = Math.max(
        secondsUntilExpiry - refreshAtSecondsRemaining,
        0
      )

      const delayMs = Math.max(delaySeconds * 1000, MIN_REFRESH_DELAY_MS)

      refreshTimer = setTimeout(performRefresh, delayMs)
    }

    supabase.auth.getSession().then(({ data }) => {
      scheduleNextRefresh(data.session?.expires_at)
    })

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().then(({ data }) => {
          const secondsRemaining = data.session?.expires_at
            ? data.session.expires_at - Math.floor(Date.now() / 1000)
            : null
          if (secondsRemaining !== null && secondsRemaining < 30) {
            performRefresh()
          } else {
            scheduleNextRefresh(data.session?.expires_at)
          }
        })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      channel.close()
    }
  }, [])

  return null
}
