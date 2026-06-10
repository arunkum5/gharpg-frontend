'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import TopBar from '@/components/layout/TopBar'
import { toast } from 'sonner'
import { Notice } from '@/lib/types/database'

interface MappedNotice extends Notice {
  sender_name: string
  read_count?: number
  unread_count?: number
}

interface ReadReceipt {
  guest_id: string
  read_at: string
  guests: {
    first_name: string
    last_name: string
  } | null
}

export default function NoticesPage() {
  const router = useRouter()
  const supabase = createClient()

  const [pgId, setPgId] = useState<string | null>(null)
  const [pgName, setPgName] = useState<string>('My PG')
  const [notices, setNotices] = useState<MappedNotice[]>([])
  const [loading, setLoading] = useState(true)

  // Filtering states
  const [activeTab, setActiveTab] = useState<'all' | 'sent' | 'drafts'>('all')
  const [selectedNoticeId, setSelectedNoticeId] = useState<string | null>(null)
  const [readReceipts, setReadReceipts] = useState<ReadReceipt[]>([])
  const [totalGuestsCount, setTotalGuestsCount] = useState<number>(0)

  // Compose form states
  const [newTitle, setNewTitle] = useState('')
  const [newBody, setNewBody] = useState('')
  const [newType, setNewType] = useState<'general' | 'maintenance' | 'payment' | 'food' | 'emergency' | 'event'>('general')
  const [newTarget, setNewTarget] = useState<'all' | 'floor' | 'purpose_student' | 'purpose_working'>('all')
  const [isComposeOpen, setIsComposeOpen] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (selectedNoticeId) fetchReadReceipts(selectedNoticeId)
  }, [selectedNoticeId])

  async function fetchData() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Get PG
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

      // Fetch total guests count
      const { count: guestsCount } = await supabase
        .from('guests')
        .select('*', { count: 'exact', head: true })
        .eq('pg_id', pg.id)
        .eq('status', 'active')
      
      setTotalGuestsCount(guestsCount || 0)

      // Fetch notices
      const { data: noticesData, error: noticesErr } = await supabase
        .from('notices')
        .select(`
          *,
          profiles:created_by_user_id (name)
        `)
        .eq('pg_id', pg.id)
        .order('created_at', { ascending: false })

      if (noticesErr) throw noticesErr

      const mapped = (noticesData || []).map((n: any) => ({
        ...n,
        sender_name: n.profiles?.name || 'Admin'
      })) as MappedNotice[]

      // Fetch read counts for sent notices
      for (const notice of mapped) {
        if (notice.status === 'sent') {
          const { count } = await supabase
            .from('notice_reads')
            .select('*', { count: 'exact', head: true })
            .eq('notice_id', notice.id)
          notice.read_count = count || 0
          notice.unread_count = Math.max(0, (guestsCount || 0) - (count || 0))
        }
      }

      setNotices(mapped)

      if (mapped.length > 0 && !selectedNoticeId) {
        setSelectedNoticeId(mapped[0].id)
      }

    } catch (e: any) {
      console.error(e)
      toast.error('Error loading notices data')
    } finally {
      setLoading(false)
    }
  }

  async function fetchReadReceipts(noticeId: string) {
    try {
      const { data, error } = await supabase
        .from('notice_reads')
        .select(`
          guest_id,
          read_at,
          guests:guest_id (first_name, last_name)
        `)
        .eq('notice_id', noticeId)

      if (error) throw error

      const mapped = (data || []).map((r: any) => ({
        guest_id: r.guest_id,
        read_at: r.read_at,
        guests: r.guests ? { first_name: r.guests.first_name, last_name: r.guests.last_name } : null
      })) as ReadReceipt[]

      setReadReceipts(mapped)
    } catch (e: any) {
      console.error(e)
    }
  }

  // Send notice
  async function handleSend() {
    if (!newTitle.trim() || !newBody.trim() || !pgId) {
      toast.error('Please enter Title and Message')
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: newNotice, error } = await supabase
        .from('notices')
        .insert({
          pg_id: pgId,
          created_by_user_id: user.id,
          title: newTitle.trim(),
          body: newBody.trim(),
          type: newType,
          target: newTarget,
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) throw error

      toast.success(`Announcement "${newTitle}" sent successfully!`)
      setNewTitle('')
      setNewBody('')
      setNewType('general')
      setNewTarget('all')
      setSelectedNoticeId(newNotice.id)
      await fetchData()
    } catch (e: any) {
      console.error(e)
      toast.error('Error sending notice')
    }
  }

  // Save draft notice
  async function handleSaveDraft() {
    if (!newTitle.trim() || !pgId) {
      toast.error('Please enter a Title to save draft')
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: newNotice, error } = await supabase
        .from('notices')
        .insert({
          pg_id: pgId,
          created_by_user_id: user.id,
          title: newTitle.trim(),
          body: newBody.trim(),
          type: newType,
          target: newTarget,
          status: 'draft'
        })
        .select()
        .single()

      if (error) throw error

      toast.success('Notice saved as draft')
      setNewTitle('')
      setNewBody('')
      setSelectedNoticeId(newNotice.id)
      await fetchData()
    } catch (e: any) {
      console.error(e)
      toast.error('Error saving draft')
    }
  }

  // Delete Notice
  async function handleDelete(noticeId: string) {
    if (!confirm('Are you sure you want to delete this notice?')) return
    try {
      await supabase.from('notice_reads').delete().eq('notice_id', noticeId)
      const { error } = await supabase.from('notices').delete().eq('id', noticeId)
      if (error) throw error

      toast.success('Notice deleted')
      setSelectedNoticeId(null)
      await fetchData()
    } catch (e: any) {
      console.error(e)
      toast.error('Error deleting notice')
    }
  }

  // Filter list
  const filteredNotices = notices.filter(n => {
    if (activeTab === 'sent') return n.status === 'sent'
    if (activeTab === 'drafts') return n.status === 'draft'
    return true
  })

  const selectedNotice = notices.find(n => n.id === selectedNoticeId)

  // Type details
  const typeIcons = {
    general: '📢',
    maintenance: '🔧',
    payment: '💰',
    food: '🍱',
    emergency: '🚨',
    event: '🎉'
  }

  const typeClass = {
    general: 'b-general',
    maintenance: 'b-maintenance',
    payment: 'b-payment',
    food: 'b-food',
    emergency: 'b-emergency',
    event: 'b-event'
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="Notices & Announcements" subtitle={`${pgName} · Broadcast announcements`} />

      <div className="content">
        {/* LEFT: NOTICE LIST */}
        <div className="notices-left">
          <div className="nl-header">
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '14.5px', fontWeight: 700 }}>
              All Notices
            </div>
            <div className="nl-tabs">
              <div
                className={`nl-tab ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                All <span className="cnt">{notices.length}</span>
              </div>
              <div
                className={`nl-tab ${activeTab === 'sent' ? 'active' : ''}`}
                onClick={() => setActiveTab('sent')}
              >
                Sent <span className="cnt">{notices.filter(n => n.status === 'sent').length}</span>
              </div>
              <div
                className={`nl-tab ${activeTab === 'drafts' ? 'active' : ''}`}
                onClick={() => setActiveTab('drafts')}
              >
                Drafts <span className="cnt">{notices.filter(n => n.status === 'draft').length}</span>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12" style={{ color: '#A89080' }}>
              Loading announcements...
            </div>
          ) : filteredNotices.length === 0 ? (
            <div className="text-center py-12" style={{ color: '#A89080' }}>
              No notices found.
            </div>
          ) : (
            <div className="nl-list">
              {filteredNotices.map(n => {
                const isSelected = selectedNoticeId === n.id
                const isDraft = n.status === 'draft'

                return (
                  <div
                    key={n.id}
                    className={`nc type-${n.type} ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedNoticeId(n.id)}
                    style={{ opacity: isDraft ? 0.75 : 1 }}
                  >
                    <div className="nc-top">
                      <div className="nc-type-ic" style={{ background: 'rgba(255,255,255,0.7)' }}>
                        {typeIcons[n.type]}
                      </div>
                      <div className="nc-title">{n.title}</div>
                      <span className={`nc-badge ${typeClass[n.type]}`}>
                        {isDraft ? 'Draft' : n.type.toUpperCase()}
                      </span>
                    </div>
                    <div className="nc-preview">{n.body}</div>
                    <div className="nc-footer">
                      <div className="nc-time">
                        {n.sent_at
                          ? new Date(n.sent_at).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : 'Draft'}
                      </div>
                      {n.status === 'sent' && (
                        <div className="nc-reads">
                          👁 {n.read_count || 0} / {totalGuestsCount} read
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* RIGHT: COMPOSE & VIEW PANEL */}
        <div className="notices-right">
          {/* COMPOSE PANEL */}
          <div className="compose-panel">
            <div className="cp-title">
              📝 Compose Announcement
              <span className="cp-toggle" onClick={() => setIsComposeOpen(!isComposeOpen)}>
                {isComposeOpen ? '▼ Collapse' : '▶ Expand'}
              </span>
            </div>

            {isComposeOpen && (
              <div className="compose-form">
                <div className="cf-field">
                  <label>Title *</label>
                  <input
                    type="text"
                    placeholder="e.g. Overhead Tank Cleaning on Sunday"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                  />
                </div>
                <div className="cf-field">
                  <label>Type</label>
                  <div className="type-pills">
                    {(Object.keys(typeIcons) as Array<keyof typeof typeIcons>).map(type => (
                      <div
                        key={type}
                        className={`type-pill ${newType === type ? 'sel' : ''}`}
                        onClick={() => setNewType(type)}
                      >
                        {typeIcons[type]} {type.toUpperCase()}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="cf-field">
                  <label>Target Audience</label>
                  <div className="target-pills">
                    {[
                      { key: 'all', val: `👥 All Guests (${totalGuestsCount})` },
                      { key: 'purpose_student', val: '🎓 Students Only' },
                      { key: 'purpose_working', val: '💼 Workers Only' }
                    ].map(t => (
                      <div
                        key={t.key}
                        className={`target-pill ${newTarget === t.key ? 'sel' : ''}`}
                        onClick={() => setNewTarget(t.key as any)}
                      >
                        {t.val}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="cf-field">
                  <label>Message Body *</label>
                  <textarea
                    placeholder="Describe the notice clearly..."
                    value={newBody}
                    onChange={e => setNewBody(e.target.value)}
                  ></textarea>
                </div>
                <div className="compose-actions">
                  <button className="ca-draft" onClick={handleSaveDraft}>
                    Save Draft
                  </button>
                  <button className="ca-send" onClick={handleSend}>
                    📣 Send Announcement
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* DETAIL PANEL */}
          <div className="notice-detail">
            {selectedNotice ? (
              <>
                <div className="nd-card">
                  <div className="nd-header">
                    <div className="nd-type-row">
                      <div className="nd-type-ic" style={{ background: 'var(--orange-pale)' }}>
                        {typeIcons[selectedNotice.type]}
                      </div>
                      <span className={`nd-type-label ${typeClass[selectedNotice.type]}`}>
                        {selectedNotice.type.toUpperCase()}
                      </span>
                      <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-soft)' }}>
                        {selectedNotice.sent_at
                          ? new Date(selectedNotice.sent_at).toLocaleString('en-IN')
                          : 'Draft Notice'}
                      </div>
                    </div>
                    <div className="nd-title">{selectedNotice.title}</div>
                    <div className="nd-meta-row">
                      <div className="nd-meta-item">👤 By {selectedNotice.sender_name}</div>
                      <div className="nd-meta-item">
                        🎯 Target: {selectedNotice.target.toUpperCase()}
                      </div>
                    </div>
                  </div>
                  <div className="nd-body-text">{selectedNotice.body}</div>

                  {selectedNotice.status === 'sent' && (
                    <div className="nd-stats-row">
                      <div className="nd-stat">
                        <div className="nd-stat-val" style={{ color: 'var(--green)' }}>
                          {selectedNotice.read_count || 0}
                        </div>
                        <div className="nd-stat-lbl">Read</div>
                      </div>
                      <div className="nd-stat">
                        <div className="nd-stat-val" style={{ color: 'var(--amber)' }}>
                          {selectedNotice.unread_count || 0}
                        </div>
                        <div className="nd-stat-lbl">Unread</div>
                      </div>
                      <div className="nd-stat">
                        <div className="nd-stat-val">{totalGuestsCount}</div>
                        <div className="nd-stat-lbl">Target size</div>
                      </div>
                    </div>
                  )}

                  <div className="nd-actions">
                    <button
                      className="nd-delete"
                      onClick={() => handleDelete(selectedNotice.id)}
                    >
                      🗑 Delete Notice
                    </button>
                  </div>
                </div>

                {selectedNotice.status === 'sent' && readReceipts.length > 0 && (
                  <div className="nd-card">
                    <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--border)' }}>
                      <div className="read-by-title">👁 Read Receipts ({readReceipts.length} guests)</div>
                    </div>
                    <div style={{ padding: '14px 18px' }}>
                      <div className="read-by-list">
                        {readReceipts.map(receipt => {
                          const initials = `${receipt.guests?.first_name[0] || ''}${
                            receipt.guests?.last_name[0] || ''
                          }`.toUpperCase()
                          return (
                            <div key={receipt.guest_id} className="rb-chip">
                              <div
                                className="rb-av"
                                style={{
                                  background: 'linear-gradient(135deg,#1DB970,#5DE89A)'
                                }}
                              >
                                {initials}
                              </div>
                              {receipt.guests?.first_name} {receipt.guests?.last_name}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div
                className="text-center py-12"
                style={{ color: '#A89080', background: '#fff', borderRadius: '14px' }}
              >
                Select a notice to view details.
              </div>
            )}
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
          --blue: #2563EB; --blue-pale: #EFF6FF;
          --shadow-sm: 0 1px 4px rgba(28,15,5,0.06);
          --shadow-md: 0 4px 16px rgba(28,15,5,0.10);
          --r: 14px;
        }

        .content { flex: 1; overflow: hidden; display: flex; }

        .notices-left { width: 340px; flex-shrink: 0; border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; background: var(--white); }
        .nl-header { padding: 16px 18px 12px; border-bottom: 1px solid var(--border); }
        .nl-tabs { display: flex; gap: 5px; margin-top: 10px; }
        .nl-tab { border: 1.5px solid var(--border); border-radius: 8px; padding: 5px 12px; font-size: 12px; font-weight: 700; cursor: pointer; color: var(--text-soft); transition: all 0.15s; }
        .nl-tab:hover { border-color: var(--orange-border); color: var(--orange); }
        .nl-tab.active { border-color: var(--orange); background: var(--orange-pale); color: var(--orange); }
        .nl-tab .cnt { display: inline-block; background: var(--orange); color: #fff; font-size: 9.5px; font-weight: 800; padding: 1px 6px; border-radius: 20px; margin-left: 4px; }

        .nl-list { flex: 1; overflow-y: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 9px; scrollbar-width: thin; }

        .nc { border: 1.5px solid var(--border); border-radius: 12px; padding: 13px 15px; cursor: pointer; transition: all 0.15s; background: var(--bg); position: relative; overflow: hidden; }
        .nc:hover { border-color: var(--orange-border); background: var(--orange-pale); }
        .nc.selected { border-color: var(--orange); background: var(--orange-pale); box-shadow: 0 0 0 2px rgba(244,112,10,0.12); }
        .nc::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3.5px; border-radius: 4px 0 0 4px; }
        .nc.type-general::before { background: var(--orange); }
        .nc.type-maintenance::before { background: var(--amber); }
        .nc.type-emergency::before { background: var(--red); }
        .nc.type-food::before { background: var(--green); }
        .nc.type-event::before { background: var(--purple); }
        .nc.type-payment::before { background: var(--blue); }

        .nc-top { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 7px; }
        .nc-type-ic { width: 32px; height: 32px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0; }
        .nc-title { font-size: 13px; font-weight: 800; color: var(--text); flex: 1; line-height: 1.3; }
        .nc-badge { font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 20px; flex-shrink: 0; }
        
        .b-general     { background: var(--orange-pale); color: var(--orange); }
        .b-maintenance { background: var(--amber-pale);  color: #B87800; }
        .b-emergency   { background: var(--red-pale);    color: var(--red); }
        .b-food        { background: var(--green-pale);  color: var(--green); }
        .b-event       { background: var(--purple-pale); color: var(--purple); }
        .b-payment     { background: var(--blue-pale);   color: var(--blue); }

        .nc-preview { font-size: 12px; color: var(--text-soft); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .nc-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
        .nc-time { font-size: 10.5px; color: var(--text-soft); font-weight: 600; }
        .nc-reads { font-size: 10.5px; color: var(--text-soft); font-weight: 600; display: flex; align-items: center; gap: 4px; }

        .notices-right { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

        .compose-panel { background: var(--white); border-bottom: 1px solid var(--border); padding: 16px 22px; flex-shrink: 0; }
        .cp-title { font-family: 'Playfair Display', serif; font-size: 14.5px; font-weight: 700; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; }
        .cp-toggle { font-size: 12px; color: var(--orange); font-weight: 700; cursor: pointer; }

        .compose-form { display: flex; flex-direction: column; gap: 11px; }
        .cf-field { display: flex; flex-direction: column; gap: 4px; flex: 1; }
        .cf-field label { font-size: 10.5px; font-weight: 800; color: var(--text-mid); text-transform: uppercase; letter-spacing: 0.8px; }
        .cf-field input, .cf-field select, .cf-field textarea {
          border: 1.5px solid var(--border); border-radius: 9px;
          padding: 9px 12px; font-size: 13px; outline: none; transition: border-color 0.15s;
          color: var(--text); background: var(--bg);
        }
        .cf-field input:focus, .cf-field select:focus, .cf-field textarea:focus { border-color: var(--orange); background: #fff; }
        .cf-field textarea { resize: none; height: 72px; }

        .type-pills, .target-pills { display: flex; gap: 6px; flex-wrap: wrap; }
        .type-pill, .target-pill { border: 1.5px solid var(--border); border-radius: 20px; padding: 5px 12px; font-size: 11.5px; font-weight: 700; cursor: pointer; color: var(--text-soft); transition: all 0.15s; display: flex; align-items: center; gap: 5px; }
        .type-pill:hover, .target-pill:hover { border-color: var(--orange-border); }
        .type-pill.sel, .target-pill.sel { border-color: var(--orange); background: var(--orange-pale); color: var(--orange); }

        .compose-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
        .ca-draft { background: var(--bg); border: 1.5px solid var(--border); color: var(--text-mid); border-radius: 9px; padding: 8px 16px; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: all 0.15s; }
        .ca-draft:hover { border-color: var(--orange-border); background: var(--orange-pale); }
        .ca-send { background: var(--orange); color: #fff; border: none; border-radius: 9px; padding: 8px 18px; font-size: 12.5px; font-weight: 800; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 5px; }
        .ca-send:hover { background: var(--orange-hover); }

        .notice-detail { flex: 1; overflow-y: auto; padding: 22px 24px; scrollbar-width: thin; }

        .nd-card { background: var(--white); border-radius: var(--r); border: 1px solid var(--border); overflow: hidden; box-shadow: var(--shadow-sm); margin-bottom: 16px; animation: fadeUp 0.3s ease both; }
        .nd-header { padding: 18px 20px 16px; border-bottom: 1px solid var(--border); }
        .nd-type-row { display: flex; align-items: center; gap: 9px; margin-bottom: 10px; }
        .nd-type-ic { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; background: var(--orange-pale); }
        .nd-type-label { font-size: 11.5px; font-weight: 800; padding: 3px 10px; border-radius: 20px; }
        .nd-title { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 800; color: var(--text); line-height: 1.3; margin-bottom: 10px; }
        .nd-meta-row { display: flex; align-items: center; gap: 14px; font-size: 12px; color: var(--text-soft); flex-wrap: wrap; }
        .nd-meta-item { display: flex; align-items: center; gap: 5px; font-weight: 600; }

        .nd-body-text { padding: 18px 20px; font-size: 13.5px; color: var(--text-mid); line-height: 1.75; white-space: pre-wrap; }

        .nd-stats-row { padding: 14px 20px; border-top: 1px solid var(--border); display: flex; gap: 18px; background: var(--bg); }
        .nd-stat { display: flex; flex-direction: column; align-items: center; }
        .nd-stat-val { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 700; color: var(--text); }
        .nd-stat-lbl { font-size: 10.5px; color: var(--text-soft); font-weight: 600; margin-top: 2px; }

        .nd-actions { padding: 14px 20px; border-top: 1px solid var(--border); display: flex; gap: 8px; }
        .nd-delete { background: var(--red-pale); color: var(--red); border: 1.5px solid #F5C6C5; border-radius: 9px; padding: 8px 16px; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: all 0.15s; }
        .nd-delete:hover { background: var(--red); color: #fff; border-color: var(--red); }

        .read-by-title { font-family: 'Playfair Display', serif; font-size: 13px; font-weight: 700; margin-bottom: 11px; }
        .read-by-list { display: flex; flex-wrap: wrap; gap: 7px; }
        .rb-chip { display: flex; align-items: center; gap: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 20px; padding: 5px 11px; font-size: 12px; font-weight: 600; }
        .rb-av { width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 800; color: #fff; }

        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}
