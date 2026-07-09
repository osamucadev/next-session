'use client'
import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

const CHANNEL_NAME = 'supabase-session-sync'
const LOCK_NAME = 'supabase-refresh-lock'
const REFRESH_THRESHOLD_RATIO = 0.75
const MIN_REFRESH_DELAY_MS = 5000

const DISABLE_PROACTIVE_REFRESH =
  process.env.NEXT_PUBLIC_DISABLE_PROACTIVE_REFRESH === 'true'

export const SESSION_SYNC_EVENT = 'session-sync-log'

function emitLog(message: string) {
  window.dispatchEvent(
    new CustomEvent(SESSION_SYNC_EVENT, {
      detail: { message, timestamp: new Date().toLocaleTimeString('pt-BR') },
    })
  )
}

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
        emitLog('📡 Recebido: outra aba renovou a sessão — relendo cookie (sem refresh próprio)')
        const { data } = await supabase.auth.getSession()
        if (!DISABLE_PROACTIVE_REFRESH) {
          scheduleNextRefresh(data.session?.expires_at)
        }
      }
      if (event.data === 'signed-out') {
        emitLog('🚪 Recebido: sessão encerrada em outra aba')
        window.location.href = '/login'
      }
    }

    async function performRefresh() {
      emitLog('🔒 Solicitando lock para renovar o token...')
      await navigator.locks.request(LOCK_NAME, async () => {
        emitLog('🔓 Lock adquirido — esta aba executará o refresh')
        const { data: sessionData } = await supabase.auth.getSession()
        const expiresAt = sessionData.session?.expires_at
        const stillNeedsRefresh =
          expiresAt !== undefined &&
          expiresAt - Math.floor(Date.now() / 1000) < 30

        if (!stillNeedsRefresh) {
          emitLog('✅ Sessão já estava fresca (outra aba renovou enquanto esperávamos o lock)')
          scheduleNextRefresh(expiresAt)
          return
        }

        const { data, error } = await supabase.auth.refreshSession()

        if (error) {
          // O refresh pode falhar com "Already Used" quando outra fonte
          // (o proxy, numa navegação de página, ou outra aba) já rotacionou
          // o refresh token um instante antes. Isso NÃO significa que a
          // sessão morreu -- só que já foi renovada por outro caminho.
          // Relemos o cookie local antes de desistir de verdade.
          emitLog(`⚠️ Refresh falhou (${error.message}) — verificando se outra fonte já renovou...`)
          const { data: freshSessionData } = await supabase.auth.getSession()
          const freshExpiresAt = freshSessionData.session?.expires_at
          const isFreshSessionValid =
            freshExpiresAt !== undefined &&
            freshExpiresAt - Math.floor(Date.now() / 1000) > 5

          if (isFreshSessionValid) {
            emitLog('✅ Sessão já estava válida (renovada por outra fonte) — não é logout')
            scheduleNextRefresh(freshExpiresAt)
            return
          }

          emitLog(`❌ Sessão realmente inválida após verificação: ${error.message}`)
          channel.postMessage('signed-out')
          return
        }

        emitLog('🔄 Token renovado com sucesso — avisando outras abas')
        channel.postMessage('session-refreshed')
        scheduleNextRefresh(data.session?.expires_at)
      })
    }

    function scheduleNextRefresh(expiresAt?: number) {
      if (DISABLE_PROACTIVE_REFRESH) return
      if (refreshTimer) clearTimeout(refreshTimer)
      if (!expiresAt) return

      const nowSeconds = Math.floor(Date.now() / 1000)
      const secondsUntilExpiry = expiresAt - nowSeconds

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

      emitLog(`⏱️ Próximo refresh agendado em ~${Math.round(delayMs / 1000)}s`)
      refreshTimer = setTimeout(performRefresh, delayMs)
    }

    if (!DISABLE_PROACTIVE_REFRESH) {
      supabase.auth.getSession().then(({ data }) => {
        emitLog('🟢 SessionSync iniciado nesta aba')
        scheduleNextRefresh(data.session?.expires_at)
      })
    }

    function handleVisibilityChange() {
      if (DISABLE_PROACTIVE_REFRESH) return
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().then(({ data }) => {
          const secondsRemaining = data.session?.expires_at
            ? data.session.expires_at - Math.floor(Date.now() / 1000)
            : null
          if (secondsRemaining !== null && secondsRemaining < 30) {
            emitLog('👁️ Aba voltou a ficar visível com token perto de expirar — renovando')
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
