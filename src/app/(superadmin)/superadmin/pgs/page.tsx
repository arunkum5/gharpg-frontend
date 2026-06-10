'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import TopBar from '@/components/layout/TopBar'
import { toast } from 'sonner'
import Link from 'next/link'

interface PG {
  id: string
  name: string
  type: 'boys' | 'girls' | 'coliving'
  address: string
  city: string
  state: string
  contact_phone: string
  is_active: boolean
  created_at: string
  rooms: {
    id: string
    status: string
    capacity: number
    current_occupancy: number
  }[]
}

interface PGWithStats extends PG {
  totalRooms: number
  occupiedRooms: number
  totalCapacity: number
  currentOccupancy: number
  occupancyPct: number
}

export default function SuperAdminPgs() {
  const router = useRouter()
  const supabase = createClient()

  // State
  const [pgs, setPgs] = useState<PGWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCity, setSelectedCity] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')

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

      // Query pgs with individual room status and capacity details
      const { data, error } = await supabase
        .from('pgs')
        .select(`
          *,
          rooms(id, status, capacity, current_occupancy)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (error) throw error

      const computed: PGWithStats[] = (data || []).map((pg: any) => {
        const rooms = pg.rooms || []
        const totalRooms = rooms.length
        const occupiedRooms = rooms.filter((r: any) => r.status !== 'free').length
        const totalCapacity = rooms.reduce((sum: number, r: any) => sum + (r.capacity || 0), 0)
        const currentOccupancy = rooms.reduce((sum: number, r: any) => sum + (r.current_occupancy || 0), 0)
        const occupancyPct = totalCapacity > 0 ? Math.round((currentOccupancy / totalCapacity) * 100) : 0

        return {
          ...pg,
          totalRooms,
          occupiedRooms,
          totalCapacity,
          currentOccupancy,
          occupancyPct
        }
      })

      setPgs(computed)
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to fetch PG properties')
    } finally {
      setLoading(false)
    }
  }

  // Toggle active status
  async function handleToggleActive(pgId: string, currentStatus: boolean) {
    try {
      const { error } = await supabase
        .from('pgs')
        .update({
          is_active: !currentStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', pgId)

      if (error) throw error
      
      toast.success(`PG property is now ${!currentStatus ? 'Active' : 'Inactive'}`)
      // Update local state directly to be responsive
      setPgs(prev => prev.map(pg => pg.id === pgId ? { ...pg, is_active: !currentStatus } : pg))
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to update status')
    }
  }

  // Delete property
  async function handleDeletePg(pgId: string, pgName: string) {
    if (!confirm(`Are you sure you want to delete "${pgName}"? This will hide it from the platform.`)) return
    try {
      const { error } = await supabase
        .from('pgs')
        .update({
          deleted_at: new Date().toISOString()
        })
        .eq('id', pgId)

      if (error) throw error

      toast.success(`"${pgName}" has been deleted`)
      setPgs(prev => prev.filter(pg => pg.id !== pgId))
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to delete PG property')
    }
  }

  // Get unique cities list for filter
  const uniqueCities = Array.from(new Set(pgs.map(pg => pg.city))).filter(Boolean)

  // Filtered pgs
  const filteredPgs = pgs.filter(pg => {
    const matchSearch = pg.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                        pg.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        pg.address.toLowerCase().includes(searchQuery.toLowerCase())
    const matchCity = selectedCity === 'all' || pg.city === selectedCity
    const matchStatus = selectedStatus === 'all' || 
                        (selectedStatus === 'active' && pg.is_active) || 
                        (selectedStatus === 'inactive' && !pg.is_active)
    
    return matchSearch && matchCity && matchStatus
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar 
        title="🏘️ All PGs" 
        subtitle={`Platform has ${pgs.length} registered properties`}
      >
        <Link href="/superadmin/pgs/register">
          <button className="tb-btn">
            ＋ Register PG
          </button>
        </Link>
      </TopBar>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-[#FAF6F2]">
        
        {/* FILTERS TOOLBAR */}
        <div className="filters-bar">
          <div className="search-wrap">
            <span className="search-ic">🔍</span>
            <input 
              type="text" 
              placeholder="Search by name, address, city..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="select-wrap">
            <label>City</label>
            <select value={selectedCity} onChange={e => setSelectedCity(e.target.value)}>
              <option value="all">All Cities</option>
              {uniqueCities.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="select-wrap">
            <label>Status</label>
            <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* LOADING / EMPTY / GRID */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-[#A89080]">
            Loading registered properties...
          </div>
        ) : filteredPgs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-white border border-[#EDE0D4] rounded-[16px] p-12 text-center">
            <div style={{ fontSize: 48, marginBottom: 14 }}>🏘️</div>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700 }}>No PGs Found</h3>
            <p style={{ fontSize: 13, color: '#A89080', marginTop: 4, marginBottom: 16 }}>
              {pgs.length === 0 ? 'Start by registering your first PG property.' : 'No properties match your active filters.'}
            </p>
            {pgs.length === 0 && (
              <Link href="/superadmin/pgs/register">
                <button className="tb-btn">＋ Register PG</button>
              </Link>
            )}
          </div>
        ) : (
          <div className="pg-grid">
            {filteredPgs.map(pg => {
              const statusClass = pg.is_active ? 'badge-active' : 'badge-inactive'
              const progressColor = pg.occupancyPct > 85 ? '#E53935' : pg.occupancyPct > 50 ? '#F4700A' : '#1DB970'

              return (
                <div key={pg.id} className="pg-card">
                  <div className="pg-card-hd">
                    <div className="pg-avatar">
                      {pg.type === 'boys' ? '👨' : pg.type === 'girls' ? '👩' : '👫'}
                    </div>
                    <div>
                      <div className="pg-title-text">{pg.name}</div>
                      <div className="pg-subtitle-text">📍 {pg.city}, {pg.state}</div>
                    </div>
                    <span className={`status-badge ${statusClass}`}>
                      {pg.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="pg-card-body">
                    <div className="stats-row">
                      <div className="stat-box">
                        <span className="stat-lbl">Rooms</span>
                        <span className="stat-val">{pg.totalRooms}</span>
                      </div>
                      <div className="stat-box">
                        <span className="stat-lbl">Occupancy</span>
                        <span className="stat-val">{pg.currentOccupancy} / {pg.totalCapacity}</span>
                      </div>
                      <div className="stat-box">
                        <span className="stat-lbl">Occupancy %</span>
                        <span className="stat-val" style={{ color: progressColor }}>{pg.occupancyPct}%</span>
                      </div>
                    </div>

                    <div className="progress-container">
                      <div className="progress-bg">
                        <div 
                          className="progress-fill" 
                          style={{ width: `${pg.occupancyPct}%`, background: progressColor }}
                        />
                      </div>
                    </div>

                    <div style={{ fontSize: 12.5, color: '#6B4F38', wordBreak: 'break-word', lineHeight: 1.5 }}>
                      {pg.address}
                    </div>
                    {pg.contact_phone && (
                      <div style={{ fontSize: 12, color: '#A89080', marginTop: 4 }}>
                        📞 Contact: {pg.contact_phone}
                      </div>
                    )}
                  </div>

                  <div className="pg-card-foot">
                    <div className="toggle-wrap">
                      <label className="switch">
                        <input 
                          type="checkbox" 
                          checked={pg.is_active} 
                          onChange={() => handleToggleActive(pg.id, pg.is_active)}
                        />
                        <span className="slider round"></span>
                      </label>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#6B4F38' }}>
                        {pg.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button 
                        onClick={() => handleDeletePg(pg.id, pg.name)}
                        className="delete-btn-pg"
                        title="Delete PG Property"
                      >
                        🗑️
                      </button>
                      <button 
                        onClick={() => router.push(`/pgadmin/rooms?pgId=${pg.id}`)}
                        className="edit-btn"
                      >
                        Set Up Rooms 🏢
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <style>{`
        .tb-btn {
          background: #F4700A;
          color: #fff;
          border: none;
          border-radius: 9px;
          padding: 9px 18px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s;
        }
        .tb-btn:hover {
          background: #E05C00;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(244,112,10,0.3);
        }

        .filters-bar {
          background: #fff;
          border: 1px solid #EDE0D4;
          border-radius: 14px;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          box-shadow: 0 1px 4px rgba(28,15,5,0.06);
        }

        .search-wrap {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 8px;
          background: #FAF6F2;
          border: 1.5px solid #EDE0D4;
          border-radius: 10px;
          padding: 8px 12px;
        }
        .search-ic {
          font-size: 16px;
          color: #A89080;
        }
        .search-input {
          flex: 1;
          border: none;
          background: transparent;
          outline: none;
          font-size: 13.5px;
          font-family: inherit;
          color: #1C0F05;
        }

        .select-wrap {
          display: flex;
          flex-direction: column;
          gap: 3px;
          width: 140px;
        }
        .select-wrap label {
          font-size: 10px;
          font-weight: 800;
          color: #A89080;
          text-transform: uppercase;
          letter-spacing: 0.8px;
        }
        .select-wrap select {
          border: 1.5px solid #EDE0D4;
          border-radius: 10px;
          padding: 8px;
          font-size: 13px;
          background: #FAF6F2;
          outline: none;
          font-family: inherit;
          color: #1C0F05;
          cursor: pointer;
        }

        .pg-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
        }

        .pg-card {
          background: #fff;
          border: 1px solid #EDE0D4;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 1px 4px rgba(28,15,5,0.06);
          display: flex;
          flex-direction: column;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .pg-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 16px rgba(28,15,5,0.1);
        }

        .pg-card-hd {
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          border-bottom: 1px solid #EDE0D4;
        }
        .pg-avatar {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: #FFF4EC;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          flex-shrink: 0;
        }
        .pg-title-text {
          font-size: 14px;
          font-weight: 800;
          color: #1C0F05;
        }
        .pg-subtitle-text {
          font-size: 11.5px;
          color: #A89080;
          margin-top: 2px;
        }

        .status-badge {
          margin-left: auto;
          font-size: 10px;
          font-weight: 800;
          padding: 3px 8px;
          border-radius: 20px;
          text-transform: uppercase;
        }
        .badge-active {
          background: #E6F9F0;
          color: #1DB970;
        }
        .badge-inactive {
          background: #FDECEA;
          color: #E53935;
        }

        .pg-card-body {
          padding: 16px;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .stats-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          background: #FAF6F2;
          border-radius: 10px;
          padding: 10px;
          text-align: center;
        }
        .stat-box {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .stat-box:not(:last-child) {
          border-right: 1px solid #EDE0D4;
        }
        .stat-lbl {
          font-size: 9px;
          font-weight: 800;
          color: #A89080;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .stat-val {
          font-size: 13.5px;
          font-weight: 800;
          color: #1C0F05;
        }

        .progress-container {
          margin: 4px 0;
        }
        .progress-bg {
          height: 6px;
          background: #F0EDE8;
          border-radius: 20px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          border-radius: 20px;
          transition: width 0.3s ease;
        }

        .pg-card-foot {
          padding: 12px 16px;
          background: #FAF6F2;
          border-top: 1px solid #EDE0D4;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .toggle-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .edit-btn {
          border: 1px solid #EDE0D4;
          background: #fff;
          border-radius: 8px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 700;
          color: #6B4F38;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s;
        }
        .edit-btn:hover {
          background: #FFF4EC;
          border-color: #FFD9B8;
          color: #F4700A;
        }

        .delete-btn-pg {
          border: 1px solid #EDE0D4;
          background: #fff;
          border-radius: 8px;
          padding: 6px 10px;
          font-size: 12px;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s;
        }
        .delete-btn-pg:hover {
          background: #FDECEA;
          border-color: #F5C6C5;
          color: #E53935;
        }

        /* TOGGLE SWITCH SWITCH STYLE */
        .switch {
          position: relative;
          display: inline-block;
          width: 34px;
          height: 20px;
        }
        .switch input { 
          opacity: 0;
          width: 0;
          height: 0;
        }
        .slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #D0C4BA;
          transition: .3s;
        }
        .slider:before {
          position: absolute;
          content: "";
          height: 14px;
          width: 14px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .3s;
        }
        input:checked + .slider {
          background-color: #1DB970;
        }
        input:focus + .slider {
          box-shadow: 0 0 1px #1DB970;
        }
        input:checked + .slider:before {
          transform: translateX(14px);
        }
        .slider.round {
          border-radius: 20px;
        }
        .slider.round:before {
          border-radius: 50%;
        }
      `}</style>
    </div>
  )
}
