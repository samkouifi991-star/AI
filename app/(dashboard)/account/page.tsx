'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import SignOutButton from '../SignOutButton';

export default function AccountPage() {
  const supabase = supabaseBrowser();

  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [loading, setLoading] = useState(true);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordResult, setPasswordResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [needsDisposition, setNeedsDisposition] = useState(false);
  const [activeNumberCount, setActiveNumberCount] = useState(0);
  const [numberDisposition, setNumberDisposition] = useState<'keep' | 'release' | 'release_and_close' | ''>('');

  useEffect(() => {
    async function load() {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? '');

      const { data: business } = await supabase.from('businesses').select('name').eq('owner_user_id', user.id).single();
      setBusinessName(business?.name ?? '');
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function changePassword() {
    setPasswordResult(null);
    if (newPassword.length < 8) {
      setPasswordResult({ ok: false, message: 'Password must be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordResult({ ok: false, message: 'Passwords do not match.' });
      return;
    }

    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);

    if (error) {
      setPasswordResult({ ok: false, message: error.message });
    } else {
      setPasswordResult({ ok: true, message: 'Password updated.' });
      setNewPassword('');
      setConfirmPassword('');
    }
  }

  async function deleteAccount() {
    if (!deletePassword) {
      setDeleteError('Enter your password to confirm.');
      return;
    }
    if (needsDisposition && !numberDisposition) {
      setDeleteError('Choose what happens to your phone number before continuing.');
      return;
    }
    setDeleting(true);
    setDeleteError(null);

    const res = await fetch('/api/account/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: deletePassword, numberDisposition: numberDisposition || undefined })
    });
    const data = await res.json();
    setDeleting(false);

    if (!res.ok) {
      // The server has a real, paid phone number on this account and is
      // refusing to guess what should happen to it — surface the choice
      // instead of retrying with a made-up default.
      if (data.error === 'number_disposition_required') {
        setNeedsDisposition(true);
        setActiveNumberCount(data.activeNumberCount ?? 1);
        setDeleteError('This account has an active phone number. Choose what should happen to it, then confirm again.');
        return;
      }
      setDeleteError(data.error ?? 'Could not delete your account.');
      return;
    }

    await supabase.auth.signOut();
    window.location.assign('/?accountDeleted=1');
  }

  if (loading) return <div className="card max-w-2xl">Loading…</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">Account Settings</h1>
        <p className="text-slate-600 text-sm">Your login, business, and account.</p>
      </div>

      <section className="card space-y-3">
        <div>
          <span className="label">Account email</span>
          <div className="text-sm font-medium">{email}</div>
        </div>
        <div>
          <span className="label">Business name</span>
          <div className="text-sm font-medium">{businessName || 'Not set'}</div>
        </div>
        <div>
          <span className="label">Role</span>
          <div className="text-sm font-medium">Owner</div>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-display text-lg font-semibold">Change password</h2>
        {passwordResult && (
          <div className={passwordResult.ok ? 'text-sm text-success bg-green-50 rounded-lg px-3 py-2' : 'text-sm text-danger bg-red-50 rounded-lg px-3 py-2'}>
            {passwordResult.message}
          </div>
        )}
        <div>
          <label className="label">New password</label>
          <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <input className="input" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
        </div>
        <button className="btn-primary" onClick={changePassword} disabled={passwordSaving}>
          {passwordSaving ? 'Saving…' : 'Update password'}
        </button>
      </section>

      <section className="card">
        <SignOutButton className="btn-secondary" />
      </section>

      <section className="card border-2 border-red-200 space-y-3">
        <h2 className="font-display text-lg font-semibold text-danger">Danger zone</h2>
        <p className="text-sm text-slate-600">
          Deleting your account permanently removes your business, menu, knowledge base, call history, orders, and
          everything else tied to it. This cannot be undone.
        </p>

        {!showDeleteConfirm ? (
          <button className="rounded-lg bg-danger text-white text-sm font-medium px-4 py-2 hover:bg-red-700" onClick={() => setShowDeleteConfirm(true)}>
            Delete my account
          </button>
        ) : (
          <div className="space-y-3 border-t border-red-100 pt-3">
            {deleteError && <div className="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">{deleteError}</div>}

            {needsDisposition && (
              <div className="space-y-2 bg-amber-50 rounded-lg px-3 py-3">
                <p className="text-sm font-medium">
                  You have {activeNumberCount} active phone number{activeNumberCount === 1 ? '' : 's'}. What should happen to{' '}
                  {activeNumberCount === 1 ? 'it' : 'them'}?
                </p>
                {[
                  ['keep', 'Keep the number active — just disconnect it from Business Pilot AI. Twilio will keep billing you for it directly.'],
                  ['release', 'Release the number back to Twilio. This stops the monthly rental charge and the number becomes available to others.'],
                  ['release_and_close', 'Release the number and close its Twilio subaccount entirely. This stops all further charges for it.']
                ].map(([value, label]) => (
                  <label key={value} className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="numberDisposition"
                      className="mt-1"
                      checked={numberDisposition === value}
                      onChange={() => setNumberDisposition(value as typeof numberDisposition)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            )}

            <div>
              <label className="label">Enter your password to confirm</label>
              <input
                className="input"
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="flex gap-3">
              <button
                className="rounded-lg bg-danger text-white text-sm font-medium px-4 py-2 hover:bg-red-700 disabled:opacity-50"
                onClick={deleteAccount}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Permanently delete my account'}
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeletePassword('');
                  setDeleteError(null);
                }}
                disabled={deleting}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
