'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

const CHANNEL_NAME = 'supabase-session-sync'
const LOCK_NAME = 'supabase-refresh-lock'

export function SessionSync() {
  const channelRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channelRef.current = channel

    let refreshTimer: ReturnType<typeof setTimeout> | null = null

    // Quando outra aba avisa que renovou a sessão, esta aba só
    // relê a sessão do cookie -- não tenta renovar de novo.
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
      // Web Lock garante que, entre todas as abas desta origem,
      // só uma execute o refresh de fato por vez.
      await navigator.locks.request(LOCK_NAME, async () => {
        const { data: sessionData } = await supabase.auth.getSession()

        // Antes de renovar, verifica se outra aba já renovou
        // enquanto esperávamos o lock (evita refresh duplicado).
        const stillNeedsRefresh =
          sessionData.session &&
          sessionData.session.expires_at !== undefined &&
          sessionData.session.expires_at - Math.floor(Date.now() / 1000) < 60

        if (!stillNeedsRefresh) {
          scheduleNextRefresh(sessionData.session?.expires_at)
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

      const secondsUntilExpiry = expiresAt - Math.floor(Date.now() / 1000)
      // Agenda o refresh 60s antes da expiração (ou imediatamente se já estiver perto)
      const delayMs = Math.max((secondsUntilExpiry - 60) * 1000, 0)

      refreshTimer = setTimeout(performRefresh, delayMs)
    }

    // Inicialização: agenda com base na sessão atual
    supabase.auth.getSession().then(({ data }) => {
      scheduleNextRefresh(data.session?.expires_at)
    })

    // Também reagimos quando a aba volta a ficar visível
    // (usuário trocou de aba e voltou) -- cenário citado no desafio.
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().then(({ data }) => {
          const secondsRemaining = data.session?.expires_at
            ? data.session.expires_at - Math.floor(Date.now() / 1000)
            : null
          if (secondsRemaining !== null && secondsRemaining < 60) {
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
