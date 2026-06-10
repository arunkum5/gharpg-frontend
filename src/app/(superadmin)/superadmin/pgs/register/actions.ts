'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function registerPGAction(
  pgData: {
    name: string
    type: 'boys' | 'girls' | 'coliving'
    description: string | null
    address: string
    city: string
    state: string
    pin_code: string | null
    maps_link: string | null
    contact_phone: string
    contact_email: string | null
    min_rent: number | null
    max_rent: number | null
    security_deposit: number | null
    notice_period_months: number
    checkin_cutoff_time: string | null
    rules: string | null
    amenities: string[]
    superadmin_id: string
  },
  adminData: {
    mode: 'existing' | 'invite'
    existingAdminId?: string
    inviteAdminName?: string
    inviteAdminMobile?: string
    inviteAdminEmail?: string
    inviteAdminAccess?: 'full' | 'limited' | 'view_only'
  }
) {
  // Initialize Supabase with service role key to bypass RLS and perform admin user operations
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // 1. Insert PG
    const { data: pg, error: pgError } = await supabase
      .from('pgs')
      .insert({
        name: pgData.name,
        type: pgData.type,
        description: pgData.description,
        address: pgData.address,
        city: pgData.city,
        state: pgData.state,
        pin_code: pgData.pin_code,
        maps_link: pgData.maps_link,
        contact_phone: pgData.contact_phone,
        contact_email: pgData.contact_email,
        min_rent: pgData.min_rent,
        max_rent: pgData.max_rent,
        security_deposit: pgData.security_deposit,
        notice_period_months: pgData.notice_period_months,
        checkin_cutoff_time: pgData.checkin_cutoff_time,
        rules: pgData.rules,
        amenities: pgData.amenities,
        superadmin_id: pgData.superadmin_id,
        is_active: true
      })
      .select()
      .single()

    if (pgError) {
      console.error('PG Insert Error:', pgError)
      throw new Error(`Failed to insert PG: ${pgError.message}`)
    }

    let adminUserId = ''

    // 2. Handle Admin Assignment
    if (adminData.mode === 'existing') {
      if (!adminData.existingAdminId) {
        throw new Error('Existing admin ID is required')
      }
      adminUserId = adminData.existingAdminId
    } else {
      // Invite admin: create auth user & profile
      if (!adminData.inviteAdminEmail || !adminData.inviteAdminName || !adminData.inviteAdminMobile) {
        throw new Error('New admin details are required')
      }
      
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: adminData.inviteAdminEmail,
        password: '123456', // Default 6 digit PIN
        email_confirm: true
      })

      if (createErr) {
        // If user already exists in auth, find and use them
        if (createErr.message.includes('already exists') || createErr.status === 422) {
          const { data: { users }, error: listUsersErr } = await supabase.auth.admin.listUsers()
          if (listUsersErr) throw listUsersErr
          
          const existing = users.find(u => u.email === adminData.inviteAdminEmail)
          if (existing) {
            adminUserId = existing.id
            // Upsert profile
            const { error: upsertErr } = await supabase
              .from('profiles')
              .upsert({
                id: existing.id,
                name: adminData.inviteAdminName,
                role: 'pgadmin',
                email: adminData.inviteAdminEmail,
                phone: adminData.inviteAdminMobile,
                is_active: true,
                updated_at: new Date().toISOString()
              })
            if (upsertErr) throw upsertErr
          } else {
            throw new Error(`Auth user already exists but could not be located: ${createErr.message}`)
          }
        } else {
          throw new Error(`Failed to create auth user: ${createErr.message}`)
        }
      } else {
        adminUserId = newUser.user.id
        // Create profile
        const { error: profError } = await supabase
          .from('profiles')
          .upsert({
            id: newUser.user.id,
            name: adminData.inviteAdminName,
            role: 'pgadmin',
            email: adminData.inviteAdminEmail,
            phone: adminData.inviteAdminMobile,
            is_active: true,
            updated_at: new Date().toISOString()
          })
        if (profError) throw profError
      }
    }

    // 3. Link admin in pg_admins
    if (adminUserId) {
      // Deactivate any existing active admin mappings for this user
      await supabase
        .from('pg_admins')
        .update({ is_active: false })
        .eq('user_id', adminUserId)

      // Insert new admin mapping
      const { error: linkErr } = await supabase
        .from('pg_admins')
        .insert({
          pg_id: pg.id,
          user_id: adminUserId,
          is_active: true
        })

      if (linkErr) {
        console.error('Link Admin Error:', linkErr)
        throw new Error(`Failed to assign PG Admin: ${linkErr.message}`)
      }
    }

    return { success: true, pgId: pg.id }
  } catch (err: any) {
    console.error('registerPGAction Error:', err)
    return { success: false, error: err.message || 'Unknown error occurred' }
  }
}
