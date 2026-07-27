import { supabaseServer } from '@/lib/supabase/server';

export default async function LeadsPage() {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user?.id)
    .single();

  const { data: leads } = business
    ? await supabase
        .from('leads')
        .select('*')
        .eq('business_id', business.id)
        .eq('is_practice', false)
        .order('created_at', { ascending: false })
        .limit(50)
    : { data: [] };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">Leads</h1>
        <p className="text-slate-600 text-sm">Everyone who called and left their info.</p>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Received</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(!leads || leads.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-600">
                  No leads yet.
                </td>
              </tr>
            )}
            {leads?.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-3 font-medium">{l.name ?? '—'}</td>
                <td className="px-4 py-3">{l.phone ?? '—'}</td>
                <td className="px-4 py-3">{l.email ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className="badge-warning">{l.status}</span>
                </td>
                <td className="px-4 py-3">{new Date(l.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
