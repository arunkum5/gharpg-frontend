'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import TopBar from '@/components/layout/TopBar'
import { toast } from 'sonner'
import { Guest, Room, Floor } from '@/lib/types/database'

interface RequestGuest extends Guest {
  rooms: {
    room_number: string
    floors: {
      floor_name: string
    } | null
  } | null
}

export default function ApprovalsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [pgId, setPgId] = useState<string | null>(null)
  const [pgName, setPgName] = useState<string>('My PG')
  const [requests, setRequests] = useState<RequestGuest[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)

  // Filtering states
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'checkout_requests'>('pending')
  const [searchQuery, setSearchQuery] = useState('')

  // Detail panel states
  const [selectedReq, setSelectedReq] = useState<RequestGuest | null>(null)
  const [allocatedRoomId, setAllocatedRoomId] = useState<string | null>(null)
  const [isRejectOpen, setIsRejectOpen] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')

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

      // Get PG
      const { data: pgAdmin, error: pgErr } = await supabase
        .from('pg_admins')
        .select('pg_id, pgs(id, name, city)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()

      if (pgErr || !pgAdmin) {
        toast.error('No active PG assigned')
        router.push('/login')
        return
      }

      const pg = pgAdmin.pgs as unknown as { id: string; name: string; city: string }
      setPgId(pg.id)
      setPgName(pg.name)

      // Fetch requests (approval_status pending or any other status)
      const { data: guestsData, error: guestsErr } = await supabase
        .from('guests')
        .select(`
          *,
          rooms(room_number, floors(floor_name))
        `)
        .eq('pg_id', pg.id)
      
      if (guestsErr) throw guestsErr

      const mapped = (guestsData || []).map((g: any) => ({
        ...g,
        rooms: g.rooms ? {
          room_number: g.rooms.room_number,
          floors: g.rooms.floors ? { floor_name: g.rooms.floors.floor_name } : null
        } : null
      })) as RequestGuest[]

      setRequests(mapped)

      // Fetch rooms for allocation
      const { data: roomsData } = await supabase
        .from('rooms')
        .select('*')
        .eq('pg_id', pg.id)
        .eq('is_active', true)

      setRooms(roomsData || [])

      // Auto select first pending request
      const pending = mapped.filter(r => r.approval_status === 'pending')
      if (pending.length > 0) {
        setSelectedReq(pending[0])
        setAllocatedRoomId(pending[0].room_id)
      } else if (mapped.length > 0) {
        setSelectedReq(mapped[0])
        setAllocatedRoomId(mapped[0].room_id)
      }

    } catch (e: any) {
      console.error(e)
      toast.error('Error loading approvals data')
    } finally {
      setLoading(false)
    }
  }

  // Action methods
  async function handleApprove(guest: RequestGuest) {
    const roomIdToAssign = guest.id === selectedReq?.id ? allocatedRoomId : guest.room_id
    if (!roomIdToAssign) {
      toast.error('Please assign a room first')
      return
    }

    try {
      const { error: guestErr } = await supabase
        .from('guests')
        .update({
          approval_status: 'approved',
          status: 'active',
          room_id: roomIdToAssign,
          approved_at: new Date().toISOString()
        })
        .eq('id', guest.id)

      if (guestErr) throw guestErr

      // Update room occupancy
      const room = rooms.find(r => r.id === roomIdToAssign)
      if (room) {
        const newOcc = room.current_occupancy + 1
        await supabase
          .from('rooms')
          .update({
            current_occupancy: newOcc,
            status: newOcc >= room.capacity ? 'full' : 'partial'
          })
          .eq('id', roomIdToAssign)
      }

      toast.success(`${guest.first_name} approved!`)
      setSelectedReq(null)
      await fetchData()
    } catch (e: any) {
      console.error(e)
      toast.error('Error approving request')
    }
  }

  async function handleReject(guest: RequestGuest) {
    try {
      const { error } = await supabase
        .from('guests')
        .update({
          approval_status: 'rejected',
          status: 'rejected',
          rejection_reason: rejectionReason || null
        })
        .eq('id', guest.id)

      if (error) throw error
      toast.success('Registration rejected')
      setIsRejectOpen(false)
      setRejectionReason('')
      setSelectedReq(null)
      await fetchData()
    } catch (e: any) {
      console.error(e)
      toast.error('Error rejecting request')
    }
  }

  async function handleApproveCheckout(guest: RequestGuest) {
    try {
      const { error } = await supabase
        .from('guests')
        .update({
          status: 'checked_out',
          checkout_requested: false,
          actual_checkout_date: guest.expected_checkout_date || new Date().toISOString().split('T')[0]
        })
        .eq('id', guest.id)

      if (error) throw error

      // Decrease occupancy of allocated room
      if (guest.room_id) {
        const { data: roomData } = await supabase
          .from('rooms')
          .select('current_occupancy, capacity')
          .eq('id', guest.room_id)
          .single()
        
        if (roomData) {
          const newOcc = Math.max(0, roomData.current_occupancy - 1)
          await supabase
            .from('rooms')
            .update({
              current_occupancy: newOcc,
              status: newOcc === 0 ? 'free' : 'partial'
            })
            .eq('id', guest.room_id)
        }
      }

      toast.success(`Checkout approved for ${guest.first_name}!`)
      setSelectedReq(null)
      await fetchData()
    } catch (e: any) {
      console.error(e)
      toast.error('Error approving checkout request')
    }
  }

  // Count states
  const totalCount = requests.length
  const pendingCount = requests.filter(r => r.approval_status === 'pending').length
  const approvedCount = requests.filter(r => r.approval_status === 'approved').length
  const rejectedCount = requests.filter(r => r.approval_status === 'rejected').length
  const checkoutRequestsCount = requests.filter(r => r.checkout_requested).length

  // Filter requests list
  const filteredRequests = requests
    .filter(r => {
      if (activeTab === 'pending') return r.approval_status === 'pending' && !r.checkout_requested
      if (activeTab === 'approved') return r.approval_status === 'approved' && !r.checkout_requested
      if (activeTab === 'rejected') return r.approval_status === 'rejected'
      if (activeTab === 'checkout_requests') return !!r.checkout_requested
      return true
    })
    .filter(r => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return (
        `${r.first_name} ${r.last_name}`.toLowerCase().includes(q) ||
        r.purpose.toLowerCase().includes(q)
      )
    })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="Guest Approvals" subtitle={`${pgName} · Review and onboarding`}>
        <div className="tb-search">
          🔍
          <input
            placeholder="Search by name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </TopBar>

      <div className="content">
        {/* STAT STRIP */}
        <div className="stat-strip" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {[
            { id: 'all', icon: '📋', val: totalCount, label: 'Total Requests', color: 'var(--orange-pale)' },
            { id: 'pending', icon: '⏳', val: pendingCount, label: 'Pending', color: 'var(--amber-pale)' },
            { id: 'checkout_requests', icon: '🚪', val: checkoutRequestsCount, label: 'Checkout Requests', color: '#FEE2E2' },
            { id: 'approved', icon: '✅', val: approvedCount, label: 'Approved', color: 'var(--green-pale)' },
            { id: 'rejected', icon: '❌', val: rejectedCount, label: 'Rejected', color: 'var(--red-pale)' }
          ].map(s => (
            <div
              key={s.id}
              className={`ss-card ${activeTab === s.id ? 'active-filter' : ''}`}
              onClick={() => setActiveTab(s.id as any)}
            >
              <div className="ss-icon" style={{ background: s.color }}>
                {s.icon}
              </div>
              <div>
                <div className="ss-val">{s.val}</div>
                <div className="ss-label">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12" style={{ color: '#A89080' }}>
            Loading approvals...
          </div>
        ) : (
          <div className="approval-layout">
            {/* LEFT: REQUEST CARDS */}
            <div>
              <div className="list-header">
                <div className="list-title">All Requests</div>
              </div>

              {filteredRequests.length === 0 ? (
                <div className="text-center py-12" style={{ color: '#A89080' }}>
                  No requests found.
                </div>
              ) : (
                <div className="appr-cards">
                  {filteredRequests.map(r => {
                    const initials = `${r.first_name[0] || ''}${r.last_name[0] || ''}`.toUpperCase()
                    const isSelected = selectedReq?.id === r.id

                    return (
                      <div
                        key={r.id}
                        className={`appr-card ${isSelected ? 'selected' : ''} ${
                          r.approval_status === 'approved'
                            ? 'approved'
                            : r.approval_status === 'rejected'
                            ? 'rejected'
                            : ''
                        }`}
                        onClick={() => {
                          setSelectedReq(r)
                          setAllocatedRoomId(r.room_id)
                          setIsRejectOpen(false)
                        }}
                      >
                        <div className="ac-top">
                          <div
                            className="ac-av"
                            style={{
                              background: 'linear-gradient(135deg,#F4700A,#FFAA60)'
                            }}
                          >
                            {initials}
                          </div>
                          <div className="ac-info">
                            <div className="ac-name">
                              {r.first_name} {r.last_name}
                            </div>
                            <div className="ac-meta">
                              {r.purpose.charAt(0).toUpperCase() + r.purpose.slice(1)} · Stay:{' '}
                              {r.stay_duration_months} months
                            </div>
                            {r.notes && <div className="ac-ref">Notes: {r.notes}</div>}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div className="ac-status">
                              {r.checkout_requested
                                ? '🚪 Checkout Req'
                                : r.approval_status === 'approved'
                                ? '🟢 Approved'
                                : r.approval_status === 'rejected'
                                ? '🔴 Rejected'
                                : '🟡 Pending'}
                            </div>
                          </div>
                        </div>
                        {r.checkout_requested && (
                          <div className="ac-actions" onClick={e => e.stopPropagation()}>
                            <button className="btn-approve" onClick={() => handleApproveCheckout(r)} style={{ background: '#FEE2E2', color: '#EF4444', borderColor: '#FCA5A5' }}>
                              🚪 Approve Checkout
                            </button>
                          </div>
                        )}
                        {r.approval_status === 'pending' && !r.checkout_requested && (
                          <div className="ac-actions" onClick={e => e.stopPropagation()}>
                            <button className="btn-approve" onClick={() => handleApprove(r)}>
                              ✓ &nbsp;Approve
                            </button>
                            <button className="btn-reject" onClick={() => { setSelectedReq(r); setIsRejectOpen(true) }}>
                              ✕ &nbsp;Reject
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* RIGHT PANEL: DETAIL REVIEW */}
            <div className="detail-panel">
              {selectedReq ? (
                <>
                  <div className="dp-card">
                    <div className="gpp">
                      <div className="gpp-av">
                        {`${selectedReq.first_name[0] || ''}${selectedReq.last_name[0] || ''}`.toUpperCase()}
                      </div>
                      <div className="gpp-name">
                        {selectedReq.first_name} {selectedReq.last_name}
                      </div>
                      <div className="gpp-meta">
                        Gender: {selectedReq.gender} · Stay: {selectedReq.stay_duration_months}{' '}
                        months
                      </div>
                    </div>
                    <div className="dp-card-body">
                      <div className="detail-rows">
                        <div className="dr">
                          <span className="dr-key">Purpose</span>
                          <span className="dr-val">
                            {selectedReq.purpose.toUpperCase()}
                          </span>
                        </div>
                        <div className="dr">
                          <span className="dr-key">Move-in Date</span>
                          <span className="dr-val">{selectedReq.checkin_date || '—'}</span>
                        </div>
                        <div className="dr">
                          <span className="dr-key">Hometown</span>
                          <span className="dr-val">{selectedReq.hometown_city || '—'}</span>
                        </div>
                        <div className="dr">
                          <span className="dr-key">Status</span>
                          <span className="dr-val">
                            {selectedReq.approval_status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {selectedReq.checkout_requested && (
                    <div className="dp-card">
                      <div className="dp-card-hd">
                        <div className="dp-card-title">🚪 Checkout Details</div>
                      </div>
                      <div className="dp-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div className="detail-rows">
                          <div className="dr">
                            <span className="dr-key">Requested Date</span>
                            <span className="dr-val" style={{ color: 'var(--red)' }}>{selectedReq.expected_checkout_date || 'N/A'}</span>
                          </div>
                          <div className="dr">
                            <span className="dr-key">Reason</span>
                            <span className="dr-val">{selectedReq.checkout_reason || 'No reason provided'}</span>
                          </div>
                        </div>
                        <button
                          className="panel-approve"
                          onClick={() => handleApproveCheckout(selectedReq)}
                          style={{ background: 'var(--red)', marginTop: 8 }}
                        >
                          🚪 Approve Checkout / Settle Dues
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedReq.approval_status === 'pending' && !selectedReq.checkout_requested && (
                    <>
                      <div className="dp-card">
                        <div className="dp-card-hd">
                          <div className="dp-card-title">🛏️ Assign Room</div>
                        </div>
                        <div className="dp-card-body">
                          <div className="room-assign-row">
                            {rooms.map(room => {
                              const isFull = room.current_occupancy >= room.capacity
                              const isSelected = allocatedRoomId === room.id
                              return (
                                <div
                                  key={room.id}
                                  className={`ra-room ${isFull ? 'rp-full' : 'free'} ${
                                    isSelected ? 'sel' : ''
                                  }`}
                                  onClick={() => {
                                    if (!isFull) setAllocatedRoomId(room.id)
                                  }}
                                >
                                  {room.room_number} ({room.current_occupancy}/{room.capacity})
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="dp-card">
                        <div className="dp-card-hd">
                          <div className="dp-card-title">⚡ Quick Action</div>
                        </div>
                        <div className="dp-card-body">
                          <button
                            className="panel-approve"
                            onClick={() => handleApprove(selectedReq)}
                          >
                            ✓ &nbsp;Approve & Allocate Room
                          </button>
                          <button
                            className="panel-reject"
                            onClick={() => setIsRejectOpen(!isRejectOpen)}
                          >
                            ✕ &nbsp;Reject Request
                          </button>

                          {isRejectOpen && (
                            <div className="reject-field show">
                              <textarea
                                placeholder="Reason for rejection (optional)..."
                                value={rejectionReason}
                                onChange={e => setRejectionReason(e.target.value)}
                              ></textarea>
                              <button
                                onClick={() => handleReject(selectedReq)}
                                style={{
                                  background: 'var(--red)',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '9px',
                                  padding: '9px',
                                  fontSize: '13px',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                  width: '100%',
                                  marginTop: '7px'
                                }}
                              >
                                Confirm Rejection
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div
                  className="text-center py-12"
                  style={{ color: '#A89080', background: '#fff', borderRadius: '14px' }}
                >
                  Select a request to review details.
                </div>
              )}
            </div>
          </div>
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
          --shadow-md: 0 4px 20px rgba(28,15,5,0.10);
          --r: 14px;
        }

        .tb-search {
          display: flex; align-items: center; gap: 7px; background: var(--bg);
          border: 1px solid var(--border); border-radius: 9px; padding: 7px 13px;
          font-size: 12.5px; color: var(--text-soft); width: 200px;
        }
        .tb-search input { border: none; outline: none; background: transparent; font-size: 13px; width: 100%; color: var(--text); }

        .content { flex: 1; overflow-y: auto; padding: 22px 26px; display: flex; flex-direction: column; gap: 18px; scrollbar-width: thin; }

        .stat-strip { display: grid; grid-template-columns: repeat(4,1fr); gap: 13px; animation: fadeUp 0.35s ease both; }
        .ss-card { background: var(--white); border-radius: var(--r); border: 1px solid var(--border); padding: 14px 16px; display: flex; align-items: center; gap: 12px; box-shadow: var(--shadow-sm); cursor: pointer; transition: all 0.15s; }
        .ss-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
        .ss-card.active-filter { border-color: var(--orange); background: var(--orange-pale); }
        .ss-icon { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
        .ss-val { font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 700; line-height: 1; }
        .ss-label { font-size: 11.5px; color: var(--text-soft); font-weight: 500; margin-top: 2px; }

        .approval-layout { display: grid; grid-template-columns: 1fr 320px; gap: 18px; animation: fadeUp 0.4s 0.15s ease both; }

        .list-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .list-title { font-family: 'Playfair Display', serif; font-size: 15px; font-weight: 700; }

        .appr-cards { display: flex; flex-direction: column; gap: 12px; }

        .appr-card {
          background: var(--white); border: 1.5px solid var(--border);
          border-radius: var(--r); padding: 16px 18px;
          box-shadow: var(--shadow-sm); cursor: pointer;
          transition: all 0.2s; position: relative;
          overflow: hidden;
        }
        .appr-card:hover { border-color: var(--orange-border); box-shadow: var(--shadow-md); transform: translateY(-1px); }
        .appr-card.selected { border-color: var(--orange); box-shadow: 0 0 0 3px rgba(244,112,10,0.12); }
        .appr-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--amber); border-radius: 4px 0 0 4px; }
        .appr-card.approved::before { background: var(--green); }
        .appr-card.rejected::before { background: var(--red); }

        .ac-top { display: flex; align-items: flex-start; gap: 13px; margin-bottom: 12px; }
        .ac-av { width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 800; color: #fff; flex-shrink: 0; }
        .ac-info { flex: 1; }
        .ac-name { font-size: 14.5px; font-weight: 800; color: var(--text); }
        .ac-meta { font-size: 12px; color: var(--text-soft); margin-top: 2px; font-weight: 500; }
        .ac-ref { font-size: 11.5px; color: var(--orange); font-weight: 700; margin-top: 3px; }
        .ac-status { font-size: 11px; font-weight: 800; padding: 3px 9px; border-radius: 20px; margin-top: 4px; display: inline-block; }

        .ac-actions { display: flex; gap: 8px; margin-top: 10px; }
        .btn-approve { flex: 1; background: var(--green-pale); color: var(--green); border: 1.5px solid #A8EDD0; border-radius: 9px; padding: 9px; font-size: 13px; font-weight: 800; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center; gap: 5px; }
        .btn-approve:hover { background: var(--green); color: #fff; border-color: var(--green); }
        .btn-reject { flex: 1; background: var(--red-pale); color: var(--red); border: 1.5px solid #F5C6C5; border-radius: 9px; padding: 9px; font-size: 13px; font-weight: 800; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center; gap: 5px; }
        .btn-reject:hover { background: var(--red); color: #fff; border-color: var(--red); }

        .detail-panel { display: flex; flex-direction: column; gap: 14px; position: sticky; top: 0; }

        .dp-card { background: var(--white); border-radius: var(--r); border: 1px solid var(--border); box-shadow: var(--shadow-sm); overflow: hidden; }
        .dp-card-hd { padding: 13px 16px 11px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
        .dp-card-title { font-family: 'Playfair Display', serif; font-size: 13.5px; font-weight: 700; }
        .dp-card-body { padding: 14px 16px; }

        .gpp { display: flex; flex-direction: column; align-items: center; padding: 20px 16px 16px; background: linear-gradient(160deg, #1C0F05, #3D1F08); }
        .gpp-av { width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; color: #fff; border: 3px solid rgba(255,255,255,0.15); margin-bottom: 10px; background: linear-gradient(135deg,#F4700A,#FFAA60); }
        .gpp-name { font-family: 'Playfair Display', serif; font-size: 17px; font-weight: 800; color: #fff; }
        .gpp-meta { font-size: 12px; color: #C9A882; margin-top: 3px; }

        .detail-rows { display: flex; flex-direction: column; gap: 9px; }
        .dr { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .dr-key { font-size: 11.5px; color: var(--text-soft); font-weight: 500; flex-shrink: 0; }
        .dr-val { font-size: 12px; font-weight: 700; color: var(--text); text-align: right; }

        .room-assign-row { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 8px; }
        .ra-room { border: 1.5px solid var(--border); border-radius: 9px; padding: 6px 11px; font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.15s; color: var(--text-mid); }
        .ra-room.free { border-color: #A8EDD0; background: var(--green-pale); color: var(--green); }
        .ra-room.sel { border-color: var(--orange) !important; background: var(--orange-pale) !important; color: var(--orange) !important; box-shadow: 0 0 0 2px rgba(244,112,10,0.15); }
        .ra-room.rp-full { border-color: #F5C6C5; background: var(--red-pale); color: var(--red); opacity: 0.6; cursor: not-allowed; }

        .panel-approve { background: var(--green); color: #fff; border: none; border-radius: 10px; padding: 11px; font-size: 13.5px; font-weight: 800; cursor: pointer; width: 100%; margin-bottom: 8px; transition: all 0.15s; }
        .panel-approve:hover { background: #17A85F; box-shadow: 0 4px 12px rgba(29,185,112,0.3); }
        .panel-reject { background: var(--red-pale); color: var(--red); border: 1.5px solid #F5C6C5; border-radius: 10px; padding: 11px; font-size: 13.5px; font-weight: 800; cursor: pointer; width: 100%; transition: all 0.15s; }
        .panel-reject:hover { background: var(--red); color: #fff; border-color: var(--red); }

        .reject-field { display: none; }
        .reject-field.show { display: block; }
        .reject-field textarea { width: 100%; border: 1.5px solid var(--border); border-radius: 9px; padding: 10px 12px; font-size: 12.5px; resize: none; height: 72px; outline: none; margin-top: 8px; }
        .reject-field textarea:focus { border-color: var(--red); }

        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}
