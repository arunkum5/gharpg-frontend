import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TopBar from '@/components/layout/TopBar'

export default async function PGAdminDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get admin's PG
  const { data: pgAdmin } = await supabase
    .from('pg_admins')
    .select('pg_id, pgs(id, name, city)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!pgAdmin) redirect('/login')
  const pg     = pgAdmin.pgs as unknown as { id: string; name: string; city: string }
  const pgId   = pg.id

  // Fetch stats in parallel
  const [
    { count: totalGuests },
    { count: pendingCount },
    { data: rooms },
    { data: recentGuests },
  ] = await Promise.all([
    supabase.from('guests').select('*', { count: 'exact', head: true }).eq('pg_id', pgId).eq('status', 'active'),
    supabase.from('guests').select('*', { count: 'exact', head: true }).eq('pg_id', pgId).eq('approval_status', 'pending'),
    supabase.from('rooms').select('id, room_number, status, capacity, current_occupancy, floor_id, row_id, floors(floor_name), rows(row_name)').eq('pg_id', pgId).eq('is_active', true).order('room_number'),
    supabase.from('guests').select('id, first_name, last_name, room_id, purpose, checkin_date, status, approval_status, rooms(room_number)').eq('pg_id', pgId).order('created_at', { ascending: false }).limit(5),
  ])

  const totalRooms    = rooms?.length || 0
  const occupiedRooms = rooms?.filter(r => r.status !== 'free').length || 0
  const freeRooms     = rooms?.filter(r => r.status === 'free').length || 0
  const occupancyPct  = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0

  // Group rooms by floor → row
  const floorMap = new Map<string, { name: string; rows: Map<string, { name: string; rooms: typeof rooms }> }>()
  rooms?.forEach(room => {
    const floor = room.floors as unknown as { floor_name: string } | null
    const row   = room.rows   as unknown as { row_name:   string } | null
    const fName = floor?.floor_name || 'Floor'
    const rName = row?.row_name     || 'Row'
    if (!floorMap.has(room.floor_id)) floorMap.set(room.floor_id, { name: fName, rows: new Map() })
    const floorEntry = floorMap.get(room.floor_id)!
    if (!floorEntry.rows.has(room.row_id)) floorEntry.rows.set(room.row_id, { name: rName, rooms: [] })
    floorEntry.rows.get(room.row_id)!.rooms!.push(room)
  })

  const statusColor: Record<string, { bg: string; color: string; border: string }> = {
    free:    { bg: '#E6F9F0', color: '#1DB970', border: '#A8EDD0' },
    partial: { bg: '#FEF6E6', color: '#B87800', border: '#FAD898' },
    full:    { bg: '#FDECEA', color: '#E53935', border: '#F5C6C5' },
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="Dashboard" subtitle={`${pg.name} · ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}>
        <a href="/pgadmin/guests/add">
          <button className="flex items-center gap-1.5 px-4 py-2 rounded-[9px] text-white text-sm font-bold cursor-pointer border-none"
            style={{ background: '#F4700A', fontFamily: 'inherit' }}>
            ＋ Add Guest
          </button>
        </a>
      </TopBar>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5" style={{ scrollbarWidth: 'thin' }}>

        {/* STAT CARDS */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { icon: '🛏️', label: 'Total Guests',      val: totalGuests || 0,  sub: 'Active guests',      pillTxt: '● Active',    pillColor: '#1DB970', pillBg: '#E6F9F0' },
            { icon: '🏠', label: 'Rooms Occupied',     val: `${occupiedRooms}/${totalRooms}`, sub: `${freeRooms} rooms available`, pillTxt: `${occupancyPct}%`, pillColor: '#F4700A', pillBg: '#FFF4EC' },
            { icon: '⏳', label: 'Pending Approvals',  val: pendingCount || 0, sub: 'Awaiting your action', pillTxt: '● Pending', pillColor: '#F5A623', pillBg: '#FEF6E6' },
            { icon: '🚪', label: 'Free Rooms',         val: freeRooms,         sub: 'Available now',       pillTxt: 'Available',   pillColor: '#1DB970', pillBg: '#E6F9F0' },
          ].map(c => (
            <div key={c.label} className="rounded-[14px] p-4 cursor-pointer transition-all hover:-translate-y-0.5"
              style={{ background: '#fff', border: '1px solid #EDE0D4', boxShadow: '0 1px 4px rgba(28,15,5,0.06)' }}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-lg" style={{ background: '#FFF4EC' }}>{c.icon}</div>
                <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{ color: c.pillColor, background: c.pillBg }}>{c.pillTxt}</span>
              </div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 30, fontWeight: 700, color: '#1C0F05', lineHeight: 1 }}>{c.val}</div>
              <div style={{ fontSize: 12, color: '#A89080', marginTop: 4 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* MID ROW */}
        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 320px' }}>

          {/* FLOOR & ROOM GRID */}
          <div className="rounded-[14px] overflow-hidden" style={{ background: '#fff', border: '1px solid #EDE0D4', boxShadow: '0 1px 4px rgba(28,15,5,0.06)' }}>
            <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid #EDE0D4' }}>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14.5, fontWeight: 700 }}>🏢 Floor & Room Overview</div>
              <a href="/pgadmin/rooms" style={{ fontSize: 12, color: '#F4700A', fontWeight: 700, textDecoration: 'none' }}>Manage Rooms →</a>
            </div>
            <div className="p-4 flex flex-col gap-4">
              {floorMap.size === 0 && (
                <div className="py-8 text-center" style={{ color: '#A89080', fontSize: 13 }}>
                  No rooms yet. <a href="/pgadmin/rooms" style={{ color: '#F4700A', fontWeight: 700 }}>Set up floors & rooms →</a>
                </div>
              )}
              {Array.from(floorMap.entries()).map(([floorId, floor]) => (
                <div key={floorId}>
                  {Array.from(floor.rows.entries()).map(([rowId, row]) => (
                    <div key={rowId} className="mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: '#A89080', textTransform: 'uppercase', letterSpacing: 1 }}>
                          {floor.name} — {row.name}
                        </span>
                        <div className="flex-1 h-px" style={{ background: '#EDE0D4' }} />
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {row.rooms?.map(room => {
                          const sc = statusColor[room.status] || statusColor.free
                          return (
                            <a key={room.id} href={`/pgadmin/rooms`}
                              className="w-12 h-12 rounded-[10px] flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-110 border-[1.5px] no-underline"
                              style={{ background: sc.bg, color: sc.color, borderColor: sc.border }}
                              title={`Room ${room.room_number} — ${room.status}`}>
                              <span style={{ fontSize: 11.5, fontWeight: 800 }}>{room.room_number}</span>
                              <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.75 }}>{room.current_occupancy}/{room.capacity}</span>
                            </a>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              {/* Legend */}
              <div className="flex items-center gap-4 pt-2" style={{ borderTop: '1px solid #EDE0D4' }}>
                {[{ bg: '#A8EDD0', label: 'Free' }, { bg: '#FAD898', label: 'Partial' }, { bg: '#F5C6C5', label: 'Full' }].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: l.bg }} />
                    <span style={{ fontSize: 11, color: '#6B4F38', fontWeight: 600 }}>{l.label}</span>
                  </div>
                ))}
                <span className="ml-auto" style={{ fontSize: 12, fontWeight: 800, color: '#1C0F05' }}>
                  {occupiedRooms}/{totalRooms} Occupied · {freeRooms} Free
                </span>
              </div>
            </div>
          </div>

          {/* PENDING APPROVALS */}
          <div className="rounded-[14px] overflow-hidden" style={{ background: '#fff', border: '1px solid #EDE0D4', boxShadow: '0 1px 4px rgba(28,15,5,0.06)' }}>
            <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid #EDE0D4' }}>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14.5, fontWeight: 700 }}>✅ Pending Approvals</div>
              <a href="/pgadmin/approvals" style={{ fontSize: 12, color: '#F4700A', fontWeight: 700, textDecoration: 'none' }}>View All →</a>
            </div>
            <div className="p-3 flex flex-col gap-2">
              {(pendingCount || 0) === 0 && (
                <div className="py-8 text-center" style={{ color: '#A89080', fontSize: 13 }}>
                  🎉 No pending approvals!
                </div>
              )}
              {recentGuests?.filter(g => g.approval_status === 'pending').map(g => {
                const room = g.rooms as unknown as { room_number: string } | null
                const initials = `${g.first_name[0]}${g.last_name[0]}`.toUpperCase()
                return (
                  <div key={g.id} className="flex items-center gap-2.5 p-2.5 rounded-[11px] transition-all cursor-pointer border border-[#EDE0D4] hover:border-[#FFD9B8] hover:bg-[#FFF4EC]"
                    style={{ background: '#FAF6F2' }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg,#F4700A,#FFAA60)' }}>{initials}</div>
                    <div className="flex-1">
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{g.first_name} {g.last_name}</div>
                      <div style={{ fontSize: 11, color: '#A89080' }}>{g.purpose} · {room?.room_number ? `Room ${room.room_number}` : 'No room'}</div>
                    </div>
                    <a href="/pgadmin/approvals">
                      <div className="flex gap-1">
                        <button className="text-xs font-bold px-2 py-1 rounded-[7px] border-none cursor-pointer"
                          style={{ background: '#E6F9F0', color: '#1DB970', fontFamily: 'inherit' }}>✓</button>
                        <button className="text-xs font-bold px-2 py-1 rounded-[7px] border-none cursor-pointer"
                          style={{ background: '#FDECEA', color: '#E53935', fontFamily: 'inherit' }}>✕</button>
                      </div>
                    </a>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* RECENT GUESTS */}
        <div className="rounded-[14px] overflow-hidden" style={{ background: '#fff', border: '1px solid #EDE0D4', boxShadow: '0 1px 4px rgba(28,15,5,0.06)' }}>
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid #EDE0D4' }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14.5, fontWeight: 700 }}>👥 Recent Guests</div>
            <a href="/pgadmin/guests" style={{ fontSize: 12, color: '#F4700A', fontWeight: 700, textDecoration: 'none' }}>View All →</a>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ background: '#FAF6F2' }}>
                {['Guest', 'Room', 'Purpose', 'Check-in', 'Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left" style={{ fontSize: 11, fontWeight: 800, color: '#A89080', textTransform: 'uppercase', letterSpacing: '0.8px', borderBottom: '1px solid #EDE0D4' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentGuests?.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center" style={{ color: '#A89080', fontSize: 13 }}>No guests yet. <a href="/pgadmin/guests/add" style={{ color: '#F4700A', fontWeight: 700 }}>Add first guest →</a></td></tr>
              )}
              {recentGuests?.map((g, idx) => {
                const room    = g.rooms as unknown as { room_number: string } | null
                const initials = `${g.first_name[0]}${g.last_name[0]}`.toUpperCase()
                const colors   = ['linear-gradient(135deg,#F4700A,#FFAA60)', 'linear-gradient(135deg,#1DB970,#5DE89A)', 'linear-gradient(135deg,#7C3AED,#A78BFA)', 'linear-gradient(135deg,#2563EB,#60A5FA)', 'linear-gradient(135deg,#E53935,#FF7B7B)']
                return (
                  <tr key={g.id} className="cursor-pointer transition-all hover:bg-[#FFF4EC]" style={{ borderBottom: idx < recentGuests.length - 1 ? '1px solid #F5EDE5' : 'none' }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                          style={{ background: colors[idx % colors.length] }}>{initials}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{g.first_name} {g.last_name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11.5px] font-bold px-2 py-0.5 rounded-[6px]"
                        style={{ background: '#FFF4EC', color: '#F4700A' }}>
                        {room?.room_number || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ fontSize: 12.5, color: '#6B4F38' }}>
                      {g.purpose === 'student' ? '🎓' : '💼'} {g.purpose}
                    </td>
                    <td className="px-4 py-3" style={{ fontSize: 12, color: '#A89080' }}>
                      {g.checkin_date ? new Date(g.checkin_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: g.status === 'active' ? '#E6F9F0' : '#FEF6E6',
                          color:      g.status === 'active' ? '#1DB970'  : '#B87800',
                        }}>
                        {g.status === 'active' ? 'Active' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
