import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Contador em memória só para fins de teste/demonstração: força um 401
// na primeira chamada após o servidor iniciar, simulando um cenário de
// corrida onde o token é rejeitado momentaneamente. Isso isola o teste
// do fetchWithAuthRetry sem depender de esperar expiração real, já que
// o proxy intercepta e renova o token antes de chegar aqui na maioria
// dos casos reais.
let hasSimulatedFailureOnce = false

export async function GET(request: Request) {
  const simulateFailure =
    new URL(request.url).searchParams.get('simulateAuthFailure') === 'true'

  if (simulateFailure && !hasSimulatedFailureOnce) {
    hasSimulatedFailureOnce = true
    return NextResponse.json({ error: 'Unauthorized (simulated)' }, { status: 401 })
  }

  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({
    message: 'Dados protegidos acessados com sucesso',
    userEmail: user.email,
    timestamp: new Date().toISOString(),
  })
}
