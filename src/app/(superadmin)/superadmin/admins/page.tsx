'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import TopBar from '@/components/layout/TopBar'
import { toast } from 'sonner'
import { resetUserPasswordAction } from '@/app/actions/auth'

interface PGAdminProfile {
  id: string
  name: string
  email: string | null
  phone: string | null
  is_active: boolean
  pg_admins: {
    id: string
    is_active: boolean
    pg_id: string
    pgs: {
      id: string
      name: string
      city: string
    } | null
  }[]
}

interface PGInfo {
  id: string
  name: string
}

export default function SuperAdminAdmins() {
  const router = useRouter()
  const supabase = createClient()

  // States
  const [admins, setAdmins] = useState<PGAdminProfile[]>([])
  const [pgs, setPgs] = useState<PGInfo[]>([])
  const [guestCounts, setGuestCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Edit modal states
  const [editingAdmin, setEditingAdmin] = useState<PGAdminProfile | null>(null)
  const [selectedPgId, setSelectedPgId] = useState<string>('')
  const [saving, setSaving] = useState(false)

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

      // Fetch parallel resources:
      // 1. profiles where role is pgadmin
      // 2. all active PGs
      // 3. active guest records to compute counts client-side
      const [profilesRes, pgsRes, guestsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select(`
            id, name, email, phone, is_active,
            pg_admins(id, is_active, pg_id, pgs(id, name, city))
          `)
          .eq('role', 'pgadmin')
          .order('name'),
        supabase
          .from('pgs')
          .select('id, name')
          .is('deleted_at', null)
          .order('name'),
        supabase
          .from('guests')
          .select('pg_id')
          .eq('status', 'active')
      ])

      if (profilesRes.error) throw profilesRes.error
      if (pgsRes.error) throw pgsRes.error
      if (guestsRes.error) throw guestsRes.error

      setAdmins(profilesRes.data as unknown as PGAdminProfile[])
      setPgs(pgsRes.data || [])

      // Map guest counts per PG
      const counts: Record<string, number> = {}
      guestsRes.data.forEach(g => {
        if (g.pg_id) {
          counts[g.pg_id] = (counts[g.pg_id] || 0) + 1
        }
      })
      setGuestCounts(counts)
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to load admin profiles')
    } finally {
      setLoading(false)
    }
  }

  // Toggle active status
  async function handleToggleActive(adminId: string, currentStatus: boolean) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          is_active: !currentStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', adminId)

      if (error) throw error

      toast.success(`Admin profile is now ${!currentStatus ? 'Active' : 'Deactivated'}`)
      setAdmins(prev => prev.map(a => a.id === adminId ? { ...a, is_active: !currentStatus } : a))
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to update admin profile')
    }
  }

  // Open edit modal
  function openEditModal(admin: PGAdminProfile) {
    setEditingAdmin(admin)
    // Find currently active PG assignment
    const activeAssign = admin.pg_admins.find(pa => pa.is_active)
    setSelectedPgId(activeAssign?.pg_id || 'none')
  }

  // Save new PG assignment
  async function handleSaveAssignment() {
    if (!editingAdmin) return
    setSaving(true)
    try {
      // 1. Deactivate current active assignments
      await supabase
        .from('pg_admins')
        .update({ is_active: false })
        .eq('user_id', editingAdmin.id)

      // 2. If assigning to a PG, insert new record
      if (selectedPgId !== 'none') {
        const { error } = await supabase
          .from('pg_admins')
          .insert({
            user_id: editingAdmin.id,
            pg_id: selectedPgId,
            is_active: true
          })
        
        if (error) throw error
      }

      toast.success('PG assignment updated successfully!')
      setEditingAdmin(null)
      await fetchData()
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to update assignment')
    } finally {
      setSaving(false)
    }
  }

  // Reset login PIN
  async function handleResetPin(userId: string, name: string) {
    if (!confirm(`Are you sure you want to reset the login PIN for ${name} to "123456"?`)) return
    try {
      const res = await resetUserPasswordAction(userId)
      if (!res.success) throw new Error(res.error || 'Failed to reset PIN')
      toast.success(`PIN for ${name} has been reset to "123456"!`)
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || 'Failed to reset PIN')
    }
  }

  // Filter admins
  const filteredAdmins = admins.filter(admin => {
    const activePg = admin.pg_admins.find(pa => pa.is_active)?.pgs
    const query = searchQuery.toLowerCase()
    
    return admin.name.toLowerCase().includes(query) || 
           (admin.email && admin.email.toLowerCase().includes(query)) ||
           (admin.phone && admin.phone.toLowerCase().includes(query)) ||
           (activePg && activePg.name.toLowerCase().includes(query))
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar 
        title="🧑‍💼 PG Admins" 
        subtitle={`Platform has ${admins.length} registered PG Admins`}
      />

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-[#FAF6F2]">
        
        {/* SEARCH BAR */}
        <div className="filters-bar">
          <div className="search-wrap">
            <span className="search-ic">🔍</span>
            <input 
              type="text" 
              placeholder="Search by admin name, email, phone, or assigned PG..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        {/* LOADING / TABLE */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-[#A89080]">
            Loading admin list...
          </div>
        ) : filteredAdmins.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-white border border-[#EDE0D4] rounded-[16px] p-12 text-center">
            <div style={{ fontSize: 48, marginBottom: 14 }}>🧑‍💼</div>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700 }}>No Admins Found</h3>
            <p style={{ fontSize: 13, color: '#A89080', marginTop: 4 }}>
              Try inviting new admins during PG registration or adjust search parameters.
            </p>
          </div>
        ) : (
          <div className="table-card">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Admin Name / Contact</th>
                  <th>Assigned PG</th>
                  <th>City</th>
                  <th>Guests Managed</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAdmins.map(admin => {
                  const initials = admin.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                  const activeAssign = admin.pg_admins.find(pa => pa.is_active)
                  const activePg = activeAssign?.pgs
                  const guestCount = activePg ? (guestCounts[activePg.id] || 0) : 0

                  return (
                    <tr key={admin.id}>
                      <td>
                        <div className="admin-profile-cell">
                          <div className="admin-av">{initials}</div>
                          <div>
                            <div className="admin-name">{admin.name}</div>
                            <div className="admin-sub">{admin.email} · {admin.phone}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontWeight: 700, color: '#1C0F05' }}>
                        {activePg ? activePg.name : '— Unassigned'}
                      </td>
                      <td style={{ color: '#6B4F38' }}>
                        {activePg ? activePg.city : '—'}
                      </td>
                      <td style={{ fontWeight: 800, color: '#1C0F05' }}>
                        {activePg ? guestCount : '—'}
                      </td>
                      <td>
                        <span className={`status-badge ${admin.is_active ? 'badge-active' : 'badge-inactive'}`}>
                          {admin.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td>
                        <div className="actions-cell">
                          <button 
                            className="action-btn text-orange"
                            onClick={() => handleResetPin(admin.id, admin.name)}
                          >
                            Reset PIN 🔑
                          </button>
                          <button 
                            className="action-btn text-orange"
                            onClick={() => openEditModal(admin)}
                          >
                            Reassign PG 🏢
                          </button>
                          <button 
                            className={`action-btn ${admin.is_active ? 'text-red' : 'text-green'}`}
                            onClick={() => handleToggleActive(admin.id, admin.is_active)}
                          >
                            {admin.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* REASSIGN MODAL */}
      {editingAdmin && (
        <div className="modal-overlay" onClick={() => setEditingAdmin(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <div className="modal-title">🏢 Reassign PG Property</div>
              <div className="modal-close" onClick={() => setEditingAdmin(null)}>✕</div>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: '#6B4F38', marginBottom: 14 }}>
                Change PG property assignment for <strong>{editingAdmin.name}</strong>. An admin can only be assigned to one active property at a time.
              </p>
              <div className="field">
                <label>Select PG Property</label>
                <select value={selectedPgId} onChange={e => setSelectedPgId(e.target.value)}>
                  <option value="none">None (Unassigned)</option>
                  {pgs.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-foot">
              <button className="m-btn-ghost" onClick={() => setEditingAdmin(null)}>
                Cancel
              </button>
              <button 
                className="m-btn-primary" 
                onClick={handleSaveAssignment}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .filters-bar {
          background: #fff;
          border: 1px solid #EDE0D4;
          border-radius: 14px;
          padding: 16px 20px;
          box-shadow: 0 1px 4px rgba(28,15,5,0.06);
        }

        .search-wrap {
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

        .table-card {
          background: #fff;
          border: 1px solid #EDE0D4;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 1px 4px rgba(28,15,5,0.06);
        }

        .admin-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }
        .admin-table th {
          font-size: 10.5px;
          font-weight: 800;
          color: #A89080;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          padding: 14px 20px;
          border-bottom: 1.5px solid #EDE0D4;
          background: #FAF6F2;
        }
        .admin-table td {
          padding: 12px 20px;
          font-size: 13.5px;
          border-bottom: 1px solid #F5EDE5;
          vertical-align: middle;
        }
        .admin-table tr:last-child td {
          border-bottom: none;
        }
        .admin-table tr:hover td {
          background: #FFF4EC;
        }

        .admin-profile-cell {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .admin-av {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: linear-gradient(135deg, #F4700A, #FFAA60);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13.5px;
          font-weight: 800;
          color: #fff;
          flex-shrink: 0;
        }
        .admin-name {
          font-weight: 700;
          color: #1C0F05;
        }
        .admin-sub {
          font-size: 11px;
          color: #A89080;
          margin-top: 2px;
        }

        .status-badge {
          font-size: 10px;
          font-weight: 800;
          padding: 3px 8px;
          border-radius: 20px;
          text-transform: uppercase;
          display: inline-block;
        }
        .badge-active {
          background: #E6F9F0;
          color: #1DB970;
        }
        .badge-inactive {
          background: #FDECEA;
          color: #E53935;
        }

        .actions-cell {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
        }

        .action-btn {
          background: transparent;
          border: none;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          padding: 4px 8px;
          border-radius: 6px;
          transition: background 0.15s;
        }
        .action-btn:hover {
          background: rgba(0,0,0,0.04);
        }

        .text-orange { color: #F4700A; }
        .text-red { color: #E53935; }
        .text-green { color: #1DB970; }

        /* MODALS */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(28,15,5,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.2s ease;
        }
        .modal {
          background: #fff;
          border-radius: 16px;
          max-width: 440px;
          width: 90%;
          box-shadow: 0 12px 36px rgba(28,15,5,0.15);
          overflow: hidden;
          animation: scaleUp 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .modal-hd {
          padding: 18px 20px;
          border-bottom: 1px solid #EDE0D4;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .modal-title {
          font-family: 'Playfair Display', serif;
          font-size: 16px;
          font-weight: 700;
          color: #1C0F05;
        }
        .modal-close {
          cursor: pointer;
          color: #A89080;
          font-size: 16px;
        }
        .modal-body {
          padding: 20px;
        }
        .modal-foot {
          padding: 14px 20px;
          background: #FAF6F2;
          border-top: 1px solid #EDE0D4;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .field label {
          font-size: 10.5px;
          font-weight: 800;
          color: #6B4F38;
          text-transform: uppercase;
          letter-spacing: 0.8px;
        }
        .field select {
          border: 1.5px solid #EDE0D4;
          border-radius: 10px;
          padding: 10px;
          font-size: 13.5px;
          background: #FAF6F2;
          outline: none;
          font-family: inherit;
          color: #1C0F05;
          cursor: pointer;
        }

        .m-btn-ghost {
          background: transparent;
          border: 1px solid #EDE0D4;
          color: #6B4F38;
          border-radius: 8px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
        }
        .m-btn-primary {
          background: #F4700A;
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 8px 18px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
        }
        .m-btn-primary:hover {
          background: #E05C00;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
