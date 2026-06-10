export type UserRole        = 'superadmin' | 'pgadmin' | 'guest'
export type PGPropertyType  = 'boys' | 'girls' | 'coliving'
export type AdminAccess     = 'full' | 'limited' | 'view_only'
export type RoomType        = 'single' | 'double' | 'triple' | 'quad' | 'dormitory'
export type RoomStatus      = 'free' | 'partial' | 'full'
export type GenderType      = 'male' | 'female' | 'other'
export type PurposeType     = 'student' | 'working' | 'medical' | 'other'
export type GuestStatus     = 'pending' | 'active' | 'checked_out' | 'rejected'
export type ApprovalStatus  = 'pending' | 'approved' | 'rejected'
export type DocType         = 'aadhaar' | 'pan' | 'passport' | 'voter_id' | 'driving_licence' | 'college_id' | 'photo'
export type DocStatus       = 'pending' | 'verified' | 'rejected'
export type RelationType    = 'father' | 'mother' | 'sibling' | 'spouse' | 'friend' | 'other'
export type NoticeType      = 'general' | 'maintenance' | 'payment' | 'food' | 'emergency' | 'event'
export type NoticeTarget    = 'all' | 'floor' | 'purpose_student' | 'purpose_working'
export type NoticeStatus    = 'draft' | 'sent' | 'scheduled'

export interface Profile {
  id:          string
  name:        string
  phone:       string | null
  email:       string | null
  role:        UserRole
  avatar_url:  string | null
  is_active:   boolean
  created_at:  string
  updated_at:  string
  deleted_at:  string | null
}

export interface PG {
  id:                   string
  name:                 string
  type:                 PGPropertyType
  description:          string | null
  address:              string
  city:                 string
  state:                string
  pin_code:             string | null
  maps_link:            string | null
  contact_phone:        string
  contact_email:        string | null
  min_rent:             number | null
  max_rent:             number | null
  security_deposit:     number | null
  notice_period_months: number
  checkin_cutoff_time:  string | null
  rules:                string | null
  amenities:            string[]
  is_active:            boolean
  superadmin_id:        string
  created_at:           string
  updated_at:           string
  deleted_at:           string | null
}

export interface Floor {
  id:           string
  pg_id:        string
  floor_number: number
  floor_name:   string
  sort_order:   number
  created_at:   string
}

export interface Row {
  id:         string
  floor_id:   string
  pg_id:      string
  row_name:   string
  sort_order: number
  created_at: string
}

export interface Room {
  id:                string
  pg_id:             string
  floor_id:          string
  row_id:            string
  room_number:       string
  room_type:         RoomType
  capacity:          number
  current_occupancy: number
  status:            RoomStatus
  monthly_rent:      number | null
  amenities:         string[]
  notes:             string | null
  is_active:         boolean
  created_at:        string
  updated_at:        string
}

export interface Guest {
  id:                     string
  user_id:                string | null
  pg_id:                  string
  room_id:                string | null
  first_name:             string
  last_name:              string
  gender:                 GenderType
  dob:                    string | null
  photo_url:              string | null
  purpose:                PurposeType
  college_or_company:     string | null
  hometown_city:          string | null
  checkin_date:           string | null
  expected_checkout_date: string | null
  actual_checkout_date:   string | null
  stay_duration_months:   number | null
  monthly_rent:           number | null
  advance_paid:           number | null
  status:                 GuestStatus
  referred_by_guest_id:   string | null
  added_by_user_id:       string
  approval_status:        ApprovalStatus
  approved_by_user_id:    string | null
  approved_at:            string | null
  rejection_reason:       string | null
  notes:                  string | null
  checkout_requested?:    boolean
  checkout_reason?:       string | null
  created_at:             string
  updated_at:             string
  deleted_at:             string | null
}

export interface GuestDocument {
  id:                  string
  guest_id:            string
  doc_type:            DocType
  doc_number:          string | null
  front_url:           string | null
  back_url:            string | null
  verification_status: DocStatus
  verified_by_user_id: string | null
  verified_at:         string | null
  created_at:          string
}

export interface EmergencyContact {
  id:         string
  guest_id:   string
  name:       string
  relation:   RelationType
  phone:      string
  city:       string | null
  created_at: string
}

export interface Notice {
  id:                 string
  pg_id:              string
  created_by_user_id: string
  title:              string
  body:               string
  type:               NoticeType
  target:             NoticeTarget
  target_floor_id:    string | null
  status:             NoticeStatus
  scheduled_at:       string | null
  sent_at:            string | null
  created_at:         string
}

export interface NoticeRead {
  id:        string
  notice_id: string
  guest_id:  string
  read_at:   string
}

export interface AuditLog {
  id:            string
  pg_id:         string | null
  actor_user_id: string
  action:        string
  entity_type:   string | null
  entity_id:     string | null
  meta:          Record<string, unknown>
  created_at:    string
}

// ── Joined types (with relations) ─────────────────────────

export interface RoomWithDetails extends Room {
  floor:  Floor
  row:    Row
  guests: Guest[]
}

export interface GuestWithDetails extends Guest {
  room:               Room | null
  documents:          GuestDocument[]
  emergency_contact:  EmergencyContact | null
  referred_by:        Guest | null
}

export interface FloorWithRooms extends Floor {
  rows: RowWithRooms[]
}

export interface RowWithRooms extends Row {
  rooms: Room[]
}

export interface PGWithStats extends PG {
  total_rooms:      number
  occupied_rooms:   number
  free_rooms:       number
  total_guests:     number
  pending_approvals: number
  occupancy_pct:    number
}

export type IssueCategory = 'plumbing' | 'electrical' | 'cleanliness' | 'wifi' | 'furniture' | 'other'
export type IssueStatus = 'open' | 'in_progress' | 'resolved'

export interface GuestIssue {
  id: string
  pg_id: string
  guest_id: string
  title: string
  description: string
  category: IssueCategory
  status: IssueStatus
  created_at: string
  updated_at: string
}

export interface GuestIssueWithDetails extends GuestIssue {
  guest: Guest
}

export interface MealAttendance {
  id: string
  pg_id: string
  guest_id: string
  date: string
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snacks'
  eating: boolean
  created_at: string
}


