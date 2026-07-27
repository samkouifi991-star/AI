import { supabaseServer } from '@/lib/supabase/server';

async function getBusiness(supabase: ReturnType<typeof supabaseServer>) {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('businesses').select('*').eq('owner_user_id', user.id).single();
  return data;
}

export default async function DashboardPage() {
  const supabase = supabaseServer();
  const business = await getBusiness(supabase);

  if (!business) {
    return (
      <div className="card max-w-lg">
        <h2 className="font-display text-xl font-semibold mb-2">Let&apos;s set up your business</h2>
        <p className="text-slate-600 text-sm mb-4">
          Finish onboarding to start seeing calls, leads, and appointments here.
        </p>
        <a href="/onboarding" className="btn-primary inline-block">Start onboarding</a>
      </div>
    );
  }

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [{ count: callsAnswered }, { count: transferred }, { count: leadsCount }, { count: apptsCount }, { count: estimatesCount }] =
    await Promise.all([
      supabase.from('calls').select('*', { count: 'exact', head: true }).eq('business_id', business.id).eq('status', 'completed').gte('started_at', since.toISOString()),
      supabase.from('calls').select('*', { count: 'exact', head: true }).eq('business_id', business.id).eq('status', 'transferred').gte('started_at', since.toISOString()),
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', since.toISOString()),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', since.toISOString()),
      supabase.from('estimates').select('*', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', since.toISOString())
    ]);

  const { data: recentCalls } = await supabase
    .from('calls')
    .select('id, from_number, status, summary, started_at')
    .eq('business_id', business.id)
    .order('started_at', { ascending: false })
    .limit(6);

  const stats = [
    { label: 'Calls answered (30d)', value: callsAnswered ?? 0 },
    { label: 'Transferred to a human', value: transferred ?? 0 },
    { label: 'New leads', value: leadsCount ?? 0 },
    { label: 'Appointments booked', value: apptsCount ?? 0 },
    { label: 'Estimates created', value: estimatesCount ?? 0 }
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">{business.name}</h1>
        <span className={business.is_live ? 'badge-success' : 'badge-warning'}>
          {business.is_live ? 'Live' : 'Not live yet'}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <div className="text-3xl font-display font-semibold">{s.value}</div>
            <div className="text-sm text-slate-600 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="font-display text-lg font-semibold mb-4">Recent calls</h2>
        {(!recentCalls || recentCalls.length === 0) ? (
          <p className="text-sm text-slate-600">No calls yet. Once your number is forwarded, calls will show up here.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentCalls.map((c) => (
              <div key={c.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{c.from_number ?? 'Unknown number'}</div>
                  <div className="text-xs text-slate-600 mt-0.5">{c.summary ?? 'No summary yet'}</div>
                </div>
                <span
                  className={
                    c.status === 'completed'
                      ? 'badge-success'
                      : c.status === 'transferred'
                      ? 'badge-warning'
                      : 'badge-danger'
                  }
                >
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
