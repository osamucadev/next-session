import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Desativamos o auto-refresh nativo porque cada aba rodaria
        // seu próprio timer e disparariam refresh concorrentes.
        // A coordenação é feita manualmente pelo SessionSync (Web Locks).
        autoRefreshToken: false,
        persistSession: true,
      },
    }
  )
}
