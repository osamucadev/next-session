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

  return (
    <div style={{ maxWidth: 600, margin: '4rem auto', padding: '1rem' }}>
      <h1>Área protegida</h1>
      <p>Logado como: {user.email}</p>
      <p>Sessão expira em: {new Date((user as unknown as { exp?: number }).exp ? (user as unknown as { exp: number }).exp * 1000 : 0).toString() !== 'Invalid Date' ? '' : ''}</p>
    </div>
  )
}
