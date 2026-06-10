'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface PG {
  id: string
  name: string
  address: string
  city: string
  state: string
  contact_phone: string
  rules: string | null
  amenities: string[]
}

interface Room {
  id: string
  room_number: string
  room_type: string
  capacity: number
  current_occupancy: number
  monthly_rent: number
  amenities: string[]
  floors?: { floor_name: string }
  rows?: { row_name: string }
}

interface Roommate {
  id: string
  first_name: string
  last_name: string
  purpose: string
  checkin_date: string | null
}

interface Notice {
  id: string
  title: string
  body: string
  created_at: string
}

interface GuestDoc {
  id: string
  doc_type: string
  doc_number: string | null
  verification_status: string
}

interface EmergencyContact {
  id: string
  name: string
  relation: string
  phone: string
}

export default function GuestHome() {
  const router = useRouter()
  const supabase = createClient()

  // Navigation
  const [activeScreen, setActiveScreen] = useState<'home' | 'room' | 'refer' | 'profile'>('home')

  // Loading & Data states
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [guest, setGuest] = useState<any>(null)
  const [pg, setPg] = useState<PG | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [roommates, setRoommates] = useState<Roommate[]>([])
  const [notice, setNotice] = useState<Notice | null>(null)
  const [documents, setDocuments] = useState<GuestDoc[]>([])
  const [emergencyContact, setEmergencyContact] = useState<EmergencyContact | null>(null)
  
  // Is showing demo profile warning
  const [isDemoMode, setIsDemoMode] = useState(false)

  // Referral form state
  const [refName, setRefName] = useState('')
  const [refMobile, setRefMobile] = useState('')
  const [refPurpose, setRefPurpose] = useState('student')
  const [refRoomPref, setRefRoomPref] = useState('mine')
  const [refMoveInDate, setRefMoveInDate] = useState('')
  const [refNotes, setRefNotes] = useState('')
  const [submittingReferral, setSubmittingReferral] = useState(false)

  // Change PIN states
  const [isChangePinOpen, setIsChangePinOpen] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [updatingPin, setUpdatingPin] = useState(false)

  // Fetch all data
  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        router.push('/login')
        return
      }
      setUser(authUser)

      const { data: userProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()
      
      setProfile(userProfile)

      // Fetch guest record
      let { data: guestData } = await supabase
        .from('guests')
        .select('*')
        .eq('user_id', authUser.id)
        .eq('status', 'active')
        .maybeSingle()

      if (!guestData) {
        // Fallback to seeding/demo guest if user is superadmin/pgadmin
        console.log('No active guest record found for user. Loading preview guest...')
        setIsDemoMode(true)
        
        // Find seeded Arjun Kapoor
        const { data: arjun } = await supabase
          .from('guests')
          .select('*')
          .eq('first_name', 'Arjun')
          .eq('last_name', 'Kapoor')
          .maybeSingle()
        
        if (arjun) {
          guestData = arjun
        }
      }

      if (guestData) {
        setGuest(guestData)

        // Parallel fetch room, pg, roommates, notice, docs, emergency contacts
        const [pgRes, roomRes, roommatesRes, noticeRes, docsRes, contactRes] = await Promise.all([
          supabase.from('pgs').select('*').eq('id', guestData.pg_id).single(),
          supabase.from('rooms').select('*, floors(floor_name), rows(row_name)').eq('id', guestData.room_id).single(),
          supabase.from('guests').select('*').eq('room_id', guestData.room_id).eq('status', 'active').neq('id', guestData.id),
          supabase.from('notices').select('*').eq('pg_id', guestData.pg_id).eq('status', 'sent').order('created_at', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('guest_documents').select('*').eq('guest_id', guestData.id),
          supabase.from('emergency_contacts').select('*').eq('guest_id', guestData.id).maybeSingle()
        ])

        if (pgRes.data) setPg(pgRes.data as unknown as PG)
        if (roomRes.data) setRoom(roomRes.data as unknown as Room)
        if (roommatesRes.data) setRoommates(roommatesRes.data as unknown as Roommate[])
        if (noticeRes.data) setNotice(noticeRes.data as Notice)
        if (docsRes.data) setDocuments(docsRes.data as GuestDoc[])
        if (contactRes.data) setEmergencyContact(contactRes.data as EmergencyContact)
      }
    } catch (e) {
      console.error('Error fetching guest data:', e)
      toast.error('Failed to load PWA dashboard')
    } finally {
      setLoading(false)
    }
  }

  // Handle Submit Referral
  async function handleSubmitReferral(e: React.FormEvent) {
    e.preventDefault()
    if (!guest || !pg) return
    if (!refName.trim() || !refMobile.trim()) {
      toast.error('Guest Name and Mobile Number are required')
      return
    }

    setSubmittingReferral(true)
    try {
      const parts = refName.trim().split(' ')
      const firstName = parts[0]
      const lastName = parts.slice(1).join(' ') || 'Kapoor' // fallback

      // Store mobile in notes along with notes
      const notesWithMobile = `Mobile: ${refMobile.trim()}\nNotes: ${refNotes.trim()}`

      const { error } = await supabase
        .from('guests')
        .insert({
          pg_id: pg.id,
          room_id: refRoomPref === 'mine' ? guest.room_id : null,
          first_name: firstName,
          last_name: lastName,
          gender: 'male', // default
          purpose: refPurpose,
          checkin_date: refMoveInDate || null,
          status: 'pending',
          approval_status: 'pending',
          referred_by_guest_id: guest.id,
          added_by_user_id: user.id,
          notes: notesWithMobile
        })

      if (error) throw error

      toast.success('Referral submitted successfully!')
      setRefName('')
      setRefMobile('')
      setRefNotes('')
      setRefMoveInDate('')
      setActiveScreen('home')
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Failed to submit referral')
    } finally {
      setSubmittingReferral(false)
    }
  }

  async function handleChangePin(e: React.FormEvent) {
    e.preventDefault()
    if (newPin.length !== 6 || !/^\d+$/.test(newPin)) {
      toast.error('PIN must be exactly 6 digits')
      return
    }
    if (newPin !== confirmPin) {
      toast.error('Confirm PIN does not match New PIN')
      return
    }

    setUpdatingPin(true)
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPin
      })

      if (error) throw error

      toast.success('Your PIN has been successfully updated!')
      setIsChangePinOpen(false)
      setNewPin('')
      setConfirmPin('')
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || 'Failed to update PIN')
    } finally {
      setUpdatingPin(false)
    }
  }

  function handleLogout() {
    supabase.auth.signOut().then(() => {
      router.push('/login')
    })
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#E8DDD4]" style={{ fontFamily: 'inherit' }}>
        <div className="text-center">
          <div style={{ fontSize: 32, marginBottom: 10 }}>📱</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#6B4F38' }}>Loading Guest App...</div>
        </div>
      </div>
    )
  }

  if (!guest) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#E8DDD4]" style={{ padding: 20 }}>
        <div className="bg-[#FAF6F2] rounded-[24px] p-6 max-w-sm w-full text-center border border-[#EDE0D4] shadow-md">
          <div style={{ fontSize: 48, marginBottom: 14 }}>🔍</div>
          <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 800, color: '#1C0F05', marginBottom: 10 }}>
            Profile Not Found
          </h3>
          <p style={{ fontSize: 13, color: '#6B4F38', lineHeight: 1.6, marginBottom: 20 }}>
            Your account ({profile?.email}) is not linked to any active guest record yet. Please contact the PG Admin to onboarding you.
          </p>
          <button
            onClick={handleLogout}
            style={{ background: '#F4700A', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 24px', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}
          >
            Log Out
          </button>
        </div>
      </div>
    )
  }

  const guestName = `${guest.first_name} ${guest.last_name}`
  const initials = guestName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="pwa-wrap">
      {isDemoMode && (
        <div className="demo-banner">
          ⚠️ Viewing Guest PWA as a Platform Preview (Arjun Kapoor Profile)
        </div>
      )}

      {/* PHONE FRAME */}
      <div className="phone">
        {/* STATUS BAR */}
        <div className="status-bar">
          <div className="sb-time">9:41</div>
          <div className="sb-icons">
            <span>●●●</span>
            <span style={{ fontSize: 11 }}>WiFi</span>
            <span>🔋</span>
          </div>
        </div>

        {/* SCREENS CONTAINER */}
        <div className="screens">

          {/* ═══════════ HOME SCREEN ═══════════ */}
          <div className={`screen ${activeScreen === 'home' ? 'active' : ''}`}>
            <div className="home-header">
              <div className="hh-top">
                <div>
                  <div className="hh-greeting">Good Morning 🌅</div>
                  <div className="hh-name">{guestName}</div>
                </div>
                <div className="hh-notif" onClick={() => setActiveScreen('profile')}>
                  <div className="hh-avatar">{initials}</div>
                  <div className="hh-notif-dot"></div>
                </div>
              </div>
              <div className="room-hero">
                <div className="rh-icon">🛏️</div>
                <div className="rh-info">
                  <div className="rh-label">Your Room</div>
                  <div className="rh-room">Room {room?.room_number || 'N/A'}</div>
                  <div className="rh-detail">
                    {room?.floors?.floor_name || 'N/A'} · {room?.rows?.row_name || 'N/A'} · {room?.room_type === 'double' ? 'Double Sharing' : room?.room_type === 'single' ? 'Single Room' : room?.room_type === 'triple' ? 'Triple Sharing' : (room?.room_type === 'quad' || (room?.room_type === 'dormitory' && room?.capacity === 4)) ? '4 Sharing' : 'Dormitory'}
                  </div>
                </div>
                <div className="rh-badge">Active ✓</div>
              </div>
            </div>

            <div className="home-body">
              {/* QUICK ACTIONS */}
              <div>
                <div className="sec-hd">
                  <div className="sec-title">Quick Actions</div>
                </div>
                <div className="quick-actions">
                  <div className="qa-item" onClick={() => setActiveScreen('room')}>
                    <div className="qa-icon" style={{ background: 'var(--orange-pale)' }}>🏠</div>
                    <div className="qa-label">My Room</div>
                  </div>
                  <div className="qa-item" onClick={() => setActiveScreen('refer')}>
                    <div className="qa-icon" style={{ background: 'var(--green-pale)' }}>🔗</div>
                    <div className="qa-label">Refer Guest</div>
                  </div>
                  <div className="qa-item">
                    <div className="qa-icon" style={{ background: 'var(--amber-pale)' }}>🍱</div>
                    <div className="qa-label">Food Menu</div>
                  </div>
                  <div className="qa-item" onClick={() => setActiveScreen('profile')}>
                    <div className="qa-icon" style={{ background: '#EFF6FF' }}>📄</div>
                    <div className="qa-label">My Docs</div>
                  </div>
                </div>
              </div>

              {/* NOTICE */}
              {notice && (
                <div>
                  <div className="sec-hd">
                    <div className="sec-title">📣 Latest Notice</div>
                  </div>
                  <div className="notice-card">
                    <div className="nc-icon">🔔</div>
                    <div>
                      <div className="nc-title">{notice.title}</div>
                      <div className="nc-body">{notice.body}</div>
                      <div className="nc-time">
                        Posted by Admin · {new Date(notice.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ROOMMATES */}
              {roommates.length > 0 && (
                <div>
                  <div className="sec-hd">
                    <div className="sec-title">👫 Roommates</div>
                  </div>
                  <div className="roommates">
                    {roommates.map(rm => {
                      const rmInitials = `${rm.first_name[0]}${rm.last_name[0]}`.toUpperCase()
                      return (
                        <div key={rm.id} className="rm-item">
                          <div className="rm-av" style={{ background: 'linear-gradient(135deg,#1DB970,#5DE89A)' }}>
                            {rmInitials}
                          </div>
                          <div>
                            <div className="rm-name">{rm.first_name} {rm.last_name}</div>
                            <div className="rm-sub">
                              {rm.purpose === 'student' ? 'Student' : rm.purpose === 'working' ? 'Working Professional' : 'Resident'} · Since {rm.checkin_date ? new Date(rm.checkin_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'recently'}
                            </div>
                          </div>
                          <div className="rm-status rm-online"></div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* REFER BANNER */}
              <div className="refer-btn" onClick={() => setActiveScreen('refer')}>
                <div className="rb-icon">🔗</div>
                <div>
                  <div className="rb-title">Know someone looking for PG?</div>
                  <div className="rb-sub">Refer them and help them find a home</div>
                </div>
                <div className="rb-arrow">›</div>
              </div>

              {/* STAY INFO */}
              <div>
                <div className="sec-hd"><div className="sec-title">📋 Stay Info</div></div>
                <div className="info-card">
                  <div className="ic-body">
                    <div className="detail-rows">
                      <div className="dr">
                        <span className="dr-key">Check-in Date</span>
                        <span className="dr-val">
                          {guest.checkin_date ? new Date(guest.checkin_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                        </span>
                      </div>
                      <div className="dr">
                        <span className="dr-key">Duration</span>
                        <span className="dr-val">{guest.stay_duration_months || 6} Months</span>
                      </div>
                      <div className="dr">
                        <span className="dr-key">Monthly Rent</span>
                        <span className="dr-val" style={{ color: 'var(--orange)' }}>₹{guest.monthly_rent || 7500}</span>
                      </div>
                      <div className="dr">
                        <span className="dr-key">PG Name</span>
                        <span className="dr-val">{pg?.name || 'Sunshine Residency'}</span>
                      </div>
                      <div className="dr">
                        <span className="dr-key">City</span>
                        <span className="dr-val">{pg?.city || 'Mumbai'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* BOTTOM NAV */}
            <div className="bottom-nav">
              <div className="bn-item active" onClick={() => setActiveScreen('home')}>
                <div className="bn-icon">🏠</div>
                <div className="bn-label">Home</div>
              </div>
              <div className="bn-item" onClick={() => setActiveScreen('room')}>
                <div className="bn-icon">🛏️</div>
                <div className="bn-label">My Room</div>
              </div>
              <div className="bn-item" onClick={() => setActiveScreen('refer')}>
                <div className="bn-icon">🔗</div>
                <div className="bn-label">Refer</div>
              </div>
              <div className="bn-item" onClick={() => setActiveScreen('profile')}>
                <div className="bn-icon">👤</div>
                <div className="bn-label">Profile</div>
              </div>
            </div>
          </div>

          {/* ═══════════ MY ROOM SCREEN ═══════════ */}
          <div className={`screen ${activeScreen === 'room' ? 'active' : ''}`}>
            <div className="rs-header">
              <div className="rs-hd-top">
                <div className="rs-back" onClick={() => setActiveScreen('home')}>←</div>
                <div className="rs-hd-title">My Room</div>
              </div>
              <div className="room-big-card">
                <div className="rbc-top">
                  <div className="rbc-num">{room?.room_number || '104'}</div>
                  <div className="rbc-badge">✓ Active</div>
                </div>
                <div className="rbc-details">
                  <div className="rbc-item"><div className="rbc-item-label">Floor</div><div className="rbc-item-val">{room?.floors?.floor_name || '1st Floor'}</div></div>
                  <div className="rbc-item"><div className="rbc-item-label">Row</div><div className="rbc-item-val">{room?.rows?.row_name || 'Row A'}</div></div>
                  <div className="rbc-item"><div className="rbc-item-label">Type</div><div className="rbc-item-val">{room?.room_type === 'double' ? 'Double Sharing' : room?.room_type === 'single' ? 'Single Room' : room?.room_type === 'triple' ? 'Triple Sharing' : (room?.room_type === 'quad' || (room?.room_type === 'dormitory' && room?.capacity === 4)) ? '4 Sharing' : 'Dormitory'}</div></div>
                  <div className="rbc-item"><div className="rbc-item-label">Occupancy</div><div className="rbc-item-val">{room?.current_occupancy || 1} / {room?.capacity || 2}</div></div>
                </div>
              </div>
            </div>
            <div className="rs-body">
              <div className="info-card">
                <div className="ic-hd"><div className="ic-title">🛋️ Room Details</div></div>
                <div className="ic-body">
                  <div className="detail-rows">
                    <div className="dr"><span className="dr-key">Room Number</span><span className="dr-val">{room?.room_number || '104'}</span></div>
                    <div className="dr"><span className="dr-key">Floor</span><span className="dr-val">{room?.floors?.floor_name || '1st Floor'}</span></div>
                    <div className="dr"><span className="dr-key">Row / Wing</span><span className="dr-val">{room?.rows?.row_name || 'Row A'}</span></div>
                    <div className="dr"><span className="dr-key">Capacity</span><span className="dr-val">{room?.capacity || 2} Guests</span></div>
                    <div className="dr"><span className="dr-key">Monthly Rent</span><span className="dr-val" style={{ color: 'var(--orange)' }}>₹{room?.monthly_rent || 7500}</span></div>
                  </div>
                  {room?.amenities && room.amenities.length > 0 && (
                    <div className="amenity-chips" style={{ marginTop: 12 }}>
                      {room.amenities.map(a => (
                        <div key={a} className="achip">⚙️ {a}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {roommates.length > 0 && (
                <div className="info-card">
                  <div className="ic-hd"><div className="ic-title">👫 Roommates</div></div>
                  <div className="ic-body">
                    <div className="roommates">
                      {roommates.map(rm => (
                        <div key={rm.id} className="rm-item" style={{ border: 'none', padding: 0 }}>
                          <div className="rm-av" style={{ background: 'linear-gradient(135deg,#1DB970,#5DE89A)' }}>
                            {rm.first_name[0]}{rm.last_name[0]}
                          </div>
                          <div>
                            <div className="rm-name">{rm.first_name} {rm.last_name}</div>
                            <div className="rm-sub">{rm.purpose === 'working' ? 'Working' : 'Student'} · Since {rm.checkin_date ? new Date(rm.checkin_date).toLocaleDateString('en-IN', { month: 'short' }) : 'recently'}</div>
                          </div>
                          <div className="rm-status rm-online"></div>
                        </div>
                      ))}
                    </div>
                    {room && room.current_occupancy < room.capacity && (
                      <div
                        style={{ marginTop: 12, padding: '11px 13px', background: 'var(--orange-pale)', border: '1.5px dashed var(--orange-border)', borderRadius: 11, textAlign: 'center', cursor: 'pointer' }}
                        onClick={() => setActiveScreen('refer')}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange)' }}>＋ Refer a Guest for this Room</div>
                        <div style={{ fontSize: 11, color: 'var(--text-mid)', marginTop: 2 }}>Bed available · sharing room</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="info-card">
                <div className="ic-hd"><div className="ic-title">📍 PG Details</div></div>
                <div className="ic-body">
                  <div className="detail-rows">
                    <div className="dr"><span className="dr-key">PG Name</span><span className="dr-val">{pg?.name || 'Sunshine Residency'}</span></div>
                    <div className="dr"><span className="dr-key">Address</span><span className="dr-val" style={{ textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{pg?.address || 'Andheri West, Mumbai'}</span></div>
                    <div className="dr"><span className="dr-key">Admin Contact</span><span className="dr-val" style={{ color: 'var(--orange)' }}>📞 {pg?.contact_phone || '9876543210'}</span></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bottom-nav">
              <div className="bn-item" onClick={() => setActiveScreen('home')}><div className="bn-icon">🏠</div><div className="bn-label">Home</div></div>
              <div className="bn-item active" onClick={() => setActiveScreen('room')}><div className="bn-icon">🛏️</div><div className="bn-label">My Room</div></div>
              <div className="bn-item" onClick={() => setActiveScreen('refer')}><div className="bn-icon">🔗</div><div className="bn-label">Refer</div></div>
              <div className="bn-item" onClick={() => setActiveScreen('profile')}><div className="bn-icon">👤</div><div className="bn-label">Profile</div></div>
            </div>
          </div>

          {/* ═══════════ REFER SCREEN ═══════════ */}
          <div className={`screen ${activeScreen === 'refer' ? 'active' : ''}`}>
            <div className="refer-hd">
              <div className="rs-hd-top">
                <div className="rs-back" onClick={() => setActiveScreen('home')}>←</div>
                <div className="rs-hd-title">Refer a Guest</div>
              </div>
              <div style={{ fontSize: 12.5, color: '#C9A882', marginTop: 6 }}>Fill details · Admin will review and approve</div>
            </div>
            <form className="refer-form" onSubmit={handleSubmitReferral}>
              <div className="ref-info-banner">
                <div className="rib-icon">💡</div>
                <div className="rib-text">
                  You&apos;re referring someone to <strong>{pg?.name || 'Sunshine Residency'}</strong>. The PG admin will review and approve the guest before they can move in.
                </div>
              </div>
              <div className="field">
                <label>Guest Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Rohit Sharma"
                  value={refName}
                  onChange={e => setRefName(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label>Mobile Number *</label>
                <input
                  type="tel"
                  placeholder="98765 XXXXX"
                  value={refMobile}
                  onChange={e => setRefMobile(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label>Purpose of Stay *</label>
                <select value={refPurpose} onChange={e => setRefPurpose(e.target.value)}>
                  <option value="student">Student</option>
                  <option value="working">Working Professional</option>
                  <option value="medical">Medical</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="field">
                <label>Preferred Room</label>
                <select value={refRoomPref} onChange={e => setRefRoomPref(e.target.value)}>
                  <option value="mine">Same as mine (Room {room?.room_number || '104'})</option>
                  <option value="any">Any available room</option>
                  <option value="admin">Let admin decide</option>
                </select>
              </div>
              <div className="field">
                <label>Expected Move-in Date</label>
                <input
                  type="date"
                  value={refMoveInDate}
                  onChange={e => setRefMoveInDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Additional Note</label>
                <textarea
                  placeholder="Anything the admin should know about this guest…"
                  value={refNotes}
                  onChange={e => setRefNotes(e.target.value)}
                />
              </div>
              <button className="submit-btn" type="submit" disabled={submittingReferral}>
                {submittingReferral ? 'Submitting...' : '🔗 Submit Referral'}
              </button>
            </form>

            <div className="bottom-nav">
              <div className="bn-item" onClick={() => setActiveScreen('home')}><div className="bn-icon">🏠</div><div className="bn-label">Home</div></div>
              <div className="bn-item" onClick={() => setActiveScreen('room')}><div className="bn-icon">🛏️</div><div className="bn-label">My Room</div></div>
              <div className="bn-item active" onClick={() => setActiveScreen('refer')}><div className="bn-icon">🔗</div><div className="bn-label">Refer</div></div>
              <div className="bn-item" onClick={() => setActiveScreen('profile')}><div className="bn-icon">👤</div><div className="bn-label">Profile</div></div>
            </div>
          </div>

          {/* ═══════════ PROFILE SCREEN ═══════════ */}
          <div className={`screen ${activeScreen === 'profile' ? 'active' : ''}`}>
            <div className="prof-header">
              <div className="prof-av">{initials}</div>
              <div className="prof-name">{guestName}</div>
              <div className="prof-pg">{pg?.name || 'Sunshine Residency'} · {pg?.city || 'Mumbai'}</div>
              <div className="prof-room-badge">🛏️ Room {room?.room_number || '104'} · Active</div>
            </div>
            <div className="prof-body">
              <div className="prof-section">
                <div className="ps-item">
                  <div className="ps-ic" style={{ background: 'var(--orange-pale)' }}>👤</div>
                  <div className="ps-label">Personal Details</div>
                  <div className="ps-arrow">›</div>
                </div>
                <div className="ps-item">
                  <div className="ps-ic" style={{ background: 'var(--green-pale)' }}>🪪</div>
                  <div className="ps-label">ID Documents</div>
                  <div className="ps-val">
                    {documents.length > 0
                      ? `${documents[0].doc_type.toUpperCase()} (${documents[0].verification_status})`
                      : 'Not uploaded'}
                  </div>
                  <div className="ps-arrow">›</div>
                </div>
                <div className="ps-item">
                  <div className="ps-ic" style={{ background: 'var(--amber-pale)' }}>🆘</div>
                  <div className="ps-label">Emergency Contact</div>
                  <div className="ps-val">{emergencyContact ? `${emergencyContact.name} (${emergencyContact.relation})` : 'Not added'}</div>
                  <div className="ps-arrow">›</div>
                </div>
              </div>

              <div className="prof-section">
                <div className="ps-item" onClick={() => setActiveScreen('room')}>
                  <div className="ps-ic" style={{ background: 'var(--orange-pale)' }}>🛏️</div>
                  <div className="ps-label">My Room</div>
                  <div className="ps-val">Room {room?.room_number || '104'}</div>
                  <div className="ps-arrow">›</div>
                </div>
                <div className="ps-item">
                  <div className="ps-ic" style={{ background: 'var(--green-pale)' }}>📅</div>
                  <div className="ps-label">Check-in Date</div>
                  <div className="ps-val">
                    {guest.checkin_date ? new Date(guest.checkin_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                  </div>
                  <div className="ps-arrow">›</div>
                </div>
                <div className="ps-item">
                  <div className="ps-ic" style={{ background: '#EFF6FF' }}>💰</div>
                  <div className="ps-label">Monthly Rent</div>
                  <div className="ps-val" style={{ color: 'var(--orange)' }}>₹{guest.monthly_rent || 7500}</div>
                  <div className="ps-arrow">›</div>
                </div>
              </div>

              <div className="prof-section">
                <div className="ps-item">
                  <div className="ps-ic" style={{ background: 'var(--red-pale)' }}>🔔</div>
                  <div className="ps-label">Notifications</div>
                  <div className="ps-arrow">›</div>
                </div>
                <div className="ps-item" onClick={() => setIsChangePinOpen(true)}>
                  <div className="ps-ic" style={{ background: 'var(--orange-pale)' }}>🔑</div>
                  <div className="ps-label">Change Login PIN</div>
                  <div className="ps-arrow">›</div>
                </div>
                <div className="ps-item" onClick={handleLogout}>
                  <div className="ps-ic" style={{ background: '#F0EDE8' }}>🚪</div>
                  <div className="ps-label">Sign Out</div>
                  <div className="ps-arrow">›</div>
                </div>
              </div>

              <button className="logout-btn" onClick={handleLogout}>🚪 &nbsp;Log Out</button>
            </div>

            <div className="bottom-nav">
              <div className="bn-item" onClick={() => setActiveScreen('home')}><div className="bn-icon">🏠</div><div className="bn-label">Home</div></div>
              <div className="bn-item" onClick={() => setActiveScreen('room')}><div className="bn-icon">🛏️</div><div className="bn-label">My Room</div></div>
              <div className="bn-item" onClick={() => setActiveScreen('refer')}><div className="bn-icon">🔗</div><div className="bn-label">Refer</div></div>
              <div className="bn-item active" onClick={() => setActiveScreen('profile')}><div className="bn-icon">👤</div><div className="bn-label">Profile</div></div>
            </div>
          </div>

        </div>{/* /screens */}

        {/* CHANGE PIN DRAWER (MOBILE SHEET) */}
        {isChangePinOpen && (
          <div className="drawer-overlay open" onClick={() => setIsChangePinOpen(false)} style={{ zIndex: 999 }}></div>
        )}
        <div className={`pwa-sheet ${isChangePinOpen ? 'open' : ''}`}>
          <div className="sheet-hd">
            <div className="sheet-title">🔑 Update Login PIN</div>
            <div className="sheet-close" onClick={() => setIsChangePinOpen(false)}>✕</div>
          </div>
          <form className="sheet-body" onSubmit={handleChangePin}>
            <p style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 14, lineHeight: 1.4 }}>
              Set a new 6-digit passcode PIN to login to your guest portal.
            </p>
            <div className="field">
              <label>New 6-digit PIN</label>
              <input
                type="password"
                maxLength={6}
                placeholder="••••••"
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label>Confirm PIN</label>
              <input
                type="password"
                maxLength={6}
                placeholder="••••••"
                value={confirmPin}
                onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>
            <button 
              type="submit" 
              className="sheet-btn" 
              disabled={updatingPin}
              style={{ marginTop: 16 }}
            >
              {updatingPin ? 'Updating PIN...' : 'Save New PIN'}
            </button>
          </form>
        </div>

      </div>{/* /phone */}

      <style>{`
        .pwa-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: #E8DDD4;
          padding: 20px;
          font-family: inherit;
        }

        .demo-banner {
          background: #F5A623;
          color: #1C0F05;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 800;
          margin-bottom: 15px;
          text-align: center;
          box-shadow: var(--shadow-sm);
        }

        /* PHONE FRAME */
        .phone {
          width: 390px;
          height: 820px;
          background: var(--bg);
          border-radius: 44px;
          box-shadow: 0 30px 80px rgba(28,15,5,0.35), 0 0 0 10px #1C0F05, 0 0 0 12px #333;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        /* STATUS BAR */
        .status-bar {
          background: #1C0F05;
          padding: 12px 24px 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
        }
        .sb-time { font-size: 14px; font-weight: 800; color: #fff; }
        .sb-icons { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #fff; }

        /* SCREEN CONTAINER */
        .screens { flex: 1; overflow: hidden; position: relative; }
        .screen { position: absolute; inset: 0; overflow-y: auto; display: none; flex-direction: column; }
        .screen.active { display: flex; }
        .screen::-webkit-scrollbar { display: none; }

        /* HOME SCREEN */
        .home-header {
          background: linear-gradient(160deg, #1C0F05 0%, #3D1F08 100%);
          padding: 18px 22px 28px;
          flex-shrink: 0;
          position: relative;
          overflow: hidden;
        }
        .home-header::after {
          content: '🏠';
          position: absolute; right: 16px; bottom: -8px;
          font-size: 80px; opacity: 0.08;
        }
        .hh-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .hh-greeting { font-size: 12px; color: #A07858; font-weight: 600; }
        .hh-name { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 800; color: #fff; margin-top: 2px; }
        .hh-avatar { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, var(--orange), #FF6B00); display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 800; color: #fff; border: 2px solid rgba(255,255,255,0.2); cursor: pointer; }
        .hh-notif { position: relative; }
        .hh-notif-dot { position: absolute; top: -2px; right: -2px; width: 8px; height: 8px; background: var(--orange); border-radius: 50%; border: 1.5px solid #1C0F05; }

        /* ROOM CARD HERO */
        .room-hero {
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 14px;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .rh-icon { width: 46px; height: 46px; background: var(--orange); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; }
        .rh-info {}
        .rh-label { font-size: 10px; color: #A07858; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; }
        .rh-room { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 800; color: #fff; line-height: 1; margin-top: 2px; }
        .rh-detail { font-size: 11.5px; color: #C9A882; margin-top: 3px; }
        .rh-badge { margin-left: auto; background: var(--green); color: #fff; font-size: 10.5px; font-weight: 800; padding: 4px 10px; border-radius: 20px; flex-shrink: 0; }

        /* SCROLL CONTENT */
        .home-body { flex: 1; padding: 18px 18px 80px; display: flex; flex-direction: column; gap: 16px; }

        /* QUICK ACTIONS */
        .quick-actions { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; }
        .qa-item { display: flex; flex-direction: column; align-items: center; gap: 6px; cursor: pointer; }
        .qa-icon { width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 22px; transition: transform 0.15s; }
        .qa-item:hover .qa-icon { transform: scale(1.08); }
        .qa-label { font-size: 10.5px; font-weight: 700; color: var(--text-mid); text-align: center; line-height: 1.2; }

        /* SECTION HEADER */
        .sec-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .sec-title { font-family: 'Playfair Display', serif; font-size: 15px; font-weight: 700; color: var(--text); }
        .sec-link { font-size: 12px; color: var(--orange); font-weight: 700; cursor: pointer; }

        /* NOTICE CARD */
        .notice-card {
          background: linear-gradient(135deg, var(--orange-pale), #FFE4CC);
          border: 1.5px solid var(--orange-border);
          border-radius: var(--r); padding: 14px 16px;
          display: flex; gap: 12px; align-items: flex-start;
        }
        .nc-icon { font-size: 22px; flex-shrink: 0; }
        .nc-title { font-size: 13px; font-weight: 800; color: var(--text); }
        .nc-body { font-size: 12px; color: var(--text-mid); margin-top: 3px; line-height: 1.4; }
        .nc-time { font-size: 10.5px; color: var(--text-soft); margin-top: 6px; font-weight: 600; }

        /* ROOMMATES */
        .roommates { display: flex; flex-direction: column; gap: 9px; }
        .rm-item { display: flex; align-items: center; gap: 11px; padding: 10px 13px; background: var(--white); border-radius: 12px; border: 1px solid var(--border); }
        .rm-av { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; color: #fff; flex-shrink: 0; }
        .rm-name { font-size: 13px; font-weight: 700; color: var(--text); }
        .rm-sub { font-size: 11px; color: var(--text-soft); margin-top: 1px; }
        .rm-status { margin-left: auto; width: 8px; height: 8px; border-radius: 50%; }
        .rm-online { background: var(--green); }
        .rm-offline { background: #D0C4BA; }

        /* REFER BUTTON */
        .refer-btn {
          background: linear-gradient(135deg, var(--orange) 0%, #FF6B00 100%);
          border-radius: var(--r); padding: 16px 18px;
          display: flex; align-items: center; gap: 14px;
          cursor: pointer; transition: all 0.15s;
          box-shadow: 0 4px 18px rgba(244,112,10,0.3);
        }
        .refer-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(244,112,10,0.35); }
        .rb-icon { font-size: 28px; }
        .rb-title { font-size: 14px; font-weight: 800; color: #fff; }
        .rb-sub { font-size: 11.5px; color: rgba(255,255,255,0.75); margin-top: 2px; }
        .rb-arrow { margin-left: auto; color: rgba(255,255,255,0.6); font-size: 18px; }

        /* BOTTOM NAV */
        .bottom-nav {
          position: absolute; bottom: 0; left: 0; right: 0;
          background: var(--white);
          border-top: 1px solid var(--border);
          display: flex;
          padding: 10px 0 14px;
          z-index: 50;
        }
        .bn-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; transition: all 0.15s; }
        .bn-icon { font-size: 20px; transition: transform 0.15s; }
        .bn-item.active .bn-icon { transform: scale(1.1); }
        .bn-label { font-size: 10px; font-weight: 700; color: var(--text-soft); }
        .bn-item.active .bn-label { color: var(--orange); }

        /* MY ROOM SCREEN */
        .rs-header { background: linear-gradient(160deg, #1C0F05, #3D1F08); padding: 18px 22px 22px; }
        .rs-hd-top { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
        .rs-back { width: 32px; height: 32px; border-radius: 9px; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 14px; color: #fff; cursor: pointer; }
        .rs-hd-title { font-family: 'Playfair Display', serif; font-size: 17px; font-weight: 800; color: #fff; }

        .room-big-card { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 16px 18px; }
        .rbc-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .rbc-num { font-family: 'Playfair Display', serif; font-size: 36px; font-weight: 800; color: #fff; }
        .rbc-badge { background: var(--green); color: #fff; font-size: 11px; font-weight: 800; padding: 4px 12px; border-radius: 20px; }
        .rbc-details { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .rbc-item { background: rgba(255,255,255,0.07); border-radius: 10px; padding: 10px 12px; }
        .rbc-item-label { font-size: 9.5px; color: #A07858; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; }
        .rbc-item-val { font-size: 13px; font-weight: 800; color: #fff; margin-top: 3px; }

        .rs-body { padding: 18px 18px 80px; display: flex; flex-direction: column; gap: 16px; }

        .info-card { background: var(--white); border-radius: var(--r); border: 1px solid var(--border); overflow: hidden; }
        .ic-hd { padding: 13px 16px 11px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
        .ic-title { font-family: 'Playfair Display', serif; font-size: 14px; font-weight: 700; }
        .ic-body { padding: 14px 16px; }

        .detail-rows { display: flex; flex-direction: column; gap: 10px; }
        .dr { display: flex; align-items: center; justify-content: space-between; }
        .dr-key { font-size: 12.5px; color: var(--text-soft); font-weight: 500; }
        .dr-val { font-size: 12.5px; font-weight: 700; color: var(--text); }

        .amenity-chips { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
        .achip { background: var(--orange-pale); color: var(--orange); border-radius: 20px; padding: 5px 11px; font-size: 11.5px; font-weight: 700; }

        /* REFER SCREEN */
        .refer-hd { background: linear-gradient(160deg, #1C0F05, #3D1F08); padding: 18px 22px 22px; }
        .refer-form { padding: 18px 18px 80px; display: flex; flex-direction: column; gap: 14px; }
        .field { display: flex; flex-direction: column; gap: 5px; }
        .field label { font-size: 11px; font-weight: 800; color: var(--text-mid); text-transform: uppercase; letter-spacing: 0.8px; }
        .field input, .field select, .field textarea {
          border: 1.5px solid var(--border); border-radius: 11px;
          padding: 12px 14px; font-size: 14px; font-family: inherit;
          color: var(--text); background: var(--white); outline: none; transition: border-color 0.15s;
        }
        .field input:focus, .field select:focus, .field textarea:focus { border-color: var(--orange); box-shadow: 0 0 0 3px rgba(244,112,10,0.10); }
        .field textarea { resize: none; height: 80px; font-size: 13px; }
        .submit-btn { background: var(--orange); color: #fff; border: none; border-radius: 13px; padding: 15px; font-size: 15px; font-weight: 800; cursor: pointer; font-family: inherit; width: 100%; transition: all 0.15s; }
        .submit-btn:hover { background: var(--orange-hover); }

        .ref-info-banner { background: var(--orange-pale); border: 1.5px solid var(--orange-border); border-radius: 13px; padding: 14px 16px; display: flex; gap: 12px; align-items: flex-start; }
        .rib-icon { font-size: 22px; flex-shrink: 0; }
        .rib-text { font-size: 12.5px; font-weight: 600; color: var(--text-mid); line-height: 1.5; }

        /* PROFILE SCREEN */
        .prof-header { background: linear-gradient(160deg, #1C0F05, #3D1F08); padding: 18px 22px 28px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .prof-av { width: 72px; height: 72px; border-radius: 50%; background: linear-gradient(135deg, var(--orange), #FF6B00); display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 800; color: #fff; border: 3px solid rgba(255,255,255,0.2); }
        .prof-name { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 800; color: #fff; }
        .prof-pg { font-size: 12.5px; color: #C9A882; }
        .prof-room-badge { background: rgba(244,112,10,0.25); border: 1px solid rgba(244,112,10,0.4); color: var(--orange-light); font-size: 12px; font-weight: 700; padding: 5px 14px; border-radius: 20px; margin-top: 2px; }

        .prof-body { padding: 18px 18px 80px; display: flex; flex-direction: column; gap: 12px; }
        .prof-section { background: var(--white); border-radius: var(--r); border: 1px solid var(--border); overflow: hidden; }
        .ps-item { display: flex; align-items: center; gap: 13px; padding: 13px 16px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.15s; }
        .ps-item:last-child { border-bottom: none; }
        .ps-item:hover { background: var(--orange-pale); }
        .ps-ic { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
        .ps-label { font-size: 13.5px; font-weight: 600; color: var(--text); flex: 1; }
        .ps-val { font-size: 12px; color: var(--text-soft); font-weight: 600; }
        .ps-arrow { color: var(--text-soft); font-size: 12px; }

        .logout-btn { background: var(--red-pale); color: var(--red); border: 1.5px solid #F5C6C5; border-radius: 13px; padding: 14px; font-size: 14px; font-weight: 800; cursor: pointer; font-family: inherit; width: 100%; }

        .pwa-sheet {
          position: absolute; left: 0; right: 0; bottom: 0;
          background: var(--white); border-top: 1px solid var(--border);
          border-radius: 24px 24px 0 0; box-shadow: 0 -10px 30px rgba(0,0,0,0.15);
          transform: translateY(100%); transition: transform 0.3s cubic-bezier(.4,0,.2,1);
          z-index: 1000; padding: 20px;
        }
        .pwa-sheet.open { transform: translateY(0); }
        .sheet-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .sheet-title { font-family: 'Playfair Display', serif; font-size: 16px; font-weight: 800; color: var(--text); }
        .sheet-close { font-size: 16px; color: var(--text-soft); cursor: pointer; }
        .sheet-btn { background: var(--orange); color: #fff; border: none; border-radius: 12px; padding: 12px; font-size: 14px; font-weight: 800; cursor: pointer; width: 100%; transition: background 0.15s; font-family: inherit; }
        .sheet-btn:hover { background: var(--orange-hover); }

        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .home-body > * { animation: fadeUp 0.3s ease both; }
        .home-body > *:nth-child(1) { animation-delay:.05s } 
        .home-body > *:nth-child(2) { animation-delay:.10s }
        .home-body > *:nth-child(3) { animation-delay:.15s } 
        .home-body > *:nth-child(4) { animation-delay:.20s }
        .home-body > *:nth-child(5) { animation-delay:.25s }
      `}</style>
    </div>
  )
}
