'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function deletePGAction(pgId: string) {
  // Initialize Supabase with service role key to bypass RLS and perform admin user operations
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // 1. Soft-delete the PG property
    const { error: pgError } = await supabase
      .from('pgs')
      .update({
        deleted_at: new Date().toISOString(),
        is_active: false
      })
      .eq('id', pgId)

    if (pgError) {
      throw new Error(`Failed to delete PG: ${pgError.message}`)
    }

    // 2. Clean up Guests in this PG
    const { data: guests, error: findGuestsError } = await supabase
      .from('guests')
      .select('id, user_id')
      .eq('pg_id', pgId)

    if (findGuestsError) {
      throw new Error(`Failed to fetch guests for PG: ${findGuestsError.message}`)
    }

    for (const guest of (guests || [])) {
      if (guest.user_id) {
        // Delete guest profile
        try {
          await supabase.from('profiles').delete().eq('id', guest.user_id)
        } catch (err) {
          console.error(`Failed to delete profile for guest ${guest.user_id}:`, err)
        }
        // Delete guest auth user using admin client
        try {
          const { error: delAuthErr } = await supabase.auth.admin.deleteUser(guest.user_id)
          if (delAuthErr) {
            console.error(`Failed to delete guest auth user ${guest.user_id}:`, delAuthErr.message)
          }
        } catch (err) {
          console.error(`Failed to delete auth user for guest ${guest.user_id}:`, err)
        }
      }
      
      // Delete guest documents, emergency contacts, and guest record physically
      try {
        await supabase.from('guest_documents').delete().eq('guest_id', guest.id)
      } catch (err) {
        console.error(`Failed to delete documents for guest ${guest.id}:`, err)
      }
      try {
        await supabase.from('emergency_contacts').delete().eq('guest_id', guest.id)
      } catch (err) {
        console.error(`Failed to delete emergency contacts for guest ${guest.id}:`, err)
      }
      try {
        const { error: delGuestErr } = await supabase.from('guests').delete().eq('id', guest.id)
        if (delGuestErr) {
          console.error(`Failed to delete guest record ${guest.id}:`, delGuestErr.message)
        }
      } catch (err) {
        console.error(`Failed to delete guest record ${guest.id}:`, err)
      }
    }

    // 3. Clean up PG Admins mapped to this PG
    const { data: pgAdmins, error: adminsError } = await supabase
      .from('pg_admins')
      .select('user_id')
      .eq('pg_id', pgId)

    if (adminsError) {
      throw new Error(`Failed to fetch PG admins: ${adminsError.message}`)
    }

    const adminUserIds = pgAdmins ? pgAdmins.map(pa => pa.user_id) : []

    // Delete mapping records
    const { error: linkDelErr } = await supabase
      .from('pg_admins')
      .delete()
      .eq('pg_id', pgId)

    if (linkDelErr) {
      throw new Error(`Failed to delete pg_admins links: ${linkDelErr.message}`)
    }

    // Check and delete admins who are not mapped to other active (non-deleted) PGs
    for (const userId of adminUserIds) {
      // Find other active pg_admins links for this user.
      const { data: otherLinks, error: otherLinksErr } = await supabase
        .from('pg_admins')
        .select(`
          pg_id,
          pgs!inner(id, deleted_at)
        `)
        .eq('user_id', userId)
        .is('pgs.deleted_at', null)

      if (otherLinksErr) {
        console.error(`Error checking other links for admin ${userId}:`, otherLinksErr)
        continue
      }

      // If they have no other links to active PGs, delete profile and auth user
      if (!otherLinks || otherLinks.length === 0) {
        try {
          await supabase.from('profiles').delete().eq('id', userId)
        } catch (err) {
          console.error(`Failed to delete profile for admin ${userId}:`, err)
        }
        try {
          const { error: authDelErr } = await supabase.auth.admin.deleteUser(userId)
          if (authDelErr) {
            console.error(`Failed to delete auth user for admin ${userId}:`, authDelErr.message)
          }
        } catch (err) {
          console.error(`Failed to delete auth user for admin ${userId}:`, err)
        }
      }
    }

    return { success: true }
  } catch (err: any) {
    console.error('deletePGAction Error:', err)
    return { success: false, error: err.message || 'Unknown error occurred' }
  }
}
