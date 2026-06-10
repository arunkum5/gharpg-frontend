import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'

export default async function PGAdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'pgadmin') redirect('/login')

  // Get assigned PG name
  const { data: pgAdmin } = await supabase
    .from('pg_admins')
    .select('pgs(name)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  const pgName = (pgAdmin?.pgs as unknown as { name: string } | null)?.name || 'My PG'

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#FAF6F2' }}>
      <Sidebar role="pgadmin" userName={profile.name} pgName={pgName} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  )
}
