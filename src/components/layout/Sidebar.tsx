'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { UserRole } from '@/lib/types/database'
import { cn } from '@/lib/utils'

interface NavItem {
  icon:  string
  label: string
  href:  string
  badge?: number
}

interface SidebarProps {
  role:     UserRole
  userName: string
  pgName?:  string
}

const SUPERADMIN_NAV: NavItem[] = [
  { icon: '📊', label: 'Dashboard',    href: '/superadmin/dashboard' },
  { icon: '🏘️', label: 'All PGs',     href: '/superadmin/pgs' },
  { icon: '👥', label: 'All Guests',   href: '/superadmin/guests' },
  { icon: '🧑‍💼', label: 'PG Admins',  href: '/superadmin/admins' },
  { icon: '✅', label: 'Approvals',    href: '/superadmin/approvals' },
  { icon: '💰', label: 'Revenue',      href: '/superadmin/revenue' },
  { icon: '📋', label: 'Reports',      href: '/superadmin/reports' },
  { icon: '🔧', label: 'Platform Config', href: '/superadmin/config' },
]

const PGADMIN_NAV: NavItem[] = [
  { icon: '📊', label: 'Dashboard',    href: '/pgadmin/dashboard' },
  { icon: '🏢', label: 'Floors & Rooms', href: '/pgadmin/rooms' },
  { icon: '👥', label: 'Guests',       href: '/pgadmin/guests' },
  { icon: '✅', label: 'Approvals',    href: '/pgadmin/approvals' },
  { icon: '🍱', label: 'Food Menu',    href: '/pgadmin/food' },
  { icon: '💰', label: 'Payments',     href: '/pgadmin/payments' },
  { icon: '🔔', label: 'Notices',      href: '/pgadmin/notices' },
  { icon: '📋', label: 'Reports',      href: '/pgadmin/reports' },
  { icon: '⚙️', label: 'PG Settings', href: '/pgadmin/settings' },
]

export default function Sidebar({ role, userName, pgName }: SidebarProps) {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()
  const nav      = role === 'superadmin' ? SUPERADMIN_NAV : PGADMIN_NAV
  const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-[220px] flex-shrink-0 flex flex-col h-screen"
      style={{ background: '#1C0F05' }}>

      {/* Logo */}
      <div className="flex items-center gap-2.5 px-[18px] py-5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-lg flex-shrink-0"
          style={{ background: '#F4700A' }}>🏠</div>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 800, color: '#fff' }}>GharPG</div>
          <div style={{ fontSize: 9.5, color: '#A07858', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginTop: 1 }}>
            {role === 'superadmin' ? 'Super Admin' : 'Admin Panel'}
          </div>
        </div>
      </div>

      {/* Role badge — Super Admin only */}
      {role === 'superadmin' && (
        <div className="mx-3 mt-3 mb-1 flex items-center gap-2 px-3 py-2 rounded-[9px]"
          style={{ background: 'linear-gradient(135deg,rgba(244,112,10,0.2),rgba(244,112,10,0.08))', border: '1px solid rgba(244,112,10,0.25)' }}>
          <span>👑</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>Super Admin</div>
            <div style={{ fontSize: 10, color: '#A07858' }}>Platform Owner</div>
          </div>
        </div>
      )}

      {/* PG Selector — PG Admin only */}
      {role === 'pgadmin' && pgName && (
        <div className="mx-3 mt-3 mb-1 flex items-center justify-between px-3 py-2 rounded-[10px] cursor-pointer"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <div style={{ fontSize: 9.5, color: '#A07858', textTransform: 'uppercase', letterSpacing: '1px' }}>Current PG</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginTop: 2 }}>{pgName}</div>
          </div>
          <span style={{ color: '#A07858', fontSize: 11 }}>⌄</span>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2" style={{ scrollbarWidth: 'none' }}>
        {nav.map(item => {
          const active = pathname === item.href ||
            (item.href !== '/pgadmin/dashboard' && item.href !== '/superadmin/dashboard' && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href}
              className="flex items-center gap-2.5 px-[18px] py-[9px] relative transition-all no-underline"
              style={{ color: active ? '#fff' : '#A07858', background: active ? 'rgba(244,112,10,0.14)' : 'transparent', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
              {active && (
                <div className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-sm"
                  style={{ background: '#F4700A' }} />
              )}
              <span style={{ fontSize: 15, width: 18, textAlign: 'center' }}>{item.icon}</span>
              <span>{item.label}</span>
              {item.badge && (
                <span className="ml-auto text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: '#F4700A' }}>{item.badge}</span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Profile + Logout */}
      <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-2.5 p-2 rounded-[10px] cursor-pointer group">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ background: role === 'superadmin' ? 'linear-gradient(135deg,#7C3AED,#A78BFA)' : 'linear-gradient(135deg,#F4700A,#FF6B00)' }}>
            {initials}
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#fff' }}>{userName}</div>
            <div style={{ fontSize: 10.5, color: '#A07858' }}>
              {role === 'superadmin' ? 'Super Admin' : 'PG Admin'}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="ml-auto text-xs px-2 py-1 rounded-md transition-all"
            style={{ color: '#A07858', background: 'transparent' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.color = '#fff' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#A07858' }}>
            Exit
          </button>
        </div>
      </div>
    </aside>
  )
}
