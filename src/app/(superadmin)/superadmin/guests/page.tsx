'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import TopBar from '@/components/layout/TopBar'
import { toast } from 'sonner'
import Link from 'next/link'
import { resetUserPasswordAction } from '@/app/actions/auth'

interface GuestWithPGAndRoom {
  id: string
  user_id: string | null
  first_name: string
  last_name: string
  gender: string
  dob: string | null
  photo_url: string | null
  purpose: string
  college_or_company: string | null
  hometown_city: string | null
  checkin_date: string | null
  expected_checkout_date: string | null
  actual_checkout_date: string | null
  stay_duration_months: number | null
  monthly_rent: number | null
  status: string
  approval_status: string
  notes: string | null
  created_at: string
  pg_id: string
  room_id: string | null
  rooms: {
    id: string
    room_number: string
    current_occupancy: number
    capacity: number
    floors: {
      floor_name: string
    } | null
  } | null
  pgs: {
    id: string
    name: string
    city: string
  } | null
}

interface EmergencyContact {
  id: string
  name: string
  relation: string
  phone: string
  city: string | null
}

interface GuestDocument {
  id: string
  doc_type: string
  doc_number: string | null
  front_url: string | null
  back_url: string | null
  verification_status: string
}

interface PGInfo {
  id: string
  name: string
  city: string
}

