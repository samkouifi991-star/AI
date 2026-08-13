import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { updateProfile } from '@/app/actions/account'
import { ChangePasswordForm } from '@/components/account/ChangePasswordForm'
import { DeleteAccountButton } from '@/components/account/DeleteAccountButton'

export default async function AccountPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in?next=/account')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <h1 className="text-2xl font-bold">Account Settings</h1>

      <div className="card">
        <h2 className="font-heading font-semibold">Profile</h2>
        <form action={updateProfile} className="mt-4 space-y-4">
          <div>
            <label className="field-label" htmlFor="fullName">Full name</label>
            <input id="fullName" name="fullName" defaultValue={profile?.full_name ?? ''} className="field-input" />
          </div>
          <div>
            <label className="field-label">Email</label>
            <input value={user.email ?? ''} disabled className="field-input bg-ink-50 text-ink-500" />
          </div>
          <button type="submit" className="btn-primary">Save Changes</button>
        </form>
      </div>

      <div className="card">
        <h2 className="font-heading font-semibold">Password</h2>
        <div className="mt-4">
          <ChangePasswordForm />
        </div>
      </div>

      <div className="card border-danger-100">
        <h2 className="font-heading font-semibold text-danger-600">Danger Zone</h2>
        <p className="mt-2 text-sm text-ink-600">Permanently delete your account and every application, document, and answer associated with it.</p>
        <div className="mt-4">
          <DeleteAccountButton />
        </div>
      </div>
    </div>
  )
}
