'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import OpeningHoursPanel from '@/components/teach/OpeningHoursPanel';

type Settings = {
  pickup_enabled: boolean;
  pickup_prep_minutes: number;
  pay_at_pickup: boolean;
  delivery_enabled: boolean;
  delivery_radius_miles: number;
  delivery_fee: number;
  delivery_min_order: number;
  delivery_prep_minutes: number;
  pay_at_delivery: boolean;
  order_cutoff_time: string | null;
  staff_approval_required: boolean;
  tax_rate: number;
  tip_presets: string;
  discount_code: string | null;
  discount_percent: number | null;
  payment_hold_minutes: number;
};

const DEFAULTS: Settings = {
  pickup_enabled: true,
  pickup_prep_minutes: 20,
  pay_at_pickup: true,
  delivery_enabled: false,
  delivery_radius_miles: 5,
  delivery_fee: 3.99,
  delivery_min_order: 15,
  delivery_prep_minutes: 25,
  pay_at_delivery: false,
  order_cutoff_time: null,
  staff_approval_required: false,
  tax_rate: 0,
  tip_presets: '15,18,20',
  discount_code: null,
  discount_percent: null,
  payment_hold_minutes: 30
};

export default function RestaurantSettingsPage() {
  const supabase = supabaseBrowser();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single();
      if (!business) return;
      setBusinessId(business.id);

      const { data: existing } = await supabase.from('restaurant_settings').select('*').eq('business_id', business.id).single();
      if (existing) setSettings(existing as Settings);
    }
    load();
  }, [supabase]);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
    setSaveStatus('idle');
  }

  async function handleSave() {
    if (!businessId) return;
    setSaveStatus('saving');
    setSaveError(null);
    const { error } = await supabase.from('restaurant_settings').upsert(
      { business_id: businessId, ...settings, updated_at: new Date().toISOString() },
      { onConflict: 'business_id' }
    );
    if (error) {
      setSaveStatus('failed');
      setSaveError(error.message);
    } else {
      setSaveStatus('saved');
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">Restaurant settings</h1>
        <p className="text-slate-600 text-sm">Pickup, delivery, taxes, tips, and discounts your AI applies to every order.</p>
      </div>

      {saveStatus === 'saved' && <div className="text-sm text-success bg-green-50 rounded-lg px-3 py-2">Saved — takes effect on the next call.</div>}
      {saveStatus === 'failed' && <div className="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">Failed to save{saveError ? `: ${saveError}` : '.'}</div>}

      <section className="card space-y-3">
        <h2 className="font-display text-lg font-semibold">Pickup</h2>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={settings.pickup_enabled} onChange={(e) => update('pickup_enabled', e.target.checked)} /> Offer pickup
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Prep time (minutes)</label>
            <input className="input" type="number" value={settings.pickup_prep_minutes} onChange={(e) => update('pickup_prep_minutes', Number(e.target.value))} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 mt-6">
            <input type="checkbox" checked={settings.pay_at_pickup} onChange={(e) => update('pay_at_pickup', e.target.checked)} /> Allow pay at pickup
          </label>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-display text-lg font-semibold">Delivery</h2>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={settings.delivery_enabled} onChange={(e) => update('delivery_enabled', e.target.checked)} /> Offer delivery
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Delivery radius (miles)</label>
            <input className="input" type="number" step="0.1" value={settings.delivery_radius_miles} onChange={(e) => update('delivery_radius_miles', Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Delivery fee ($)</label>
            <input className="input" type="number" step="0.01" value={settings.delivery_fee} onChange={(e) => update('delivery_fee', Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Minimum order ($)</label>
            <input className="input" type="number" step="0.01" value={settings.delivery_min_order} onChange={(e) => update('delivery_min_order', Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Prep time (minutes)</label>
            <input className="input" type="number" value={settings.delivery_prep_minutes} onChange={(e) => update('delivery_prep_minutes', Number(e.target.value))} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={settings.pay_at_delivery} onChange={(e) => update('pay_at_delivery', e.target.checked)} /> Allow pay at delivery
        </label>
      </section>

      <section className="card space-y-3">
        <h2 className="font-display text-lg font-semibold">Opening hours</h2>
        <p className="text-sm text-slate-600">
          These are the hours Ava uses on every call — the same hours shown in Teach Ava and onboarding. Changing them here updates Ava immediately.
        </p>
        <OpeningHoursPanel />
      </section>

      <section className="card space-y-3">
        <h2 className="font-display text-lg font-semibold">Taxes, tips, and discounts</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Tax rate (%)</label>
            <input className="input" type="number" step="0.01" value={settings.tax_rate} onChange={(e) => update('tax_rate', Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Suggested tip percentages</label>
            <input className="input" value={settings.tip_presets} onChange={(e) => update('tip_presets', e.target.value)} placeholder="15,18,20" />
          </div>
          <div>
            <label className="label">Discount code</label>
            <input className="input" value={settings.discount_code ?? ''} onChange={(e) => update('discount_code', e.target.value || null)} placeholder="e.g. WELCOME10" />
          </div>
          <div>
            <label className="label">Discount (%)</label>
            <input className="input" type="number" step="0.01" value={settings.discount_percent ?? ''} onChange={(e) => update('discount_percent', e.target.value ? Number(e.target.value) : null)} />
          </div>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-display text-lg font-semibold">Order handling</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Order cutoff time</label>
            <input className="input" type="time" value={settings.order_cutoff_time ?? ''} onChange={(e) => update('order_cutoff_time', e.target.value || null)} />
          </div>
          <div>
            <label className="label">Payment hold duration (minutes)</label>
            <input className="input" type="number" value={settings.payment_hold_minutes} onChange={(e) => update('payment_hold_minutes', Number(e.target.value))} />
            <p className="text-xs text-slate-500 mt-1">How long an unpaid order holds before being released.</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={settings.staff_approval_required} onChange={(e) => update('staff_approval_required', e.target.checked)} />
          Staff must approve an order before payment is requested
        </label>
      </section>

      <button className="btn-primary" onClick={handleSave} disabled={saveStatus === 'saving' || !businessId}>
        {saveStatus === 'saving' ? 'Saving…' : 'Save settings'}
      </button>
    </div>
  );
}
