'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import TopBar from '@/components/layout/TopBar'
import { toast } from 'sonner'
import Link from 'next/link'
import { resetUserPasswordAction } from '@/app/actions/auth'

interface GuestWithRoom {
  id: string
  user_id: string | null
  first_name: string
  last_name: string
  gender: string
  dob: string | null
  photo_url: string | null
  purpose: string
  checkin_date: string | null
  status: string
  approval_status: string
  monthly_rent: number | null
  stay_duration_months: number | null
  notes: string | null
  created_at: string
  email: string | null
  rooms: {
    id: string
    room_number: string
    floors: {
      floor_name: string
    } | null
  } | null
}

export default function GuestList() {
  const router = useRouter()
  const supabase = createClient()

  const [pgId, setPgId] = useState<string | null>(null)
  const [pgName, setPgName] = useState<string>('My PG')
  const [guests, setGuests] = useState<GuestWithRoom[]>([])
  const [floors, setFloors] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'pending' | 'checked_out'>('all')
  const [selectedFloor, setSelectedFloor] = useState<string>('all')
  const [selectedPurpose, setSelectedPurpose] = useState<string>('all')
  const [sortField, setSortField] = useState<'checkin_date' | 'name' | 'room_number' | 'monthly_rent'>('checkin_date')
  const [sortAsc, setSortAsc] = useState(false)

  // Drawer state
  const [drawerGuest, setDrawerGuest] = useState<GuestWithRoom | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Get admin's PG
      const { data: pgAdmin, error: pgErr } = await supabase
        .from('pg_admins')
        .select('pg_id, pgs(id, name, city)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()

      if (pgErr || !pgAdmin) {
        toast.error('No active PG assigned to your profile')
        router.push('/login')
        return
      }

      const pg = pgAdmin.pgs as unknown as { id: string; name: string; city: string }
      setPgId(pg.id)
      setPgName(pg.name)

      // Fetch guests with profile email via join (safely, fallback if error)
      let guestsData: any[] = []
      const { data: joinedData, error: guestsErr } = await supabase
        .from('guests')
        .select(`
          id, user_id, first_name, last_name, gender, dob, photo_url, purpose, checkin_date, status, approval_status, monthly_rent, stay_duration_months, notes, created_at,
          rooms(id, room_number, floors(floor_name))
        `)
        .eq('pg_id', pg.id)

      if (guestsErr) throw guestsErr
      guestsData = joinedData || []

      // Fetch emails for the profiles linked to guests in a secondary query to prevent schema relationship errors
      const userIds = guestsData.map(g => g.user_id).filter(Boolean)
      let profilesMap: Record<string, string> = {}
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, email')
          .in('id', userIds)
        if (profilesData) {
          profilesData.forEach(p => {
            if (p.email) profilesMap[p.id] = p.email
          })
        }
      }

      const mappedGuests = guestsData.map((g: any) => ({
        ...g,
        email: g.user_id ? (profilesMap[g.user_id] || null) : null,
        rooms: g.rooms ? {
          id: g.rooms.id,
          room_number: g.rooms.room_number,
          floors: g.rooms.floors ? { floor_name: g.rooms.floors.floor_name } : null
        } : null
      })) as GuestWithRoom[]

      setGuests(mappedGuests)

      // Get unique floor names
      const floorNamesSet = new Set<string>()
      mappedGuests.forEach(g => {
        if (g.rooms?.floors?.floor_name) {
          floorNamesSet.add(g.rooms.floors.floor_name)
        }
      })
      setFloors(Array.from(floorNamesSet))

    } catch (e: any) {
      console.error(e)
      toast.error('Error loading guests')
    } finally {
      setLoading(false)
    }
  }

  // Handle Quick Checkout
  async function handleCheckout(guestId: string) {
    if (!confirm('Are you sure you want to check out this guest?')) return
    try {
      const { error } = await supabase
        .from('guests')
        .update({
          status: 'checked_out',
          actual_checkout_date: new Date().toISOString().split('T')[0]
        })
        .eq('id', guestId)

      if (error) throw error
      toast.success('Guest checked out successfully')
      setDrawerGuest(null)
      await fetchData()
    } catch (e: any) {
      console.error(e)
      toast.error('Error during checkout')
    }
  }

  // Handle delete guest
  async function handleDeleteGuest(guestId: string) {
    if (!confirm('Are you sure you want to delete this guest record permanently?')) return
    try {
      const { error } = await supabase.from('guests').delete().eq('id', guestId)
      if (error) throw error
      toast.success('Guest record deleted')
      setDrawerGuest(null)
      await fetchData()
    } catch (e: any) {
      console.error(e)
      toast.error('Error deleting guest')
    }
  }

  // Reset login PIN
  async function handleResetPin(userId: string, name: string) {
    if (!confirm(`Are you sure you want to reset the login PIN for ${name} to "123456"?`)) return
    try {
      const res = await resetUserPasswordAction(userId)
      if (!res.success) throw new Error(res.error || 'Failed to reset PIN')
      toast.success(`PIN for ${name} has been reset to "123456"!`)
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || 'Failed to reset PIN')
    }
  }

  // Stats
  const activeCount = guests.filter(g => g.status === 'active').length
  const pendingCount = guests.filter(g => g.status === 'pending').length
  const checkedOutCount = guests.filter(g => g.status === 'checked_out').length

  // Filter & Search Logic
  const filteredGuests = guests
    .filter(g => {
      // Tab filter
      if (activeTab === 'active') return g.status === 'active'
      if (activeTab === 'pending') return g.status === 'pending'
      if (activeTab === 'checked_out') return g.status === 'checked_out'
      return true
    })
    .filter(g => {
      // Search filter
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      const name = `${g.first_name} ${g.last_name}`.toLowerCase()
      const room = g.rooms?.room_number?.toLowerCase() || ''
      const purpose = g.purpose.toLowerCase()
      return name.includes(q) || room.includes(q) || purpose.includes(q)
    })
    .filter(g => {
      // Floor filter
      if (selectedFloor === 'all') return true
      return g.rooms?.floors?.floor_name === selectedFloor
    })
    .filter(g => {
      // Purpose filter
      if (selectedPurpose === 'all') return true
      return g.purpose === selectedPurpose
    })
    .sort((a, b) => {
      // Sorting
      let valA: any = ''
      let valB: any = ''

      if (sortField === 'checkin_date') {
        valA = a.checkin_date || ''
        valB = b.checkin_date || ''
      } else if (sortField === 'name') {
        valA = `${a.first_name} ${a.last_name}`.toLowerCase()
        valB = `${b.first_name} ${b.last_name}`.toLowerCase()
      } else if (sortField === 'room_number') {
        valA = a.rooms?.room_number || ''
        valB = b.rooms?.room_number || ''
      } else if (sortField === 'monthly_rent') {
        valA = a.monthly_rent || 0
        valB = b.monthly_rent || 0
      }

      if (valA < valB) return sortAsc ? -1 : 1
      if (valA > valB) return sortAsc ? 1 : -1
      return 0
    })

  function toggleSort(field: typeof sortField) {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(true)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="Guests" subtitle={`${pgName} · ${activeCount} active guests`}>
        <div className="tb-search">
          🔍
          <input
            placeholder="Search name, room, purpose..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <Link href="/pgadmin/guests/add">
          <button className="tb-btn">＋ Add Guest</button>
        </Link>
      </TopBar>

      <div className="content">
        {/* FILTER BAR */}
        <div className="filter-bar">
          <div className="fb-tabs">
            <div
              className={`fb-tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All <span className="cnt">{guests.length}</span>
            </div>
            <div
              className={`fb-tab ${activeTab === 'active' ? 'active' : ''}`}
              onClick={() => setActiveTab('active')}
            >
              Active <span className="cnt">{activeCount}</span>
            </div>
            <div
              className={`fb-tab ${activeTab === 'pending' ? 'active' : ''}`}
              onClick={() => setActiveTab('pending')}
            >
              Pending <span className="cnt">{pendingCount}</span>
            </div>
            <div
              className={`fb-tab ${activeTab === 'checked_out' ? 'active' : ''}`}
              onClick={() => setActiveTab('checked_out')}
            >
              Checked Out <span className="cnt">{checkedOutCount}</span>
            </div>
          </div>
          <div className="fb-spacer"></div>

          <select
            className="fb-filter"
            value={selectedFloor}
            onChange={e => setSelectedFloor(e.target.value)}
            style={{ appearance: 'none', border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', outline: 'none' }}
          >
            <option value="all">🏢 Floor: All</option>
            {floors.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <select
            className="fb-filter"
            value={selectedPurpose}
            onChange={e => setSelectedPurpose(e.target.value)}
            style={{ appearance: 'none', border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', outline: 'none', marginLeft: '6px' }}
          >
            <option value="all">🎯 Purpose: All</option>
            <option value="student">Student</option>
            <option value="working">Working</option>
            <option value="medical">Medical</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* TABLE */}
        <div className="table-wrap">
          {loading ? (
            <div className="text-center py-12" style={{ color: '#A89080' }}>
              Loading guests list...
            </div>
          ) : filteredGuests.length === 0 ? (
            <div className="text-center py-12" style={{ color: '#A89080' }}>
              No guests found matching filters.
            </div>
          ) : (
            <div className="gtable-card">
              <table className="gtable">
                <thead>
                  <tr>
                    <th onClick={() => toggleSort('name')}>
                      Guest {sortField === 'name' ? (sortAsc ? '▲' : '▼') : '↕'}
                    </th>
                    <th onClick={() => toggleSort('room_number')}>
                      Room {sortField === 'room_number' ? (sortAsc ? '▲' : '▼') : '↕'}
                    </th>
                    <th>Floor</th>
                    <th>Purpose</th>
                    <th onClick={() => toggleSort('checkin_date')}>
                      Check-in {sortField === 'checkin_date' ? (sortAsc ? '▲' : '▼') : '↕'}
                    </th>
                    <th>Duration</th>
                    <th onClick={() => toggleSort('monthly_rent')}>
                      Rent {sortField === 'monthly_rent' ? (sortAsc ? '▲' : '▼') : '↕'}
                    </th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGuests.map(g => {
                    const initials = `${g.first_name[0] || ''}${g.last_name[0] || ''}`.toUpperCase()
                    const colors = [
                      'linear-gradient(135deg,#F4700A,#FFAA60)',
                      'linear-gradient(135deg,#1DB970,#5DE89A)',
                      'linear-gradient(135deg,#7C3AED,#A78BFA)',
                      'linear-gradient(135deg,#2563EB,#60A5FA)'
                    ]
                    const avBg = colors[initials.charCodeAt(0) % colors.length]

                    return (
                      <tr key={g.id} onClick={() => setDrawerGuest(g)}>
                        <td>
                          <div className="g-cell">
                            <div className="g-av" style={{ background: avBg }}>
                              {initials}
                            </div>
                            <div>
                              <div className="g-name">
                                {g.first_name} {g.last_name}
                              </div>
                              {g.email && (
                                <div className="g-email">{g.email}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="room-chip">{g.rooms?.room_number || '—'}</span>
                        </td>
                        <td style={{ fontSize: '12.5px', color: 'var(--text-mid)', fontWeight: 600 }}>
                          {g.rooms?.floors?.floor_name || '—'}
                        </td>
                        <td>
                          <span className="purpose-chip">
                            {g.purpose === 'student' ? '🎓' : g.purpose === 'working' ? '💼' : '🧑'}{' '}
                            {g.purpose.charAt(0).toUpperCase() + g.purpose.slice(1)}
                          </span>
                        </td>
                        <td style={{ fontSize: '12.5px', color: 'var(--text-mid)' }}>
                          {g.checkin_date
                            ? new Date(g.checkin_date).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric'
                              })
                            : '—'}
                        </td>
                        <td style={{ fontSize: '12.5px', color: 'var(--text-mid)' }}>
                          {g.stay_duration_months ? `${g.stay_duration_months} Months` : '—'}
                        </td>
                        <td style={{ fontSize: '13px', fontWeight: 800, color: 'var(--orange)' }}>
                          ₹{g.monthly_rent?.toLocaleString('en-IN') || '—'}
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              g.status === 'active'
                                ? 'b-active'
                                : g.status === 'pending'
                                ? 'b-pending'
                                : 'b-checkout'
                            }`}
                          >
                            {g.status === 'active'
                              ? 'Active'
                              : g.status === 'pending'
                              ? 'Pending'
                              : 'Checked Out'}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions" onClick={e => e.stopPropagation()}>
                            <Link href={`/pgadmin/guests/${g.id}`}>
                              <div className="ra-btn" title="View Full Profile">
                                👁
                              </div>
                            </Link>
                            <div className="ra-btn" onClick={() => handleDeleteGuest(g.id)} title="Delete Record">
                              🗑
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* SUMMARY BAR */}
        <div className="summary-bar">
          <div className="sb-stat">
            Showing <strong>{filteredGuests.length}</strong> of <strong>{guests.length}</strong> guests
          </div>
          <div className="sb-stat">
            Active: <strong style={{ color: 'var(--green)' }}>{activeCount}</strong>
          </div>
          <div className="sb-stat">
            Pending: <strong style={{ color: 'var(--amber)' }}>{pendingCount}</strong>
          </div>
          <div className="sb-stat">
            Checked Out: <strong style={{ color: 'var(--red)' }}>{checkedOutCount}</strong>
          </div>
        </div>
      </div>

      {/* DRAWER OVERLAY */}
      {drawerGuest && (
        <div className="drawer-overlay open" onClick={() => setDrawerGuest(null)}></div>
      )}

      {/* QUICK VIEW DRAWER */}
      <div className={`drawer ${drawerGuest ? 'open' : ''}`}>
        {drawerGuest && (
          <>
            <div className="dr-header">
              <div className="drh-top">
                <button className="drh-close" onClick={() => setDrawerGuest(null)}>
                  ✕
                </button>
                <div className="drh-actions">
                  <Link href={`/pgadmin/guests/${drawerGuest.id}`}>
                    <button className="drh-act-btn">📄 Full Profile</button>
                  </Link>
                </div>
              </div>
              <div className="dr-profile">
                <div
                  className="dr-av"
                  style={{
                    background:
                      'linear-gradient(135deg,#F4700A,#FFAA60)'
                  }}
                >
                  {`${drawerGuest.first_name[0] || ''}${drawerGuest.last_name[0] || ''}`.toUpperCase()}
                </div>
                <div>
                  <div className="dr-name">
                    {drawerGuest.first_name} {drawerGuest.last_name}
                  </div>
                  <div className="dr-meta">
                    {drawerGuest.gender.charAt(0).toUpperCase() + drawerGuest.gender.slice(1)}
                  </div>
                  <div className="dr-room-badge">
                    Room {drawerGuest.rooms?.room_number || '—'} ·{' '}
                    {drawerGuest.rooms?.floors?.floor_name || 'No floor'}
                  </div>
                </div>
              </div>
            </div>
            <div className="dr-body">
              <div className="dr-section">
                <div className="drs-title">📋 Stay Details</div>
                <div className="detail-rows">
                  {drawerGuest.email && (
                    <div className="drow">
                      <span className="dk">Login Email</span>
                      <span className="dv" style={{ color: 'var(--orange)', fontSize: 12 }}>{drawerGuest.email}</span>
                    </div>
                  )}
                  <div className="drow">
                    <span className="dk">Purpose</span>
                    <span className="dv">
                      {drawerGuest.purpose.charAt(0).toUpperCase() + drawerGuest.purpose.slice(1)}
                    </span>
                  </div>
                  <div className="drow">
                    <span className="dk">Check-in</span>
                    <span className="dv">{drawerGuest.checkin_date || '—'}</span>
                  </div>
                  <div className="drow">
                    <span className="dk">Duration</span>
                    <span className="dv">
                      {drawerGuest.stay_duration_months
                        ? `${drawerGuest.stay_duration_months} Months`
                        : '—'}
                    </span>
                  </div>
                  <div className="drow">
                    <span className="dk">Monthly Rent</span>
                    <span className="dv" style={{ color: 'var(--orange)' }}>
                      ₹{drawerGuest.monthly_rent?.toLocaleString('en-IN') || '—'}
                    </span>
                  </div>
                  <div className="drow">
                    <span className="dk">Notes</span>
                    <span className="dv">{drawerGuest.notes || 'No extra notes'}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="dr-foot">
              {drawerGuest.user_id && (
                <button
                  className="dr-checkout-btn"
                  onClick={() => handleResetPin(drawerGuest.user_id!, `${drawerGuest.first_name} ${drawerGuest.last_name}`)}
                  style={{ background: 'var(--orange-pale)', color: 'var(--orange)', borderColor: 'var(--orange-border)' }}
                >
                  🔑 Reset PIN
                </button>
              )}
              {drawerGuest.status === 'active' && (
                <button
                  className="dr-checkout-btn"
                  onClick={() => handleCheckout(drawerGuest.id)}
                >
                  🚪 Checkout
                </button>
              )}
              <Link href={`/pgadmin/guests/${drawerGuest.id}`} style={{ flex: 1, display: 'flex' }}>
                <button className="dr-edit-btn" style={{ width: '100%' }}>
                  ✏️ Edit Profile
                </button>
              </Link>
            </div>
          </>
        )}
      </div>

      <style>{`
        :root {
          --orange: #F4700A; --orange-hover: #E05C00; --orange-light: #FF9240;
          --orange-pale: #FFF4EC; --orange-border: #FFD9B8;
          --bg: #FAF6F2; --white: #FFFFFF;
          --sidebar: #1C0F05; --sidebar-text: #A07858;
          --text: #1C0F05; --text-mid: #6B4F38; --text-soft: #A89080;
          --border: #EDE0D4;
          --green: #1DB970; --green-pale: #E6F9F0;
          --red: #E53935; --red-pale: #FDECEA;
          --amber: #F5A623; --amber-pale: #FEF6E6;
          --shadow-sm: 0 1px 4px rgba(28,15,5,0.06);
          --shadow-md: 0 4px 16px rgba(28,15,5,0.10);
          --r: 14px;
        }

        .tb-search {
          display: flex; align-items: center; gap: 7px; background: var(--bg);
          border: 1.5px solid var(--border); border-radius: 9px; padding: 8px 13px;
          font-size: 13px; color: var(--text-soft); width: 240px; transition: border-color 0.15s;
        }
        .tb-search:focus-within { border-color: var(--orange); }
        .tb-search input { border: none; outline: none; background: transparent; font-size: 13px; width: 100%; color: var(--text); }

        .tb-btn {
          background: var(--orange); color: #fff; border: none; border-radius: 9px;
          padding: 8px 16px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.15s;
        }
        .tb-btn:hover { background: var(--orange-hover); transform: translateY(-1px); }

        .content { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

        .filter-bar { background: var(--white); border-bottom: 1px solid var(--border); padding: 12px 26px; display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .fb-tabs { display: flex; gap: 5px; }
        .fb-tab { border: 1.5px solid var(--border); border-radius: 8px; padding: 6px 14px; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: all 0.15s; color: var(--text-soft); }
        .fb-tab:hover { border-color: var(--orange-border); color: var(--orange); }
        .fb-tab.active { border-color: var(--orange); background: var(--orange-pale); color: var(--orange); }
        .fb-tab .cnt { display: inline-block; background: var(--orange); color: #fff; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 20px; margin-left: 4px; }
        .fb-spacer { flex: 1; }
        .fb-filter { display: flex; align-items: center; gap: 7px; border: 1px solid var(--border); border-radius: 8px; padding: 6px 12px; font-size: 12.5px; font-weight: 600; color: var(--text-mid); cursor: pointer; background: var(--bg); transition: all 0.15s; }

        .table-wrap { flex: 1; overflow-y: auto; padding: 20px 26px; scrollbar-width: thin; }
        .gtable-card { background: var(--white); border-radius: var(--r); border: 1px solid var(--border); box-shadow: var(--shadow-sm); overflow: hidden; animation: fadeUp 0.35s ease both; }
        .gtable { width: 100%; border-collapse: collapse; }
        .gtable th {
          background: var(--bg); font-size: 11px; font-weight: 800; color: var(--text-soft);
          text-transform: uppercase; letter-spacing: 0.8px; padding: 12px 16px; text-align: left;
          border-bottom: 1px solid var(--border); white-space: nowrap; cursor: pointer; user-select: none;
        }
        .gtable th:hover { color: var(--orange); }
        .gtable td { padding: 13px 16px; font-size: 13px; color: var(--text); border-bottom: 1px solid #F5EDE5; vertical-align: middle; }
        .gtable tr:last-child td { border-bottom: none; }
        .gtable tbody tr { cursor: pointer; transition: background 0.12s; }
        .gtable tbody tr:hover td { background: var(--orange-pale); }

        .g-cell { display: flex; align-items: center; gap: 10px; }
        .g-av { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; color: #fff; flex-shrink: 0; }
        .g-name { font-weight: 700; font-size: 13px; }
        .g-email { font-size: 11px; color: var(--text-soft); margin-top: 1px; }

        .room-chip { background: var(--orange-pale); color: var(--orange); border-radius: 6px; padding: 3px 9px; font-size: 11.5px; font-weight: 800; display: inline-block; }
        .badge { border-radius: 20px; padding: 3px 9px; font-size: 11px; font-weight: 800; display: inline-block; }
        .b-active   { background: var(--green-pale);  color: var(--green); }
        .b-pending  { background: var(--amber-pale);  color: #B87800; }
        .b-checkout { background: var(--red-pale);    color: var(--red); }
        .purpose-chip { font-size: 11px; font-weight: 700; color: var(--text-mid); }

        .row-actions { display: flex; gap: 5px; opacity: 0; transition: opacity 0.15s; }
        .gtable tbody tr:hover .row-actions { opacity: 1; }
        .ra-btn { width: 28px; height: 28px; border-radius: 7px; border: 1px solid var(--border); background: var(--white); display: flex; align-items: center; justify-content: center; font-size: 13px; cursor: pointer; transition: all 0.15s; }
        .ra-btn:hover { background: var(--orange-pale); border-color: var(--orange-border); }

        .drawer-overlay { position: fixed; inset: 0; background: rgba(28,15,5,0.3); z-index: 100; opacity: 0; pointer-events: none; transition: opacity 0.25s; }
        .drawer-overlay.open { opacity: 1; pointer-events: all; }
        .drawer { position: fixed; right: 0; top: 0; bottom: 0; width: 380px; background: var(--white); box-shadow: -6px 0 30px rgba(28,15,5,0.12); z-index: 101; transform: translateX(100%); transition: transform 0.3s cubic-bezier(.4,0,.2,1); display: flex; flex-direction: column; overflow: hidden; }
        .drawer.open { transform: translateX(0); }

        .dr-header { background: linear-gradient(160deg, #1C0F05, #3D1F08); padding: 22px 22px 26px; flex-shrink: 0; }
        .drh-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
        .drh-close { width: 30px; height: 30px; border-radius: 8px; background: rgba(255,255,255,0.1); border: none; color: #fff; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .drh-actions { display: flex; gap: 7px; }
        .drh-act-btn { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: #fff; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 700; cursor: pointer; }
        .dr-profile { display: flex; align-items: center; gap: 14px; }
        .dr-av { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; color: #fff; border: 2.5px solid rgba(255,255,255,0.2); flex-shrink: 0; }
        .dr-name { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 800; color: #fff; }
        .dr-meta { font-size: 12.5px; color: #C9A882; margin-top: 3px; }
        .dr-room-badge { display: inline-block; background: rgba(244,112,10,0.3); color: var(--orange-light); font-size: 11px; font-weight: 800; padding: 4px 12px; border-radius: 20px; margin-top: 6px; border: 1px solid rgba(244,112,10,0.3); }

        .dr-body { flex: 1; overflow-y: auto; padding: 18px 20px 20px; display: flex; flex-direction: column; gap: 14px; scrollbar-width: thin; }
        .dr-section { background: var(--bg); border-radius: 12px; padding: 14px 16px; border: 1px solid var(--border); }
        .drs-title { font-size: 11px; font-weight: 800; color: var(--text-soft); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; display: flex; align-items: center; gap: 7px; }
        .detail-rows { display: flex; flex-direction: column; gap: 9px; }
        .drow { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .dk { font-size: 12px; color: var(--text-soft); flex-shrink: 0; }
        .dv { font-size: 12.5px; font-weight: 700; color: var(--text); text-align: right; }

        .dr-foot { padding: 14px 20px; border-top: 1px solid var(--border); display: flex; gap: 8px; flex-shrink: 0; }
        .dr-checkout-btn { flex: 1; background: var(--red-pale); color: var(--red); border: 1.5px solid #F5C6C5; border-radius: 10px; padding: 10px; font-size: 13px; font-weight: 800; cursor: pointer; transition: all 0.15s; }
        .dr-checkout-btn:hover { background: var(--red); color: #fff; border-color: var(--red); }
        .dr-edit-btn { flex: 1; background: var(--orange); color: #fff; border: none; border-radius: 10px; padding: 10px; font-size: 13px; font-weight: 800; cursor: pointer; transition: all 0.15s; }
        .dr-edit-btn:hover { background: var(--orange-hover); }

        .summary-bar { background: var(--white); border-top: 1px solid var(--border); padding: 10px 26px; display: flex; align-items: center; gap: 20px; flex-shrink: 0; font-size: 12.5px; }
        .sb-stat { display: flex; align-items: center; gap: 6px; color: var(--text-mid); font-weight: 600; }
        .sb-stat strong { color: var(--text); font-weight: 800; }

        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}
