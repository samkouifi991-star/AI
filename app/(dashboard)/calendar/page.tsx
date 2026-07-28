import { supabaseServer } from '@/lib/supabase/server';

export default async function CalendarPage({
  searchParams
}: {
  searchParams: { connected?: string; error?: string };
}) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user?.id)
    .single();

  const { data: connection } = business
    ? await supabase.from('calendar_connections').select('*').eq('business_id', business.id).single()
    : { data: null };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">Calendar</h1>
        <p className="text-slate-600 text-sm">
          Connect Google Calendar so your AI can check availability and book appointments in real time.
        </p>
      </div>

      {searchParams.connected && (
        <div className="text-sm text-success bg-green-50 rounded-lg px-3 py-2">Google Calendar connected.</div>
      )}
      {searchParams.error === 'google_not_configured' && (
        <div className="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">
          Google Calendar isn&apos;t set up on this deployment yet — GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or
          GOOGLE_REDIRECT_URI is missing from the server environment. Contact support or check your deployment settings.
        </div>
      )}
      {searchParams.error && searchParams.error !== 'google_not_configured' && (
        <div className="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">Something went wrong connecting your calendar.</div>
      )}

      <div className="card">
        {connection ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">Google Calendar</div>
              <div className="text-xs text-slate-600 mt-0.5">
                Connected {new Date(connection.connected_at).toLocaleDateString()}
              </div>
            </div>
            <span className="badge-success">Connected</span>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">Google Calendar</div>
              <div className="text-xs text-slate-600 mt-0.5">Not connected yet</div>
            </div>
            <a href="/api/calendar/google" className="btn-primary">Connect</a>
          </div>
        )}
      </div>
    </div>
  );
}
