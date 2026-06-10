import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TopBar from '@/components/layout/TopBar'

export default async function SuperAdminDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch all PGs
  const { data: pgs } = await supabase
    .from('pgs')
    .select('id, name, city, type, is_active')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const pgIds = (pgs || []).map(p => p.id)

  let totalGuests = 0
  let totalRooms = 0
  let pendingCount = 0

  if (pgIds.length > 0) {
    const [guestsRes, roomsRes, pendingRes] = await Promise.all([
      supabase
        .from('guests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .in('pg_id', pgIds),
      supabase
        .from('rooms')
        .select('*', { count: 'exact', head: true })
        .in('pg_id', pgIds),
      supabase
        .from('guests')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', 'pending')
        .in('pg_id', pgIds)
    ])

    totalGuests = guestsRes.count || 0
    totalRooms = roomsRes.count || 0
    pendingCount = pendingRes.count || 0
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="Platform Dashboard" subtitle={`Thursday, ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`}>
        <a href="/superadmin/pgs/register">
          <button className="flex items-center gap-1.5 px-4 py-2 rounded-[9px] text-white text-sm font-bold cursor-pointer border-none"
            style={{ background: '#F4700A', fontFamily: 'inherit' }}>
            ＋ Register PG
          </button>
        </a>
      </TopBar>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5"
        style={{ scrollbarWidth: 'thin' }}>

        {/* HERO BANNER */}
        <div className="rounded-[14px] p-6 flex items-center justify-between relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg,#1C0F05 0%,#3D1F08 60%,#5C2E0A 100%)' }}>
          <div className="absolute right-5 text-[100px] opacity-[0.06] select-none pointer-events-none top-1/2 -translate-y-1/2">🏠</div>
          <div>
            <div style={{ fontSize: 12, color: '#A07858', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Platform Overview</div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
              Welcome back, Arun 👑
            </div>
            <div style={{ fontSize: 13, color: '#C9A882' }}>
              Your platform has {pgs?.length || 0} active PGs
            </div>
          </div>
          <div className="flex gap-6">
            {[
              { val: pgs?.length || 0,  lbl: 'Total PGs' },
              { val: totalGuests || 0,  lbl: 'Guests' },
              { val: pendingCount || 0, lbl: 'Pending' },
              { val: totalRooms || 0,   lbl: 'Rooms' },
            ].map(s => (
              <div key={s.lbl} className="text-center px-5" style={{ borderLeft: '1px solid rgba(255,255,255,0.10)' }}>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 800, color: '#fff' }}>{s.val}</div>
                <div style={{ fontSize: 11, color: '#A07858', fontWeight: 600, marginTop: 3 }}>{s.lbl}</div>
              </div>
            ))}
          </div>
        </div>

        {/* STAT CARDS */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { icon: '🏘️', label: 'Registered PGs',  val: pgs?.length || 0,  pill: '▲ Active',   pillColor: '#1DB970', pillBg: '#E6F9F0' },
            { icon: '👥', label: 'Total Guests',     val: totalGuests || 0,  pill: 'Active',     pillColor: '#1DB970', pillBg: '#E6F9F0' },
            { icon: '🏠', label: 'Total Rooms',      val: totalRooms || 0,   pill: 'All floors', pillColor: '#F4700A', pillBg: '#FFF4EC' },
            { icon: '⏳', label: 'Pending Approvals',val: pendingCount || 0, pill: '● Action',   pillColor: '#F5A623', pillBg: '#FEF6E6' },
          ].map(c => (
            <div key={c.label} className="rounded-[14px] p-4 cursor-pointer transition-all hover:-translate-y-0.5"
              style={{ background: '#fff', border: '1px solid #EDE0D4', boxShadow: '0 1px 4px rgba(28,15,5,0.06)' }}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-lg" style={{ background: '#FFF4EC' }}>{c.icon}</div>
                <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{ color: c.pillColor, background: c.pillBg }}>{c.pill}</span>
              </div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 30, fontWeight: 700, color: '#1C0F05', lineHeight: 1 }}>{c.val}</div>
              <div style={{ fontSize: 12, color: '#A89080', marginTop: 4, fontWeight: 500 }}>{c.label}</div>
            </div>
          ))}
        </div>

        {/* PG LIST */}
        <div className="rounded-[14px] overflow-hidden" style={{ background: '#fff', border: '1px solid #EDE0D4', boxShadow: '0 1px 4px rgba(28,15,5,0.06)' }}>
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid #EDE0D4' }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14.5, fontWeight: 700 }}>🏘️ All PGs</div>
            <span style={{ fontSize: 12, color: '#F4700A', fontWeight: 700, cursor: 'pointer' }}>View All →</span>
          </div>
          <div className="divide-y" style={{ borderColor: '#F5EDE5' }}>
            {pgs?.length === 0 && (
              <div className="py-12 text-center" style={{ color: '#A89080', fontSize: 13 }}>
                No PGs registered yet. <a href="/superadmin/pgs/register" style={{ color: '#F4700A', fontWeight: 700 }}>Register your first PG →</a>
              </div>
            )}
            {pgs?.map(pg => (
              <div key={pg.id} className="flex items-center gap-3 px-5 py-3 cursor-pointer transition-all hover:bg-[#FFF4EC]">
                <div className="w-10 h-10 rounded-[10px] flex items-center justify-center text-lg flex-shrink-0" style={{ background: '#FFF4EC' }}>
                  {pg.type === 'boys' ? '👨' : pg.type === 'girls' ? '👩' : '👫'}
                </div>
                <div className="flex-1">
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#1C0F05' }}>{pg.name}</div>
                  <div style={{ fontSize: 11, color: '#A89080', marginTop: 2 }}>📍 {pg.city} · {pg.type}</div>
                </div>
                <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: pg.is_active ? '#E6F9F0' : '#FDECEA', color: pg.is_active ? '#1DB970' : '#E53935' }}>
                  {pg.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* REGISTER CTA */}
        <div className="rounded-[14px] p-5 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg,#FFF4EC,#FFE4CC)', border: '1.5px dashed #FFD9B8' }}>
          <div className="flex items-center gap-4">
            <span style={{ fontSize: 36 }}>🏗️</span>
            <div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 700, color: '#1C0F05' }}>Register a New PG</div>
              <div style={{ fontSize: 12, color: '#6B4F38', marginTop: 3 }}>Add a new PG · Assign admin · Set up floors & rooms in minutes</div>
            </div>
          </div>
          <a href="/superadmin/pgs/register">
            <button className="px-5 py-2.5 rounded-[10px] text-white text-sm font-bold cursor-pointer border-none whitespace-nowrap"
              style={{ background: '#F4700A', fontFamily: 'inherit' }}>
              ＋ Register New PG →
            </button>
          </a>
        </div>

      </div>
    </div>
  )
}
