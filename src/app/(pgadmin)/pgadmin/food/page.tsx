'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import TopBar from '@/components/layout/TopBar'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks'

interface FoodMenuRow {
  id: string
  pg_id: string
  day_of_week: number   // 0=Sun … 6=Sat
  meal_type: MealType
  items: string         // comma-separated
  is_active: boolean
}

// Keyed by `${day_of_week}:${meal_type}` for O(1) lookup
type MenuMap = Map<string, FoodMenuRow>

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAYS_SHORT = ['Sun',    'Mon',    'Tue',     'Wed',       'Thu',      'Fri',    'Sat']

const MEALS: { type: MealType; label: string; icon: string; timeHint: string }[] = [
  { type: 'breakfast', label: 'Breakfast', icon: '🌅', timeHint: '7 – 9 AM'  },
  { type: 'lunch',     label: 'Lunch',     icon: '☀️', timeHint: '12 – 2 PM' },
  { type: 'dinner',    label: 'Dinner',    icon: '🌙', timeHint: '7 – 9 PM'  },
  { type: 'snacks',    label: 'Snacks',    icon: '🍿', timeHint: '4 – 6 PM'  },
]

function menuKey(day: number, meal: MealType) {
  return `${day}:${meal}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FoodMenuPage() {
  const router   = useRouter()
  const supabase = createClient()

  // ── State
  const [pgId,    setPgId]    = useState<string | null>(null)
  const [pgName,  setPgName]  = useState<string>('My PG')
  const [loading, setLoading] = useState(true)
  const [menuMap, setMenuMap] = useState<MenuMap>(new Map())

  // Textarea draft values (local edits before blur)
  const [drafts,   setDrafts]   = useState<Map<string, string>>(new Map())
  // Keys that are currently saving (to show spinner)
  const [saving,   setSaving]   = useState<Set<string>>(new Set())
  // Keys that are toggling active state
  const [toggling, setToggling] = useState<Set<string>>(new Set())

  // Today's day index
  const todayIdx   = new Date().getDay()  // 0=Sun … 6=Sat
  // Default selected day = today, but Monday if today is Sunday (often a better UX default—
  // though here we keep today's actual day)
  const [selectedDay, setSelectedDay] = useState<number>(todayIdx === 0 ? 1 : todayIdx)

  // ── Load
  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

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

      const { data: rows, error: rowsErr } = await supabase
        .from('food_menu')
        .select('*')
        .eq('pg_id', pg.id)

      if (rowsErr) throw rowsErr

      const map: MenuMap = new Map()
      const draftInit    = new Map<string, string>()
      for (const row of (rows ?? []) as FoodMenuRow[]) {
        const k = menuKey(row.day_of_week, row.meal_type)
        map.set(k, row)
        draftInit.set(k, row.items ?? '')
      }
      setMenuMap(map)
      setDrafts(draftInit)
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to load food menu')
    } finally {
      setLoading(false)
    }
  }

  // ── Upsert on textarea blur
  const handleBlur = useCallback(async (day: number, meal: MealType) => {
    if (!pgId) return
    const k     = menuKey(day, meal)
    const value = drafts.get(k) ?? ''

    // Skip if unchanged
    const existing = menuMap.get(k)
    if (existing && existing.items === value) return

    setSaving(prev => new Set(prev).add(k))
    try {
      const payload: Omit<FoodMenuRow, 'id'> & { id?: string } = {
        pg_id:       pgId,
        day_of_week: day,
        meal_type:   meal,
        items:       value,
        is_active:   existing?.is_active ?? true,
      }

      const { data, error } = await supabase
        .from('food_menu')
        .upsert(payload, {
          onConflict:        'pg_id,day_of_week,meal_type',
          ignoreDuplicates:  false,
        })
        .select()
        .single()

      if (error) throw error

      setMenuMap(prev => {
        const next = new Map(prev)
        next.set(k, data as FoodMenuRow)
        return next
      })
      toast.success(`${MEALS.find(m => m.type === meal)!.label} saved`)
    } catch (e: any) {
      console.error(e)
      toast.error('Save failed — please try again')
    } finally {
      setSaving(prev => { const s = new Set(prev); s.delete(k); return s })
    }
  }, [pgId, drafts, menuMap, supabase])

  // ── Toggle is_active
  const handleToggle = useCallback(async (day: number, meal: MealType) => {
    if (!pgId) return
    const k        = menuKey(day, meal)
    const existing = menuMap.get(k)
    const newActive = !(existing?.is_active ?? true)

    setToggling(prev => new Set(prev).add(k))
    try {
      const { data, error } = await supabase
        .from('food_menu')
        .upsert({
          pg_id:       pgId,
          day_of_week: day,
          meal_type:   meal,
          items:       existing?.items ?? '',
          is_active:   newActive,
        }, {
          onConflict:       'pg_id,day_of_week,meal_type',
          ignoreDuplicates: false,
        })
        .select()
        .single()

      if (error) throw error

      setMenuMap(prev => {
        const next = new Map(prev)
        next.set(k, data as FoodMenuRow)
        return next
      })
      toast.success(newActive ? 'Meal enabled' : 'Meal disabled')
    } catch (e: any) {
      console.error(e)
      toast.error('Toggle failed')
    } finally {
      setToggling(prev => { const s = new Set(prev); s.delete(k); return s })
    }
  }, [pgId, menuMap, supabase])

  // ── Draft change handler
  const handleDraftChange = useCallback((day: number, meal: MealType, value: string) => {
    const k = menuKey(day, meal)
    setDrafts(prev => { const next = new Map(prev); next.set(k, value); return next })
  }, [])

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        title="Food Menu"
        subtitle={pgName ? `${pgName} · Weekly meal planner` : 'Weekly meal planner'}
      />

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="food-spinner" />
            <div style={{ fontSize: 13, color: '#A89080', fontWeight: 600 }}>Loading menu…</div>
          </div>
        </div>
      ) : (
        <div className="food-layout">

          {/* ── LEFT: Day Tabs ───────────────────────────── */}
          <div className="day-tabs-col">
            <div className="day-tabs-header">
              <span style={{ fontSize: 10, fontWeight: 800, color: '#A89080', textTransform: 'uppercase', letterSpacing: '0.9px' }}>
                Week
              </span>
            </div>
            <div className="day-tabs-list">
              {DAYS_SHORT.map((short, idx) => {
                const isToday    = idx === todayIdx
                const isSelected = idx === selectedDay
                return (
                  <button
                    key={idx}
                    className={`day-tab ${isSelected ? 'selected' : ''} ${isToday && !isSelected ? 'today' : ''}`}
                    onClick={() => setSelectedDay(idx)}
                  >
                    <span className="day-tab-short">{short}</span>
                    {isToday && (
                      <span className="today-dot" title="Today" />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Quick week stats */}
            <div className="week-stats">
              <div style={{ fontSize: 10, fontWeight: 800, color: '#A89080', textTransform: 'uppercase', letterSpacing: '0.9px', marginBottom: 10 }}>
                Week Summary
              </div>
              {MEALS.map(m => {
                const active = DAYS_SHORT.reduce((acc, _, idx) => {
                  const row = menuMap.get(menuKey(idx, m.type))
                  return acc + (row?.is_active && row.items.trim() ? 1 : 0)
                }, 0)
                return (
                  <div key={m.type} className="week-stat-row">
                    <span style={{ fontSize: 13 }}>{m.icon}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: '#6B4F38', flex: 1 }}>{m.label}</span>
                    <span style={{
                      fontSize: 10.5, fontWeight: 800,
                      color: active === 7 ? '#1DB970' : active > 0 ? '#F4700A' : '#A89080',
                      background: active === 7 ? '#E6F9F0' : active > 0 ? '#FFF4EC' : '#F5EDE5',
                      padding: '2px 8px', borderRadius: 20
                    }}>
                      {active}/7
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── RIGHT: Meal Cards ─────────────────────────── */}
          <div className="meals-panel">
            {/* Day header */}
            <div className="meals-day-header">
              <div className="day-full-name">
                {DAYS_FULL[selectedDay]}
                {selectedDay === todayIdx && (
                  <span className="today-badge">Today</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#A89080' }}>
                {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>

            {/* Meal cards grid */}
            <div className="meals-grid">
              {MEALS.map(meal => {
                const k        = menuKey(selectedDay, meal.type)
                const row      = menuMap.get(k)
                const draft    = drafts.get(k) ?? ''
                const isSaving = saving.has(k)
                const isToggling = toggling.has(k)
                const isActive = row?.is_active ?? true
                const hasContent = draft.trim().length > 0
                const dishes = draft
                  .split(',')
                  .map(d => d.trim())
                  .filter(Boolean)

                return (
                  <div
                    key={meal.type}
                    className={`meal-card ${!isActive ? 'inactive' : ''}`}
                  >
                    {/* Card header */}
                    <div className="meal-card-header">
                      <div className="meal-icon-wrap">
                        <span style={{ fontSize: 20 }}>{meal.icon}</span>
                      </div>
                      <div className="meal-header-text">
                        <div className="meal-name">{meal.label}</div>
                        <div className="meal-time">{meal.timeHint}</div>
                      </div>

                      {/* Save indicator */}
                      {isSaving && (
                        <div className="save-indicator">
                          <div className="save-spinner" />
                          <span>Saving…</span>
                        </div>
                      )}

                      {/* Active toggle */}
                      <button
                        className={`toggle-btn ${isActive ? 'on' : 'off'}`}
                        onClick={() => handleToggle(selectedDay, meal.type)}
                        disabled={isToggling}
                        title={isActive ? 'Disable this meal' : 'Enable this meal'}
                      >
                        <div className="toggle-knob" />
                        <span className="toggle-label">{isActive ? 'Active' : 'Off'}</span>
                      </button>
                    </div>

                    {/* Divider */}
                    <div style={{ height: 1, background: '#EDE0D4', margin: '0 18px' }} />

                    {/* Textarea */}
                    <div className="meal-body">
                      <label className="items-label">
                        Dishes <span style={{ fontWeight: 400, color: '#C0A090' }}>(comma-separated)</span>
                      </label>
                      <textarea
                        className="items-textarea"
                        placeholder={isActive
                          ? `e.g. Idli, Sambar, Coconut Chutney, Filter Coffee`
                          : 'Meal is disabled for this day'}
                        value={draft}
                        disabled={!isActive}
                        onChange={e => handleDraftChange(selectedDay, meal.type, e.target.value)}
                        onBlur={() => handleBlur(selectedDay, meal.type)}
                      />

                      {/* Preview chips */}
                      {isActive && hasContent ? (
                        <div className="dish-chips">
                          {dishes.slice(0, 8).map((d, i) => (
                            <span key={i} className="dish-chip">{d}</span>
                          ))}
                          {dishes.length > 8 && (
                            <span className="dish-chip more">+{dishes.length - 8} more</span>
                          )}
                        </div>
                      ) : isActive && !hasContent ? (
                        <div className="empty-hint">
                          <span style={{ fontSize: 20 }}>🍽️</span>
                          <span>No dishes added yet — type above and click away to save</span>
                        </div>
                      ) : (
                        <div className="empty-hint" style={{ opacity: 0.5 }}>
                          <span style={{ fontSize: 18 }}>⛔</span>
                          <span>This meal is turned off for {DAYS_SHORT[selectedDay]}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Scoped CSS ────────────────────────────────────── */}
      <style>{`
        :root {
          --orange:        #F4700A;
          --orange-hover:  #E05C00;
          --orange-pale:   #FFF4EC;
          --orange-border: #FFD9B8;
          --bg:            #FAF6F2;
          --white:         #FFFFFF;
          --text:          #1C0F05;
          --text-mid:      #6B4F38;
          --text-soft:     #A89080;
          --border:        #EDE0D4;
          --green:         #1DB970;
          --green-pale:    #E6F9F0;
          --red:           #E53935;
          --red-pale:      #FDECEA;
          --shadow-sm:     0 1px 4px  rgba(28,15,5,0.06);
          --shadow-md:     0 4px 16px rgba(28,15,5,0.10);
        }

        /* ── Layout */
        .food-layout {
          flex: 1;
          display: flex;
          overflow: hidden;
        }

        /* ── Day tabs column */
        .day-tabs-col {
          width: 108px;
          flex-shrink: 0;
          background: var(--white);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          scrollbar-width: thin;
        }
        .day-tabs-header {
          padding: 16px 14px 10px;
          border-bottom: 1px solid var(--border);
        }
        .day-tabs-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 10px 10px;
        }
        .day-tab {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 10px 6px;
          border-radius: 10px;
          border: 1.5px solid transparent;
          background: transparent;
          cursor: pointer;
          font-family: inherit;
          font-size: 13px;
          font-weight: 700;
          color: var(--text-soft);
          transition: all 0.15s;
          position: relative;
        }
        .day-tab:hover {
          background: var(--bg);
          color: var(--text-mid);
          border-color: var(--border);
        }
        .day-tab.today {
          color: var(--orange);
        }
        .day-tab.selected {
          background: var(--orange);
          color: #fff;
          border-color: var(--orange);
          box-shadow: 0 2px 8px rgba(244,112,10,0.30);
        }
        .day-tab-short { font-size: 13px; }
        .today-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--orange);
          flex-shrink: 0;
        }
        .day-tab.selected .today-dot {
          background: rgba(255,255,255,0.8);
        }

        /* ── Week stats */
        .week-stats {
          margin-top: auto;
          padding: 14px 12px 16px;
          border-top: 1px solid var(--border);
        }
        .week-stat-row {
          display: flex;
          align-items: center;
          gap: 5px;
          margin-bottom: 7px;
        }

        /* ── Meals panel */
        .meals-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--bg);
        }
        .meals-day-header {
          padding: 18px 24px 14px;
          background: var(--white);
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: baseline;
          gap: 16px;
          flex-shrink: 0;
        }
        .day-full-name {
          font-family: 'Playfair Display', serif;
          font-size: 22px;
          font-weight: 800;
          color: var(--text);
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .today-badge {
          font-family: inherit;
          font-size: 11px;
          font-weight: 800;
          background: var(--orange);
          color: #fff;
          padding: 2px 10px;
          border-radius: 20px;
          letter-spacing: 0.4px;
        }

        /* ── Meal cards grid */
        .meals-grid {
          flex: 1;
          overflow-y: auto;
          padding: 20px 22px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          align-content: start;
          scrollbar-width: thin;
        }
        @media (max-width: 900px) {
          .meals-grid { grid-template-columns: 1fr; }
        }

        /* ── Individual meal card */
        .meal-card {
          background: var(--white);
          border-radius: 16px;
          border: 1.5px solid var(--border);
          box-shadow: var(--shadow-sm);
          display: flex;
          flex-direction: column;
          transition: box-shadow 0.2s, border-color 0.2s;
          overflow: hidden;
        }
        .meal-card:hover {
          box-shadow: var(--shadow-md);
          border-color: var(--orange-border);
        }
        .meal-card.inactive {
          opacity: 0.6;
          background: #F9F4F0;
        }

        /* Card header */
        .meal-card-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 18px;
        }
        .meal-icon-wrap {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: var(--orange-pale);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .meal-header-text { flex: 1; }
        .meal-name {
          font-family: 'Playfair Display', serif;
          font-size: 15px;
          font-weight: 800;
          color: var(--text);
          line-height: 1.2;
        }
        .meal-time {
          font-size: 11px;
          color: var(--text-soft);
          font-weight: 600;
          margin-top: 1px;
        }

        /* Save indicator */
        .save-indicator {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 700;
          color: var(--orange);
        }
        .save-spinner {
          width: 12px;
          height: 12px;
          border: 2px solid var(--orange-pale);
          border-top-color: var(--orange);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Toggle button */
        .toggle-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 5px 10px 5px 6px;
          border-radius: 20px;
          border: 1.5px solid var(--border);
          cursor: pointer;
          font-family: inherit;
          font-size: 11px;
          font-weight: 700;
          transition: all 0.2s;
          background: var(--bg);
          flex-shrink: 0;
        }
        .toggle-btn.on {
          background: var(--green-pale);
          border-color: #A8EDD0;
          color: #16A05A;
        }
        .toggle-btn.off {
          background: #F5EDE5;
          border-color: var(--border);
          color: var(--text-soft);
        }
        .toggle-btn:disabled { opacity: 0.5; cursor: wait; }
        .toggle-knob {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: currentColor;
          flex-shrink: 0;
        }

        /* Card body */
        .meal-body {
          padding: 14px 18px 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .items-label {
          font-size: 10.5px;
          font-weight: 800;
          color: var(--text-mid);
          text-transform: uppercase;
          letter-spacing: 0.8px;
        }
        .items-textarea {
          width: 100%;
          min-height: 72px;
          border: 1.5px solid var(--border);
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 13px;
          font-family: inherit;
          color: var(--text);
          background: var(--bg);
          outline: none;
          resize: vertical;
          transition: border-color 0.15s, background 0.15s;
          line-height: 1.55;
        }
        .items-textarea:focus {
          border-color: var(--orange);
          background: #fff;
          box-shadow: 0 0 0 3px rgba(244,112,10,0.09);
        }
        .items-textarea:disabled {
          color: var(--text-soft);
          cursor: not-allowed;
          background: #F5EDE5;
          border-style: dashed;
        }

        /* Dish chips preview */
        .dish-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          animation: fadeUp 0.2s ease both;
        }
        .dish-chip {
          display: inline-flex;
          align-items: center;
          background: var(--orange-pale);
          color: var(--orange);
          border: 1px solid var(--orange-border);
          border-radius: 20px;
          padding: 3px 10px;
          font-size: 11.5px;
          font-weight: 700;
        }
        .dish-chip.more {
          background: var(--bg);
          color: var(--text-soft);
          border-color: var(--border);
        }

        /* Empty hint */
        .empty-hint {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: var(--text-soft);
          font-style: italic;
          padding: 4px 0;
        }

        /* Loading spinner */
        .food-spinner {
          width: 38px;
          height: 38px;
          border: 3.5px solid var(--orange-pale);
          border-top-color: var(--orange);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
      `}</style>
    </div>
  )
}
