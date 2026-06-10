'use client'

import { useState, useEffect, use } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import TopBar from '@/components/layout/TopBar'
import { toast } from 'sonner'
import Link from 'next/link'
import { Guest, Room, GuestDocument, EmergencyContact } from '@/lib/types/database'
import { resetUserPasswordAction } from '@/app/actions/auth'

interface MappedRoom extends Room {
  floor_name: string
  row_name: string
}

interface GuestDetails extends Guest {
  rooms: MappedRoom | null
  guest_documents: GuestDocument[]
  emergency_contacts: EmergencyContact[]
}

export default function GuestProfile() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()

  const [pgId, setPgId] = useState<string | null>(null)
  const [pgName, setPgName] = useState<string>('My PG')
  const [guest, setGuest] = useState<GuestDetails | null>(null)
  const [roommates, setRoommates] = useState<Guest[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'documents' | 'activity'>('overview')

  useEffect(() => {
    if (id) fetchData()
  }, [id])

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

      // Fetch guest details
      const { data: guestData, error: guestErr } = await supabase
        .from('guests')
        .select(`
          *,
          rooms(id, room_number, room_type, capacity, current_occupancy, monthly_rent, amenities, notes, floors(floor_name), rows(row_name)),
          guest_documents(*),
          emergency_contacts(*)
        `)
        .eq('id', id)
        .single()

      if (guestErr || !guestData) {
        toast.error('Guest not found')
        router.push('/pgadmin/guests')
        return
      }

      const mappedGuest = {
        ...guestData,
        rooms: guestData.rooms ? {
          ...guestData.rooms,
          room_type: (guestData.rooms.room_type === 'dormitory' && guestData.rooms.capacity === 4) ? 'quad' : guestData.rooms.room_type,
          floor_name: (guestData.rooms.floors as any)?.floor_name || 'Floor',
          row_name: (guestData.rooms.rows as any)?.row_name || 'Row'
        } : null
      } as GuestDetails

      setGuest(mappedGuest)

      // Fetch roommates
      if (mappedGuest.room_id) {
        const { data: roommatesData } = await supabase
          .from('guests')
          .select('*')
          .eq('room_id', mappedGuest.room_id)
          .eq('status', 'active')
          .neq('id', mappedGuest.id)
        
        setRoommates(roommatesData || [])
      }

    } catch (e: any) {
      console.error(e)
      toast.error('Error loading guest details')
    } finally {
      setLoading(false)
    }
  }

  // Checkout Guest
  async function handleCheckout() {
    if (!guest || !confirm('Are you sure you want to mark this guest as checked out?')) return
    try {
      const { error } = await supabase
        .from('guests')
        .update({
          status: 'checked_out',
          actual_checkout_date: new Date().toISOString().split('T')[0]
        })
        .eq('id', guest.id)

      if (error) throw error

      // Decrement room occupancy
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

      toast.success('Guest checked out successfully')
      await fetchData()
    } catch (e: any) {
      console.error(e)
      toast.error('Error during checkout')
    }
  }

  // Delete Guest
  async function handleDelete() {
    if (!guest || !confirm('Are you sure you want to delete this guest record permanently?')) return
    try {
      const { error } = await supabase.from('guests').delete().eq('id', guest.id)
      if (error) throw error

      // Decrement room occupancy if active
      if (guest.status === 'active' && guest.room_id && guest.rooms) {
        const newOcc = Math.max(0, guest.rooms.current_occupancy - 1)
        await supabase
          .from('rooms')
          .update({
            current_occupancy: newOcc,
            status: newOcc === 0 ? 'free' : 'partial'
          })
          .eq('id', guest.room_id)
      }

      toast.success('Guest record deleted')
      router.push('/pgadmin/guests')
    } catch (e: any) {
      console.error(e)
      toast.error('Error deleting guest')
    }
  }

  // Reset Guest PIN
  async function handleResetPin() {
    if (!guest || !guest.user_id) return
    if (!confirm(`Are you sure you want to reset the login PIN for ${guest.first_name} ${guest.last_name} to "123456"?`)) return
    try {
      const res = await resetUserPasswordAction(guest.user_id)
      if (!res.success) throw new Error(res.error || 'Failed to reset PIN')
      toast.success('PIN has been successfully reset to "123456"!')
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || 'Failed to reset PIN')
    }
  }

  // Verify Doc
  async function handleVerifyDoc(docId: string) {
    try {
      const { error } = await supabase
        .from('guest_documents')
        .update({ verification_status: 'verified' })
        .eq('id', docId)

      if (error) throw error
      toast.success('Document verified')
      await fetchData()
    } catch (e: any) {
      console.error(e)
      toast.error('Error verifying document')
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar title="Guest Profile" subtitle="Loading..." />
        <div className="flex-1 flex items-center justify-center" style={{ color: '#A89080' }}>
          Loading profile...
        </div>
      </div>
    )
  }

  if (!guest) return null

  const initials = `${guest.first_name[0] || ''}${guest.last_name[0] || ''}`.toUpperCase()
  const daysStayed = Math.floor(
    (new Date().getTime() - new Date(guest.created_at).getTime()) / (1000 * 60 * 60 * 24)
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title={guest.first_name + ' ' + guest.last_name} subtitle={`Sunshine Residency · Room ${guest.rooms?.room_number || '—'}`}>
        <button className="tb-btn-ghost" onClick={() => router.push('/pgadmin/guests')}>
          ← Back to List
        </button>
        {guest.status === 'active' && (
          <button className="tb-btn-red" onClick={handleCheckout}>
            🚪 Checkout
          </button>
        )}
      </TopBar>

      <div className="content">
        {/* HERO PROFILE CARD */}
        <div className="profile-hero">
          <div className="ph-body">
            <div className="ph-av-wrap">
              <div className="ph-av">{initials}</div>
              <div
                className="ph-status-dot"
                style={{
                  background:
                    guest.status === 'active'
                      ? 'var(--green)'
                      : guest.status === 'pending'
                      ? 'var(--amber)'
                      : 'var(--red)'
                }}
              ></div>
            </div>
            <div className="ph-info">
              <div className="ph-name">
                {guest.first_name} {guest.last_name}
              </div>
              <div className="ph-meta">
                <div className="ph-meta-item">🎯 {guest.purpose.toUpperCase()}</div>
                <div className="ph-meta-item">🏠 {pgName}</div>
              </div>
              <div className="ph-badges">
                <div
                  className={`ph-badge ${
                    guest.status === 'active'
                      ? 'phb-active'
                      : guest.status === 'pending'
                      ? 'phb-room'
                      : 'phb-type'
                  }`}
                  style={{ background: guest.status === 'active' ? 'rgba(29,185,112,0.25)' : 'rgba(244,112,10,0.25)' }}
                >
                  {guest.status.toUpperCase()}
                </div>
                {guest.rooms && (
                  <div className="ph-badge phb-room">🛏️ Room {guest.rooms.room_number}</div>
                )}
              </div>
            </div>
            <div className="ph-stats">
              <div className="ph-stat">
                <div className="ph-stat-val">₹{guest.monthly_rent?.toLocaleString('en-IN') || '—'}</div>
                <div className="ph-stat-lbl">Monthly Rent</div>
              </div>
              <div className="ph-stat">
                <div className="ph-stat-val">{daysStayed}</div>
                <div className="ph-stat-lbl">Days Stayed</div>
              </div>
            </div>
          </div>
          <div className="ph-tabs">
            <div
              className={`ph-tab ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              👤 Overview
            </div>
            <div
              className={`ph-tab ${activeTab === 'documents' ? 'active' : ''}`}
              onClick={() => setActiveTab('documents')}
            >
              🪪 Documents
            </div>
            <div
              className={`ph-tab ${activeTab === 'activity' ? 'active' : ''}`}
              onClick={() => setActiveTab('activity')}
            >
              📋 Activity
            </div>
          </div>
        </div>

        {/* DETAILS GRID */}
        <div className="main-grid">
          {/* LEFT PANEL */}
          <div>
            {activeTab === 'overview' && (
              <>
                {/* PERSONAL INFO */}
                <div className="card">
                  <div className="card-hd">
                    <div className="card-title">👤 Personal Information</div>
                  </div>
                  <div className="card-body">
                    <div className="detail-grid">
                      <div className="dg-item">
                        <div className="dg-label">Full Name</div>
                        <div className="dg-val">
                          {guest.first_name} {guest.last_name}
                        </div>
                      </div>
                      <div className="dg-item">
                        <div className="dg-label">Gender</div>
                        <div className="dg-val">
                          {guest.gender.charAt(0).toUpperCase() + guest.gender.slice(1)}
                        </div>
                      </div>
                      <div className="dg-item">
                        <div className="dg-label">Date of Birth</div>
                        <div className="dg-val">{guest.dob || '—'}</div>
                      </div>
                      <div className="dg-item">
                        <div className="dg-label">Purpose of Stay</div>
                        <div className="dg-val">
                          {guest.purpose.charAt(0).toUpperCase() + guest.purpose.slice(1)}
                        </div>
                      </div>
                      <div className="dg-item">
                        <div className="dg-label">College / Company</div>
                        <div className="dg-val">{guest.college_or_company || '—'}</div>
                      </div>
                      <div className="dg-item">
                        <div className="dg-label">Hometown</div>
                        <div className="dg-val">{guest.hometown_city || '—'}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ROOM INFO */}
                {guest.rooms && (
                  <div className="card">
                    <div className="card-hd">
                      <div className="card-title">🛏️ Room Allocation</div>
                    </div>
                    <div className="card-body">
                      <div className="room-visual">
                        <div className="rv-icon">🛏️</div>
                        <div>
                          <div className="rv-room">Room {guest.rooms.room_number}</div>
                          <div className="rv-detail">
                            {guest.rooms.floor_name} · {guest.rooms.row_name} · Rent: ₹
                            {guest.rooms.monthly_rent?.toLocaleString('en-IN')}
                          </div>
                        </div>
                      </div>
                      <div className="detail-grid">
                        <div className="dg-item">
                          <div className="dg-label">Room Type</div>
                          <div className="dg-val">{guest.rooms.room_type === 'quad' ? '4 SHARING' : guest.rooms.room_type.toUpperCase()}</div>
                        </div>
                        <div className="dg-item">
                          <div className="dg-label">Occupancy</div>
                          <div className="dg-val">
                            {guest.rooms.current_occupancy} / {guest.rooms.capacity} Beds occupied
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ROOMMATES */}
                {guest.rooms && roommates.length > 0 && (
                  <div className="card">
                    <div className="card-hd">
                      <div className="card-title">👫 Roommates in Room {guest.rooms.room_number}</div>
                    </div>
                    <div className="card-body">
                      {roommates.map(rm => (
                        <div key={rm.id} className="rm-item">
                          <div
                            className="rm-av"
                            style={{ background: 'linear-gradient(135deg,#1DB970,#5DE89A)' }}
                          >
                            {`${rm.first_name[0] || ''}${rm.last_name[0] || ''}`.toUpperCase()}
                          </div>
                          <div>
                            <div className="rm-name">
                              {rm.first_name} {rm.last_name}
                            </div>
                            <div className="rm-sub">
                              {rm.purpose} · Since {rm.checkin_date}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* EMERGENCY CONTACT */}
                {guest.emergency_contacts && guest.emergency_contacts.length > 0 && (
                  <div className="card">
                    <div className="card-hd">
                      <div className="card-title">🆘 Emergency Contact</div>
                    </div>
                    <div className="card-body">
                      {guest.emergency_contacts.map(c => (
                        <div key={c.id} className="detail-grid">
                          <div className="dg-item">
                            <div className="dg-label">Name</div>
                            <div className="dg-val">{c.name}</div>
                          </div>
                          <div className="dg-item">
                            <div className="dg-label">Relation</div>
                            <div className="dg-val">{c.relation.toUpperCase()}</div>
                          </div>
                          <div className="dg-item">
                            <div className="dg-label">Mobile Number</div>
                            <div className="dg-val highlight">{c.phone}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === 'documents' && (
              <div className="card">
                <div className="card-hd">
                  <div className="card-title">🪪 ID & Verification Documents</div>
                </div>
                <div className="card-body">
                  {guest.guest_documents.length === 0 ? (
                    <div className="text-center py-6" style={{ color: '#A89080' }}>
                      No documents uploaded yet.
                    </div>
                  ) : (
                    guest.guest_documents.map(doc => (
                      <div key={doc.id} className="doc-row">
                        <div className="doc-ic">📄</div>
                        <div>
                          <div className="doc-name">{doc.doc_type.toUpperCase()}</div>
                          <div className="doc-sub">
                            Number: {doc.doc_number || '—'}
                          </div>
                        </div>
                        <div
                          className={`doc-status ${
                            doc.verification_status === 'verified' ? 'ds-verified' : 'ds-pending'
                          }`}
                        >
                          {doc.verification_status === 'verified' ? '✓ Verified' : 'Pending'}
                        </div>
                        {doc.verification_status !== 'verified' && (
                          <button
                            className="doc-view"
                            onClick={() => handleVerifyDoc(doc.id)}
                          >
                            ✓ Approve
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === 'activity' && (
              <div className="card">
                <div className="card-hd">
                  <div className="card-title">📋 Activity History</div>
                </div>
                <div className="card-body">
                  <div className="timeline">
                    <div className="tl-item">
                      <div className="tl-dot" style={{ background: 'var(--green-pale)' }}>
                        ✓
                      </div>
                      <div>
                        <div className="tl-title">Stay Active</div>
                        <div className="tl-sub">Guest is currently checked in</div>
                        <div className="tl-time">Check-in: {guest.checkin_date || '—'}</div>
                      </div>
                    </div>
                    <div className="tl-item">
                      <div className="tl-dot" style={{ background: 'var(--green-pale)' }}>
                        ✓
                      </div>
                      <div>
                        <div className="tl-title">Profile Created</div>
                        <div className="tl-sub">Record added by PG Admin</div>
                        <div className="tl-time">
                          {new Date(guest.created_at).toLocaleString('en-IN')}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT PANEL */}
          <div className="right-col">
            <div className="card">
              <div className="card-hd">
                <div className="card-title">📅 Stay Duration</div>
              </div>
              <div className="card-body">
                <div className="detail-grid" style={{ gridTemplateColumns: '1fr' }}>
                  <div className="dg-item">
                    <div className="dg-label">Check-in Date</div>
                    <div className="dg-val green">{guest.checkin_date || '—'}</div>
                  </div>
                  <div className="dg-item">
                    <div className="dg-label">Staying Duration</div>
                    <div className="dg-val">
                      {guest.stay_duration_months
                        ? `${guest.stay_duration_months} Months`
                        : '—'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="danger-zone">
              <div className="dz-hd">⚠️ Administrative Actions</div>
              <div className="dz-body">
                {guest.status === 'active' && (
                  <button className="dz-btn" onClick={handleCheckout}>
                    🚪 Mark as Checked Out
                  </button>
                )}
                {guest.user_id && (
                  <button className="dz-btn" onClick={handleResetPin} style={{ color: '#F4700A', borderColor: '#FFD9B8' }}>
                    🔑 Reset Login PIN to "123456"
                  </button>
                )}
                <button className="dz-btn" onClick={handleDelete}>
                  🗑 Delete Record Permanently
                </button>
              </div>
            </div>
          </div>
        </div>
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

        .tb-btn-ghost {
          background: var(--white); color: var(--text); border: 1px solid var(--border); border-radius: 9px;
          padding: 8px 16px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.15s;
        }
        .tb-btn-ghost:hover { border-color: var(--orange-border); background: var(--orange-pale); }

        .tb-btn-red {
          background: var(--red-pale); color: var(--red); border: 1.5px solid #F5C6C5; border-radius: 9px;
          padding: 8px 14px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.15s;
        }
        .tb-btn-red:hover { background: var(--red); color: #fff; border-color: var(--red); }

        .content { flex: 1; overflow-y: auto; padding: 22px 26px; scrollbar-width: thin; }

        .profile-hero {
          background: linear-gradient(135deg, #1C0F05 0%, #3D1F08 60%, #5C2E0A 100%);
          border-radius: var(--r); padding: 0; overflow: hidden;
          margin-bottom: 20px; box-shadow: var(--shadow-md); animation: fadeUp 0.3s ease both;
        }
        .ph-body { padding: 24px 26px; display: flex; align-items: center; gap: 22px; }
        .ph-av-wrap { position: relative; flex-shrink: 0; }
        .ph-av { width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, var(--orange), #FF6B00); display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 800; color: #fff; border: 3px solid rgba(255,255,255,0.2); }
        .ph-status-dot { position: absolute; bottom: 4px; right: 4px; width: 14px; height: 14px; border-radius: 50%; border: 2.5px solid #1C0F05; }
        .ph-info { flex: 1; }
        .ph-name { font-family: 'Playfair Display', serif; font-size: 26px; font-weight: 800; color: #fff; line-height: 1.1; }
        .ph-meta { font-size: 13px; color: #C9A882; margin-top: 5px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .ph-meta-item { display: flex; align-items: center; gap: 5px; }
        .ph-badges { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
        .ph-badge { font-size: 11.5px; font-weight: 800; padding: 4px 12px; border-radius: 20px; }
        .phb-active { background: rgba(29,185,112,0.25); color: #5DE89A; border: 1px solid rgba(29,185,112,0.3); }
        .phb-room   { background: rgba(244,112,10,0.25); color: var(--orange-light); border: 1px solid rgba(244,112,10,0.3); }
        .phb-type   { background: rgba(255,255,255,0.1); color: #C9A882; border: 1px solid rgba(255,255,255,0.12); }
        .ph-stats { display: flex; gap: 0; flex-shrink: 0; }
        .ph-stat { padding: 0 22px; text-align: center; border-left: 1px solid rgba(255,255,255,0.1); }
        .ph-stat:first-child { border-left: none; }
        .ph-stat-val { font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 800; color: #fff; }
        .ph-stat-lbl { font-size: 10.5px; color: #A07858; font-weight: 600; margin-top: 3px; }

        .ph-tabs { border-top: 1px solid rgba(255,255,255,0.08); display: flex; }
        .ph-tab { flex: 1; padding: 13px 16px; text-align: center; font-size: 12.5px; font-weight: 700; color: #A07858; cursor: pointer; transition: all 0.15s; border-right: 1px solid rgba(255,255,255,0.07); }
        .ph-tab:last-child { border-right: none; }
        .ph-tab:hover { color: #fff; background: rgba(255,255,255,0.04); }
        .ph-tab.active { color: var(--orange-light); background: rgba(244,112,10,0.12); border-bottom: 2px solid var(--orange); }

        .main-grid { display: grid; grid-template-columns: 1fr 320px; gap: 18px; }

        .card { background: var(--white); border-radius: var(--r); border: 1px solid var(--border); box-shadow: var(--shadow-sm); overflow: hidden; margin-bottom: 16px; animation: fadeUp 0.35s ease both; }
        .card-hd { padding: 14px 18px 12px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
        .card-title { font-family: 'Playfair Display', serif; font-size: 14px; font-weight: 700; }
        .card-body { padding: 16px 18px; }

        .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .dg-item { background: var(--bg); border-radius: 10px; padding: 11px 13px; }
        .dg-label { font-size: 10px; font-weight: 800; color: var(--text-soft); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px; }
        .dg-val { font-size: 13px; font-weight: 700; color: var(--text); }
        .dg-val.highlight { color: var(--orange); }
        .dg-val.green { color: var(--green); }
        .dg-val.amber { color: #B87800; }

        .room-visual { background: linear-gradient(135deg, var(--orange-pale), #FFE4CC); border: 1.5px solid var(--orange-border); border-radius: 12px; padding: 16px 18px; display: flex; align-items: center; gap: 16px; margin-bottom: 14px; }
        .rv-icon { width: 52px; height: 52px; background: var(--orange); border-radius: 13px; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; }
        .rv-room { font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 800; color: var(--text); }
        .rv-detail { font-size: 12.5px; color: var(--text-mid); margin-top: 3px; }

        .rm-item { display: flex; align-items: center; gap: 11px; padding: 10px 13px; background: var(--bg); border-radius: 11px; border: 1px solid var(--border); margin-bottom: 8px; }
        .rm-av { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; color: #fff; flex-shrink: 0; }
        .rm-name { font-size: 13px; font-weight: 700; }
        .rm-sub { font-size: 11px; color: var(--text-soft); }

        .doc-row { display: flex; align-items: center; gap: 12px; padding: 11px 13px; background: var(--bg); border-radius: 11px; border: 1px solid var(--border); margin-bottom: 8px; }
        .doc-ic { font-size: 22px; flex-shrink: 0; }
        .doc-name { font-size: 13px; font-weight: 700; color: var(--text); }
        .doc-sub { font-size: 11.5px; color: var(--text-soft); margin-top: 1px; }
        .doc-status { margin-left: auto; font-size: 11px; font-weight: 800; padding: 3px 9px; border-radius: 20px; }
        .ds-verified { background: var(--green-pale); color: var(--green); }
        .ds-pending { background: var(--amber-pale); color: #B87800; }
        .doc-view { margin-left: 8px; background: var(--white); border: 1px solid var(--border); border-radius: 7px; padding: 5px 10px; font-size: 11.5px; font-weight: 700; cursor: pointer; color: var(--text-mid); }

        .right-col { display: flex; flex-direction: column; gap: 16px; }

        .timeline { display: flex; flex-direction: column; gap: 0; }
        .tl-item { display: flex; gap: 13px; padding-bottom: 14px; position: relative; }
        .tl-item:last-child { padding-bottom: 0; }
        .tl-item:not(:last-child)::before { content: ''; position: absolute; left: 14px; top: 30px; bottom: 0; width: 2px; background: var(--border); }
        .tl-dot { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0; }
        .tl-title { font-size: 12.5px; font-weight: 700; color: var(--text); }
        .tl-sub { font-size: 11px; color: var(--text-soft); margin-top: 2px; }
        .tl-time { font-size: 10.5px; color: var(--text-soft); font-weight: 600; }

        .danger-zone { border: 1.5px solid #F5C6C5; border-radius: var(--r); overflow: hidden; }
        .dz-hd { background: var(--red-pale); padding: 12px 16px; font-size: 12px; font-weight: 800; color: var(--red); }
        .dz-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; background: var(--white); }
        .dz-btn { background: var(--white); border: 1.5px solid #F5C6C5; color: var(--red); border-radius: 9px; padding: 10px 14px; font-size: 12.5px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 7px; transition: all 0.15s; width: 100%; text-align: left; }
        .dz-btn:hover { background: var(--red); color: #fff; border-color: var(--red); }

        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}
