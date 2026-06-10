'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────
type Role = 'superadmin' | 'pgadmin' | 'guest'

const ROLE_CONFIG = {
  superadmin: { icon: '👑', label: 'Super Admin', desc: 'Platform owner' },
  pgadmin:    { icon: '🏠', label: 'PG Admin',    desc: 'PG manager'     },
  guest:      { icon: '🛏️', label: 'Guest',       desc: 'PG resident'   },
} as const

const REDIRECT = {
  superadmin: '/superadmin/dashboard',
  pgadmin:    '/pgadmin/dashboard',
  guest:      '/guest/home',
} as const

// ── Saved account type ────────────────────────────────────
interface SavedAccount {
  email:  string
  name:   string
  role:   Role
  initials: string
  color:  string
}

// ── Avatar colors per role ────────────────────────────────
const ROLE_COLOR: Record<Role, string> = {
  superadmin: 'linear-gradient(135deg,#7C3AED,#A78BFA)',
  pgadmin:    'linear-gradient(135deg,#F4700A,#FFAA60)',
  guest:      'linear-gradient(135deg,#1DB970,#5DE89A)',
}

// ─────────────────────────────────────────────────────────
export default function LoginPage() {
  const router  = useRouter()
  const supabase = createClient()

  const [role,     setRole]     = useState<Role>('pgadmin')
  const [email,    setEmail]    = useState('')
  const [pin,      setPin]      = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState(false)
  const [successName, setSuccessName] = useState('')
  const [saved,    setSaved]    = useState<SavedAccount[]>([])

  // Load saved accounts on mount
  useEffect(() => {
    const list = JSON.parse(localStorage.getItem('gharpg_accounts') || '[]')
    setSaved(list)
  }, [])

  // Keyboard PIN input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (success) return
      if (document.activeElement?.id === 'email-input') return
      if (e.key >= '0' && e.key <= '9' && pin.length < 4) {
        setPin(p => p + e.key)
        setError('')
      }
      if (e.key === 'Backspace') setPin(p => p.slice(0, -1))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pin, success])

  // Auto-submit when PIN reaches 6 digits
  useEffect(() => {
    if (pin.length === 6) {
      const t = setTimeout(() => doLogin(), 150)
      return () => clearTimeout(t)
    }
  }, [pin])

  // ── Saved accounts ──────────────────────────────────────
  function saveAccount(name: string, emailVal: string, roleVal: Role) {
    const list: SavedAccount[] = JSON.parse(localStorage.getItem('gharpg_accounts') || '[]')
    const initials = name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    const entry: SavedAccount = { email: emailVal, name, role: roleVal, initials, color: ROLE_COLOR[roleVal] }
    const idx = list.findIndex(s => s.email === emailVal)
    if (idx >= 0) list[idx] = entry; else list.unshift(entry)
    if (list.length > 5) list.pop()
    localStorage.setItem('gharpg_accounts', JSON.stringify(list))
    setSaved(list)
  }

  function removeSaved(e: React.MouseEvent, idx: number) {
    e.stopPropagation()
    const list = [...saved]
    list.splice(idx, 1)
    localStorage.setItem('gharpg_accounts', JSON.stringify(list))
    setSaved(list)
  }

  function clickSaved(acc: SavedAccount) {
    setRole(acc.role)
    setEmail(acc.email)
    setPin('')
    setError('')
  }

  // ── Login ───────────────────────────────────────────────
  async function doLogin() {
    if (!email.trim()) { setError('Please enter your email.'); setPin(''); return }
    if (pin.length < 6) { setError('Please enter your 6-digit PIN.'); return }

    setLoading(true)
    setError('')

    try {
      // PIN is used as password in Supabase Auth
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pin,
      })

      if (authError || !data.user) {
        setError('Incorrect email or PIN. Please try again.')
        setPin('')
        setLoading(false)
        return
      }

      // Check role matches
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, role')
        .eq('id', data.user.id)
        .single()

      if (!profile) {
        setError('Profile not found. Contact admin.')
        setPin('')
        setLoading(false)
        return
      }

      if (profile.role !== role) {
        setError(`This account is a ${profile.role === 'superadmin' ? 'Super Admin' : profile.role === 'pgadmin' ? 'PG Admin' : 'Guest'}. Please select correct role.`)
        setPin('')
        setLoading(false)
        return
      }

      // Save to localStorage
      if (rememberMe) saveAccount(profile.name, email.trim(), role)

      // Show success
      setSuccessName(profile.name.split(' ')[0])
      setSuccess(true)
      setLoading(false)

      // Redirect
      setTimeout(() => router.push(REDIRECT[role]), 2000)

    } catch {
      setError('Something went wrong. Please try again.')
      setPin('')
      setLoading(false)
    }
  }

  function pressNum(n: string) {
    if (pin.length >= 6 || success) return
    setPin(p => p + n)
    setError('')
  }

  function pressDelete() {
    setPin(p => p.slice(0, -1))
  }

  // ── Render ──────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", background: '#FAF6F2' }}>

      {/* ── LEFT PANEL ── */}
      <div className="hidden lg:flex flex-col w-[440px] flex-shrink-0 p-12 relative overflow-hidden" style={{ background: '#1C0F05' }}>
        {/* decorative circles */}
        <div className="absolute w-80 h-80 rounded-full top-[-80px] right-[-80px]" style={{ border: '1px solid rgba(244,112,10,0.12)' }} />
        <div className="absolute w-56 h-56 rounded-full bottom-16 left-[-60px]" style={{ border: '1px solid rgba(244,112,10,0.08)' }} />

        {/* Logo */}
        <div className="flex items-center gap-3 mb-14 relative z-10">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: '#F4700A', boxShadow: '0 4px 16px rgba(244,112,10,0.4)' }}>🏠</div>
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 800, color: '#fff' }}>GharPG</div>
            <div style={{ fontSize: 10, color: '#6B4030', textTransform: 'uppercase', letterSpacing: '1.8px', fontWeight: 700 }}>PG Management</div>
          </div>
        </div>

        {/* Headline */}
        <div className="relative z-10">
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 38, fontWeight: 800, color: '#fff', lineHeight: 1.15, letterSpacing: -1, marginBottom: 14 }}>
            Your Home,<br /><em style={{ color: '#FF9240' }}>Away from</em><br />Home.
          </div>
          <div style={{ fontSize: 14, color: '#7A5040', lineHeight: 1.7, maxWidth: 300, marginBottom: 44 }}>
            India&apos;s smartest PG management platform — built for owners, admins, and guests.
          </div>

          {/* Features */}
          <div className="flex flex-col gap-4">
            {[
              { ic: '🏢', t: 'Visual Room Builder', d: '— design floors & rooms with a click' },
              { ic: '✅', t: 'One-click Approvals', d: '— approve or reject guest requests' },
              { ic: '📣', t: 'Smart Notices',       d: '— broadcast to all guests or floors' },
              { ic: '📱', t: 'Guest PWA',           d: '— works on any phone, no install needed' },
            ].map(f => (
              <div key={f.t} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                  style={{ background: 'rgba(244,112,10,0.12)', border: '1px solid rgba(244,112,10,0.18)' }}>
                  {f.ic}
                </div>
                <div style={{ fontSize: 13, color: '#9A7060', lineHeight: 1.4 }}>
                  <strong style={{ color: '#C9A882' }}>{f.t}</strong> {f.d}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto relative z-10" style={{ fontSize: 11.5, color: '#4A2E1A', paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          © 2026 GharPG · Made with ❤️ in India
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex items-center justify-center p-8" style={{ background: '#FAF6F2' }}>
        <div className="w-full max-w-[400px]">

          <div style={{ fontSize: 12, fontWeight: 700, color: '#A89080', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 5 }}>Welcome back</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 800, color: '#1C0F05', marginBottom: 22, letterSpacing: -0.5 }}>
            Sign in to GharPG
          </div>

          {/* ROLE SELECTOR */}
          <div className="flex gap-2 mb-6">
            {(Object.entries(ROLE_CONFIG) as [Role, typeof ROLE_CONFIG[Role]][]).map(([r, cfg]) => (
              <button
                key={r}
                onClick={() => { setRole(r); setPin(''); setError('') }}
                className="flex-1 rounded-xl py-3 px-2 text-center transition-all border-[1.5px] cursor-pointer"
                style={{
                  borderColor:       role === r ? '#F4700A' : '#EDE0D4',
                  background:        role === r ? '#FFF4EC' : '#fff',
                  boxShadow:         role === r ? '0 0 0 3px rgba(244,112,10,0.10)' : 'none',
                }}
              >
                <div style={{ fontSize: 22, marginBottom: 3 }}>{cfg.icon}</div>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: role === r ? '#F4700A' : '#6B4F38' }}>{cfg.label}</div>
                <div style={{ fontSize: 10, color: '#A89080', marginTop: 1 }}>{cfg.desc}</div>
              </button>
            ))}
          </div>

          {/* CARD */}
          <div className="rounded-[18px] p-6" style={{ background: '#fff', border: '1px solid #EDE0D4', boxShadow: '0 8px 40px rgba(28,15,5,0.12)' }}>

            {success ? (
              /* SUCCESS STATE */
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto mb-4"
                  style={{ background: '#E6F9F0', border: '3px solid #1DB970', animation: 'popIn 0.4s ease' }}>✓</div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 800, color: '#1C0F05', marginBottom: 5 }}>
                  Welcome, {successName}! 👋
                </div>
                <div style={{ fontSize: 13, color: '#A89080' }}>
                  {ROLE_CONFIG[role].label} · Redirecting to dashboard…
                </div>
                <div className="mt-4 h-1 rounded-full overflow-hidden" style={{ background: '#EDE0D4' }}>
                  <div className="h-full rounded-full" style={{ background: '#1DB970', width: '100%', transition: 'width 2s linear' }} />
                </div>
              </div>
            ) : (
              <>
                {/* SAVED ACCOUNTS */}
                {saved.length > 0 && (
                  <div className="mb-4">
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: '#A89080', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>
                      Saved Accounts
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {saved.map((acc, i) => (
                        <div
                          key={i}
                          onClick={() => clickSaved(acc)}
                          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all border-[1.5px]"
                          style={{ border: '1.5px solid #EDE0D4', background: '#FAF6F2' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#FFD9B8'; (e.currentTarget as HTMLElement).style.background = '#FFF4EC' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#EDE0D4'; (e.currentTarget as HTMLElement).style.background = '#FAF6F2' }}
                        >
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                            style={{ background: acc.color }}>{acc.initials}</div>
                          <div>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1C0F05' }}>{acc.name}</div>
                            <div style={{ fontSize: 10.5, color: '#A89080' }}>{acc.email} · {ROLE_CONFIG[acc.role as Role]?.label}</div>
                          </div>
                          <span style={{ marginLeft: 'auto', color: '#A89080', fontSize: 13 }}>→</span>
                          <span
                            onClick={e => removeSaved(e, i)}
                            className="text-xs px-1 py-0.5 rounded cursor-pointer"
                            style={{ color: '#A89080' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#EDE0D4'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                          >✕</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 my-4">
                      <div className="flex-1 h-px" style={{ background: '#EDE0D4' }} />
                      <span style={{ fontSize: 11, color: '#A89080', fontWeight: 600 }}>or sign in with another account</span>
                      <div className="flex-1 h-px" style={{ background: '#EDE0D4' }} />
                    </div>
                  </div>
                )}

                {/* ERROR */}
                {error && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-3 text-sm font-semibold"
                    style={{ background: '#FDECEA', border: '1.5px solid #F5C6C5', color: '#C62828' }}>
                    ⚠️ {error}
                  </div>
                )}

                {/* EMAIL */}
                <div className="mb-3">
                  <label style={{ fontSize: 11, fontWeight: 800, color: '#6B4F38', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: 6 }}>
                    Email
                  </label>
                  <div className="flex items-center rounded-xl overflow-hidden transition-all border-[1.5px]"
                    style={{ borderColor: '#EDE0D4', background: '#FAF6F2' }}
                    onFocus={e => (e.currentTarget as HTMLElement).style.borderColor = '#F4700A'}
                    onBlur={e => (e.currentTarget as HTMLElement).style.borderColor = '#EDE0D4'}>
                    <span className="px-3 text-lg" style={{ color: '#A89080' }}>👤</span>
                    <input
                      id="email-input"
                      type="email"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setError('') }}
                      placeholder="Enter your email"
                      autoComplete="email"
                      className="flex-1 py-3 pr-3 text-sm outline-none bg-transparent"
                      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#1C0F05', fontWeight: 500 }}
                    />
                  </div>
                </div>

                {/* PIN DOTS */}
                <div className="mb-3">
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#6B4F38', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
                    6-digit PIN
                  </div>
                  <div className="flex gap-3 justify-center mb-3">
                    {[0, 1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="w-4 h-4 rounded-full border-2 transition-all"
                        style={{
                          borderColor: error ? '#E53935' : i < pin.length ? '#F4700A' : '#EDE0D4',
                          background:  error ? '#E53935' : i < pin.length ? '#F4700A' : '#FAF6F2',
                          transform:   i < pin.length ? 'scale(1.15)' : 'scale(1)',
                        }} />
                    ))}
                  </div>

                  {/* NUMPAD */}
                  <div className="grid grid-cols-3 gap-2">
                    {['1','2','3','4','5','6','7','8','9'].map(n => (
                      <button key={n} onClick={() => pressNum(n)}
                        className="h-12 rounded-xl border-[1.5px] font-bold text-xl transition-all cursor-pointer"
                        style={{ borderColor: '#EDE0D4', background: '#FAF6F2', color: '#1C0F05', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#FFF4EC'; (e.currentTarget as HTMLElement).style.borderColor = '#FFD9B8'; (e.currentTarget as HTMLElement).style.color = '#F4700A' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FAF6F2'; (e.currentTarget as HTMLElement).style.borderColor = '#EDE0D4'; (e.currentTarget as HTMLElement).style.color = '#1C0F05' }}>
                        {n}
                      </button>
                    ))}
                    {/* empty, 0, delete */}
                    <div />
                    <button onClick={() => pressNum('0')}
                      className="h-12 rounded-xl border-[1.5px] font-bold text-xl transition-all cursor-pointer"
                      style={{ borderColor: '#EDE0D4', background: '#FAF6F2', color: '#1C0F05', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#FFF4EC'; (e.currentTarget as HTMLElement).style.borderColor = '#FFD9B8'; (e.currentTarget as HTMLElement).style.color = '#F4700A' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FAF6F2'; (e.currentTarget as HTMLElement).style.borderColor = '#EDE0D4'; (e.currentTarget as HTMLElement).style.color = '#1C0F05' }}>
                      0
                    </button>
                    <button onClick={pressDelete}
                      className="h-12 rounded-xl border-[1.5px] font-bold text-base transition-all cursor-pointer"
                      style={{ borderColor: '#F5C6C5', background: '#FDECEA', color: '#E53935', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#E53935'; (e.currentTarget as HTMLElement).style.color = '#fff' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FDECEA'; (e.currentTarget as HTMLElement).style.color = '#E53935' }}>
                      ⌫
                    </button>
                  </div>
                </div>

                {/* REMEMBER ME */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 cursor-pointer" onClick={() => setRememberMe(!rememberMe)}>
                    <div className="w-4 h-4 rounded flex items-center justify-center text-white text-xs transition-all"
                      style={{ background: rememberMe ? '#F4700A' : '#FAF6F2', border: `1.5px solid ${rememberMe ? '#F4700A' : '#EDE0D4'}` }}>
                      {rememberMe ? '✓' : ''}
                    </div>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: '#6B4F38' }}>Remember me</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#F4700A', cursor: 'pointer' }}>Forgot PIN?</span>
                </div>

                {/* LOGIN BUTTON */}
                <button
                  onClick={doLogin}
                  disabled={loading}
                  className="w-full rounded-xl py-3.5 text-white font-bold text-base transition-all cursor-pointer"
                  style={{
                    background:  loading ? '#FFAA60' : '#F4700A',
                    fontFamily:  "'Plus Jakarta Sans', sans-serif",
                    fontSize: 15, fontWeight: 800,
                  }}
                  onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#D95E00' }}
                  onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#F4700A' }}>
                  {loading ? 'Verifying…' : 'Sign In →'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@0,700;0,800;1,700&display=swap');
        @keyframes popIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  )
}
