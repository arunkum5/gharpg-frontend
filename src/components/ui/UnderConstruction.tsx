'use client'

import TopBar from '@/components/layout/TopBar'
import { useRouter } from 'next/navigation'

interface UnderConstructionProps {
  title: string
  role: 'superadmin' | 'pgadmin'
}

export default function UnderConstruction({ title, role }: UnderConstructionProps) {
  const router = useRouter()

  const activeFeatures = role === 'superadmin' 
    ? [
        { name: 'Dashboard', route: '/superadmin/dashboard', icon: '📊' },
        { name: 'Register New PG', route: '/superadmin/pgs/register', icon: '＋' }
      ]
    : [
        { name: 'Dashboard', route: '/pgadmin/dashboard', icon: '📊' },
        { name: 'Floors & Rooms Builder', route: '/pgadmin/rooms', icon: '🏢' },
        { name: 'Guest Directory', route: '/pgadmin/guests', icon: '👥' },
        { name: 'Onboard Guest', route: '/pgadmin/guests/add', icon: '👤' },
        { name: 'Announcement notices', route: '/pgadmin/notices', icon: '🔔' }
      ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title={title} subtitle="Feature Under Construction" />
      
      <div className="flex-1 p-6 flex items-center justify-center bg-[#FAF6F2]">
        <div className="max-w-[480px] w-full bg-white border border-[#EDE0D4] rounded-[16px] p-8 text-center shadow-sm">
          <div className="text-[54px] mb-4">🛠️</div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 800, color: '#1C0F05', marginBottom: 10 }}>
            {title} is Coming Soon!
          </h2>
          <p style={{ fontSize: 13.5, color: '#6B4F38', lineHeight: 1.6, marginBottom: 24 }}>
            This page is part of a future release. Currently, the core flows of the GharPG platform are fully functional. Please try one of the active features below:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#A89080', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Active Working Features
            </div>
            {activeFeatures.map(f => (
              <div
                key={f.route}
                onClick={() => router.push(f.route)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: '1.5px solid #EDE0D4',
                  background: '#FAF6F2',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 700,
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#FFD9B8';
                  e.currentTarget.style.background = '#FFF4EC';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#EDE0D4';
                  e.currentTarget.style.background = '#FAF6F2';
                }}
              >
                <span style={{ fontSize: 16 }}>{f.icon}</span>
                <span style={{ flex: 1 }}>{f.name}</span>
                <span style={{ color: '#F4700A' }}>Go →</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
