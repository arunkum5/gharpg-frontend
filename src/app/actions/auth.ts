'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Resets a user's password/PIN to the default "123456" using admin privileges.
 */
export async function resetUserPasswordAction(userId: string) {
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: '123456'
    })

    if (error) throw error
    return { success: true }
  } catch (err: any) {
    console.error('resetUserPasswordAction error:', err)
    return { success: false, error: err.message || 'Failed to reset PIN' }
  }
}

/**
 * Creates a guest auth user and profile with default password "123456".
 */
export async function createGuestAuthAction(email: string, name: string, phone: string) {
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email: email.trim(),
      password: '123456',
      email_confirm: true
    })

    let userId = ''

    if (createErr) {
      // If user already exists in auth, locate and reuse their ID
      if (createErr.message.includes('already exists') || createErr.status === 422) {
        const { data: { users }, error: listUsersErr } = await supabase.auth.admin.listUsers()
        if (listUsersErr) throw listUsersErr

        const existing = users.find(u => u.email === email.trim())
        if (existing) {
          userId = existing.id
          
          // Upsert profile role to guest
          const { error: upsertErr } = await supabase
            .from('profiles')
            .upsert({
              id: existing.id,
              name: name.trim(),
              role: 'guest',
              email: email.trim(),
              phone: phone.trim(),
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
      userId = newUser.user.id
      
      // Create profile
      const { error: profError } = await supabase
        .from('profiles')
        .upsert({
          id: newUser.user.id,
          name: name.trim(),
          role: 'guest',
          email: email.trim(),
          phone: phone.trim(),
          is_active: true,
          updated_at: new Date().toISOString()
        })
      if (profError) throw profError
    }

    return { success: true, userId }
  } catch (err: any) {
    console.error('createGuestAuthAction error:', err)
    return { success: false, error: err.message || 'Failed to provision guest user' }
  }
}
