'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import TopBar from '@/components/layout/TopBar'
import { toast } from 'sonner'

export default function PGAdminSettings() {
  const router = useRouter()
  const supabase = createClient()

  // States
  const [loading, setLoading] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pgName, setPgName] = useState('My PG')

  useEffect(() => {
    fetchPGDetails()
  }, [])

  async function fetchPGDetails() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: pgAdmin, error: pgErr } = await supabase
        .from('pg_admins')
        .select('pg_id, pgs(name)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()

      if (pgAdmin && pgAdmin.pgs) {
        setPgName((pgAdmin.pgs as any).name)
      }
    } catch (e) {
      console.error(e)
    }
  }

  async function handleUpdatePin(e: React.FormEvent) {
    e.preventDefault()
    if (newPin.length !== 6 || !/^\d+$/.test(newPin)) {
      toast.error('PIN must be exactly 6 digits')
      return
    }
    if (newPin !== confirmPin) {
      toast.error('Confirm PIN does not match New PIN')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPin
      })

      if (error) throw error

      toast.success('Your login PIN has been updated successfully!')
      setNewPin('')
      setConfirmPin('')
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || 'Failed to update PIN')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar 
        title="⚙️ PG Settings" 
        subtitle={`${pgName} · Security settings & preferences`}
      />

      <div className="flex-1 overflow-y-auto p-6 bg-[#FAF6F2] flex flex-col gap-6">
        
        <div className="settings-card">
          <div className="sc-header">
            <span style={{ fontSize: 20 }}>🔑</span>
            <div>
              <div className="sc-title">Change Login PIN</div>
              <div className="sc-desc">Update your 6-digit access code used for logging into the admin panel.</div>
            </div>
          </div>
          
          <form className="sc-body" onSubmit={handleUpdatePin}>
            <div className="field">
              <label>New 6-Digit PIN</label>
              <input 
                type="password" 
                maxLength={6}
                placeholder="••••••"
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>

            <div className="field">
              <label>Confirm 6-Digit PIN</label>
              <input 
                type="password" 
                maxLength={6}
                placeholder="••••••"
                value={confirmPin}
                onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>

            <button 
              type="submit" 
              className="save-btn" 
              disabled={loading}
            >
              {loading ? 'Updating PIN...' : 'Update Login PIN'}
            </button>
          </form>
        </div>

      </div>

      <style>{`
        .settings-card {
          background: #fff;
          border: 1px solid #EDE0D4;
          border-radius: 16px;
          box-shadow: 0 1px 4px rgba(28,15,5,0.06);
          max-width: 460px;
          overflow: hidden;
        }

        .sc-header {
          padding: 20px;
          border-bottom: 1px solid #EDE0D4;
          display: flex;
          align-items: flex-start;
          gap: 12px;
          background: #FAF6F2;
        }
        .sc-title {
          font-family: 'Playfair Display', serif;
          font-size: 15px;
          font-weight: 700;
          color: #1C0F05;
        }
        .sc-desc {
          font-size: 12px;
          color: #A89080;
          margin-top: 4px;
          line-height: 1.4;
        }

        .sc-body {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
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
        .field input {
          border: 1.5px solid #EDE0D4;
          border-radius: 10px;
          padding: 10px;
          font-size: 14px;
          background: #FAF6F2;
          outline: none;
          font-family: inherit;
          color: #1C0F05;
        }
        .field input:focus {
          border-color: #F4700A;
        }

        .save-btn {
          background: #F4700A;
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 11px;
          font-size: 13.5px;
          font-weight: 800;
          cursor: pointer;
          font-family: inherit;
          margin-top: 6px;
          transition: background 0.15s;
        }
        .save-btn:hover {
          background: #E05C00;
        }
      `}</style>
    </div>
  )
}
