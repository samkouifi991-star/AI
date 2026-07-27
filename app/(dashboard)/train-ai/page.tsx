'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

type Faq = { id?: string; question: string; answer: string };
type Service = { id?: string; name: string; base_price: string; unit: string };
type PricingRule = {
  id?: string;
  name: string;
  rule_type: 'per_unit' | 'flat' | 'tiered' | 'multiplier';
  unit_label: string;
  base_rate: string;
};

export default function TrainAiPage() {
  const supabase = supabaseBrowser();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([{ name: '', base_price: '', unit: '' }]);
  const [faqs, setFaqs] = useState<Faq[]>([{ question: '', answer: '' }]);
  const [rules, setRules] = useState<PricingRule[]>([
    { name: '', rule_type: 'per_unit', unit_label: '', base_rate: '' }
  ]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: business } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_user_id', user.id)
        .single();
      if (business) setBusinessId(business.id);
    }
    load();
  }, [supabase]);

  async function handleSave() {
    if (!businessId) return;
    setSaving(true);

    const validServices = services.filter((s) => s.name.trim());
    const validFaqs = faqs.filter((f) => f.question.trim() && f.answer.trim());
    const validRules = rules.filter((r) => r.name.trim() && r.base_rate);

    if (validServices.length) {
      await supabase
        .from('services')
        .insert(validServices.map((s) => ({ business_id: businessId, name: s.name, base_price: Number(s.base_price) || null, unit: s.unit })));
    }
    if (validFaqs.length) {
      await supabase.from('faqs').insert(validFaqs.map((f) => ({ business_id: businessId, ...f })));
    }
    if (validRules.length) {
      await supabase.from('pricing_rules').insert(
        validRules.map((r) => ({
          business_id: businessId,
          name: r.name,
          rule_type: r.rule_type,
          unit_label: r.unit_label,
          base_rate: Number(r.base_rate)
        }))
      );
    }

    await supabase.from('businesses').update({ onboarding_step: 'knowledge_base' }).eq('id', businessId);

    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">Train My AI</h1>
        <p className="text-slate-600 text-sm">
          This is what your AI receptionist knows: your services, common questions, and how you price jobs.
        </p>
      </div>

      {saved && (
        <div className="text-sm text-success bg-green-50 rounded-lg px-3 py-2">
          Saved. You can add more anytime, or continue to Knowledge Base to upload documents.
        </div>
      )}

      {/* Services */}
      <section className="card">
        <h2 className="font-display text-lg font-semibold mb-3">Services</h2>
        <div className="space-y-3">
          {services.map((s, i) => (
            <div key={i} className="grid grid-cols-3 gap-3">
              <input
                className="input"
                placeholder="Service name (e.g. Vinyl fence installation)"
                value={s.name}
                onChange={(e) => {
                  const next = [...services];
                  next[i].name = e.target.value;
                  setServices(next);
                }}
              />
              <input
                className="input"
                placeholder="Base price"
                value={s.base_price}
                onChange={(e) => {
                  const next = [...services];
                  next[i].base_price = e.target.value;
                  setServices(next);
                }}
              />
              <input
                className="input"
                placeholder="Unit (per foot, flat, per hour)"
                value={s.unit}
                onChange={(e) => {
                  const next = [...services];
                  next[i].unit = e.target.value;
                  setServices(next);
                }}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary mt-3 text-sm"
          onClick={() => setServices([...services, { name: '', base_price: '', unit: '' }])}
        >
          + Add another service
        </button>
      </section>

      {/* FAQs */}
      <section className="card">
        <h2 className="font-display text-lg font-semibold mb-3">Frequently asked questions</h2>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="space-y-2">
              <input
                className="input"
                placeholder="Question customers ask (e.g. Do you offer financing?)"
                value={f.question}
                onChange={(e) => {
                  const next = [...faqs];
                  next[i].question = e.target.value;
                  setFaqs(next);
                }}
              />
              <textarea
                className="input"
                placeholder="How your AI should answer"
                rows={2}
                value={f.answer}
                onChange={(e) => {
                  const next = [...faqs];
                  next[i].answer = e.target.value;
                  setFaqs(next);
                }}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary mt-3 text-sm"
          onClick={() => setFaqs([...faqs, { question: '', answer: '' }])}
        >
          + Add another question
        </button>
      </section>

      {/* Pricing rules */}
      <section className="card">
        <h2 className="font-display text-lg font-semibold mb-1">Estimate pricing rules</h2>
        <p className="text-sm text-slate-600 mb-3">
          Used when a customer asks for a price on the phone. Add modifiers (gates, removal, etc.) later
          in the pricing rule detail view.
        </p>
        <div className="space-y-3">
          {rules.map((r, i) => (
            <div key={i} className="grid grid-cols-4 gap-3">
              <input
                className="input"
                placeholder="Rule name (e.g. 6ft vinyl fence)"
                value={r.name}
                onChange={(e) => {
                  const next = [...rules];
                  next[i].name = e.target.value;
                  setRules(next);
                }}
              />
              <select
                className="input"
                value={r.rule_type}
                onChange={(e) => {
                  const next = [...rules];
                  next[i].rule_type = e.target.value as PricingRule['rule_type'];
                  setRules(next);
                }}
              >
                <option value="per_unit">Per unit</option>
                <option value="flat">Flat rate</option>
                <option value="tiered">Tiered</option>
                <option value="multiplier">Multiplier</option>
              </select>
              <input
                className="input"
                placeholder="Unit label (linear foot)"
                value={r.unit_label}
                onChange={(e) => {
                  const next = [...rules];
                  next[i].unit_label = e.target.value;
                  setRules(next);
                }}
              />
              <input
                className="input"
                placeholder="Rate ($)"
                value={r.base_rate}
                onChange={(e) => {
                  const next = [...rules];
                  next[i].base_rate = e.target.value;
                  setRules(next);
                }}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary mt-3 text-sm"
          onClick={() => setRules([...rules, { name: '', rule_type: 'per_unit', unit_label: '', base_rate: '' }])}
        >
          + Add another pricing rule
        </button>
      </section>

      <div className="flex gap-3">
        <button className="btn-primary" onClick={handleSave} disabled={saving || !businessId}>
          {saving ? 'Saving…' : 'Save and continue'}
        </button>
        <a href="/knowledge-base" className="btn-secondary">Skip to Knowledge Base</a>
      </div>
    </div>
  );
}
