'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import TopBar from '@/components/layout/TopBar'
import { toast } from 'sonner'
import { GuestIssueWithDetails, IssueStatus } from '@/lib/types/database'

export default function PGAdminIssuesPage() {
  const router = useRouter()
  const supabase = createClient()

  const [pgId, setPgId] = useState<string | null>(null)
  const [pgName, setPgName] = useState<string>('My PG')
  const [issues, setIssues] = useState<GuestIssueWithDetails[]>([])
  const [loading, setLoading] = useState(true)

  // Filter states
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved'>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

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

      // Get PG Admin details
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

      // Fetch all issues with guest details
      const { data: issuesData, error: issuesErr } = await supabase
        .from('guest_issues')
        .select(`
          *,
          guest:guests (
            id,
            first_name,
            last_name,
            room_id,
            rooms (room_number)
          )
        `)
        .eq('pg_id', pg.id)
        .order('created_at', { ascending: false })

      if (issuesErr) throw issuesErr

      setIssues(issuesData as unknown as GuestIssueWithDetails[])
    } catch (err: any) {
      console.error(err)
      toast.error('Failed to load issues')
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdateStatus(issueId: string, newStatus: IssueStatus) {
    try {
      const { error } = await supabase
        .from('guest_issues')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', issueId)

      if (error) throw error

      toast.success(`Issue marked as ${newStatus.replace('_', ' ')}`)
      
      // Update state locally
      setIssues(prev => prev.map(issue => 
        issue.id === issueId ? { ...issue, status: newStatus } : issue
      ))
    } catch (err: any) {
      console.error(err)
      toast.error('Failed to update status')
    }
  }

  // Filter issues
  const filteredIssues = issues.filter(issue => {
    const statusMatch = statusFilter === 'all' || issue.status === statusFilter
    const categoryMatch = categoryFilter === 'all' || issue.category === categoryFilter
    return statusMatch && categoryMatch
  })

  // Group counts for summary blocks
  const countOpen = issues.filter(i => i.status === 'open').length
  const countInProgress = issues.filter(i => i.status === 'in_progress').length
  const countResolved = issues.filter(i => i.status === 'resolved').length

  const catEmojis: Record<string, string> = {
    plumbing: '🚰',
    electrical: '🔌',
    cleanliness: '🧹',
    wifi: '📶',
    furniture: '🛏️',
    other: '❓'
  }

  const statusMap: Record<IssueStatus, { bg: string; text: string; label: string }> = {
    open: { bg: '#FEE2E2', text: '#EF4444', label: 'Open' },
    in_progress: { bg: '#FEF3C7', text: '#D97706', label: 'In Progress' },
    resolved: { bg: '#D1FAE5', text: '#059669', label: 'Resolved' }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#FAF6F2]">
      <TopBar 
        title="Guest Complaints & Issues" 
        subtitle={`${pgName} · Support Desk`} 
      />

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-stone-500 font-medium">
            ⌛ Loading reported issues...
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* KPI STATS ROW */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-orange-100 text-[#F4700A] flex items-center justify-center text-xl font-bold">📋</div>
                <div>
                  <div className="text-stone-400 text-xs font-semibold uppercase tracking-wider">Total Filed</div>
                  <div className="text-2xl font-extrabold text-stone-850">{issues.length}</div>
                </div>
              </div>
              <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-red-100 text-red-500 flex items-center justify-center text-xl font-bold">🚨</div>
                <div>
                  <div className="text-stone-400 text-xs font-semibold uppercase tracking-wider">Open</div>
                  <div className="text-2xl font-extrabold text-stone-850">{countOpen}</div>
                </div>
              </div>
              <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center text-xl font-bold">⚙️</div>
                <div>
                  <div className="text-stone-400 text-xs font-semibold uppercase tracking-wider">In Progress</div>
                  <div className="text-2xl font-extrabold text-stone-850">{countInProgress}</div>
                </div>
              </div>
              <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl font-bold">✅</div>
                <div>
                  <div className="text-stone-400 text-xs font-semibold uppercase tracking-wider">Resolved</div>
                  <div className="text-2xl font-extrabold text-stone-850">{countResolved}</div>
                </div>
              </div>
            </div>

            {/* FILTERS & LIST SECTION */}
            <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-stone-200 bg-stone-50 flex flex-wrap items-center justify-between gap-4">
                <div className="text-sm font-bold text-stone-800">
                  ⚠️ Reported Complaints ({filteredIssues.length})
                </div>
                
                {/* FILTER CONTROLS */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-stone-500 font-semibold">
                    <span>Status:</span>
                    <select 
                      value={statusFilter} 
                      onChange={e => setStatusFilter(e.target.value as any)}
                      className="border border-stone-200 bg-white rounded-md px-2.5 py-1.5 text-xs font-bold text-stone-800 outline-none"
                    >
                      <option value="all">All Statuses</option>
                      <option value="open">🔴 Open</option>
                      <option value="in_progress">🟡 In Progress</option>
                      <option value="resolved">🟢 Resolved</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-stone-500 font-semibold">
                    <span>Category:</span>
                    <select 
                      value={categoryFilter} 
                      onChange={e => setCategoryFilter(e.target.value)}
                      className="border border-stone-200 bg-white rounded-md px-2.5 py-1.5 text-xs font-bold text-stone-800 outline-none"
                    >
                      <option value="all">All Categories</option>
                      <option value="plumbing">🚰 Plumbing</option>
                      <option value="electrical">🔌 Electrical</option>
                      <option value="cleanliness">🧹 Cleanliness</option>
                      <option value="wifi">📶 WiFi</option>
                      <option value="furniture">🛏️ Furniture</option>
                      <option value="other">❓ Other / Food</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* ISSUES LIST CONTAINER */}
              {filteredIssues.length === 0 ? (
                <div className="text-center py-16 text-stone-400">
                  <div className="text-4xl mb-3">🍃</div>
                  <div className="font-bold text-stone-700">No matching issues found</div>
                  <div className="text-sm mt-1">Try changing your filters or verify later</div>
                </div>
              ) : (
                <div className="divide-y divide-stone-100">
                  {filteredIssues.map(issue => {
                    const stObj = statusMap[issue.status] || { bg: '#F3F4F6', text: '#4B5563', label: issue.status }
                    const guestInfo = issue.guest as any
                    const guestName = guestInfo ? `${guestInfo.first_name} ${guestInfo.last_name}` : 'Unknown Guest'
                    const roomNumber = guestInfo?.rooms?.room_number ? `Room ${guestInfo.rooms.room_number}` : 'No Room'

                    return (
                      <div key={issue.id} className="p-5 hover:bg-stone-50/50 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="space-y-2 max-w-3xl">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-bold text-stone-500 bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                              {catEmojis[issue.category] || '⚠️'} {issue.category}
                            </span>
                            <span 
                              className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full"
                              style={{ backgroundColor: stObj.bg, color: stObj.text }}
                            >
                              {stObj.label}
                            </span>
                            <span className="text-xs text-stone-400">
                              • Reported {new Date(issue.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </span>
                          </div>

                          <div>
                            <h3 className="text-sm font-bold text-stone-850">{issue.title}</h3>
                            <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">{issue.description}</p>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-stone-500 font-semibold pt-1">
                            <span className="w-5 h-5 rounded-full bg-stone-200 text-stone-600 flex items-center justify-center text-[10px] font-bold">👤</span>
                            <span className="text-stone-750 font-bold">{guestName}</span>
                            <span className="text-stone-300">|</span>
                            <span className="text-stone-550">{roomNumber}</span>
                          </div>
                        </div>

                        {/* ADMIN STATUS CONTROLS */}
                        <div className="flex items-center gap-2 self-start md:self-center">
                          {issue.status !== 'open' && (
                            <button
                              onClick={() => handleUpdateStatus(issue.id, 'open')}
                              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-all bg-white"
                            >
                              Open
                            </button>
                          )}
                          {issue.status !== 'in_progress' && (
                            <button
                              onClick={() => handleUpdateStatus(issue.id, 'in_progress')}
                              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 transition-all bg-white"
                            >
                              In Progress
                            </button>
                          )}
                          {issue.status !== 'resolved' && (
                            <button
                              onClick={() => handleUpdateStatus(issue.id, 'resolved')}
                              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-sm border border-transparent"
                            >
                              Mark Resolved ✓
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
