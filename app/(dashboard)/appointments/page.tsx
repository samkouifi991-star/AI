import { supabaseServer } from '@/lib/supabase/server';

export default async function AppointmentsPage() {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user?.id)
    .single();

  const { data: appointments } = business
    ? await supabase
        .from('appointments')
        .select('*, leads(name, phone, address)')
        .eq('business_id', business.id)
        .eq('is_practice', false)
        .order('scheduled_at', { ascending: true })
        .limit(50)
    : { data: [] };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">Appointments</h1>
        <p className="text-slate-600 text-sm">Estimate visits and service calls booked by your AI.</p>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Confirmation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(!appointments || appointments.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-600">
                  No appointments yet.
                </td>
              </tr>
            )}
            {appointments?.map((a: any) => (
              <tr key={a.id}>
                <td className="px-4 py-3 font-medium">{a.leads?.name ?? '—'}</td>
                <td className="px-4 py-3">{a.appointment_type}</td>
                <td className="px-4 py-3">{new Date(a.scheduled_at).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={a.status === 'completed' ? 'badge-success' : 'badge-warning'}>{a.status}</span>
                </td>
                <td className="px-4 py-3">{a.confirmation_sent ? 'Sent' : 'Pending'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
