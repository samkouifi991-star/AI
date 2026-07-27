import { supabaseServer } from '@/lib/supabase/server';
import { releaseExpiredHolds } from '@/lib/orders';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_confirmation: 'Pending Confirmation',
  pending_payment: 'Pending Payment',
  paid: 'Paid',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready for Pickup',
  out_for_delivery: 'Out for Delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded'
};

export default async function OrdersPage() {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user?.id).single();

  if (business) {
    // Lazily release any orders whose payment hold expired since the last
    // page load — see lib/orders.ts releaseExpiredHolds() for why this
    // isn't a cron job.
    await releaseExpiredHolds(business.id);
  }

  const { data: orders } = business
    ? await supabase
        .from('orders')
        .select('*, order_items(name_snapshot, quantity)')
        .eq('business_id', business.id)
        .eq('is_practice', false)
        .order('created_at', { ascending: false })
        .limit(50)
    : { data: [] };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold mb-1">Orders</h1>
        <p className="text-slate-600 text-sm">Every order your AI has taken, from draft through completion.</p>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Items</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Placed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(!orders || orders.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  No orders yet.
                </td>
              </tr>
            )}
            {orders?.map((o: any) => (
              <tr key={o.id}>
                <td className="px-4 py-3">{o.customer_name ?? '—'}</td>
                <td className="px-4 py-3 max-w-xs truncate">
                  {o.order_items?.map((i: any) => `${i.quantity} ${i.name_snapshot}`).join(', ') || '—'}
                </td>
                <td className="px-4 py-3 capitalize">{o.order_type}</td>
                <td className="px-4 py-3">${Number(o.total).toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      o.status === 'paid' || o.status === 'completed'
                        ? 'badge-success'
                        : o.status === 'cancelled' || o.status === 'refunded'
                        ? 'badge-danger'
                        : 'badge-warning'
                    }
                  >
                    {STATUS_LABELS[o.status] ?? o.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{new Date(o.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
