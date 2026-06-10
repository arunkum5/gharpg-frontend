'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import TopBar from '@/components/layout/TopBar'
import { toast } from 'sonner'
import { Room, Floor, Row } from '@/lib/types/database'

export default function FloorRoomBuilder() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlPgId = searchParams.get('pgId')
  const supabase = createClient()

  // Database states
  const [pgId, setPgId] = useState<string | null>(null)
  const [pgName, setPgName] = useState<string>('My PG')
  const [floors, setFloors] = useState<Floor[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)

  // Interactive UI states
  const [expandedFloors, setExpandedFloors] = useState<Record<string, boolean>>({})
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [isAddFloorModalOpen, setIsAddFloorModalOpen] = useState(false)

  // Add Floor form states
  const [newFloorName, setNewFloorName] = useState('')
  const [newRowNames, setNewRowNames] = useState('Row A, Row B')
  const [newRoomsPerRow, setNewRoomsPerRow] = useState(3)
  const [defaultCapacity, setDefaultCapacity] = useState(2)
  const [defaultRoomType, setDefaultRoomType] = useState('double')
  const [defaultRent, setDefaultRent] = useState(10000)

  // Edit Room form states
  const [editRoomNum, setEditRoomNum] = useState('')
  const [editFloorId, setEditFloorId] = useState('')
  const [editRowId, setEditRowId] = useState('')
  const [editRoomType, setEditRoomType] = useState('double')
  const [editCapacity, setEditCapacity] = useState(2)
  const [editStatus, setEditStatus] = useState('free')
  const [editRent, setEditRent] = useState(10000)
  const [editNotes, setEditNotes] = useState('')
  const [editAmenities, setEditAmenities] = useState<string[]>([])

  // On mount: Fetch all layout data
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

      // Check profile role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      let pg = null

      if (profile?.role === 'superadmin' && urlPgId) {
        const { data: pgData } = await supabase
          .from('pgs')
          .select('id, name, city')
          .eq('id', urlPgId)
          .single()
        if (pgData) {
          pg = pgData
        }
      }

      if (!pg) {
        const { data: pgAdmin } = await supabase
          .from('pg_admins')
          .select('pg_id, pgs(id, name, city)')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle()

        if (pgAdmin && pgAdmin.pgs) {
          pg = pgAdmin.pgs as unknown as { id: string; name: string; city: string }
        }
      }

      if (!pg) {
        toast.error('No active PG assigned to your profile')
        router.push('/login')
        return
      }

      setPgId(pg.id)
      setPgName(pg.name)

      // Fetch parallel data
      const [floorsRes, rowsRes, roomsRes] = await Promise.all([
        supabase.from('floors').select('*').eq('pg_id', pg.id).order('floor_number'),
        supabase.from('rows').select('*').eq('pg_id', pg.id).order('sort_order'),
        supabase.from('rooms').select('*').eq('pg_id', pg.id).order('room_number')
      ])

      if (floorsRes.error) throw floorsRes.error
      if (rowsRes.error) throw rowsRes.error
      if (roomsRes.error) throw roomsRes.error

      setFloors(floorsRes.data || [])
      setRows(rowsRes.data || [])
      setRooms(roomsRes.data || [])

      // Auto expand first floor if none expanded yet
      if (floorsRes.data && floorsRes.data.length > 0 && Object.keys(expandedFloors).length === 0) {
        setExpandedFloors({ [floorsRes.data[0].id]: true })
      }
    } catch (e: any) {
      console.error(e)
      toast.error('Error loading room builder data')
    } finally {
      setLoading(false)
    }
  }

  // Toggle expand floor in sidebar
  function toggleFloorExpand(id: string) {
    setExpandedFloors(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // Open room for editing
  function openRoomDetails(room: Room) {
    setSelectedRoom(room)
    setEditRoomNum(room.room_number)
    setEditFloorId(room.floor_id)
    setEditRowId(room.row_id)
    setEditRoomType(room.room_type)
    setEditCapacity(room.capacity)
    setEditStatus(room.status)
    setEditRent(room.monthly_rent || 0)
    setEditNotes(room.notes || '')
    setEditAmenities(room.amenities || [])
  }

  // Toggle amenity selection
  function toggleEditAmenity(amenity: string) {
    setEditAmenities(prev =>
      prev.includes(amenity) ? prev.filter(a => a !== amenity) : [...prev, amenity]
    )
  }

  // Save Room updates
  async function handleSaveRoom() {
    if (!selectedRoom || !pgId) return
    try {
      const { error } = await supabase
        .from('rooms')
        .update({
          room_number: editRoomNum.trim(),
          floor_id: editFloorId,
          row_id: editRowId,
          room_type: editRoomType,
          capacity: editCapacity,
          status: editStatus,
          monthly_rent: editRent,
          amenities: editAmenities,
          notes: editNotes.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedRoom.id)

      if (error) throw error
      toast.success(`Room ${editRoomNum} updated!`)
      setSelectedRoom(null)
      await fetchData()
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || 'Error updating room')
    }
  }

  // Delete Room
  async function handleDeleteRoom(roomId: string) {
    if (!confirm('Are you sure you want to delete this room?')) return
    try {
      const { error } = await supabase.from('rooms').delete().eq('id', roomId)
      if (error) throw error
      toast.success('Room deleted successfully')
      setSelectedRoom(null)
      await fetchData()
    } catch (e: any) {
      console.error(e)
      toast.error('Error deleting room')
    }
  }

  // Add Room in a Row
  async function handleAddRoom(floorId: string, rowId: string, floorName: string, floorNumber: number, rowName: string) {
    if (!pgId) return
    try {
      const rowRooms = rooms.filter(r => r.row_id === rowId)
      const nextNum = rowRooms.length + 1
      const prefix = floorName.toLowerCase().includes('ground') ? 'G' : String(floorNumber)
      const letterMatch = rowName.match(/Row\s+([A-Z])/i)
      const letter = letterMatch ? letterMatch[1] : 'R'
      const roomNumber = `${prefix}${letter}${nextNum}`

      const { error } = await supabase
        .from('rooms')
        .insert({
          pg_id: pgId,
          floor_id: floorId,
          row_id: rowId,
          room_number: roomNumber,
          room_type: 'double',
          capacity: 2,
          current_occupancy: 0,
          status: 'free',
          monthly_rent: 7500,
          amenities: ['Fan'],
          is_active: true
        })

      if (error) throw error
      toast.success(`Room ${roomNumber} added!`)
      await fetchData()
    } catch (e: any) {
      console.error(e)
      toast.error('Error adding room')
    }
  }

  // Add Row in a Floor
  async function handleAddRow(floorId: string, floorName: string, floorNumber: number) {
    if (!pgId) return
    try {
      const currentRows = rows.filter(r => r.floor_id === floorId)
      const nextSort = currentRows.length
      const nextLetter = String.fromCharCode(65 + nextSort) // A, B, C, D...
      const rowName = `Row ${nextLetter}`

      const { data: newRow, error: rowErr } = await supabase
        .from('rows')
        .insert({
          pg_id: pgId,
          floor_id: floorId,
          row_name: rowName,
          sort_order: nextSort
        })
        .select()
        .single()

      if (rowErr) throw rowErr

      // Add default 3 rooms for this row
      const roomsToInsert = []
      const prefix = floorName.toLowerCase().includes('ground') ? 'G' : String(floorNumber)
      for (let i = 1; i <= 3; i++) {
        roomsToInsert.push({
          pg_id: pgId,
          floor_id: floorId,
          row_id: newRow.id,
          room_number: `${prefix}${nextLetter}${i}`,
          room_type: 'double',
          capacity: 2,
          current_occupancy: 0,
          status: 'free',
          monthly_rent: 7500,
          amenities: ['Fan'],
          is_active: true
        })
      }

      const { error: roomsErr } = await supabase.from('rooms').insert(roomsToInsert)
      if (roomsErr) throw roomsErr

      toast.success(`${rowName} added with 3 default rooms!`)
      await fetchData()
    } catch (e: any) {
      console.error(e)
      toast.error('Error adding row')
    }
  }

  // Delete Row
  async function handleDeleteRow(rowId: string) {
    if (!confirm('Are you sure you want to delete this row and all its rooms?')) return
    try {
      await supabase.from('rooms').delete().eq('row_id', rowId)
      const { error } = await supabase.from('rows').delete().eq('id', rowId)
      if (error) throw error

      toast.success('Row deleted')
      await fetchData()
    } catch (e: any) {
      console.error(e)
      toast.error('Error deleting row')
    }
  }

  // Delete Floor
  async function handleDeleteFloor(floorId: string) {
    if (!confirm('Are you sure you want to delete this floor, all its rows, and all its rooms?')) return
    try {
      await supabase.from('rooms').delete().eq('floor_id', floorId)
      await supabase.from('rows').delete().eq('floor_id', floorId)
      const { error } = await supabase.from('floors').delete().eq('id', floorId)
      if (error) throw error

      toast.success('Floor deleted')
      await fetchData()
    } catch (e: any) {
      console.error(e)
      toast.error('Error deleting floor')
    }
  }

  // Create Floor with default Rows and Rooms
  async function handleAddFloor() {
    if (!newFloorName.trim() || !pgId) {
      toast.error('Please enter a floor name')
      return
    }

    try {
      const maxFloorNum = floors.reduce((max, f) => Math.max(max, f.floor_number), -1)
      const nextFloorNum = maxFloorNum + 1

      const { data: floorData, error: floorErr } = await supabase
        .from('floors')
        .insert({
          pg_id: pgId,
          floor_name: newFloorName.trim(),
          floor_number: nextFloorNum,
          sort_order: nextFloorNum
        })
        .select()
        .single()

      if (floorErr) throw floorErr

      // Insert rows
      const rowList = newRowNames.split(',').map(r => r.trim()).filter(Boolean)
      const rowsToInsert = rowList.map((rowName, idx) => ({
        pg_id: pgId,
        floor_id: floorData.id,
        row_name: rowName,
        sort_order: idx
      }))

      const { data: insertedRows, error: rowsErr } = await supabase
        .from('rows')
        .insert(rowsToInsert)
        .select()

      if (rowsErr) throw rowsErr

      // Insert rooms
      const roomsToInsert: any[] = []
      insertedRows.forEach((r) => {
        for (let i = 1; i <= newRoomsPerRow; i++) {
          const prefix = floorData.floor_name.toLowerCase().includes('ground') ? 'G' : String(nextFloorNum)
          const letterMatch = r.row_name.match(/Row\s+([A-Z])/i)
          const letter = letterMatch ? letterMatch[1] : 'R'
          const roomNumStr = `${prefix}${letter}${i}`

          roomsToInsert.push({
            pg_id: pgId,
            floor_id: floorData.id,
            row_id: r.id,
            room_number: roomNumStr,
            room_type: defaultRoomType,
            capacity: defaultCapacity,
            current_occupancy: 0,
            status: 'free',
            monthly_rent: defaultRent,
            amenities: ['Fan'],
            is_active: true
          })
        }
      })

      if (roomsToInsert.length > 0) {
        const { error: roomsErr } = await supabase.from('rooms').insert(roomsToInsert)
        if (roomsErr) throw roomsErr
      }

      toast.success('Floor created successfully with rows & rooms!')
      setIsAddFloorModalOpen(false)
      setNewFloorName('')
      setNewRowNames('Row A, Row B')
      setNewRoomsPerRow(3)
      setDefaultCapacity(2)
      setDefaultRoomType('double')
      setDefaultRent(7500)

      await fetchData()
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || 'Error creating floor')
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        title="Floor & Room Builder"
        subtitle={`${pgName} · ${floors.length} Floors · ${rooms.length} Rooms`}
      >
        <button className="tb-btn-ghost" onClick={() => setIsAddFloorModalOpen(true)}>
          ＋ Add Floor
        </button>
      </TopBar>

      {loading ? (
        <div className="flex-1 flex items-center justify-center" style={{ color: '#A89080' }}>
          Loading Room Builder...
        </div>
      ) : (
        <div className="builder-wrap">
          {/* LEFT PANEL: Floor Structure Tree */}
          <div className="left-panel">
            <div className="lp-header">
              <div className="lp-title">🏗️ Floor Structure</div>
              <div className="lp-sub">Expand floors to manage rows & settings</div>
            </div>
            <div className="lp-body">
              {floors.map(floor => {
                const floorRows = rows.filter(r => r.floor_id === floor.id)
                const floorRooms = rooms.filter(r => r.floor_id === floor.id)
                const isExpanded = !!expandedFloors[floor.id]

                return (
                  <div key={floor.id} className={`floor-item ${isExpanded ? 'active' : ''}`}>
                    <div className="floor-item-hd" onClick={() => toggleFloorExpand(floor.id)}>
                      <span className="fi-icon">🏢</span>
                      <span className="fi-name">{floor.floor_name}</span>
                      <span className="fi-count">{floorRooms.length} rooms</span>
                      <span className="fi-arrow">⌄</span>
                    </div>
                    {isExpanded && (
                      <div className="floor-item-body">
                        <div className="row-list">
                          {floorRows.map(row => {
                            const rowRooms = rooms.filter(r => r.row_id === row.id)
                            return (
                              <div key={row.id} className="row-tag">
                                <span>🔲</span>
                                <span className="row-tag-name">{row.row_name}</span>
                                <span className="row-tag-count">{rowRooms.length} rooms</span>
                                <span className="row-tag-del" onClick={() => handleDeleteRow(row.id)}>
                                  🗑
                                </span>
                              </div>
                            )
                          })}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button
                            className="add-row-btn"
                            style={{ flex: 1 }}
                            onClick={() => handleAddRow(floor.id, floor.floor_name, floor.floor_number)}
                          >
                            ＋ Row
                          </button>
                          <button
                            className="add-row-btn"
                            style={{ flex: 1, borderColor: '#F5C6C5', color: '#E53935' }}
                            onClick={() => handleDeleteFloor(floor.id)}
                          >
                            🗑 Floor
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              <button className="add-floor-btn" onClick={() => setIsAddFloorModalOpen(true)}>
                ＋ Add New Floor
              </button>

              <div className="divider"></div>
              <div className="section-head">
                <span className="dot"></span> Builder Defaults
              </div>
              <div className="field">
                <label>Default Rent (₹)</label>
                <input
                  type="number"
                  value={defaultRent}
                  onChange={e => setDefaultRent(Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label>Default Room Type</label>
                <select value={defaultRoomType} onChange={e => setDefaultRoomType(e.target.value)}>
                  <option value="single">Single</option>
                  <option value="double">Double (Sharing)</option>
                  <option value="triple">Triple (Sharing)</option>
                  <option value="quad">4 Sharing</option>
                  <option value="dormitory">Dormitory</option>
                </select>
              </div>
            </div>
          </div>

          {/* RIGHT CANVAS: Visual Grid */}
          <div className="right-canvas">
            <div className="canvas-hd">
              <div>
                <div className="canvas-title">Visual Floor Map</div>
                <div className="canvas-sub">Click a room to edit details or delete</div>
              </div>
              <div className="canvas-legend" style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div className="cleg">
                    <div className="cleg-dot" style={{ background: '#A8EDD0' }}></div> Free
                  </div>
                  <div className="cleg">
                    <div className="cleg-dot" style={{ background: '#FAD898' }}></div> Partial
                  </div>
                  <div className="cleg">
                    <div className="cleg-dot" style={{ background: '#F5C6C5' }}></div> Full
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 10, opacity: 0.85, marginTop: 2 }}>
                  <div className="cleg" style={{ display: 'flex', alignItems: 'center' }}><span style={{ width: 10, height: 4, borderRadius: 2, background: '#3B82F6', marginRight: 4 }}></span> Single</div>
                  <div className="cleg" style={{ display: 'flex', alignItems: 'center' }}><span style={{ width: 10, height: 4, borderRadius: 2, background: '#8B5CF6', marginRight: 4 }}></span> Double</div>
                  <div className="cleg" style={{ display: 'flex', alignItems: 'center' }}><span style={{ width: 10, height: 4, borderRadius: 2, background: '#F59E0B', marginRight: 4 }}></span> Triple</div>
                  <div className="cleg" style={{ display: 'flex', alignItems: 'center' }}><span style={{ width: 10, height: 4, borderRadius: 2, background: '#EC4899', marginRight: 4 }}></span> 4 Sharing</div>
                  <div className="cleg" style={{ display: 'flex', alignItems: 'center' }}><span style={{ width: 10, height: 4, borderRadius: 2, background: '#10B981', marginRight: 4 }}></span> Dorm</div>
                </div>
              </div>
            </div>

            {floors.map(floor => {
              const floorRows = rows.filter(r => r.floor_id === floor.id)
              const floorRooms = rooms.filter(r => r.floor_id === floor.id)
              const occupied = floorRooms.filter(r => r.status !== 'free').length
              const free = floorRooms.filter(r => r.status === 'free').length

              return (
                <div key={floor.id} className="cf-block">
                  <div className="cf-hd">
                    <span className="cf-floor-badge">
                      {floor.floor_name.replace(/Floor/i, '').trim()}
                    </span>
                    <span className="cf-floor-name">{floor.floor_name}</span>
                    <span className="cf-stats">
                      {floorRooms.length} rooms · {occupied} occupied · {free} free
                    </span>
                  </div>
                  <div className="cf-body">
                    {floorRows.map(row => {
                      const rowRooms = rooms.filter(r => r.row_id === row.id)
                      return (
                        <div key={row.id} className="row-block">
                          <div className="row-lbl">{row.row_name}</div>
                          <div className="rooms-grid">
                            {rowRooms.map(room => {
                              const isSel = selectedRoom?.id === room.id
                              const statusClass =
                                room.status === 'full'
                                  ? 'rc-full'
                                  : room.status === 'partial'
                                  ? 'rc-partial'
                                  : 'rc-free'

                              return (
                                <div
                                  key={room.id}
                                  className={`rc ${statusClass} ${isSel ? 'selected' : ''}`}
                                  onClick={() => openRoomDetails(room)}
                                >
                                  <div className={`rc-type-stripe stripe-${room.room_type}`} />
                                  <div className="rc-num">{room.room_number}</div>
                                  <div className="rc-type">
                                    {room.room_type === 'quad' ? '4 Sharing' : room.room_type.charAt(0).toUpperCase() + room.room_type.slice(1)}
                                  </div>
                                  <div className="rc-cap">
                                    {room.current_occupancy}/{room.capacity}
                                  </div>
                                </div>
                              )
                            })}
                            <div
                              className="rc-add"
                              onClick={() =>
                                handleAddRoom(
                                  floor.id,
                                  row.id,
                                  floor.floor_name,
                                  floor.floor_number,
                                  row.row_name
                                )
                              }
                            >
                              <div>＋</div>
                              <div className="rc-add-lbl">Add Room</div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* EDIT ROOM SIDEBAR */}
          <div className={`room-detail-panel ${selectedRoom ? 'open' : ''}`}>
            <div className="rdp-hd">
              <div className="rdp-title">Room Details</div>
              <div className="rdp-close" onClick={() => setSelectedRoom(null)}>
                ✕
              </div>
            </div>
            {selectedRoom && (
              <div className="rdp-body">
                <div className="field">
                  <label>Room Number</label>
                  <input
                    type="text"
                    value={editRoomNum}
                    onChange={e => setEditRoomNum(e.target.value)}
                  />
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Floor</label>
                    <select value={editFloorId} onChange={e => setEditFloorId(e.target.value)}>
                      {floors.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.floor_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Row</label>
                    <select value={editRowId} onChange={e => setEditRowId(e.target.value)}>
                      {rows
                        .filter(r => r.floor_id === editFloorId)
                        .map(r => (
                          <option key={r.id} value={r.id}>
                            {r.row_name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Room Type</label>
                  <div className="type-grid">
                    {[
                      { type: 'single', ic: '🛏️', nm: 'Single' },
                      { type: 'double', ic: '🛏🛏', nm: 'Double' },
                      { type: 'triple', ic: '🛏🛏🛏', nm: 'Triple' },
                      { type: 'quad', ic: '🛏🛏🛏🛏', nm: '4 Sharing' },
                      { type: 'dormitory', ic: '🏨', nm: 'Dorm' }
                    ].map(t => (
                      <div
                        key={t.type}
                        className={`type-btn ${editRoomType === t.type ? 'sel' : ''}`}
                        onClick={() => setEditRoomType(t.type)}
                        style={{ padding: '6px 4px' }}
                      >
                        <div className="type-ic" style={{ fontSize: 13 }}>{t.ic}</div>
                        <div className="type-nm" style={{ fontSize: 10.5 }}>{t.nm}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label>Capacity</label>
                  <input
                    type="number"
                    value={editCapacity}
                    onChange={e => setEditCapacity(Number(e.target.value))}
                    min="1"
                    max="20"
                  />
                </div>
                <div className="field">
                  <label>Current Status</label>
                  <div className="status-opts">
                    <div
                      className={`status-opt ${editStatus === 'free' ? 'active-free' : ''}`}
                      onClick={() => setEditStatus('free')}
                    >
                      🟢 Free
                    </div>
                    <div
                      className={`status-opt ${editStatus === 'partial' ? 'active-part' : ''}`}
                      onClick={() => setEditStatus('partial')}
                    >
                      🟡 Partial
                    </div>
                    <div
                      className={`status-opt ${editStatus === 'full' ? 'active-full' : ''}`}
                      onClick={() => setEditStatus('full')}
                    >
                      🔴 Full
                    </div>
                  </div>
                </div>
                <div className="field">
                  <label>Amenities</label>
                  <div className="amenity-row">
                    {['Attached Bath', 'AC', 'Fan', 'TV', 'Balcony', 'Locker'].map(amenity => {
                      const on = editAmenities.includes(amenity)
                      return (
                        <div
                          key={amenity}
                          className={`amenity-tag ${on ? 'on' : ''}`}
                          onClick={() => toggleEditAmenity(amenity)}
                        >
                          {amenity}
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="field">
                  <label>Monthly Rent (₹)</label>
                  <input
                    type="number"
                    value={editRent}
                    onChange={e => setEditRent(Number(e.target.value))}
                  />
                </div>
                <div className="field">
                  <label>Notes</label>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value)}
                    placeholder="e.g. Corner room, good ventilation"
                  />
                </div>
              </div>
            )}
            <div className="rdp-foot">
              <button className="rdp-del" onClick={() => selectedRoom && handleDeleteRoom(selectedRoom.id)}>
                🗑 Delete
              </button>
              <button className="rdp-save" onClick={handleSaveRoom}>
                Save Room
              </button>
            </div>
          </div>

          {/* ADD FLOOR MODAL */}
          {isAddFloorModalOpen && (
            <div className={`modal-overlay ${isAddFloorModalOpen ? 'open' : ''}`} onClick={() => setIsAddFloorModalOpen(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-hd">
                  <div className="modal-title">➕ Add New Floor</div>
                  <div className="modal-close" onClick={() => setIsAddFloorModalOpen(false)}>
                    ✕
                  </div>
                </div>
                <div className="modal-body">
                  <div className="field">
                    <label>Floor Name</label>
                    <input
                      type="text"
                      value={newFloorName}
                      onChange={e => setNewFloorName(e.target.value)}
                      placeholder="e.g. Ground Floor, 1st Floor, 3rd Floor"
                    />
                  </div>
                  <div className="field-row">
                    <div className="field">
                      <label>Rooms per Row</label>
                      <select
                        value={newRoomsPerRow}
                        onChange={e => setNewRoomsPerRow(Number(e.target.value))}
                      >
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                        <option value="6">6</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Default Room Capacity</label>
                      <select
                        value={defaultCapacity}
                        onChange={e => setDefaultCapacity(Number(e.target.value))}
                      >
                        <option value="1">1 (Single)</option>
                        <option value="2">2 (Double)</option>
                        <option value="3">3 (Triple)</option>
                        <option value="4">4 (4 Sharing)</option>
                      </select>
                    </div>
                  </div>
                  <div className="field">
                    <label>Row Names</label>
                    <input
                      type="text"
                      value={newRowNames}
                      onChange={e => setNewRowNames(e.target.value)}
                      placeholder="e.g. Row A, Row B (comma separated)"
                    />
                  </div>
                  <div className="field">
                    <label>Default Room Type</label>
                    <select
                      value={defaultRoomType}
                      onChange={e => setDefaultRoomType(e.target.value)}
                    >
                      <option value="single">Single</option>
                      <option value="double">Double (Sharing)</option>
                      <option value="triple">Triple (Sharing)</option>
                      <option value="quad">4 Sharing</option>
                      <option value="dormitory">Dormitory</option>
                    </select>
                  </div>
                </div>
                <div className="modal-foot">
                  <button className="m-btn-ghost" onClick={() => setIsAddFloorModalOpen(false)}>
                    Cancel
                  </button>
                  <button className="m-btn-primary" onClick={handleAddFloor}>
                    Create Floor →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STYLES INJECTED DIRECTLY TO PRESERVE MOCKUP LOOK & FEEL */}
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

        .builder-wrap { flex: 1; display: flex; overflow: hidden; }

        .left-panel { width: 320px; flex-shrink: 0; background: var(--white); border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
        .lp-header { padding: 16px 18px 12px; border-bottom: 1px solid var(--border); }
        .lp-title { font-family: 'Playfair Display', serif; font-size: 14.5px; font-weight: 700; color: var(--text); }
        .lp-sub { font-size: 11.5px; color: var(--text-soft); margin-top: 2px; }
        .lp-body { flex: 1; overflow-y: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 14px; scrollbar-width: thin; }

        .field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 8px; }
        .field label { font-size: 11px; font-weight: 800; color: var(--text-mid); text-transform: uppercase; letter-spacing: 0.8px; }
        .field input, .field select {
          border: 1.5px solid var(--border); border-radius: 9px;
          padding: 9px 12px; font-size: 13px;
          color: var(--text); background: var(--bg); outline: none;
          transition: border-color 0.15s;
        }
        .field input:focus, .field select:focus { border-color: var(--orange); background: #fff; }

        .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .divider { height: 1px; background: var(--border); margin: 6px 0; }

        .section-head { font-size: 12px; font-weight: 800; color: var(--text); display: flex; align-items: center; gap: 7px; margin-bottom: 6px; }
        .section-head .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--orange); }

        .type-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 7px; }
        .type-btn {
          border: 1.5px solid var(--border); border-radius: 9px; padding: 8px 10px;
          text-align: center; cursor: pointer; transition: all 0.15s; background: var(--bg);
        }
        .type-btn:hover { border-color: var(--orange-border); background: var(--orange-pale); }
        .type-btn.sel { border-color: var(--orange); background: var(--orange-pale); }
        .type-btn .type-ic { font-size: 18px; }
        .type-btn .type-nm { font-size: 11px; font-weight: 700; color: var(--text-mid); margin-top: 3px; }
        .type-btn.sel .type-nm { color: var(--orange); }

        .amenity-row { display: flex; gap: 7px; flex-wrap: wrap; }
        .amenity-tag {
          border: 1.5px solid var(--border); border-radius: 20px;
          padding: 5px 11px; font-size: 11.5px; font-weight: 600;
          cursor: pointer; transition: all 0.15s; background: var(--bg); color: var(--text-mid);
        }
        .amenity-tag:hover { border-color: var(--orange-border); }
        .amenity-tag.on { border-color: var(--orange); background: var(--orange-pale); color: var(--orange); }

        .add-floor-btn {
          width: 100%; border: 2px dashed var(--orange-border); border-radius: 10px;
          padding: 11px; background: var(--orange-pale); color: var(--orange);
          font-size: 13px; font-weight: 700; cursor: pointer;
          transition: all 0.15s; display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .add-floor-btn:hover { border-color: var(--orange); background: #FFE8D6; }

        .floor-item { border: 1.5px solid var(--border); border-radius: 11px; overflow: hidden; transition: border-color 0.15s; }
        .floor-item.active { border-color: var(--orange); }
        .floor-item-hd { display: flex; align-items: center; gap: 10px; padding: 10px 13px; cursor: pointer; background: var(--white); transition: background 0.15s; }
        .floor-item-hd:hover { background: var(--orange-pale); }
        .floor-item.active .floor-item-hd { background: var(--orange-pale); }
        .fi-icon { font-size: 16px; }
        .fi-name { font-size: 13px; font-weight: 700; color: var(--text); flex: 1; }
        .fi-count { font-size: 11px; color: var(--text-soft); font-weight: 600; }
        .fi-arrow { color: var(--text-soft); font-size: 12px; transition: transform 0.2s; }
        .floor-item.active .fi-arrow { transform: rotate(180deg); color: var(--orange); }
        .floor-item-body { padding: 10px 13px 13px; border-top: 1px solid var(--border); background: var(--bg); }

        .row-list { display: flex; flex-direction: column; gap: 7px; margin-bottom: 9px; }
        .row-tag { display: flex; align-items: center; gap: 8px; padding: 7px 10px; background: var(--white); border: 1px solid var(--border); border-radius: 8px; font-size: 12.5px; }
        .row-tag-name { flex: 1; font-weight: 600; color: var(--text); }
        .row-tag-count { font-size: 11px; color: var(--text-soft); }
        .row-tag-del { color: var(--red); cursor: pointer; font-size: 13px; opacity: 0.6; }
        .row-tag-del:hover { opacity: 1; }

        .add-row-btn {
          width: 100%; border: 1.5px dashed var(--border); border-radius: 8px;
          padding: 7px; background: transparent; color: var(--text-soft);
          font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s;
        }
        .add-row-btn:hover { border-color: var(--orange-border); color: var(--orange); background: var(--orange-pale); }

        .right-canvas { flex: 1; overflow-y: auto; padding: 22px 26px; scrollbar-width: thin; }
        .canvas-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
        .canvas-title { font-family: 'Playfair Display', serif; font-size: 16px; font-weight: 700; color: var(--text); }
        .canvas-sub { font-size: 12px; color: var(--text-soft); margin-top: 2px; }
        .canvas-legend { display: flex; align-items: center; gap: 14px; }
        .cleg { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--text-mid); font-weight: 600; }
        .cleg-dot { width: 10px; height: 10px; border-radius: 3px; }

        .cf-block { background: var(--white); border: 1.5px solid var(--border); border-radius: var(--r); margin-bottom: 16px; overflow: hidden; box-shadow: var(--shadow-sm); animation: fadeUp 0.3s ease both; }
        .cf-hd { padding: 12px 18px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid var(--border); background: var(--white); }
        .cf-floor-badge { background: var(--orange-pale); color: var(--orange); font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 20px; }
        .cf-floor-name { font-family: 'Playfair Display', serif; font-size: 14px; font-weight: 700; flex: 1; }
        .cf-stats { font-size: 11.5px; color: var(--text-soft); font-weight: 600; }
        .cf-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 14px; }

        .row-lbl { font-size: 10.5px; font-weight: 800; color: var(--text-soft); text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; gap: 8px; margin-bottom: 9px; }
        .row-lbl::after { content: ''; flex: 1; height: 1px; background: var(--border); }

        .rooms-grid { display: flex; gap: 8px; flex-wrap: wrap; }

        .rc {
          width: 72px; height: 72px; border-radius: 12px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.18s; border: 2px solid transparent; position: relative;
        }
        .rc:hover { transform: scale(1.08); z-index: 5; box-shadow: 0 6px 18px rgba(0,0,0,0.12); }
        .rc.selected { border-color: var(--orange) !important; box-shadow: 0 0 0 3px rgba(244,112,10,0.18); }
        .rc-num { font-size: 13px; font-weight: 800; }
        .rc-type { font-size: 9.5px; font-weight: 600; opacity: 0.8; margin-top: 1px; }
        .rc-cap { font-size: 9px; font-weight: 700; opacity: 0.7; margin-top: 1px; }

        .rc-type-stripe {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4.5px;
          border-radius: 12px 12px 0 0;
        }
        .rc-type-stripe.stripe-single { background: #3B82F6; }
        .rc-type-stripe.stripe-double { background: #8B5CF6; }
        .rc-type-stripe.stripe-triple { background: #F59E0B; }
        .rc-type-stripe.stripe-quad { background: #EC4899; }
        .rc-type-stripe.stripe-dormitory { background: #10B981; }

        .rc-free    { background: var(--green-pale); color: var(--green); border-color: #A8EDD0; }
        .rc-full    { background: var(--red-pale);   color: var(--red);   border-color: #F5C6C5; }
        .rc-partial { background: var(--amber-pale); color: #B87800;      border-color: #FAD898; }

        .rc-add {
          width: 72px; height: 72px; border-radius: 12px; border: 2px dashed var(--orange-border);
          background: transparent; color: var(--orange); display: flex; flex-direction: column;
          align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s; font-size: 22px;
        }
        .rc-add:hover { border-color: var(--orange); background: var(--orange-pale); transform: scale(1.05); }
        .rc-add-lbl { font-size: 9.5px; font-weight: 700; margin-top: 3px; }

        .room-detail-panel {
          position: fixed; right: 0; top: 0; bottom: 0;
          width: 320px; background: var(--white); border-left: 1px solid var(--border);
          box-shadow: -4px 0 24px rgba(28,15,5,0.10); display: flex; flex-direction: column;
          transform: translateX(100%); transition: transform 0.28s cubic-bezier(.4,0,.2,1); z-index: 100;
        }
        .room-detail-panel.open { transform: translateX(0); }
        .rdp-hd { padding: 16px 18px 14px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
        .rdp-title { font-family: 'Playfair Display', serif; font-size: 15px; font-weight: 700; }
        .rdp-close { width: 28px; height: 28px; border-radius: 7px; background: var(--bg); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 13px; }
        .rdp-body { flex: 1; overflow-y: auto; padding: 16px 18px; display: flex; flex-direction: column; gap: 13px; scrollbar-width: thin; }
        .rdp-foot { padding: 14px 18px; border-top: 1px solid var(--border); display: flex; gap: 8px; }
        .rdp-save { flex: 1; background: var(--orange); color: #fff; border: none; border-radius: 9px; padding: 9px; font-size: 13px; font-weight: 700; cursor: pointer; }
        .rdp-save:hover { background: var(--orange-hover); }
        .rdp-del { background: var(--red-pale); color: var(--red); border: none; border-radius: 9px; padding: 9px 14px; font-size: 13px; font-weight: 700; cursor: pointer; }
        .rdp-del:hover { background: var(--red); color: #fff; }

        .status-opts { display: flex; gap: 7px; }
        .status-opt { flex: 1; border: 1.5px solid var(--border); border-radius: 8px; padding: 7px 6px; text-align: center; cursor: pointer; font-size: 11px; font-weight: 700; transition: all 0.15s; }
        .status-opt.active-free  { border-color: var(--green); background: var(--green-pale); color: var(--green); }
        .status-opt.active-full  { border-color: var(--red);   background: var(--red-pale);   color: var(--red); }
        .status-opt.active-part  { border-color: var(--amber); background: var(--amber-pale); color: #B87800; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(28,15,5,0.45); display: flex; align-items: center; justify-content: center; z-index: 200; opacity: 0; pointer-events: none; transition: opacity 0.2s; }
        .modal-overlay.open { opacity: 1; pointer-events: all; }
        .modal { background: var(--white); border-radius: 16px; width: 420px; box-shadow: 0 20px 60px rgba(28,15,5,0.2); overflow: hidden; transform: translateY(20px); transition: transform 0.25s cubic-bezier(.4,0,.2,1); }
        .modal-overlay.open .modal { transform: translateY(0); }
        .modal-hd { padding: 18px 20px 14px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
        .modal-title { font-family: 'Playfair Display', serif; font-size: 15px; font-weight: 700; }
        .modal-close { width: 28px; height: 28px; border-radius: 7px; background: var(--bg); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 13px; }
        .modal-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 13px; }
        .modal-foot { padding: 14px 20px; border-top: 1px solid var(--border); display: flex; gap: 9px; justify-content: flex-end; }
        .m-btn-primary { background: var(--orange); color: #fff; border: none; border-radius: 9px; padding: 9px 20px; font-size: 13px; font-weight: 700; cursor: pointer; }
        .m-btn-ghost { background: var(--white); color: var(--text); border: 1px solid var(--border); border-radius: 9px; padding: 9px 16px; font-size: 13px; font-weight: 600; cursor: pointer; }

        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}
