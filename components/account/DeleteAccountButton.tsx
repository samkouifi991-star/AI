'use client'

import { deleteAccount } from '@/app/actions/account'

export function DeleteAccountButton() {
  return (
    <form
      action={deleteAccount}
      onSubmit={(e) => {
        if (!window.confirm('Delete your account and all application data? This cannot be undone.')) {
          e.preventDefault()
        }
      }}
    >
      <button type="submit" className="btn-outline border-danger-500 text-danger-600 hover:bg-danger-50">
        Delete My Account
      </button>
    </form>
  )
}