export default function SuperAdminGuests() {
  const router = useRouter()
  const supabase = createClient()

  // States
  const [guests, setGuests] = useState<GuestWithPGAndRoom[]>([])
  const [pgs, setPgs] = useState<PGInfo[]>([])
  const [loading, setLoading] = useState(true)

  // Filters / Search / Sorting
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'pending' | 'checked_out'>('all')
  const [selectedPgId, setSelectedPgId] = useState('all')
  const [sortField, setSortField] = useState<'name' | 'checkin_date' | 'rent' | 'room'>('checkin_date')
  const [sortAsc, setSortAsc] = useState(false)

  // Selected guest detail drawer
  const [selectedGuest, setSelectedGuest] = useState<GuestWithPGAndRoom | null>(null)
  const [contacts, setContacts] = useState<EmergencyContact[]>([])
  const [documents, setDocuments] = useState<GuestDocument[]>([])
  const [loadingDetails, setLoadingDetails] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  // Fetch detailed info on drawer select
  useEffect(() => {
    if (selectedGuest) {
      fetchGuestDetails(selectedGuest.id)
    } else {
      setContacts([])
      setDocuments([])
    }
  }, [selectedGuest])

  async function fetchData() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // 1. Fetch all guests with pgs and rooms relations
      const { data: guestsData, error: guestsErr } = await supabase
        .from('guests')
        .select(`
          id, user_id, first_name, last_name, gender, dob, photo_url, purpose, college_or_company, hometown_city, checkin_date, expected_checkout_date, actual_checkout_date, stay_duration_months, monthly_rent, status, approval_status, notes, created_at, pg_id, room_id,
          rooms(id, room_number, current_occupancy, capacity, floors(floor_name)),
          pgs(id, name, city)
        `)
        .order('created_at', { ascending: false })

      if (guestsErr) throw guestsErr

      // 2. Fetch all PGs for filter dropdown
      const { data: pgsData, error: pgsErr } = await supabase
        .from('pgs')
        .select('id, name, city')
        .is('deleted_at', null)
        .order('name')

      if (pgsErr) throw pgsErr

      setGuests(guestsData as unknown as GuestWithPGAndRoom[])
      setPgs(pgsData || [])
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to load guests data')
    } finally {
      setLoading(false)
    }
  }

  async function fetchGuestDetails(guestId: string) {
    setLoadingDetails(true)
    try {
      const [contactsRes, docsRes] = await Promise.all([
        supabase
          .from('emergency_contacts')
          .select('*')
          .eq('guest_id', guestId),
        supabase
          .from('guest_documents')
          .select('*')
          .eq('guest_id', guestId)
      ])

      if (contactsRes.error) throw contactsRes.error
      if (docsRes.error) throw docsRes.error

      setContacts(contactsRes.data || [])
      setDocuments(docsRes.data || [])
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to load guest documents or emergency contact details')
    } finally {
      setLoadingDetails(false)
    }
  }

  // Checkout guest handler
  async function handleCheckout(guest: GuestWithPGAndRoom) {
    if (!confirm(`Are you sure you want to check out ${guest.first_name} ${guest.last_name}?`)) return
    try {
      // 1. Update guest status to checked_out
      const { error: guestErr } = await supabase
        .from('guests')
        .update({
          status: 'checked_out',
          actual_checkout_date: new Date().toISOString().split('T')[0]
        })
        .eq('id', guest.id)

      if (guestErr) throw guestErr

      // 2. Decrement room occupancy if assigned
      if (guest.room_id && guest.rooms) {
        const newOcc = Math.max(0, guest.rooms.current_occupancy - 1)
        await supabase
          .from('rooms')
          .update({
            current_occupancy: newOcc,
            status: newOcc === 0 ? 'free' : 'partial'
          })
          .eq('id', guest.room_id)
      }

      toast.success('Guest checked out successfully!')
      setSelectedGuest(null)
      await fetchData()
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to checkout guest')
    }
  }

  // Delete guest record permanently
  async function handleDeleteGuest(guest: GuestWithPGAndRoom) {
    if (!confirm(`Are you sure you want to permanently delete guest ${guest.first_name} ${guest.last_name}? This cannot be undone.`)) return
    try {
      // 1. Delete emergency contacts and documents first to prevent FK failures
      await Promise.all([
        supabase.from('emergency_contacts').delete().eq('guest_id', guest.id),
        supabase.from('guest_documents').delete().eq('guest_id', guest.id)
      ])

      // 2. Delete guest record
      const { error: delErr } = await supabase
        .from('guests')
        .delete()
        .eq('id', guest.id)

      if (delErr) throw delErr

      // 3. Decrement room occupancy if active/approved and room assigned
      if (guest.room_id && guest.rooms && guest.status === 'active') {
        const newOcc = Math.max(0, guest.rooms.current_occupancy - 1)
        await supabase
          .from('rooms')
          .update({
            current_occupancy: newOcc,
            status: newOcc === 0 ? 'free' : 'partial'
          })
          .eq('id', guest.room_id)
      }

      toast.success('Guest record deleted successfully')
      setSelectedGuest(null)
      await fetchData()
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to delete guest record')
    }
  }

  // Reset guest PIN
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

  // Counts for tabs
  const totalCount = guests.length
  const activeCount = guests.filter(g => g.status === 'active').length
  const pendingCount = guests.filter(g => g.status === 'pending').length
  const checkedOutCount = guests.filter(g => g.status === 'checked_out').length

  // Filter & Search & Sort logic
  const filteredGuests = guests
    .filter(g => {
      // Tab status filter
      if (activeTab === 'active') return g.status === 'active'
      if (activeTab === 'pending') return g.status === 'pending'
      if (activeTab === 'checked_out') return g.status === 'checked_out'
      return true
    })
    .filter(g => {
      // PG filter dropdown
      if (selectedPgId === 'all') return true
      return g.pg_id === selectedPgId
    })
    .filter(g => {
      // Search query filter (name, hometown, pg name, room number)
      if (!searchQuery.trim()) return true
      const query = searchQuery.toLowerCase()
      const fullName = `${g.first_name} ${g.last_name}`.toLowerCase()
      const roomNum = g.rooms?.room_number?.toLowerCase() || ''
      const pgName = g.pgs?.name?.toLowerCase() || ''
      const hometown = g.hometown_city?.toLowerCase() || ''
      return fullName.includes(query) || roomNum.includes(query) || pgName.includes(query) || hometown.includes(query)
    })
    .sort((a, b) => {
      let valA: any = ''
      let valB: any = ''

      if (sortField === 'name') {
        valA = `${a.first_name} ${a.last_name}`.toLowerCase()
        valB = `${b.first_name} ${b.last_name}`.toLowerCase()
      } else if (sortField === 'checkin_date') {
        valA = a.checkin_date || ''
        valB = b.checkin_date || ''
      } else if (sortField === 'rent') {
        valA = a.monthly_rent || 0
        valB = b.monthly_rent || 0
      } else if (sortField === 'room') {
        valA = a.rooms?.room_number || ''
        valB = b.rooms?.room_number || ''
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
      <TopBar 
        title="👥 All Guests" 
        subtitle={`Platform has ${guests.length} registered guests across all properties`}
      />

      <div className="flex-1 overflow-hidden flex flex-col">
        
        {/* FILTER STRIP */}
        <div className="fb-strip">
          <div className="fb-tabs">
            <div
              className={`fb-tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All <span className="cnt">{totalCount}</span>
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

          <div style={{ flex: 1 }} />

          {/* Search bar */}
          <div className="search-wrap">
            <span className="search-ic">🔍</span>
            <input 
              type="text" 
              placeholder="Search by name, room, PG..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          {/* PG Select */}
          <div className="select-wrap">
            <select value={selectedPgId} onChange={e => setSelectedPgId(e.target.value)}>
              <option value="all">🏢 All Properties</option>
              {pgs.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.city})</option>
              ))}
            </select>
          </div>
        </div>

        {/* TABLE WRAP */}
        <div className="table-area">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-[#A89080]">
              Loading guest list...
            </div>
          ) : filteredGuests.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-white border border-[#EDE0D4] rounded-[16px] p-12 text-center m-6">
              <div style={{ fontSize: 48, marginBottom: 14 }}>👥</div>
              <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700 }}>No Guests Found</h3>
              <p style={{ fontSize: 13, color: '#A89080', marginTop: 4 }}>
                No guest matches your active search queries or status filters.
              </p>
            </div>
          ) : (
            <div className="gtable-card">
              <table className="gtable">
                <thead>
                  <tr>
                    <th onClick={() => toggleSort('name')} className="cursor-pointer select-none">
                      Guest Name {sortField === 'name' ? (sortAsc ? '▲' : '▼') : '↕'}
                    </th>
                    <th>Property (PG)</th>
                    <th onClick={() => toggleSort('room')} className="cursor-pointer select-none">
                      Room {sortField === 'room' ? (sortAsc ? '▲' : '▼') : '↕'}
                    </th>
                    <th>Purpose</th>
                    <th onClick={() => toggleSort('checkin_date')} className="cursor-pointer select-none">
                      Check-in {sortField === 'checkin_date' ? (sortAsc ? '▲' : '▼') : '↕'}
                    </th>
                    <th onClick={() => toggleSort('rent')} className="cursor-pointer select-none">
                      Rent {sortField === 'rent' ? (sortAsc ? '▲' : '▼') : '↕'}
                    </th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGuests.map(g => {
                    const initials = `${g.first_name[0] || ''}${g.last_name[0] || ''}`.toUpperCase()
                    const colors = [
                      'linear-gradient(135deg, #F4700A, #FFAA60)',
                      'linear-gradient(135deg, #1DB970, #5DE89A)',
                      'linear-gradient(135deg, #7C3AED, #A78BFA)',
                      'linear-gradient(135deg, #2563EB, #60A5FA)'
                    ]
                    const avBg = colors[initials.charCodeAt(0) % colors.length]

                    return (
                      <tr key={g.id} onClick={() => setSelectedGuest(g)} className="cursor-pointer">
                        <td>
                          <div className="guest-profile-cell">
                            <div className="guest-av" style={{ background: avBg }}>{initials}</div>
                            <div>
                              <div className="guest-name">{g.first_name} {g.last_name}</div>
                              <div className="guest-sub">{g.gender.charAt(0).toUpperCase() + g.gender.slice(1)} · {g.hometown_city || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          {g.pgs ? (
                            <div>
                              <div style={{ fontWeight: 700, color: '#1C0F05' }}>{g.pgs.name}</div>
                              <div style={{ fontSize: 11, color: '#A89080' }}>📍 {g.pgs.city}</div>
                            </div>
                          ) : '—'}
                        </td>
                        <td>
                          {g.rooms ? (
                            <div>
                              <span className="room-chip">{g.rooms.room_number}</span>
                              <div style={{ fontSize: 10.5, color: '#A89080', marginTop: 2 }}>
                                {g.rooms.floors?.floor_name || '—'}
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: '#A89080' }}>Unallocated</span>
                          )}
                        </td>
                        <td>
                          <span className="purpose-chip">
                            {g.purpose === 'student' ? '🎓 Student' : g.purpose === 'working' ? '💼 Working' : '🧑 Other'}
                          </span>
                        </td>
                        <td style={{ color: '#6B4F38' }}>
                          {g.checkin_date ? new Date(g.checkin_date).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          }) : '—'}
                        </td>
                        <td style={{ fontWeight: 800, color: '#F4700A' }}>
                          {g.monthly_rent ? `₹${g.monthly_rent.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td>
                          <span className={`status-badge ${g.status === 'active' ? 'b-active' : g.status === 'pending' ? 'b-pending' : 'b-checkout'}`}>
                            {g.status === 'active' ? 'Active' : g.status === 'pending' ? 'Pending' : 'Checked Out'}
                          </span>
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <div className="actions-cell">
                            <button 
                              className="action-btn text-orange"
                              onClick={() => setSelectedGuest(g)}
                            >
                              Details 👁
                            </button>
                            {g.status === 'active' && (
                              <button 
                                className="action-btn text-red"
                                onClick={() => handleCheckout(g)}
                              >
                                Checkout 🚪
                              </button>
                            )}
                            <button 
                              className="action-btn text-mid"
                              onClick={() => handleDeleteGuest(g)}
                            >
                              Delete 🗑
                            </button>
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
      </div>

      {/* DETAILED DRAWERS */}
      {selectedGuest && (
        <div className="drawer-overlay" onClick={() => setSelectedGuest(null)}>
          <div className="drawer" onClick={e => e.stopPropagation()}>
            
            {/* Header */}
            <div className="drawer-hd">
              <div className="drawer-av-large" style={{ background: 'linear-gradient(135deg, #F4700A, #FFAA60)' }}>
                {`${selectedGuest.first_name[0] || ''}${selectedGuest.last_name[0] || ''}`.toUpperCase()}
              </div>
              <div className="drawer-hd-details">
                <div className="drawer-name">{selectedGuest.first_name} {selectedGuest.last_name}</div>
                <div className="drawer-sub">Hometown: {selectedGuest.hometown_city || '—'}</div>
                <div style={{ marginTop: 6 }}>
                  <span className={`status-badge ${selectedGuest.status === 'active' ? 'b-active' : selectedGuest.status === 'pending' ? 'b-pending' : 'b-checkout'}`}>
                    {selectedGuest.status.toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="drawer-close" onClick={() => setSelectedGuest(null)}>✕</div>
            </div>

            {/* Body */}
            <div className="drawer-body">
              <div className="drawer-section">
                <div className="drawer-sec-title">📋 General details</div>
                <div className="detail-grid">
                  <div className="detail-item"><span className="lbl">Gender</span><span className="val">{selectedGuest.gender}</span></div>
                  <div className="detail-item"><span className="lbl">Date of birth</span><span className="val">{selectedGuest.dob || '—'}</span></div>
                  <div className="detail-item"><span className="lbl">Purpose</span><span className="val">{selectedGuest.purpose.toUpperCase()}</span></div>
                  <div className="detail-item"><span className="lbl">Company/College</span><span className="val">{selectedGuest.college_or_company || '—'}</span></div>
                  <div className="detail-item"><span className="lbl">Property (PG)</span><span className="val" style={{ fontWeight: 800 }}>{selectedGuest.pgs?.name || '—'}</span></div>
                  <div className="detail-item"><span className="lbl">Room & Floor</span><span className="val">{selectedGuest.rooms ? `${selectedGuest.rooms.room_number} (${selectedGuest.rooms.floors?.floor_name || '—'})` : '—'}</span></div>
                  <div className="detail-item"><span className="lbl">Check-in</span><span className="val">{selectedGuest.checkin_date || '—'}</span></div>
                  <div className="detail-item"><span className="lbl">Duration</span><span className="val">{selectedGuest.stay_duration_months ? `${selectedGuest.stay_duration_months} Months` : '—'}</span></div>
                  <div className="detail-item"><span className="lbl">Monthly Rent</span><span className="val" style={{ color: '#F4700A', fontWeight: 800 }}>₹{selectedGuest.monthly_rent?.toLocaleString('en-IN') || '—'}</span></div>
                </div>
                {selectedGuest.notes && (
                  <div style={{ marginTop: 12, padding: 10, background: '#FAF6F2', border: '1px solid #EDE0D4', borderRadius: 8, fontSize: 12, color: '#6B4F38' }}>
                    <strong>Notes:</strong> {selectedGuest.notes}
                  </div>
                )}
              </div>

              {/* Emergency Contact */}
              <div className="drawer-section">
                <div className="drawer-sec-title">📞 Emergency Contact</div>
                {loadingDetails ? (
                  <div className="loading-small">Loading emergency details...</div>
                ) : contacts.length === 0 ? (
                  <div className="empty-small">No emergency contact registered</div>
                ) : (
                  contacts.map(c => (
                    <div key={c.id} className="contact-card">
                      <div style={{ fontWeight: 700, color: '#1C0F05', fontSize: 13 }}>{c.name} ({c.relation})</div>
                      <div style={{ fontSize: 12, color: '#6B4F38', marginTop: 2 }}>📞 {c.phone} {c.city ? `· 📍 ${c.city}` : ''}</div>
                    </div>
                  ))
                )}
              </div>

              {/* Documents */}
              <div className="drawer-section">
                <div className="drawer-sec-title">🪪 Documents ({documents.length})</div>
                {loadingDetails ? (
                  <div className="loading-small">Loading verification files...</div>
                ) : documents.length === 0 ? (
                  <div className="empty-small">No identity verification documents uploaded</div>
                ) : (
                  <div className="doc-list">
                    {documents.map(d => (
                      <div key={d.id} className="doc-card">
                        <div className="doc-header">
                          <span style={{ fontWeight: 800, fontSize: 11.5, color: '#1C0F05', textTransform: 'uppercase' }}>
                            {d.doc_type.replace('_', ' ')}
                          </span>
                          <span className={`status-badge ${d.verification_status === 'verified' ? 'badge-active' : d.verification_status === 'rejected' ? 'badge-inactive' : 'badge-pending'}`} style={{ fontSize: 9 }}>
                            {d.verification_status}
                          </span>
                        </div>
                        {d.doc_number && <div style={{ fontSize: 12, color: '#6B4F38', marginTop: 2 }}>Number: <strong>{d.doc_number}</strong></div>}
                        <div className="doc-links">
                          {d.front_url && <a href={d.front_url} target="_blank" rel="noreferrer" className="doc-link">View Front Side 📄</a>}
                          {d.back_url && <a href={d.back_url} target="_blank" rel="noreferrer" className="doc-link">View Back Side 📄</a>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions Footer */}
            <div className="drawer-foot">
              <button 
                className="btn-ghost" 
                onClick={() => setSelectedGuest(null)}
              >
                Close Drawer
              </button>
              {selectedGuest.user_id && (
                <button 
                  className="btn-danger-outline" 
                  onClick={() => handleResetPin(selectedGuest.user_id!, `${selectedGuest.first_name} ${selectedGuest.last_name}`)}
                  style={{ borderColor: '#FFD9B8', color: '#F4700A' }}
                >
                  🔑 Reset PIN
                </button>
              )}
              {selectedGuest.status === 'active' && (
                <button 
                  className="btn-danger-outline" 
                  onClick={() => handleCheckout(selectedGuest)}
                >
                  🚪 Checkout Guest
                </button>
              )}
              <button 
                className="btn-danger" 
                onClick={() => handleDeleteGuest(selectedGuest)}
              >
                🗑 Delete Record
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .fb-strip {
          background: #fff;
          border-bottom: 1px solid #EDE0D4;
          padding: 12px 24px;
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .fb-tabs {
          display: flex;
          gap: 6px;
        }
        .fb-tab {
          border: 1.5px solid #EDE0D4;
          border-radius: 8px;
          padding: 6px 14px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s;
          color: #A89080;
        }
        .fb-tab:hover {
          border-color: #FFD9B8;
          color: #F4700A;
        }
        .fb-tab.active {
          border-color: #F4700A;
          background: #FFF4EC;
          color: #F4700A;
        }
        .fb-tab .cnt {
          background: #F4700A;
          color: #fff;
          font-size: 9.5px;
          font-weight: 800;
          padding: 1px 6px;
          border-radius: 20px;
          margin-left: 4px;
          display: inline-block;
        }

        .search-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #FAF6F2;
          border: 1.5px solid #EDE0D4;
          border-radius: 10px;
          padding: 6px 12px;
          width: 220px;
        }
        .search-ic {
          font-size: 14px;
          color: #A89080;
        }
        .search-input {
          flex: 1;
          border: none;
          background: transparent;
          outline: none;
          font-size: 13px;
          font-family: inherit;
          color: #1C0F05;
        }

        .select-wrap select {
          border: 1.5px solid #EDE0D4;
          border-radius: 10px;
          padding: 7px 10px;
          font-size: 13px;
          background: #FAF6F2;
          outline: none;
          font-family: inherit;
          color: #1C0F05;
          cursor: pointer;
        }

        .table-area {
          flex: 1;
          overflow-y: auto;
          padding: 20px 24px;
          background: #FAF6F2;
        }

        .gtable-card {
          background: #fff;
          border: 1px solid #EDE0D4;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 1px 4px rgba(28,15,5,0.06);
        }

        .gtable {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }
        .gtable th {
          font-size: 10.5px;
          font-weight: 800;
          color: #A89080;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          padding: 14px 20px;
          border-bottom: 1.5px solid #EDE0D4;
          background: #FAF6F2;
        }
        .gtable td {
          padding: 12px 20px;
          font-size: 13.5px;
          border-bottom: 1px solid #F5EDE5;
          vertical-align: middle;
        }
        .gtable tr:last-child td {
          border-bottom: none;
        }
        .gtable tbody tr:hover td {
          background: #FFF4EC;
        }

        .guest-profile-cell {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .guest-av {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 800;
          color: #fff;
          flex-shrink: 0;
        }
        .guest-name {
          font-weight: 700;
          color: #1C0F05;
        }
        .guest-sub {
          font-size: 11px;
          color: #A89080;
          margin-top: 2px;
        }

        .room-chip {
          background: #FFF4EC;
          color: #F4700A;
          border-radius: 6px;
          padding: 3px 8px;
          font-size: 11px;
          font-weight: 800;
          display: inline-block;
        }
        .purpose-chip {
          font-size: 12px;
          font-weight: 700;
          color: #6B4F38;
        }

        .status-badge {
          font-size: 10px;
          font-weight: 800;
          padding: 3px 8px;
          border-radius: 20px;
          text-transform: uppercase;
          display: inline-block;
        }
        .b-active {
          background: #E6F9F0;
          color: #1DB970;
        }
        .b-pending {
          background: #FEF6E6;
          color: #F5A623;
        }
        .b-checkout {
          background: #FDECEA;
          color: #E53935;
        }

        .actions-cell {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
        }
        .action-btn {
          background: transparent;
          border: none;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          padding: 4px 6px;
          border-radius: 6px;
          transition: background 0.15s;
        }
        .action-btn:hover {
          background: rgba(0,0,0,0.04);
        }

        .text-orange { color: #F4700A; }
        .text-red { color: #E53935; }
        .text-mid { color: #A89080; }

        /* DETAILED DRAWER */
        .drawer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(28,15,5,0.4);
          z-index: 1000;
          display: flex;
          justify-content: flex-end;
          animation: fadeIn 0.2s ease;
        }
        .drawer {
          background: #fff;
          width: 420px;
          height: 100%;
          box-shadow: -6px 0 30px rgba(28,15,5,0.15);
          display: flex;
          flex-direction: column;
          animation: slideIn 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .drawer-hd {
          padding: 24px;
          background: linear-gradient(135deg, #1C0F05, #3D1F08);
          color: #fff;
          display: flex;
          align-items: center;
          gap: 16px;
          position: relative;
        }
        .drawer-av-large {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          border: 3px solid rgba(255,255,255,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          font-weight: 800;
          color: #fff;
        }
        .drawer-hd-details {
          flex: 1;
        }
        .drawer-name {
          font-family: 'Playfair Display', serif;
          font-size: 18px;
          font-weight: 700;
        }
        .drawer-close {
          position: absolute;
          top: 20px;
          right: 20px;
          cursor: pointer;
          color: rgba(255,255,255,0.6);
          font-size: 16px;
        }
        .drawer-close:hover {
          color: #fff;
        }

        .drawer-body {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .drawer-section {
          background: #FAF6F2;
          border: 1px solid #EDE0D4;
          border-radius: 12px;
          padding: 16px;
        }
        .drawer-sec-title {
          font-size: 10.5px;
          font-weight: 800;
          color: #A89080;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          margin-bottom: 12px;
          border-bottom: 1px solid #EDE0D4;
          padding-bottom: 6px;
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        .detail-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .detail-item .lbl {
          font-size: 10.5px;
          color: #A89080;
        }
        .detail-item .val {
          font-size: 12.5px;
          font-weight: 700;
          color: #1C0F05;
        }

        .loading-small {
          font-size: 12px;
          color: #A89080;
          text-align: center;
          padding: 10px 0;
        }
        .empty-small {
          font-size: 12px;
          color: #A89080;
          font-style: italic;
          text-align: center;
          padding: 10px 0;
        }

        .contact-card {
          background: #fff;
          border: 1px solid #EDE0D4;
          border-radius: 8px;
          padding: 10px;
        }

        .doc-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .doc-card {
          background: #fff;
          border: 1px solid #EDE0D4;
          border-radius: 8px;
          padding: 10px;
        }
        .doc-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1.5px solid #FAF6F2;
          padding-bottom: 4px;
          margin-bottom: 6px;
        }
        .doc-links {
          margin-top: 8px;
          display: flex;
          gap: 12px;
        }
        .doc-link {
          font-size: 11.5px;
          color: #F4700A;
          text-decoration: none;
          font-weight: 700;
        }
        .doc-link:hover {
          text-decoration: underline;
        }

        .drawer-foot {
          padding: 16px 20px;
          background: #FAF6F2;
          border-top: 1px solid #EDE0D4;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          flex-shrink: 0;
        }

        .btn-ghost {
          background: transparent;
          border: 1px solid #EDE0D4;
          color: #6B4F38;
          border-radius: 8px;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
        }
        .btn-danger-outline {
          background: transparent;
          border: 1px solid #F5C6C5;
          color: #E53935;
          border-radius: 8px;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
        }
        .btn-danger-outline:hover {
          background: #FDECEA;
        }
        .btn-danger {
          background: #E53935;
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
        }
        .btn-danger:hover {
          background: #D32F2F;
        }

        .badge-active { background: #E6F9F0; color: #1DB970; }
        .badge-inactive { background: #FDECEA; color: #E53935; }
        .badge-pending { background: #FEF6E6; color: #F5A623; }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
