import { supabaseServer } from '@/lib/supabase/server';

export default async function CallsPage() {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user?.id)
    .single();

  const { data: calls } = business
    ? await supabase
        .from('calls')
        .select('*')
        .eq('business_id', business.id)
        .order('started_at', { ascending: false })
        .limit(50)
    : { data: [] };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">Calls & transcripts</h1>
        <p className="text-slate-600 text-sm">Every call your AI receptionist has handled.</p>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">From</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Summary</th>
              <th className="px-4 py-3 font-medium">Started</th>
              <th className="px-4 py-3 font-medium">Recording</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(!calls || calls.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-600">
                  No calls yet.
                </td>
              </tr>
            )}
            {calls?.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3">{c.from_number ?? '—'}</td>
                <td className="px-4 py-3">
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
                </td>
                <td className="px-4 py-3 max-w-sm truncate">{c.summary ?? '—'}</td>
                <td className="px-4 py-3">{new Date(c.started_at).toLocaleString()}</td>
                <td className="px-4 py-3">
                  {c.recording_url ? (
                    <a href={c.recording_url} className="text-brand-600 font-medium" target="_blank">
                      Listen
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
