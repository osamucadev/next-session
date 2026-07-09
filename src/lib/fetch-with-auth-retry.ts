import { createClient } from '@/lib/supabase/client'

const REFRESH_LOCK_NAME = 'supabase-refresh-lock'

/**
 * Wrapper de fetch que trata 401 de forma resiliente:
 * ao invés de redirecionar direto pro login, tenta recuperar
 * a sessão (respeitando o lock compartilhado com o SessionSync,
 * para não competir por um refresh concorrente) e refaz a
 * requisição uma única vez antes de desistir.
 */
export async function fetchWithAuthRetry(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const response = await fetch(input, init)

  if (response.status !== 401) {
    return response
  }

  const supabase = createClient()
  let recovered = false

  await navigator.locks.request(REFRESH_LOCK_NAME, async () => {
    const { data: sessionData } = await supabase.auth.getSession()

    const secondsRemaining = sessionData.session?.expires_at
      ? sessionData.session.expires_at - Math.floor(Date.now() / 1000)
      : null

    // Se a sessão local já parece válida (outra aba pode ter
    // renovado enquanto esperávamos o lock), não tenta de novo.
    if (secondsRemaining !== null && secondsRemaining > 5) {
      recovered = true
      return
    }

    const { error } = await supabase.auth.refreshSession()
    recovered = !error
  })

  if (!recovered) {
    window.location.href = '/login'
    return response
  }

  // Refaz a requisição original uma única vez após recuperar a sessão.
  return fetch(input, init)
}
