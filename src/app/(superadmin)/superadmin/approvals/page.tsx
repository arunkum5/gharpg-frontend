'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import TopBar from '@/components/layout/TopBar'
import { toast } from 'sonner'

interface RequestGuest {
  id: string
  first_name: string
  last_name: string
  gender: string
  dob: string | null
  photo_url: string | null
  purpose: string
  college_or_company: string | null
  hometown_city: string | null
  checkin_date: string | null
  stay_duration_months: number | null
  monthly_rent: number | null
  status: string
  approval_status: string
  rejection_reason: string | null
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

interface Room {
  id: string
  room_number: string
  capacity: number
  current_occupancy: number
  is_active: boolean
  status: string
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

export default function SuperAdminApprovals() {
  const router = useRouter()
  const supabase = createClient()

  // States
  const [requests, setRequests] = useState<RequestGuest[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')
  const [searchQuery, setSearchQuery] = useState('')

  // Detail panel states
  const [selectedReq, setSelectedReq] = useState<RequestGuest | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [contacts, setContacts] = useState<EmergencyContact[]>([])
  const [documents, setDocuments] = useState<GuestDocument[]>([])
  const [allocatedRoomId, setAllocatedRoomId] = useState<string | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)

  // Reject dialog states
  const [isRejectOpen, setIsRejectOpen] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [submittingAction, setSubmittingAction] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  // Load relations on demand when selected request changes
  useEffect(() => {
    if (selectedReq) {
      fetchRequestDetails(selectedReq)
    } else {
      setRooms([])
      setContacts([])
      setDocuments([])
      setAllocatedRoomId(null)
      setIsRejectOpen(false)
      setRejectionReason('')
    }
  }, [selectedReq])

  async function fetchData() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Fetch guest records with approval relations
      const { data, error } = await supabase
        .from('guests')
        .select(`
          id, first_name, last_name, gender, dob, photo_url, purpose, college_or_company, hometown_city, checkin_date, stay_duration_months, monthly_rent, status, approval_status, rejection_reason, notes, created_at, pg_id, room_id,
          rooms(id, room_number, current_occupancy, capacity, floors(floor_name)),
          pgs(id, name, city)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      const mapped = (data || []) as unknown as RequestGuest[]
      setRequests(mapped)

      // Auto select first request in the active filtered view if none is selected
      const filtered = mapped.filter(r => {
        if (activeTab === 'pending') return r.approval_status === 'pending'
        if (activeTab === 'approved') return r.approval_status === 'approved'
        if (activeTab === 'rejected') return r.approval_status === 'rejected'
        return true
      })

      if (filtered.length > 0) {
        setSelectedReq(filtered[0])
      } else {
        setSelectedReq(null)
      }

    } catch (e: any) {
      console.error(e)
      toast.error('Failed to load approvals queue')
    } finally {
      setLoading(false)
    }
  }

  async function fetchRequestDetails(req: RequestGuest) {
    setLoadingDetails(true)
    try {
      // 1. Fetch available rooms in the guest's PG
      // 2. Fetch emergency contacts
      // 3. Fetch documents
      const [roomsRes, contactsRes, docsRes] = await Promise.all([
        supabase
          .from('rooms')
          .select('id, room_number, capacity, current_occupancy, is_active, status')
          .eq('pg_id', req.pg_id)
          .eq('is_active', true)
          .order('room_number'),
        supabase
          .from('emergency_contacts')
          .select('*')
          .eq('guest_id', req.id),
        supabase
          .from('guest_documents')
          .select('*')
          .eq('guest_id', req.id)
      ])

      if (roomsRes.error) throw roomsRes.error
      if (contactsRes.error) throw contactsRes.error
      if (docsRes.error) throw docsRes.error

      setRooms(roomsRes.data || [])
      setContacts(contactsRes.data || [])
      setDocuments(docsRes.data || [])
      setAllocatedRoomId(req.room_id)
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to load detail parameters for selected request')
    } finally {
      setLoadingDetails(false)
    }
  }

  // Approve guest registration
  async function handleApprove(guest: RequestGuest) {
    if (!allocatedRoomId) {
      toast.error('Please assign a room to the guest')
      return
    }

    setSubmittingAction(true)
    try {
      // 1. Update guest record to approved and active
      const { error: guestErr } = await supabase
        .from('guests')
        .update({
          approval_status: 'approved',
          status: 'active',
          room_id: allocatedRoomId,
          approved_at: new Date().toISOString()
        })
        .eq('id', guest.id)

      if (guestErr) throw guestErr

      // 2. Increment new room occupancy
      const room = rooms.find(r => r.id === allocatedRoomId)
      if (room) {
        const newOcc = room.current_occupancy + 1
        await supabase
          .from('rooms')
          .update({
            current_occupancy: newOcc,
            status: newOcc >= room.capacity ? 'full' : 'partial'
          })
          .eq('id', allocatedRoomId)
      }

      toast.success(`${guest.first_name} registration approved!`)
      setSelectedReq(null)
      await fetchData()
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to approve registration')
    } finally {
      setSubmittingAction(false)
    }
  }

  // Reject guest registration
  async function handleReject(guest: RequestGuest) {
    setSubmittingAction(true)
    try {
      // 1. Update guest record to rejected
      const { error: rejectErr } = await supabase
        .from('guests')
        .update({
          approval_status: 'rejected',
          status: 'rejected',
          rejection_reason: rejectionReason.trim() || 'Details did not meet validation guidelines.'
        })
        .eq('id', guest.id)

      if (rejectErr) throw rejectErr

      toast.success('Registration request rejected')
      setIsRejectOpen(false)
      setRejectionReason('')
      setSelectedReq(null)
      await fetchData()
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to reject registration')
    } finally {
      setSubmittingAction(false)
    }
  }

  // Stats calculation
  const totalCount = requests.length
  const pendingCount = requests.filter(r => r.approval_status === 'pending').length
  const approvedCount = requests.filter(r => r.approval_status === 'approved').length
  const rejectedCount = requests.filter(r => r.approval_status === 'rejected').length

  // Filter queue items
  const filteredRequests = requests
    .filter(r => {
      if (activeTab === 'pending') return r.approval_status === 'pending'
      if (activeTab === 'approved') return r.approval_status === 'approved'
      if (activeTab === 'rejected') return r.approval_status === 'rejected'
      return true
    })
    .filter(r => {
      if (!searchQuery.trim()) return true
      const query = searchQuery.toLowerCase()
      const fullName = `${r.first_name} ${r.last_name}`.toLowerCase()
      const pgName = r.pgs?.name?.toLowerCase() || ''
      return fullName.includes(query) || pgName.includes(query)
    })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar 
        title="✅ Platform Approvals" 
        subtitle="Review and approve guest onboarding requests platform-wide"
      />

      <div className="flex-1 overflow-hidden flex flex-col p-6 bg-[#FAF6F2] gap-4">
        
        {/* STATS & FILTER TABS BAR */}
        <div className="stat-strip">
          {[
            { id: 'all', icon: '📋', val: totalCount, label: 'All Requests', color: '#FFF4EC' },
            { id: 'pending', icon: '⏳', val: pendingCount, label: 'Pending Queue', color: '#FEF6E6' },
            { id: 'approved', icon: '✅', val: approvedCount, label: 'Approved', color: '#E6F9F0' },
            { id: 'rejected', icon: '❌', val: rejectedCount, label: 'Rejected', color: '#FDECEA' }
          ].map(s => (
            <div
              key={s.id}
              className={`ss-card ${activeTab === s.id ? 'active-filter' : ''}`}
              onClick={() => {
                setActiveTab(s.id as any)
                // Set first selected item in tab view
                const items = requests.filter(r => {
                  if (s.id === 'pending') return r.approval_status === 'pending'
                  if (s.id === 'approved') return r.approval_status === 'approved'
                  if (s.id === 'rejected') return r.approval_status === 'rejected'
                  return true
                })
                setSelectedReq(items[0] || null)
              }}
            >
              <div className="ss-icon" style={{ background: s.color }}>{s.icon}</div>
              <div>
                <div className="ss-val">{s.val}</div>
                <div className="ss-label">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* SEARCH ROW */}
        <div className="search-row">
          <div className="search-wrap">
            <span className="search-ic">🔍</span>
            <input 
              type="text" 
              placeholder="Search request queue by name or PG..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        {/* TWO COLUMN CONTENT LAYOUT */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-[#A89080]">
            Loading registration queue...
          </div>
        ) : (
          <div className="approval-layout">
            
            {/* LEFT COLUMN: CARDS */}
            <div className="list-panel">
              {filteredRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center bg-white border border-[#EDE0D4] rounded-[16px] p-12 text-center h-[300px]">
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📥</div>
                  <h4 style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 700 }}>Queue Empty</h4>
                  <p style={{ fontSize: 12.5, color: '#A89080', marginTop: 4 }}>
                    No requests found matching this status filter.
                  </p>
                </div>
              ) : (
                <div className="appr-cards">
                  {filteredRequests.map(r => {
                    const initials = `${r.first_name[0] || ''}${r.last_name[0] || ''}`.toUpperCase()
                    const isSelected = selectedReq?.id === r.id
                    
                    return (
                      <div
                        key={r.id}
                        className={`appr-card ${isSelected ? 'selected' : ''} ${r.approval_status === 'approved' ? 'approved' : r.approval_status === 'rejected' ? 'rejected' : ''}`}
                        onClick={() => setSelectedReq(r)}
                      >
                        <div className="ac-top">
                          <div className="ac-av" style={{ background: 'linear-gradient(135deg, #F4700A, #FFAA60)' }}>{initials}</div>
                          <div className="ac-info">
                            <div className="ac-name">{r.first_name} {r.last_name}</div>
                            <div className="ac-meta">
                              {r.purpose.charAt(0).toUpperCase() + r.purpose.slice(1)} · Stay: {r.stay_duration_months} Months
                            </div>
                            <div className="ac-pg">{r.pgs?.name || '—'} ({r.pgs?.city || '—'})</div>
                            {r.notes && <div className="ac-ref">Ref Notes: "{r.notes}"</div>}
                          </div>
                          <div>
                            <span className={`status-badge ${r.approval_status === 'approved' ? 'badge-active' : r.approval_status === 'rejected' ? 'badge-inactive' : 'badge-pending'}`} style={{ fontSize: 9.5 }}>
                              {r.approval_status}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: DETAIL REVIEW */}
            <div className="detail-panel">
              {selectedReq ? (
                <div className="dp-scrollable">
                  
                  {/* Guest Profile Card */}
                  <div className="dp-card">
                    <div className="gpp">
                      <div className="gpp-av">{`${selectedReq.first_name[0] || ''}${selectedReq.last_name[0] || ''}`.toUpperCase()}</div>
                      <div className="gpp-name">{selectedReq.first_name} {selectedReq.last_name}</div>
                      <div className="gpp-meta">Gender: {selectedReq.gender} · Hometown: {selectedReq.hometown_city || '—'}</div>
                    </div>
                    <div className="dp-card-body">
                      <div className="detail-rows">
                        <div className="dr"><span className="dr-key">Purpose</span><span className="dr-val">{selectedReq.purpose.toUpperCase()}</span></div>
                        <div className="dr"><span className="dr-key">College/Company</span><span className="dr-val">{selectedReq.college_or_company || '—'}</span></div>
                        <div className="dr"><span className="dr-key">PG Property</span><span className="dr-val" style={{ fontWeight: 800 }}>{selectedReq.pgs?.name || '—'}</span></div>
                        <div className="dr"><span className="dr-key">Requested Room</span><span className="dr-val">{selectedReq.rooms ? `Room ${selectedReq.rooms.room_number}` : 'No allocation requested'}</span></div>
                        <div className="dr"><span className="dr-key">Move-in Date</span><span className="dr-val">{selectedReq.checkin_date || '—'}</span></div>
                        <div className="dr"><span className="dr-key">Duration</span><span className="dr-val">{selectedReq.stay_duration_months} Months</span></div>
                        <div className="dr"><span className="dr-key">Monthly Rent</span><span className="dr-val" style={{ color: '#F4700A', fontWeight: 800 }}>₹{selectedReq.monthly_rent?.toLocaleString('en-IN') || '—'}</span></div>
                        {selectedReq.rejection_reason && (
                          <div className="dr-reject-box">
                            <strong>Reason Rejected:</strong> {selectedReq.rejection_reason}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Documents & emergency contacts */}
                  <div className="dp-card">
                    <div className="dp-card-hd"><div className="dp-card-title">🪪 Verification Files & Contact</div></div>
                    <div className="dp-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      
                      {/* Emergency contact details */}
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#A89080', textTransform: 'uppercase', marginBottom: 4 }}>Emergency Contact</div>
                        {loadingDetails ? (
                          <div className="loading-text">Loading contact...</div>
                        ) : contacts.length === 0 ? (
                          <div className="empty-text">No emergency contacts listed</div>
                        ) : (
                          contacts.map(c => (
                            <div key={c.id} style={{ background: '#FAF6F2', border: '1px solid #EDE0D4', borderRadius: 8, padding: 8, fontSize: 12 }}>
                              <div style={{ fontWeight: 700, color: '#1C0F05' }}>{c.name} ({c.relation})</div>
                              <div style={{ color: '#6B4F38', marginTop: 1 }}>📞 {c.phone}</div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Document uploads */}
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#A89080', textTransform: 'uppercase', marginBottom: 4 }}>Documents uploaded</div>
                        {loadingDetails ? (
                          <div className="loading-text">Loading documents...</div>
                        ) : documents.length === 0 ? (
                          <div className="empty-text">No document uploads found</div>
                        ) : (
                          documents.map(d => (
                            <div key={d.id} style={{ background: '#FAF6F2', border: '1px solid #EDE0D4', borderRadius: 8, padding: 8, fontSize: 12, marginBottom: 6 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                                <span style={{ textTransform: 'uppercase' }}>{d.doc_type.replace('_', ' ')}</span>
                                <span style={{ fontSize: 9.5 }} className={`status-badge ${d.verification_status === 'verified' ? 'badge-active' : d.verification_status === 'rejected' ? 'badge-inactive' : 'badge-pending'}`}>{d.verification_status}</span>
                              </div>
                              {d.doc_number && <div style={{ marginTop: 2, color: '#6B4F38' }}>ID: {d.doc_number}</div>}
                              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                                {d.front_url && <a href={d.front_url} target="_blank" rel="noreferrer" style={{ color: '#F4700A', textDecoration: 'none', fontWeight: 700 }}>Front Side 📄</a>}
                                {d.back_url && <a href={d.back_url} target="_blank" rel="noreferrer" style={{ color: '#F4700A', textDecoration: 'none', fontWeight: 700 }}>Back Side 📄</a>}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ROOM ALLOCATION & APPROVE ACTIONS */}
                  {selectedReq.approval_status === 'pending' && (
                    <>
                      {/* Allocations */}
                      <div className="dp-card">
                        <div className="dp-card-hd"><div className="dp-card-title">🛏️ Allocate/Change Room</div></div>
                        <div className="dp-card-body">
                          {loadingDetails ? (
                            <div className="loading-text">Loading active rooms...</div>
                          ) : rooms.length === 0 ? (
                            <div className="empty-text">No active rooms found in this PG property</div>
                          ) : (
                            <div className="room-allocation-grid">
                              {rooms.map(r => {
                                const isFull = r.current_occupancy >= r.capacity
                                const isSelected = allocatedRoomId === r.id
                                return (
                                  <div
                                    key={r.id}
                                    className={`ra-room ${isFull ? 'room-full' : 'room-free'} ${isSelected ? 'room-selected' : ''}`}
                                    onClick={() => {
                                      if (!isFull) setAllocatedRoomId(r.id)
                                    }}
                                  >
                                    <div style={{ fontSize: 13, fontWeight: 800 }}>{r.room_number}</div>
                                    <div style={{ fontSize: 9.5, opacity: 0.8 }}>{r.current_occupancy}/{r.capacity} Beds</div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="dp-card" style={{ border: 'none', background: 'transparent', boxShadow: 'none' }}>
                        <button
                          className="panel-approve-btn"
                          disabled={submittingAction}
                          onClick={() => handleApprove(selectedReq)}
                        >
                          {submittingAction ? 'Processing approval...' : '✓ Approve & Allocate Room'}
                        </button>
                        
                        <button
                          className="panel-reject-btn"
                          disabled={submittingAction}
                          onClick={() => setIsRejectOpen(!isRejectOpen)}
                        >
                          ✕ Reject Registration
                        </button>

                        {isRejectOpen && (
                          <div className="reject-drawer-form">
                            <textarea
                              placeholder="Reason for rejecting this request (sent to guest)..."
                              value={rejectionReason}
                              onChange={e => setRejectionReason(e.target.value)}
                              className="reject-textarea"
                            />
                            <button
                              className="confirm-reject-btn"
                              disabled={submittingAction}
                              onClick={() => handleReject(selectedReq)}
                            >
                              {submittingAction ? 'Confirming rejection...' : 'Confirm Rejection'}
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                </div>
              ) : (
                <div className="dp-empty">
                  Select a registration request card to review details and perform actions.
                </div>
              )}
            </div>

          </div>
        )}
      </div>

      <style>{`
        .stat-strip {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          flex-shrink: 0;
        }
        .ss-card {
          background: #fff;
          border-radius: 12px;
          border: 1px solid #EDE0D4;
          padding: 12px 14px;
          display: flex;
          align-items: center;
          gap: 10px;
          box-shadow: 0 1px 3px rgba(28,15,5,0.04);
          cursor: pointer;
          transition: all 0.15s;
        }
        .ss-card:hover {
          transform: translateY(-1.5px);
          box-shadow: 0 4px 12px rgba(28,15,5,0.08);
        }
        .ss-card.active-filter {
          border-color: #F4700A;
          background: #FFF4EC !important;
        }
        .ss-icon {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          flex-shrink: 0;
        }
        .ss-val {
          font-family: 'Playfair Display', serif;
          font-size: 20px;
          font-weight: 700;
          line-height: 1;
        }
        .ss-label {
          font-size: 11px;
          color: #A89080;
          font-weight: 500;
          margin-top: 2px;
        }

        .search-row {
          background: #fff;
          border: 1px solid #EDE0D4;
          border-radius: 12px;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }
        .search-wrap {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 8px;
          background: #FAF6F2;
          border: 1.5px solid #EDE0D4;
          border-radius: 10px;
          padding: 6px 12px;
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

        .approval-layout {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: 16px;
          overflow: hidden;
        }

        .list-panel {
          overflow-y: auto;
          scrollbar-width: thin;
        }
        .appr-cards {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .appr-card {
          background: #fff;
          border: 1.5px solid #EDE0D4;
          border-radius: 12px;
          padding: 14px;
          box-shadow: 0 1px 3px rgba(28,15,5,0.04);
          cursor: pointer;
          transition: all 0.15s;
          position: relative;
          overflow: hidden;
        }
        .appr-card::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 4px;
          background: #F5A623;
        }
        .appr-card.approved::before {
          background: #1DB970;
        }
        .appr-card.rejected::before {
          background: #E53935;
        }
        .appr-card:hover {
          border-color: #FFD9B8;
          box-shadow: 0 4px 12px rgba(28,15,5,0.08);
        }
        .appr-card.selected {
          border-color: #F4700A;
          box-shadow: 0 0 0 3px rgba(244,112,10,0.12);
        }

        .ac-top {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .ac-av {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13.5px;
          font-weight: 800;
          color: #fff;
          flex-shrink: 0;
        }
        .ac-info {
          flex: 1;
        }
        .ac-name {
          font-size: 14px;
          font-weight: 800;
          color: #1C0F05;
        }
        .ac-meta {
          font-size: 11.5px;
          color: #A89080;
          margin-top: 1px;
        }
        .ac-pg {
          font-size: 12px;
          font-weight: 700;
          color: #6B4F38;
          margin-top: 2px;
        }
        .ac-ref {
          font-size: 11px;
          color: #F4700A;
          font-style: italic;
          margin-top: 4px;
        }

        .detail-panel {
          background: #fff;
          border: 1px solid #EDE0D4;
          border-radius: 16px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 1px 4px rgba(28,15,5,0.06);
        }

        .dp-scrollable {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          scrollbar-width: thin;
        }

        .dp-empty {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          color: #A89080;
          font-size: 13px;
          padding: 24px;
          font-style: italic;
        }

        .dp-card {
          background: #fff;
          border: 1px solid #EDE0D4;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 1px 2px rgba(28,15,5,0.02);
        }
        .dp-card-hd {
          padding: 10px 14px;
          background: #FAF6F2;
          border-bottom: 1px solid #EDE0D4;
        }
        .dp-card-title {
          font-family: 'Playfair Display', serif;
          font-size: 12.5px;
          font-weight: 700;
          color: #6B4F38;
        }
        .dp-card-body {
          padding: 12px 14px;
        }

        .gpp {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 16px;
          background: linear-gradient(135deg, #1C0F05, #3D1F08);
          color: #fff;
          text-align: center;
        }
        .gpp-av {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: linear-gradient(135deg, #F4700A, #FFAA60);
          border: 2px solid rgba(255,255,255,0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 800;
          margin-bottom: 8px;
        }
        .gpp-name {
          font-family: 'Playfair Display', serif;
          font-size: 15px;
          font-weight: 700;
        }
        .gpp-meta {
          font-size: 11px;
          color: #C9A882;
          margin-top: 2px;
        }

        .detail-rows {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .dr {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }
        .dr-key {
          font-size: 11px;
          color: #A89080;
        }
        .dr-val {
          font-size: 12px;
          font-weight: 700;
          color: #1C0F05;
          text-align: right;
        }
        .dr-reject-box {
          margin-top: 6px;
          padding: 8px;
          background: #FDECEA;
          border: 1px solid #F5C6C5;
          border-radius: 8px;
          font-size: 11.5px;
          color: #E53935;
        }

        .loading-text, .empty-text {
          font-size: 11px;
          color: #A89080;
          text-align: center;
          padding: 6px 0;
          font-style: italic;
        }

        .room-allocation-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          margin-top: 4px;
        }
        .ra-room {
          border: 1px solid #EDE0D4;
          border-radius: 8px;
          padding: 8px;
          text-align: center;
          cursor: pointer;
          transition: all 0.15s;
        }
        .ra-room.room-free {
          background: #E6F9F0;
          border-color: #A8EDD0;
          color: #1DB970;
        }
        .ra-room.room-full {
          background: #FDECEA;
          border-color: #F5C6C5;
          color: #E53935;
          opacity: 0.5;
          cursor: not-allowed;
        }
        .ra-room.room-selected {
          border-color: #F4700A !important;
          background: #FFF4EC !important;
          color: #F4700A !important;
          box-shadow: 0 0 0 2.5px rgba(244,112,10,0.15);
        }

        .panel-approve-btn {
          width: 100%;
          background: #1DB970;
          color: #fff;
          border: none;
          border-radius: 9px;
          padding: 10px;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          margin-bottom: 8px;
          transition: background 0.15s;
          font-family: inherit;
        }
        .panel-approve-btn:hover {
          background: #17A85F;
        }
        .panel-reject-btn {
          width: 100%;
          background: #FAF6F2;
          color: #E53935;
          border: 1.5px solid #F5C6C5;
          border-radius: 9px;
          padding: 9px;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.15s;
          font-family: inherit;
        }
        .panel-reject-btn:hover {
          background: #E53935;
          color: #fff;
          border-color: #E53935;
        }

        .reject-drawer-form {
          margin-top: 8px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .reject-textarea {
          width: 100%;
          border: 1.5px solid #EDE0D4;
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 12px;
          outline: none;
          resize: none;
          height: 60px;
          font-family: inherit;
        }
        .reject-textarea:focus {
          border-color: #E53935;
        }
        .confirm-reject-btn {
          background: #E53935;
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 8px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          font-family: inherit;
        }

        .status-badge {
          font-size: 10px;
          font-weight: 800;
          padding: 3px 8px;
          border-radius: 20px;
          text-transform: uppercase;
          display: inline-block;
        }
        .badge-active { background: #E6F9F0; color: #1DB970; }
        .badge-inactive { background: #FDECEA; color: #E53935; }
        .badge-pending { background: #FEF6E6; color: #F5A623; }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
