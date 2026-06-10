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

  if (!profile || (profile.role !== 'pgadmin' && profile.role !== 'superadmin')) redirect('/login')

  // Get assigned PG name
  let pgName = 'My PG'
  if (profile.role === 'pgadmin') {
    const { data: pgAdmin } = await supabase
      .from('pg_admins')
      .select('pgs(name)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    pgName = (pgAdmin?.pgs as unknown as { name: string } | null)?.name || 'My PG'
  } else {
    pgName = 'Super Admin'
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#FAF6F2' }}>
      <Sidebar role={profile.role as any} userName={profile.name} pgName={pgName} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  )
}
