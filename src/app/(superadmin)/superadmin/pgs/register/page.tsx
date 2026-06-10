'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import TopBar from '@/components/layout/TopBar'
import { toast } from 'sonner'
import { registerPGAction } from './actions'

interface Profile {
  id: string
  name: string
  email: string | null
  phone: string | null
  pg_admins?: {
    id: string
    pg_id: string
    pgs?: {
      name: string
    }
  }[]
}

const AMENITIES_LIST = [
  { label: 'Food Provided', icon: '🍱' },
  { label: 'WiFi / Internet', icon: '📶' },
  { label: 'Laundry', icon: '🧺' },
  { label: 'AC Rooms', icon: '❄️' },
  { label: 'Parking', icon: '🅿️' },
  { label: 'Gym / Fitness', icon: '🏋️' },
  { label: '24/7 Security', icon: '🔒' },
  { label: 'Housekeeping', icon: '🧹' },
  { label: 'First Aid Kit', icon: '💊' },
  { label: 'TV / Common Area', icon: '📺' }
]

export default function RegisterPG() {
  const router = useRouter()
  const supabase = createClient()

  // Stepper state
  const [currentStep, setCurrentStep] = useState(1)
  const totalSteps = 4

  // Loading & submit states
  const [superadminId, setSuperadminId] = useState<string | null>(null)
  const [existingAdmins, setExistingAdmins] = useState<Profile[]>([])
  const [loadingAdmins, setLoadingAdmins] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPublished, setIsPublished] = useState(false)

  // Form Fields
  // Step 1: Basic details
  const [pgType, setPgType] = useState<'boys' | 'girls' | 'coliving'>('boys')
  const [pgName, setPgName] = useState('')
  const [floorsCount, setFloorsCount] = useState(3)
  const [approxRoomsCount, setApproxRoomsCount] = useState(20)
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('12, 5th Cross, Koramangala')
  const [city, setCity] = useState('Bengaluru')
  const [state, setState] = useState('Karnataka')
  const [pinCode, setPinCode] = useState('560034')
  const [mapsLink, setMapsLink] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')

  // Step 2: Facilities
  const [amenities, setAmenities] = useState<string[]>([
    'Food Provided', 'WiFi / Internet', 'Laundry', 'Parking', '24/7 Security', 'First Aid Kit'
  ])
  const [minRent, setMinRent] = useState(10000)
  const [maxRent, setMaxRent] = useState(20000)
  const [securityDeposit, setSecurityDeposit] = useState(20000)
  const [checkinCutoffTime, setCheckinCutoffTime] = useState('22:00')
  const [noticePeriodMonths, setNoticePeriodMonths] = useState(2)
  const [rules, setRules] = useState(
    'No smoking or drinking allowed on the premises. Visitors are not allowed inside guest rooms and are permitted only in the common meeting lounge. Maintain common area cleanliness.'
  )

  // Step 3: Admin Assignment
  const [adminMode, setAdminMode] = useState<'existing' | 'invite'>('invite')
  const [selectedAdminId, setSelectedAdminId] = useState<string>('')
  const [inviteAdminName, setInviteAdminName] = useState('Ramesh Kumar')
  const [inviteAdminMobile, setInviteAdminMobile] = useState('9876543210')
  const [inviteAdminEmail, setInviteAdminEmail] = useState('ramesh@gharpg.in')
  const [inviteAdminAccess, setInviteAdminAccess] = useState<'full' | 'limited' | 'view_only'>('full')

  // Auth check & admins fetch
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setSuperadminId(user.id)

      // Fetch pgadmins
      try {
        setLoadingAdmins(true)
        const { data, error } = await supabase
          .from('profiles')
          .select('id, name, email, phone, pg_admins(id, pg_id, pgs(name))')
          .eq('role', 'pgadmin')
        
        if (error) throw error
        setExistingAdmins(data as unknown as Profile[] || [])
        if (data && data.length > 0) {
          setSelectedAdminId(data[0].id)
        }
      } catch (err: any) {
        console.error('Error loading admins:', err)
        toast.error('Failed to load existing admin profiles')
      } finally {
        setLoadingAdmins(false)
      }
    }
    init()
  }, [])

  // Validation helper
  function validateStep(step: number) {
    if (step === 1) {
      if (!pgName.trim()) { toast.error('PG Name is required'); return false }
      if (!address.trim()) { toast.error('Full Address is required'); return false }
      if (!city.trim()) { toast.error('City is required'); return false }
      if (!state.trim()) { toast.error('State is required'); return false }
      if (!contactPhone.trim()) { toast.error('PG Contact Number is required'); return false }
    } else if (step === 3) {
      if (adminMode === 'invite') {
        if (!inviteAdminName.trim()) { toast.error('Admin Name is required'); return false }
        if (!inviteAdminMobile.trim()) { toast.error('Mobile Number is required'); return false }
        if (!inviteAdminEmail.trim()) { toast.error('Email Address is required'); return false }
      } else {
        if (!selectedAdminId) { toast.error('Please select an existing admin'); return false }
      }
    }
    return true
  }

  function nextStep() {
    if (validateStep(currentStep)) {
      if (currentStep < totalSteps) {
        setCurrentStep(currentStep + 1)
      }
    }
  }

  function prevStep() {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  function goToStep(n: number) {
    if (n <= currentStep || validateStep(n - 1)) {
      setCurrentStep(n)
    }
  }

  function toggleAmenity(label: string) {
    setAmenities(prev =>
      prev.includes(label) ? prev.filter(a => a !== label) : [...prev, label]
    )
  }

  async function handlePublish() {
    if (!superadminId) return
    setIsSubmitting(true)

    const pgData = {
      name: pgName.trim(),
      type: pgType,
      description: description.trim() || null,
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      pin_code: pinCode.trim() || null,
      maps_link: mapsLink.trim() || null,
      contact_phone: contactPhone.trim(),
      contact_email: contactEmail.trim() || null,
      min_rent: minRent || null,
      max_rent: maxRent || null,
      security_deposit: securityDeposit || null,
      notice_period_months: noticePeriodMonths,
      checkin_cutoff_time: checkinCutoffTime || null,
      rules: rules.trim() || null,
      amenities,
      superadmin_id: superadminId
    }

    const adminData = {
      mode: adminMode,
      existingAdminId: adminMode === 'existing' ? selectedAdminId : undefined,
      inviteAdminName: adminMode === 'invite' ? inviteAdminName.trim() : undefined,
      inviteAdminMobile: adminMode === 'invite' ? inviteAdminMobile.trim() : undefined,
      inviteAdminEmail: adminMode === 'invite' ? inviteAdminEmail.trim() : undefined,
      inviteAdminAccess: adminMode === 'invite' ? inviteAdminAccess : undefined
    }

    try {
      const res = await registerPGAction(pgData, adminData)
      if (res.success) {
        toast.success('PG property registered successfully!')
        setIsPublished(true)
      } else {
        toast.error(res.error || 'Failed to register PG')
      }
    } catch (err: any) {
      console.error(err)
      toast.error('An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedAdminProfile = existingAdmins.find(a => a.id === selectedAdminId)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        title="Register New PG"
        subtitle={`Step ${currentStep} of 4 · Fill all details to set up the PG`}
      >
        <button className="tb-btn-ghost" onClick={() => router.push('/superadmin/dashboard')}>
          Cancel
        </button>
        {currentStep < totalSteps ? (
          <button className="tb-btn" onClick={nextStep}>
            Next Step →
          </button>
        ) : (
          !isPublished && (
            <button
              className="tb-btn"
              style={{ background: '#1DB970' }}
              onClick={handlePublish}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Publishing...' : '🚀 Publish PG'}
            </button>
          )
        )}
      </TopBar>

      <div className="content">
        {/* LEFT STEPPER & LIVE PREVIEW */}
        <div className="stepper-panel">
          <div className="stepper-title">📋 Setup Steps</div>

          <div className={`step-item ${currentStep === 1 ? 'active' : ''} ${currentStep > 1 ? 'done' : ''}`} onClick={() => goToStep(1)}>
            <div className="step-num">{currentStep > 1 ? '✓' : '1'}</div>
            <div>
              <div className="step-label">PG Details</div>
              <div className="step-desc">Name, type, location</div>
            </div>
          </div>
          <div className={`step-connector ${currentStep > 1 ? 'done' : ''}`} />

          <div className={`step-item ${currentStep === 2 ? 'active' : ''} ${currentStep > 2 ? 'done' : ''}`} onClick={() => goToStep(2)}>
            <div className="step-num">{currentStep > 2 ? '✓' : '2'}</div>
            <div>
              <div className="step-label">Facilities</div>
              <div className="step-desc">Amenities & rules</div>
            </div>
          </div>
          <div className={`step-connector ${currentStep > 2 ? 'done' : ''}`} />

          <div className={`step-item ${currentStep === 3 ? 'active' : ''} ${currentStep > 3 ? 'done' : ''}`} onClick={() => goToStep(3)}>
            <div className="step-num">{currentStep > 3 ? '✓' : '3'}</div>
            <div>
              <div className="step-label">Assign Admin</div>
              <div className="step-desc">PG manager details</div>
            </div>
          </div>
          <div className={`step-connector ${currentStep > 3 ? 'done' : ''}`} />

          <div className={`step-item ${currentStep === 4 ? 'active' : ''} ${isPublished ? 'done' : ''}`} onClick={() => goToStep(4)}>
            <div className="step-num">{isPublished ? '✓' : '4'}</div>
            <div>
              <div className="step-label">Review & Publish</div>
              <div className="step-desc">Confirm and go live</div>
            </div>
          </div>

          {/* MINI PREVIEW */}
          <div style={{ marginTop: 'auto', paddingTop: 20, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Preview</div>
            <div style={{ background: 'var(--orange-pale)', border: '1.5px solid var(--orange-border)', borderRadius: 10, padding: '12px 13px' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', wordBreak: 'break-word' }}>
                {pgName.trim() || '— PG Name'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-mid)', marginTop: 3 }}>
                📍 {city || 'City'}, {state || 'State'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-mid)', marginTop: 2 }}>
                🏠 {pgType === 'boys' ? 'Boys Only' : pgType === 'girls' ? 'Girls Only' : 'Co-living'}
              </div>
            </div>
          </div>
        </div>

        {/* FORM AREA */}
        <div className="form-area">
          {isPublished ? (
            /* SUCCESS STATE */
            <div style={{ animation: 'fadeUp 0.3s ease' }}>
              <div className="success-banner">
                <div className="sb-check">🎉</div>
                <div className="sb-title">PG Registered Successfully!</div>
                <div className="sb-sub">{pgName} is now live on GharPG</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 24 }}>
                <div className="action-card" onClick={() => router.push('/pgadmin/rooms')}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🏢</div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>Set Up Rooms</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-soft)', marginTop: 3 }}>Open Floor & Room Builder</div>
                </div>
                <div className="action-card" onClick={() => router.push('/pgadmin/guests/add')}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>👥</div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>Add First Guest</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-soft)', marginTop: 3 }}>Start onboarding guests</div>
                </div>
                <div className="action-card" onClick={() => router.push('/superadmin/dashboard')}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>📊</div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>View Dashboard</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-soft)', marginTop: 3 }}>Go to Platform Dashboard</div>
                </div>
                <div className="action-card" onClick={() => router.push('/superadmin/dashboard')}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🏘️</div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>All PGs</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-soft)', marginTop: 3 }}>Return to platform overview</div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* STEP 1: PG DETAILS */}
              {currentStep === 1 && (
                <div className="form-step active">
                  <div className="fs-header">
                    <div className="fs-step-label">Step 1 of 4</div>
                    <div className="fs-title">PG Basic Details</div>
                    <div className="fs-sub">Enter the core information about this PG property</div>
                  </div>

                  <div className="form-section">
                    <div className="form-section-title">PG Type</div>
                    <div className="pg-type-grid">
                      <div className={`pg-type-btn ${pgType === 'boys' ? 'sel' : ''}`} onClick={() => setPgType('boys')}>
                        <div className="pgt-ic">👨</div>
                        <div className="pgt-nm">Boys Only</div>
                        <div className="pgt-desc">Male guests only</div>
                      </div>
                      <div className={`pg-type-btn ${pgType === 'girls' ? 'sel' : ''}`} onClick={() => setPgType('girls')}>
                        <div className="pgt-ic">👩</div>
                        <div className="pgt-nm">Girls Only</div>
                        <div className="pgt-desc">Female guests only</div>
                      </div>
                      <div className={`pg-type-btn ${pgType === 'coliving' ? 'sel' : ''}`} onClick={() => setPgType('coliving')}>
                        <div className="pgt-ic">👫</div>
                        <div className="pgt-nm">Co-living</div>
                        <div className="pgt-desc">Mixed — all welcome</div>
                      </div>
                    </div>
                  </div>

                  <div className="form-section">
                    <div className="form-section-title">PG Information</div>
                    <div className="field">
                      <label>PG Name <span className="req">*</span></label>
                      <input
                        type="text"
                        placeholder="e.g. Sunshine Residency"
                        value={pgName}
                        onChange={e => setPgName(e.target.value)}
                      />
                    </div>
                    <div className="field-row">
                      <div className="field">
                        <label>Total Floors <span className="req">*</span></label>
                        <select
                          value={floorsCount}
                          onChange={e => setFloorsCount(Number(e.target.value))}
                        >
                          <option value={1}>1 Floor</option>
                          <option value={2}>2 Floors</option>
                          <option value={3}>3 Floors</option>
                          <option value={4}>4 Floors</option>
                          <option value={5}>5 Floors</option>
                          <option value={6}>6 Floors</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Total Rooms (approx)</label>
                        <input
                          type="number"
                          placeholder="e.g. 20"
                          value={approxRoomsCount}
                          onChange={e => setApproxRoomsCount(Number(e.target.value))}
                        />
                      </div>
                    </div>
                    <div className="field">
                      <label>Description</label>
                      <textarea
                        placeholder="Brief description of the PG — location highlights, nearby landmarks, facilities summary…"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-section">
                    <div className="form-section-title">Location</div>
                    <div className="field">
                      <label>Full Address <span className="req">*</span></label>
                      <input
                        type="text"
                        placeholder="House/Building No., Street, Area"
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                      />
                    </div>
                    <div className="field-row3">
                      <div className="field">
                        <label>City <span className="req">*</span></label>
                        <input
                          type="text"
                          placeholder="e.g. Bengaluru"
                          value={city}
                          onChange={e => setCity(e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label>State <span className="req">*</span></label>
                        <select
                          value={state}
                          onChange={e => setState(e.target.value)}
                        >
                          <option value="Andhra Pradesh">Andhra Pradesh</option>
                          <option value="Arunachal Pradesh">Arunachal Pradesh</option>
                          <option value="Assam">Assam</option>
                          <option value="Bihar">Bihar</option>
                          <option value="Chhattisgarh">Chhattisgarh</option>
                          <option value="Goa">Goa</option>
                          <option value="Gujarat">Gujarat</option>
                          <option value="Haryana">Haryana</option>
                          <option value="Himachal Pradesh">Himachal Pradesh</option>
                          <option value="Jammu and Kashmir">Jammu and Kashmir</option>
                          <option value="Jharkhand">Jharkhand</option>
                          <option value="Karnataka">Karnataka</option>
                          <option value="Kerala">Kerala</option>
                          <option value="Madhya Pradesh">Madhya Pradesh</option>
                          <option value="Maharashtra">Maharashtra</option>
                          <option value="Manipur">Manipur</option>
                          <option value="Meghalaya">Meghalaya</option>
                          <option value="Mizoram">Mizoram</option>
                          <option value="Nagaland">Nagaland</option>
                          <option value="Odisha">Odisha</option>
                          <option value="Punjab">Punjab</option>
                          <option value="Rajasthan">Rajasthan</option>
                          <option value="Sikkim">Sikkim</option>
                          <option value="Tamil Nadu">Tamil Nadu</option>
                          <option value="Telangana">Telangana</option>
                          <option value="Tripura">Tripura</option>
                          <option value="Uttar Pradesh">Uttar Pradesh</option>
                          <option value="Uttarakhand">Uttarakhand</option>
                          <option value="West Bengal">West Bengal</option>
                          <option value="Delhi">Delhi</option>
                          <option value="Chandigarh">Chandigarh</option>
                          <option value="Puducherry">Puducherry</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>PIN Code</label>
                        <input
                          type="text"
                          placeholder="560034"
                          value={pinCode}
                          onChange={e => setPinCode(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="field">
                      <label>Google Maps Link</label>
                      <input
                        type="text"
                        placeholder="https://maps.google.com/..."
                        value={mapsLink}
                        onChange={e => setMapsLink(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-section">
                    <div className="form-section-title">Contact</div>
                    <div className="field-row">
                      <div className="field">
                        <label>PG Contact Number <span className="req">*</span></label>
                        <input
                          type="tel"
                          placeholder="e.g. 9876543210"
                          value={contactPhone}
                          onChange={e => setContactPhone(e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label>PG Email</label>
                        <input
                          type="email"
                          placeholder="pg@email.com"
                          value={contactEmail}
                          onChange={e => setContactEmail(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="step-nav">
                    <div className="step-progress-text">Step 1 of 4</div>
                    <button className="btn-next" onClick={nextStep}>Next: Facilities →</button>
                  </div>
                </div>
              )}

              {/* STEP 2: FACILITIES */}
              {currentStep === 2 && (
                <div className="form-step active">
                  <div className="fs-header">
                    <div className="fs-step-label">Step 2 of 4</div>
                    <div className="fs-title">Facilities & Rules</div>
                    <div className="fs-sub">Select amenities and set house rules for this PG</div>
                  </div>

                  <div className="form-section">
                    <div className="form-section-title">Amenities</div>
                    <div className="amenity-grid">
                      {AMENITIES_LIST.map(item => {
                        const on = amenities.includes(item.label)
                        return (
                          <div
                            key={item.label}
                            className={`am-item ${on ? 'on' : ''}`}
                            onClick={() => toggleAmenity(item.label)}
                          >
                            <div className="am-ic">{item.icon}</div>
                            <div className="am-label">{item.label}</div>
                            <div className="am-check">{on ? '✓' : ''}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="form-section">
                    <div className="form-section-title">Pricing</div>
                    <div className="field-row3">
                      <div className="field">
                        <label>Min Rent (₹/month)</label>
                        <input
                          type="number"
                          value={minRent}
                          onChange={e => setMinRent(Number(e.target.value))}
                        />
                      </div>
                      <div className="field">
                        <label>Max Rent (₹/month)</label>
                        <input
                          type="number"
                          value={maxRent}
                          onChange={e => setMaxRent(Number(e.target.value))}
                        />
                      </div>
                      <div className="field">
                        <label>Security Deposit (₹)</label>
                        <input
                          type="number"
                          value={securityDeposit}
                          onChange={e => setSecurityDeposit(Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form-section">
                    <div className="form-section-title">House Rules</div>
                    <div className="field-row">
                      <div className="field">
                        <label>Check-in Cutoff Time</label>
                        <input
                          type="time"
                          value={checkinCutoffTime}
                          onChange={e => setCheckinCutoffTime(e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label>Notice Period</label>
                        <select
                          value={noticePeriodMonths}
                          onChange={e => setNoticePeriodMonths(Number(e.target.value))}
                        >
                          <option value={1}>1 Month</option>
                          <option value={2}>2 Months</option>
                          <option value={3}>3 Months</option>
                        </select>
                      </div>
                    </div>
                    <div className="field">
                      <label>Additional Rules</label>
                      <textarea
                        placeholder="No smoking on premises, visitors allowed till 9pm, no pets…"
                        value={rules}
                        onChange={e => setRules(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="step-nav">
                    <button className="btn-prev" onClick={prevStep}>← Back</button>
                    <div className="step-progress-text">Step 2 of 4</div>
                    <button className="btn-next" onClick={nextStep}>Next: Assign Admin →</button>
                  </div>
                </div>
              )}

              {/* STEP 3: ASSIGN ADMIN */}
              {currentStep === 3 && (
                <div className="form-step active">
                  <div className="fs-header">
                    <div className="fs-step-label">Step 3 of 4</div>
                    <div className="fs-title">Assign PG Admin</div>
                    <div className="fs-sub">Assign a manager who will run this PG day-to-day</div>
                  </div>

                  {/* Mode switcher tabs */}
                  <div className="flex gap-2 mb-6" style={{ background: 'var(--bg)', borderRadius: 10, padding: 4 }}>
                    <button
                      onClick={() => setAdminMode('invite')}
                      className="flex-1 rounded-[8px] py-2 text-center text-xs font-bold transition-all border-none cursor-pointer"
                      style={{
                        background: adminMode === 'invite' ? '#fff' : 'transparent',
                        color: adminMode === 'invite' ? 'var(--orange)' : 'var(--text-soft)',
                        boxShadow: adminMode === 'invite' ? 'var(--shadow-sm)' : 'none'
                      }}
                    >
                      Invite New Admin
                    </button>
                    <button
                      onClick={() => setAdminMode('existing')}
                      className="flex-1 rounded-[8px] py-2 text-center text-xs font-bold transition-all border-none cursor-pointer"
                      style={{
                        background: adminMode === 'existing' ? '#fff' : 'transparent',
                        color: adminMode === 'existing' ? 'var(--orange)' : 'var(--text-soft)',
                        boxShadow: adminMode === 'existing' ? 'var(--shadow-sm)' : 'none'
                      }}
                    >
                      Assign Existing Admin
                    </button>
                  </div>

                  {adminMode === 'invite' ? (
                    <div className="form-section">
                      <div className="form-section-title">Invite New Admin</div>
                      <div className="admin-invite-card">
                        <div className="aic-icon">✉️</div>
                        <div>
                          <div className="aic-title">Invite via Mobile / Email</div>
                          <div className="aic-sub">Send an invite link — they register and get PG Admin access</div>
                        </div>
                      </div>
                      <div className="field-row">
                        <div className="field">
                          <label>Admin Name <span className="req">*</span></label>
                          <input
                            type="text"
                            placeholder="e.g. Ramesh Kumar"
                            value={inviteAdminName}
                            onChange={e => setInviteAdminName(e.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label>Mobile Number <span className="req">*</span></label>
                          <input
                            type="tel"
                            placeholder="98765 43210"
                            value={inviteAdminMobile}
                            onChange={e => setInviteAdminMobile(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="field">
                        <label>Email Address <span className="req">*</span></label>
                        <input
                          type="email"
                          placeholder="admin@email.com"
                          value={inviteAdminEmail}
                          onChange={e => setInviteAdminEmail(e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label>Access Level</label>
                        <select
                          value={inviteAdminAccess}
                          onChange={e => setInviteAdminAccess(e.target.value as any)}
                        >
                          <option value="full">Full Admin (all features)</option>
                          <option value="limited">Limited Admin (view + approve only)</option>
                          <option value="view_only">View Only</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="form-section">
                      <div className="form-section-title">Assign Existing Admin</div>
                      {loadingAdmins ? (
                        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-soft)' }}>
                          Loading admin profiles...
                        </div>
                      ) : existingAdmins.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-soft)' }}>
                          No PG Admin profiles found. Please invite a new admin.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {existingAdmins.map(admin => {
                            const isSelected = selectedAdminId === admin.id
                            const initials = admin.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                            
                            // Check active PG assignment
                            const activePgName = admin.pg_admins?.find(pa => pa.pg_id)?.pgs?.name

                            return (
                              <div
                                key={admin.id}
                                className={`existing-admin-card ${isSelected ? 'selected' : ''}`}
                                onClick={() => setSelectedAdminId(admin.id)}
                              >
                                <div className="ea-av">{initials}</div>
                                <div>
                                  <div className="ea-name">{admin.name}</div>
                                  <div className="ea-email">{admin.email} · {admin.phone}</div>
                                </div>
                                {activePgName ? (
                                  <span className="ea-badge-assigned">Assigned: {activePgName}</span>
                                ) : (
                                  <span className="ea-badge-available">Available</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="step-nav">
                    <button className="btn-prev" onClick={prevStep}>← Back</button>
                    <div className="step-progress-text">Step 3 of 4</div>
                    <button className="btn-next" onClick={nextStep}>Next: Review →</button>
                  </div>
                </div>
              )}

              {/* STEP 4: REVIEW */}
              {currentStep === 4 && (
                <div className="form-step active">
                  <div className="fs-header">
                    <div className="fs-step-label">Step 4 of 4</div>
                    <div className="fs-title">Review & Publish</div>
                    <div className="fs-sub">Review all details before going live</div>
                  </div>

                  <div className="summary-grid">
                    <div className="sum-card">
                      <div className="sum-card-title">🏠 PG Details</div>
                      <div className="sum-rows">
                        <div className="sum-row"><span className="sum-key">Name</span><span className="sum-val">{pgName}</span></div>
                        <div className="sum-row">
                          <span className="sum-key">Type</span>
                          <span className="sum-val">
                            {pgType === 'boys' ? 'Boys Only' : pgType === 'girls' ? 'Girls Only' : 'Co-living'}
                          </span>
                        </div>
                        <div className="sum-row"><span className="sum-key">Floors</span><span className="sum-val">{floorsCount} Floors</span></div>
                        <div className="sum-row"><span className="sum-key">Total Rooms</span><span className="sum-val">{approxRoomsCount}</span></div>
                      </div>
                    </div>

                    <div className="sum-card">
                      <div className="sum-card-title">📍 Location</div>
                      <div className="sum-rows">
                        <div className="sum-row"><span className="sum-key">Address</span><span className="sum-val" style={{ wordBreak: 'break-word', textAlign: 'right', maxWidth: '60%' }}>{address}</span></div>
                        <div className="sum-row"><span className="sum-key">City</span><span className="sum-val">{city}</span></div>
                        <div className="sum-row"><span className="sum-key">State</span><span className="sum-val">{state}</span></div>
                        <div className="sum-row"><span className="sum-key">PIN</span><span className="sum-val">{pinCode}</span></div>
                      </div>
                    </div>

                    <div className="sum-card">
                      <div className="sum-card-title">💰 Pricing & Rules</div>
                      <div className="sum-rows">
                        <div className="sum-row"><span className="sum-key">Min Rent</span><span className="sum-val">₹{minRent}/mo</span></div>
                        <div className="sum-row"><span className="sum-key">Max Rent</span><span className="sum-val">₹{maxRent}/mo</span></div>
                        <div className="sum-row"><span className="sum-key">Deposit</span><span className="sum-val">₹{securityDeposit}</span></div>
                        <div className="sum-row"><span className="sum-key">Notice Period</span><span className="sum-val">{noticePeriodMonths} Month(s)</span></div>
                      </div>
                    </div>

                    <div className="sum-card">
                      <div className="sum-card-title">🧑‍💼 Admin Details</div>
                      <div className="sum-rows">
                        {adminMode === 'invite' ? (
                          <>
                            <div className="sum-row"><span className="sum-key">Name</span><span className="sum-val">{inviteAdminName} (New)</span></div>
                            <div className="sum-row"><span className="sum-key">Mobile</span><span className="sum-val">{inviteAdminMobile}</span></div>
                            <div className="sum-row"><span className="sum-key">Email</span><span className="sum-val">{inviteAdminEmail}</span></div>
                            <div className="sum-row"><span className="sum-key">Access</span><span className="sum-val">{inviteAdminAccess === 'full' ? 'Full Admin' : inviteAdminAccess === 'limited' ? 'Limited Admin' : 'View Only'}</span></div>
                          </>
                        ) : (
                          <>
                            <div className="sum-row"><span className="sum-key">Name</span><span className="sum-val">{selectedAdminProfile?.name} (Existing)</span></div>
                            <div className="sum-row"><span className="sum-key">Mobile</span><span className="sum-val">{selectedAdminProfile?.phone || 'N/A'}</span></div>
                            <div className="sum-row"><span className="sum-key">Email</span><span className="sum-val">{selectedAdminProfile?.email || 'N/A'}</span></div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ background: 'var(--green-pale)', border: '1.5px solid #A8EDD0', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                    <div style={{ fontSize: 22 }}>✅</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--green)' }}>All checks passed!</div>
                      <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 2 }}>PG details, amenities, and admin are all set. Ready to publish.</div>
                    </div>
                  </div>

                  <div className="step-nav">
                    <button className="btn-prev" onClick={prevStep}>← Back</button>
                    <div className="step-progress-text">Step 4 of 4 — Final Step</div>
                    <button
                      className="btn-next"
                      style={{ background: 'var(--green)', padding: '11px 28px' }}
                      onClick={handlePublish}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Publishing...' : '🚀 Publish PG'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        :root {
          --orange: #F4700A;
          --orange-hover: #E05C00;
          --orange-light: #FF9240;
          --orange-pale: #FFF4EC;
          --orange-border: #FFD9B8;
          --bg: #FAF6F2;
          --white: #FFFFFF;
          --text: #1C0F05;
          --text-mid: #6B4F38;
          --text-soft: #A89080;
          --border: #EDE0D4;
          --green: #1DB970;
          --green-pale: #E6F9F0;
          --red: #E53935;
          --red-pale: #FDECEA;
          --shadow-sm: 0 1px 4px rgba(28,15,5,0.06);
          --shadow-md: 0 4px 16px rgba(28,15,5,0.10);
        }

        .tb-btn-ghost {
          background: var(--white);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 9px;
          padding: 9px 16px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s;
        }
        .tb-btn-ghost:hover {
          border-color: var(--orange-border);
          background: var(--orange-pale);
        }

        .tb-btn {
          background: var(--orange);
          color: #fff;
          border: none;
          border-radius: 9px;
          padding: 9px 18px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .tb-btn:hover {
          background: var(--orange-hover);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(244,112,10,0.3);
        }

        .content {
          flex: 1;
          overflow: hidden;
          display: flex;
        }

        .stepper-panel {
          width: 260px;
          flex-shrink: 0;
          background: var(--white);
          border-right: 1px solid var(--border);
          padding: 28px 20px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          overflow-y: auto;
        }
        .stepper-title {
          font-family: 'Playfair Display', serif;
          font-size: 14px;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 20px;
        }

        .step-item {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 10px 12px;
          border-radius: 10px;
          cursor: pointer;
          transition: background 0.15s;
          position: relative;
        }
        .step-item:hover {
          background: var(--orange-pale);
        }
        .step-item.active {
          background: var(--orange-pale);
        }

        .step-num {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 800;
          flex-shrink: 0;
          transition: all 0.2s;
          border: 2px solid var(--border);
        }
        .step-item.done .step-num {
          background: var(--green);
          color: #fff;
          border-color: var(--green);
        }
        .step-item.active .step-num {
          background: var(--orange);
          color: #fff;
          border-color: var(--orange);
        }
        .step-item:not(.done):not(.active) .step-num {
          background: var(--bg);
          color: var(--text-soft);
        }

        .step-label {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-mid);
        }
        .step-item.active .step-label {
          color: var(--orange);
        }
        .step-item.done .step-label {
          color: var(--green);
        }
        .step-desc {
          font-size: 11px;
          color: var(--text-soft);
          margin-top: 2px;
        }

        .step-connector {
          width: 2px;
          height: 16px;
          background: var(--border);
          margin-left: 25px;
          border-radius: 2px;
        }
        .step-connector.done {
          background: var(--green);
        }

        .form-area {
          flex: 1;
          overflow-y: auto;
          padding: 28px 32px;
          background: var(--bg);
        }
        .form-area::-webkit-scrollbar {
          width: 4px;
        }
        .form-area::-webkit-scrollbar-thumb {
          background: #DDD0C5;
          border-radius: 8px;
        }

        .form-step {
          animation: fadeUp 0.3s ease;
        }

        .fs-header {
          margin-bottom: 26px;
        }
        .fs-step-label {
          font-size: 11.5px;
          font-weight: 800;
          color: var(--orange);
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 6px;
        }
        .fs-title {
          font-family: 'Playfair Display', serif;
          font-size: 22px;
          font-weight: 800;
          color: var(--text);
        }
        .fs-sub {
          font-size: 13px;
          color: var(--text-soft);
          margin-top: 5px;
        }

        .form-section {
          background: #fff;
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 24px;
          margin-bottom: 24px;
          box-shadow: var(--shadow-sm);
        }
        .form-section-title {
          font-size: 12px;
          font-weight: 800;
          color: var(--text-mid);
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 18px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .form-section-title::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--border);
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 5px;
          margin-bottom: 14px;
        }
        .field label {
          font-size: 11.5px;
          font-weight: 800;
          color: var(--text-mid);
          text-transform: uppercase;
          letter-spacing: 0.8px;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .req {
          color: var(--orange);
        }
        .field input, .field select, .field textarea {
          border: 1.5px solid var(--border);
          border-radius: 10px;
          padding: 10px 13px;
          font-size: 13.5px;
          font-family: inherit;
          color: var(--text);
          background: var(--bg);
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .field input:focus, .field select:focus, .field textarea:focus {
          border-color: var(--orange);
          background: #fff;
          box-shadow: 0 0 0 3px rgba(244,112,10,0.10);
        }
        .field textarea {
          resize: vertical;
          min-height: 80px;
        }
        .field-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .field-row3 {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 14px;
        }

        .pg-type-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 14px;
        }
        .pg-type-btn {
          border: 1.5px solid var(--border);
          border-radius: 12px;
          padding: 14px 10px;
          text-align: center;
          cursor: pointer;
          transition: all 0.18s;
          background: var(--bg);
        }
        .pg-type-btn:hover {
          border-color: var(--orange-border);
          background: var(--orange-pale);
        }
        .pg-type-btn.sel {
          border-color: var(--orange);
          background: var(--orange-pale);
          box-shadow: 0 0 0 3px rgba(244,112,10,0.10);
        }
        .pgt-ic {
          font-size: 28px;
          margin-bottom: 8px;
        }
        .pgt-nm {
          font-size: 12.5px;
          font-weight: 800;
          color: var(--text-mid);
        }
        .pgt-desc {
          font-size: 10.5px;
          color: var(--text-soft);
          margin-top: 2px;
        }
        .pg-type-btn.sel .pgt-nm {
          color: var(--orange);
        }

        .amenity-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 14px;
        }
        .am-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 13px;
          border: 1.5px solid var(--border);
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.15s;
          background: var(--bg);
        }
        .am-item:hover {
          border-color: var(--orange-border);
          background: var(--orange-pale);
        }
        .am-item.on {
          border-color: var(--orange);
          background: var(--orange-pale);
        }
        .am-ic {
          font-size: 18px;
          flex-shrink: 0;
        }
        .am-label {
          font-size: 12.5px;
          font-weight: 700;
          color: var(--text-mid);
        }
        .am-item.on .am-label {
          color: var(--orange);
        }
        .am-check {
          margin-left: auto;
          width: 18px;
          height: 18px;
          border-radius: 5px;
          border: 1.5px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          color: #fff;
          transition: all 0.15s;
        }
        .am-item.on .am-check {
          background: var(--orange);
          border-color: var(--orange);
        }

        .admin-invite-card {
          border: 1.5px dashed var(--orange-border);
          border-radius: 12px;
          padding: 16px 18px;
          background: var(--orange-pale);
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 20px;
        }
        .aic-icon {
          font-size: 28px;
        }
        .aic-title {
          font-size: 13.5px;
          font-weight: 800;
          color: var(--text);
        }
        .aic-sub {
          font-size: 11.5px;
          color: var(--text-mid);
          margin-top: 2px;
        }

        .existing-admin-card {
          border: 1.5px solid var(--border);
          border-radius: 12px;
          padding: 13px 16px;
          background: #fff;
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .existing-admin-card:hover {
          border-color: var(--orange-border);
          background: var(--orange-pale);
        }
        .existing-admin-card.selected {
          border-color: var(--orange);
          background: var(--orange-pale);
          box-shadow: 0 0 0 3px rgba(244,112,10,0.10);
        }
        .ea-av {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 800;
          color: #fff;
          background: linear-gradient(135deg, var(--orange), #FFAA60);
          flex-shrink: 0;
        }
        .ea-name {
          font-size: 13px;
          font-weight: 700;
        }
        .ea-email {
          font-size: 11.5px;
          color: var(--text-soft);
          margin-top: 2px;
        }
        .ea-badge-available {
          margin-left: auto;
          background: var(--green-pale);
          color: var(--green);
          font-size: 11px;
          font-weight: 800;
          padding: 3px 9px;
          border-radius: 20px;
        }
        .ea-badge-assigned {
          margin-left: auto;
          background: var(--orange-pale);
          color: var(--orange);
          font-size: 11px;
          font-weight: 800;
          padding: 3px 9px;
          border-radius: 20px;
          max-width: 150px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .summary-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-bottom: 20px;
        }
        .sum-card {
          background: #fff;
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px 16px;
          box-shadow: var(--shadow-sm);
        }
        .sum-card-title {
          font-size: 11px;
          font-weight: 800;
          color: var(--text-soft);
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 12px;
          border-bottom: 1px solid var(--border);
          padding-bottom: 6px;
        }
        .sum-rows {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .sum-row {
          display: flex;
          justify-content: space-between;
          font-size: 12.5px;
        }
        .sum-key {
          color: var(--text-soft);
        }
        .sum-val {
          font-weight: 700;
          color: var(--text);
        }

        .step-nav {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 28px;
          padding-top: 20px;
          border-top: 1px solid var(--border);
        }
        .btn-prev {
          background: var(--white);
          color: var(--text-mid);
          border: 1.5px solid var(--border);
          border-radius: 10px;
          padding: 11px 20px;
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s;
        }
        .btn-prev:hover {
          border-color: var(--orange-border);
          background: var(--orange-pale);
        }
        .btn-next {
          background: var(--orange);
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 11px 24px;
          font-size: 13.5px;
          font-weight: 800;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .btn-next:hover {
          background: var(--orange-hover);
          transform: translateY(-1px);
          box-shadow: 0 4px 14px rgba(244,112,10,0.3);
        }
        .step-progress-text {
          font-size: 12px;
          color: var(--text-soft);
          margin-left: auto;
          font-weight: 600;
        }

        .success-banner {
          background: linear-gradient(135deg, #0D6E3F, #1DB970);
          border-radius: 14px;
          padding: 32px 24px;
          text-align: center;
          margin-bottom: 20px;
          color: #fff;
        }
        .sb-check {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: rgba(255,255,255,0.2);
          border: 3px solid rgba(255,255,255,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          margin: 0 auto 14px;
          animation: popIn 0.4s cubic-bezier(.4,0,.2,1);
        }
        .sb-title {
          font-family: 'Playfair Display', serif;
          font-size: 20px;
          font-weight: 800;
          color: #fff;
        }
        .sb-sub {
          font-size: 13px;
          color: rgba(255,255,255,0.85);
          margin-top: 6px;
        }

        .action-card {
          background: var(--white);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 18px 16px;
          text-align: center;
          cursor: pointer;
          transition: all 0.15s;
          box-shadow: var(--shadow-sm);
        }
        .action-card:hover {
          border-color: var(--orange-border);
          background: var(--orange-pale);
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        @keyframes popIn {
          from { transform: scale(0.5); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
