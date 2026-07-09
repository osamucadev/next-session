import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const expiresAt = session?.expires_at
    ? new Date(session.expires_at * 1000)
    : null

  const secondsRemaining = session?.expires_at
    ? session.expires_at - Math.floor(Date.now() / 1000)
    : null

  return (
    <div style={{ maxWidth: 600, margin: '4rem auto', padding: '1rem' }}>
      <h1>Área protegida</h1>
      <p>Logado como: {user.email}</p>
      {expiresAt && (
        <p>
          Sessão expira em: {expiresAt.toLocaleString('pt-BR')}
          {secondsRemaining !== null && (
            <> ({Math.max(0, Math.floor(secondsRemaining / 60))} min restantes)</>
          )}
        </p>
      )}
    </div>
  )
}
