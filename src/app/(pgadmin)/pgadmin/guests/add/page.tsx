'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import TopBar from '@/components/layout/TopBar'
import { toast } from 'sonner'
import Link from 'next/link'
import { Room, Floor } from '@/lib/types/database'

interface MappedRoom extends Room {
  floor_name: string
}

export default function AddGuest() {
  const router = useRouter()
  const supabase = createClient()

  const [pgId, setPgId] = useState<string | null>(null)
  const [pgName, setPgName] = useState<string>('My PG')
  const [floors, setFloors] = useState<Floor[]>([])
  const [rooms, setRooms] = useState<MappedRoom[]>([])
  const [loading, setLoading] = useState(true)

  // Personal Info Form states
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male')
  const [mobile, setMobile] = useState('')
  const [dob, setDob] = useState('')
  const [email, setEmail] = useState('')
  const [purpose, setPurpose] = useState<'student' | 'working' | 'medical' | 'other'>('student')
  const [collegeOrCompany, setCollegeOrCompany] = useState('')
  const [hometownCity, setHometownCity] = useState('')

  // Document states
  const [docType, setDocType] = useState<'aadhaar' | 'pan' | 'passport' | 'voter_id' | 'driving_licence'>('aadhaar')
  const [docNumber, setDocNumber] = useState('')

  // Emergency contact states
  const [contactName, setContactName] = useState('')
  const [contactRelation, setContactRelation] = useState<'father' | 'mother' | 'sibling' | 'spouse' | 'friend' | 'other'>('father')
  const [contactMobile, setContactMobile] = useState('')

  // Stay details
  const [checkinDate, setCheckinDate] = useState(() => new Date().toISOString().split('T')[0])
  const [durationMonths, setDurationMonths] = useState(6)
  const [additionalNotes, setAdditionalNotes] = useState('')

  // Room allocation
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [selectedFloorTab, setSelectedFloorTab] = useState<string>('all')

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

      // Fetch floors and rooms
      const [floorsRes, roomsRes] = await Promise.all([
        supabase.from('floors').select('*').eq('pg_id', pg.id).order('floor_number'),
        supabase.from('rooms').select(`
          *,
          floors(floor_name)
        `).eq('pg_id', pg.id).eq('is_active', true).order('room_number')
      ])

      if (floorsRes.error) throw floorsRes.error
      if (roomsRes.error) throw roomsRes.error

      setFloors(floorsRes.data || [])

      const mappedRooms = (roomsRes.data || []).map((r: any) => ({
        ...r,
        floor_name: r.floors?.floor_name || 'Floor'
      })) as MappedRoom[]

      setRooms(mappedRooms)

    } catch (e: any) {
      console.error(e)
      toast.error('Error loading onboarding data')
    } finally {
      setLoading(false)
    }
  }

  // Handle form submission
  async function handleSubmit() {
    if (!firstName.trim() || !lastName.trim() || !mobile.trim()) {
      toast.error('Please fill in Name and Mobile Number')
      return
    }
    if (!selectedRoomId) {
      toast.error('Please allocate a room for the guest')
      return
    }
    if (!pgId) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const room = rooms.find(r => r.id === selectedRoomId)
      if (!room) throw new Error('Selected room not found')

      // 1. Insert Guest
      const { data: guestData, error: guestErr } = await supabase
        .from('guests')
        .insert({
          pg_id: pgId,
          room_id: selectedRoomId,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          gender,
          dob: dob || null,
          purpose,
          college_or_company: collegeOrCompany.trim() || null,
          hometown_city: hometownCity.trim() || null,
          checkin_date: checkinDate,
          stay_duration_months: durationMonths,
          monthly_rent: room.monthly_rent || 7500,
          status: 'active', // Approved directly by admin onboarding
          approval_status: 'approved',
          added_by_user_id: user.id,
          notes: additionalNotes.trim() || null
        })
        .select()
        .single()

      if (guestErr) throw guestErr

      // 2. Insert Emergency Contact
      if (contactName.trim() && contactMobile.trim()) {
        const { error: contactErr } = await supabase
          .from('emergency_contacts')
          .insert({
            guest_id: guestData.id,
            name: contactName.trim(),
            relation: contactRelation,
            phone: contactMobile.trim()
          })
        if (contactErr) throw contactErr
      }

      // 3. Insert Documents
      if (docNumber.trim()) {
        const { error: docErr } = await supabase
          .from('guest_documents')
          .insert({
            guest_id: guestData.id,
            doc_type: docType,
            doc_number: docNumber.trim(),
            verification_status: 'verified' // Auto verified by admin
          })
        if (docErr) throw docErr
      }

      // 4. Update Room occupancy & status
      const newOccupancy = room.current_occupancy + 1
      const newStatus = newOccupancy >= room.capacity ? 'full' : 'partial'
      
      const { error: roomUpdateErr } = await supabase
        .from('rooms')
        .update({
          current_occupancy: newOccupancy,
          status: newStatus
        })
        .eq('id', selectedRoomId)

      if (roomUpdateErr) throw roomUpdateErr

      toast.success(`${firstName} ${lastName} added & Room ${room.room_number} allocated!`)
      router.push('/pgadmin/guests')
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || 'Error onboarding guest')
    }
  }

  // Filter rooms on picker
  const filteredRooms = rooms.filter(r => {
    if (selectedFloorTab === 'all') return true
    return r.floor_id === selectedFloorTab
  })

  const selectedRoom = rooms.find(r => r.id === selectedRoomId)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="Add New Guest" subtitle={`${pgName} · Onboard new resident`}>
        <button className="tb-btn-ghost" onClick={() => router.push('/pgadmin/guests')}>
          Cancel
        </button>
        <button className="tb-btn" onClick={handleSubmit}>
          ✓ &nbsp;Add Guest
        </button>
      </TopBar>

      <div className="content">
        {loading ? (
          <div className="text-center py-12" style={{ color: '#A89080' }}>
            Loading form resources...
          </div>
        ) : (
          <div className="form-layout">
            {/* LEFT: FORM FIELDS */}
            <div className="left-form">
              {/* PERSONAL INFORMATION */}
              <div className="form-card">
                <div className="fc-hd">
                  <div className="fc-icon" style={{ background: 'var(--orange-pale)' }}>
                    👤
                  </div>
                  <div>
                    <div className="fc-title">Personal Information</div>
                    <div className="fc-sub">Basic details of the guest</div>
                  </div>
                </div>
                <div className="fc-body">
                  <div className="field-row">
                    <div className="field">
                      <label>
                        First Name <span className="req">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Arjun"
                        value={firstName}
                        onChange={e => setFirstName(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>
                        Last Name <span className="req">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Kapoor"
                        value={lastName}
                        onChange={e => setLastName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label>
                      Gender <span className="req">*</span>
                    </label>
                    <div className="gender-row">
                      {['male', 'female', 'other'].map(g => (
                        <div
                          key={g}
                          className={`gender-btn ${gender === g ? 'sel' : ''}`}
                          onClick={() => setGender(g as any)}
                        >
                          {g === 'male' ? '👨 Male' : g === 'female' ? '👩 Female' : '⚧ Other'}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="field-row">
                    <div className="field">
                      <label>
                        Mobile Number <span className="req">*</span>
                      </label>
                      <input
                        type="tel"
                        placeholder="e.g. 9876543210"
                        value={mobile}
                        onChange={e => setMobile(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Date of Birth</label>
                      <input type="date" value={dob} onChange={e => setDob(e.target.value)} />
                    </div>
                  </div>

                  <div className="field">
                    <label>Email Address</label>
                    <input
                      type="email"
                      placeholder="arjun@email.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                    />
                  </div>

                  <div className="field">
                    <label>
                      Purpose of Stay <span className="req">*</span>
                    </label>
                    <div className="purpose-row">
                      {[
                        { type: 'student', ic: '🎓', label: 'Student' },
                        { type: 'working', ic: '💼', label: 'Working' },
                        { type: 'medical', ic: '🏥', label: 'Medical' },
                        { type: 'other', ic: '🔹', label: 'Other' }
                      ].map(p => (
                        <div
                          key={p.type}
                          className={`purpose-btn ${purpose === p.type ? 'sel' : ''}`}
                          onClick={() => setPurpose(p.type as any)}
                        >
                          <div className="purpose-ic">{p.ic}</div>
                          <div>{p.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="field-row">
                    <div className="field">
                      <label>College / Company</label>
                      <input
                        type="text"
                        placeholder="e.g. Mumbai University"
                        value={collegeOrCompany}
                        onChange={e => setCollegeOrCompany(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>City / Hometown</label>
                      <input
                        type="text"
                        placeholder="e.g. Pune"
                        value={hometownCity}
                        onChange={e => setHometownCity(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* IDENTITY DOCUMENTS */}
              <div className="form-card">
                <div className="fc-hd">
                  <div className="fc-icon" style={{ background: 'var(--amber-pale)' }}>
                    🪪
                  </div>
                  <div>
                    <div className="fc-title">Identity Proof</div>
                    <div className="fc-sub">Government ID verification details</div>
                  </div>
                </div>
                <div className="fc-body">
                  <div className="field">
                    <label>
                      ID Type <span className="req">*</span>
                    </label>
                    <div className="id-types">
                      {[
                        { type: 'aadhaar', label: 'Aadhaar Card' },
                        { type: 'pan', label: 'PAN Card' },
                        { type: 'passport', label: 'Passport' },
                        { type: 'voter_id', label: 'Voter ID' },
                        { type: 'driving_licence', label: 'Driving Licence' }
                      ].map(id => (
                        <div
                          key={id.type}
                          className={`id-type ${docType === id.type ? 'sel' : ''}`}
                          onClick={() => setDocType(id.type as any)}
                        >
                          {id.label}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <label>
                      ID Number <span className="req">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. XXXX XXXX XXXX"
                      value={docNumber}
                      onChange={e => setDocNumber(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* EMERGENCY CONTACT */}
              <div className="form-card">
                <div className="fc-hd">
                  <div className="fc-icon" style={{ background: 'var(--red-pale)' }}>
                    🆘
                  </div>
                  <div>
                    <div className="fc-title">Emergency Contact</div>
                    <div className="fc-sub">Contact person details</div>
                  </div>
                </div>
                <div className="fc-body">
                  <div className="field-row">
                    <div className="field">
                      <label>
                        Contact Name <span className="req">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Suresh Kapoor"
                        value={contactName}
                        onChange={e => setContactName(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Relation</label>
                      <select
                        value={contactRelation}
                        onChange={e => setContactRelation(e.target.value as any)}
                      >
                        <option value="father">Father</option>
                        <option value="mother">Mother</option>
                        <option value="sibling">Sibling</option>
                        <option value="spouse">Spouse</option>
                        <option value="friend">Friend</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="field">
                    <label>
                      Mobile Number <span className="req">*</span>
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. 9876500000"
                      value={contactMobile}
                      onChange={e => setContactMobile(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* STAY DETAILS */}
              <div className="form-card">
                <div className="fc-hd">
                  <div className="fc-icon" style={{ background: 'var(--green-pale)' }}>
                    📅
                  </div>
                  <div>
                    <div className="fc-title">Check-in Details</div>
                    <div className="fc-sub">Stay duration and check-in date</div>
                  </div>
                </div>
                <div className="fc-body">
                  <div className="field-row">
                    <div className="field">
                      <label>
                        Check-in Date <span className="req">*</span>
                      </label>
                      <input
                        type="date"
                        value={checkinDate}
                        onChange={e => setCheckinDate(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Expected Stay Duration</label>
                      <select
                        value={durationMonths}
                        onChange={e => setDurationMonths(Number(e.target.value))}
                      >
                        <option value="1">1 Month</option>
                        <option value="3">3 Months</option>
                        <option value="6">6 Months</option>
                        <option value="12">12 Months</option>
                      </select>
                    </div>
                  </div>
                  <div className="field">
                    <label>Additional Notes</label>
                    <textarea
                      placeholder="Any special requests or instructions..."
                      value={additionalNotes}
                      onChange={e => setAdditionalNotes(e.target.value)}
                    ></textarea>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT: ROOM ALLOCATION AND SUMMARY */}
            <div className="right-col">
              <div className="room-picker-card">
                <div className="rpc-hd">
                  <div className="rpc-title">🏠 Allocate Room</div>
                </div>
                <div className="rpc-body">
                  <div className="floor-tabs">
                    <div
                      className={`ftab ${selectedFloorTab === 'all' ? 'active' : ''}`}
                      onClick={() => setSelectedFloorTab('all')}
                    >
                      All
                    </div>
                    {floors.map(f => (
                      <div
                        key={f.id}
                        className={`ftab ${selectedFloorTab === f.id ? 'active' : ''}`}
                        onClick={() => setSelectedFloorTab(f.id)}
                      >
                        {f.floor_name.replace(/Floor/i, '')}
                      </div>
                    ))}
                  </div>

                  <div className="rp-grid">
                    {filteredRooms.map(r => {
                      const isFull = r.current_occupancy >= r.capacity
                      const isPartial = r.current_occupancy > 0 && !isFull
                      const isSelected = selectedRoomId === r.id

                      const statusClass = isFull
                        ? 'rp-full'
                        : isPartial
                        ? 'rp-partial'
                        : 'rp-free'

                      return (
                        <div
                          key={r.id}
                          className={`rp-room ${statusClass} ${isSelected ? 'picked' : ''}`}
                          onClick={() => {
                            if (!isFull) setSelectedRoomId(r.id)
                          }}
                        >
                          <div className="rp-num">{r.room_number}</div>
                          <div className="rp-cap">
                            {r.current_occupancy}/{r.capacity}
                          </div>
                        </div>
                      )})}
                  </div>

                  {selectedRoom && (
                    <div className="selected-room-info">
                      <div className="sri-icon">🛏️</div>
                      <div>
                        <div className="sri-room">Room {selectedRoom.room_number} Selected</div>
                        <div className="sri-detail">
                          Rent: ₹{selectedRoom.monthly_rent?.toLocaleString('en-IN') || 7500} ·{' '}
                          {selectedRoom.floor_name}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* SUMMARY CARD */}
              <div className="summary-card">
                <div className="sum-hd">
                  <div className="sum-title">📋 Guest Summary</div>
                </div>
                <div className="sum-body">
                  <div className="sum-row">
                    <span className="sum-key">Name</span>
                    <span className="sum-val">
                      {firstName || lastName ? `${firstName} ${lastName}` : '—'}
                    </span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-key">Mobile</span>
                    <span className="sum-val">{mobile || '—'}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-key">Purpose</span>
                    <span className="sum-val">
                      {purpose.charAt(0).toUpperCase() + purpose.slice(1)}
                    </span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-key">Check-in</span>
                    <span className="sum-val">{checkinDate || '—'}</span>
                  </div>
                  <div className="sum-row">
                    <span className="sum-key">Room</span>
                    <span className="sum-val" style={{ color: 'var(--orange)' }}>
                      {selectedRoom ? `Room ${selectedRoom.room_number}` : 'Not Allocated'}
                    </span>
                  </div>
                  <div className="sum-divider"></div>
                  <div className="sum-row">
                    <span className="sum-key">Rent</span>
                    <span className="sum-val">
                      ₹{selectedRoom?.monthly_rent?.toLocaleString('en-IN') || 7500}
                    </span>
                  </div>
                </div>
                <div className="sum-foot">
                  <button className="btn-submit" onClick={handleSubmit}>
                    ✓ &nbsp;Add Guest &amp; Allocate Room
                  </button>
                </div>
              </div>
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
          --shadow-md: 0 4px 16px rgba(28,15,5,0.10);
          --r: 14px;
        }

        .tb-btn-ghost {
          background: var(--white); color: var(--text); border: 1px solid var(--border); border-radius: 9px;
          padding: 8px 16px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.15s;
        }
        .tb-btn-ghost:hover { border-color: var(--orange-border); background: var(--orange-pale); }

        .tb-btn {
          background: var(--orange); color: #fff; border: none; border-radius: 9px;
          padding: 9px 18px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.15s;
          display: flex; align-items: center; gap: 6px;
        }
        .tb-btn:hover { background: var(--orange-hover); transform: translateY(-1px); }

        .content { flex: 1; overflow-y: auto; padding: 24px 26px; scrollbar-width: thin; }

        .form-layout { display: grid; grid-template-columns: 1fr 320px; gap: 20px; align-items: start; }

        .form-card { background: var(--white); border-radius: var(--r); border: 1px solid var(--border); box-shadow: var(--shadow-sm); overflow: hidden; margin-bottom: 16px; animation: fadeUp 0.35s ease both; }
        .fc-hd { padding: 14px 20px 12px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
        .fc-icon { width: 32px; height: 32px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
        .fc-title { font-family: 'Playfair Display', serif; font-size: 14.5px; font-weight: 700; }
        .fc-sub { font-size: 11.5px; color: var(--text-soft); margin-top: 1px; }
        .fc-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }

        .field { display: flex; flex-direction: column; gap: 5px; }
        .field label { font-size: 11px; font-weight: 800; color: var(--text-mid); text-transform: uppercase; letter-spacing: 0.8px; display: flex; align-items: center; gap: 5px; }
        .req { color: var(--orange); }
        .field input, .field select, .field textarea {
          border: 1.5px solid var(--border); border-radius: 9px;
          padding: 9px 12px; font-size: 13px; outline: none; transition: border-color 0.15s;
          color: var(--text); background: var(--bg);
        }
        .field input:focus, .field select:focus, .field textarea:focus { border-color: var(--orange); background: #fff; }
        .field textarea { resize: vertical; min-height: 72px; }
        .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        .id-types { display: flex; gap: 7px; flex-wrap: wrap; }
        .id-type { border: 1.5px solid var(--border); border-radius: 8px; padding: 6px 13px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s; color: var(--text-mid); }
        .id-type:hover { border-color: var(--orange-border); background: var(--orange-pale); }
        .id-type.sel { border-color: var(--orange); background: var(--orange-pale); color: var(--orange); }

        .gender-row { display: flex; gap: 8px; }
        .gender-btn { flex: 1; border: 1.5px solid var(--border); border-radius: 9px; padding: 9px; text-align: center; cursor: pointer; font-size: 13px; font-weight: 700; transition: all 0.15s; color: var(--text-mid); background: var(--bg); }
        .gender-btn:hover { border-color: var(--orange-border); background: var(--orange-pale); }
        .gender-btn.sel { border-color: var(--orange); background: var(--orange-pale); color: var(--orange); }

        .purpose-row { display: flex; gap: 8px; }
        .purpose-btn { flex: 1; border: 1.5px solid var(--border); border-radius: 9px; padding: 9px 12px; text-align: center; cursor: pointer; font-size: 12px; font-weight: 700; transition: all 0.15s; color: var(--text-mid); display: flex; flex-direction: column; align-items: center; gap: 4px; background: var(--bg); }
        .purpose-btn:hover { border-color: var(--orange-border); background: var(--orange-pale); }
        .purpose-btn.sel { border-color: var(--orange); background: var(--orange-pale); color: var(--orange); }
        .purpose-ic { font-size: 20px; }

        .right-col { display: flex; flex-direction: column; gap: 16px; }

        .room-picker-card { background: var(--white); border-radius: var(--r); border: 1px solid var(--border); box-shadow: var(--shadow-sm); overflow: hidden; animation: fadeUp 0.35s 0.1s ease both; }
        .rpc-hd { padding: 14px 18px 12px; border-bottom: 1px solid var(--border); }
        .rpc-title { font-family: 'Playfair Display', serif; font-size: 14px; font-weight: 700; }
        .rpc-body { padding: 14px 18px; }

        .floor-tabs { display: flex; gap: 5px; margin-bottom: 13px; flex-wrap: wrap; }
        .ftab { border: 1.5px solid var(--border); border-radius: 8px; padding: 5px 12px; font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.15s; color: var(--text-soft); }
        .ftab:hover { border-color: var(--orange-border); color: var(--orange); }
        .ftab.active { border-color: var(--orange); background: var(--orange-pale); color: var(--orange); }

        .rp-grid { display: flex; gap: 7px; flex-wrap: wrap; margin-bottom: 10px; }
        .rp-room { width: 56px; height: 56px; border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: all 0.18s; border: 2px solid transparent; }
        .rp-room:hover { transform: scale(1.08); box-shadow: 0 4px 12px rgba(0,0,0,0.10); }
        .rp-room.picked { border-color: var(--orange) !important; box-shadow: 0 0 0 3px rgba(244,112,10,0.2); transform: scale(1.05); }
        .rp-num { font-size: 11.5px; font-weight: 800; }
        .rp-cap { font-size: 9px; font-weight: 600; opacity: 0.75; margin-top: 1px; }

        .rp-free    { background: var(--green-pale); color: var(--green); border-color: #A8EDD0; }
        .rp-partial { background: var(--amber-pale); color: #B87800; border-color: #FAD898; }
        .rp-full    { background: var(--red-pale); color: var(--red); border-color: #F5C6C5; cursor: not-allowed; opacity: 0.55; }
        .rp-full:hover { transform: none; box-shadow: none; }

        .selected-room-info { background: var(--orange-pale); border: 1.5px solid var(--orange-border); border-radius: 10px; padding: 11px 13px; display: flex; align-items: center; gap: 10px; margin-top: 10px; }
        .sri-icon { font-size: 22px; }
        .sri-room { font-size: 14px; font-weight: 800; color: var(--orange); }
        .sri-detail { font-size: 11.5px; color: var(--text-mid); margin-top: 2px; }

        .summary-card { background: var(--white); border-radius: var(--r); border: 1px solid var(--border); box-shadow: var(--shadow-sm); overflow: hidden; animation: fadeUp 0.35s 0.18s ease both; }
        .sum-hd { padding: 13px 18px 11px; border-bottom: 1px solid var(--border); }
        .sum-title { font-family: 'Playfair Display', serif; font-size: 13.5px; font-weight: 700; }
        .sum-body { padding: 14px 18px; display: flex; flex-direction: column; gap: 9px; }
        .sum-row { display: flex; align-items: center; justify-content: space-between; font-size: 12.5px; }
        .sum-key { color: var(--text-soft); font-weight: 500; }
        .sum-val { font-weight: 700; color: var(--text); }
        .sum-divider { height: 1px; background: var(--border); }
        .sum-foot { padding: 14px 18px; display: flex; flex-direction: column; gap: 8px; }

        .btn-submit { background: var(--orange); color: #fff; border: none; border-radius: 10px; padding: 12px; font-size: 14px; font-weight: 800; cursor: pointer; width: 100%; transition: all 0.15s; display: flex; align-items: center; justify-content: center; gap: 7px; }
        .btn-submit:hover { background: var(--orange-hover); box-shadow: 0 4px 16px rgba(244,112,10,0.3); }

        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}
