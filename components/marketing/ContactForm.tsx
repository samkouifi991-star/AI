'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { submitSupportRequest, type SubmitSupportState } from '@/app/actions/support'

const initialState: SubmitSupportState = { ok: false, message: '' }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Sending…' : 'Send Message'}
    </button>
  )
}

export function ContactForm() {
  const [state, formAction] = useFormState(submitSupportRequest, initialState)

  return (
    <form action={formAction} className="card space-y-4">
      {state.message && (
        <p className={state.ok ? 'rounded-xl bg-success-50 p-3 text-sm text-success-600' : 'rounded-xl bg-danger-50 p-3 text-sm text-danger-600'}>
          {state.message}
        </p>
      )}
      <div>
        <label className="field-label" htmlFor="name">Name</label>
        <input id="name" name="name" required className="field-input" />
      </div>
      <div>
        <label className="field-label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required className="field-input" />
      </div>
      <div>
        <label className="field-label" htmlFor="subject">Subject</label>
        <input id="subject" name="subject" required className="field-input" />
      </div>
      <div>
        <label className="field-label" htmlFor="message">Message</label>
        <textarea id="message" name="message" required rows={5} className="field-input" />
      </div>
      <SubmitButton />
    </form>
  )
}
