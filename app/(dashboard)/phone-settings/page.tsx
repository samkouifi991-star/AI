import { supabaseServer } from '@/lib/supabase/server';

export default async function PhoneSettingsPage() {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_user_id', user?.id)
    .single();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">Phone settings</h1>
        <p className="text-slate-600 text-sm">Connect your business line to your AI receptionist.</p>
      </div>

      <div className="card space-y-4">
        <div>
          <span className="label">Your AI receptionist number</span>
          <div className="text-lg font-display font-semibold">
            {business?.ai_phone_number ?? 'Not yet provisioned'}
          </div>
          <p className="text-xs text-slate-600 mt-1">
            This number is created automatically when your account goes live. Provisioning happens via the
            Twilio API and your chosen voice AI provider (Vapi/Retell/Bland).
          </p>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <span className="label">Forwarding instructions</span>
          <ol className="list-decimal list-inside text-sm text-slate-600 space-y-1">
            <li>Open your phone carrier&apos;s call forwarding settings for {business?.phone_number ?? 'your business number'}.</li>
            <li>Set conditional forwarding (busy, no answer, or always) to your AI receptionist number above.</li>
            <li>Make a test call to confirm the AI answers correctly.</li>
          </ol>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <span className="label">Missed call fallback</span>
          <p className="text-sm text-slate-600">
            If the AI can&apos;t handle a call, it transfers to your own cell or desk phone — set that number
            in Business Settings.
          </p>
        </div>
      </div>
    </div>
  );
}
