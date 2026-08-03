'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

type Rules = {
  ring_before_ai_enabled: boolean;
  ring_seconds_before_ai: number;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  transfer_on_customer_request: boolean;
  urgent_transfer_enabled: boolean;
  voicemail_fallback_enabled: boolean;
};

const DEFAULT_RULES: Rules = {
  ring_before_ai_enabled: true,
  ring_seconds_before_ai: 20,
  quiet_hours_enabled: false,
  quiet_hours_start: '20:00',
  quiet_hours_end: '09:00',
  transfer_on_customer_request: true,
  urgent_transfer_enabled: true,
  voicemail_fallback_enabled: true
};

function fmtTime(t: string | null) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? ':' + String(m).padStart(2, '0') : ''}${period}`;
}

function TogglePill({ on, onClick, busy }: { on: boolean; onClick: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      style={{
        fontSize: 11.5,
        fontWeight: 600,
        padding: '3px 9px',
        borderRadius: 20,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        background: on ? 'oklch(0.955 0.035 165)' : 'oklch(0.955 0.004 265)',
        color: on ? 'oklch(0.44 0.11 165)' : 'oklch(0.52 0.01 265)'
      }}
    >
      {busy ? '…' : on ? 'On' : 'Off'}
    </button>
  );
}

function EditableSpan({ value, onSave, type = 'text' }: { value: string; onSave: (v: string) => void; type?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  if (editing) {
    return (
      <input
        autoFocus
        type={type}
        className="font-instrument"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft !== value) onSave(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        style={{ fontWeight: 600, fontSize: 14.5, color: 'oklch(0.56 0.15 265)', border: 0, borderBottom: '1.5px dashed oklch(0.56 0.15 265)', width: type === 'number' ? 60 : 140, background: 'transparent' }}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      style={{ fontWeight: 600, color: 'oklch(0.56 0.15 265)', borderBottom: '1.5px dashed oklch(0.78 0.06 265)', cursor: 'pointer' }}
    >
      {value}
    </span>
  );
}

export default function YourPhoneRules({ aiName }: { aiName: string }) {
  const supabase = supabaseBrowser();
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [escalationNumber, setEscalationNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyField, setBusyField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [routingRes, employeeRow] = await Promise.all([
        fetch('/api/phone/routing').then((r) => r.json()),
        supabase.auth.getUser().then(async ({ data: { user } }) => {
          if (!user) return null;
          const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single();
          if (!business) return null;
          const { data } = await supabase.from('ai_employee_settings').select('escalation_phone_number').eq('business_id', business.id).maybeSingle();
          return data;
        })
      ]);
      if (routingRes.rules) {
        setRules({
          ring_before_ai_enabled: routingRes.rules.ring_before_ai_enabled ?? DEFAULT_RULES.ring_before_ai_enabled,
          ring_seconds_before_ai: routingRes.rules.ring_seconds_before_ai ?? DEFAULT_RULES.ring_seconds_before_ai,
          quiet_hours_enabled: routingRes.rules.quiet_hours_enabled ?? DEFAULT_RULES.quiet_hours_enabled,
          quiet_hours_start: routingRes.rules.quiet_hours_start ?? DEFAULT_RULES.quiet_hours_start,
          quiet_hours_end: routingRes.rules.quiet_hours_end ?? DEFAULT_RULES.quiet_hours_end,
          transfer_on_customer_request: routingRes.rules.transfer_on_customer_request ?? DEFAULT_RULES.transfer_on_customer_request,
          urgent_transfer_enabled: routingRes.rules.urgent_transfer_enabled ?? DEFAULT_RULES.urgent_transfer_enabled,
          voicemail_fallback_enabled: routingRes.rules.voicemail_fallback_enabled ?? DEFAULT_RULES.voicemail_fallback_enabled
        });
      }
      setEscalationNumber(employeeRow?.escalation_phone_number ?? '');
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function patch(table: 'routing' | 'employee', field: string, value: unknown, localUpdate: () => void) {
    setBusyField(field);
    setError(null);
    localUpdate();
    const res = await fetch('/api/phone/routing/patch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, field, value })
    });
    setBusyField(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Could not save that change.');
    }
  }

  if (loading) return <div className="card">Loading…</div>;

  const rows: { key: string; sentence: React.ReactNode; on: boolean; onToggle: () => void }[] = [
    {
      key: 'ring',
      sentence: (
        <>
          Ring my phone for{' '}
          <EditableSpan
            type="number"
            value={String(rules.ring_seconds_before_ai)}
            onSave={(v) => patch('routing', 'ring_seconds_before_ai', Number(v), () => setRules((r) => ({ ...r, ring_seconds_before_ai: Number(v) })))}
          />{' '}
          seconds first, then {aiName} picks it up.
        </>
      ),
      on: rules.ring_before_ai_enabled,
      onToggle: () => patch('routing', 'ring_before_ai_enabled', !rules.ring_before_ai_enabled, () => setRules((r) => ({ ...r, ring_before_ai_enabled: !r.ring_before_ai_enabled })))
    },
    {
      key: 'quiet',
      sentence: (
        <>
          {aiName} answers everything{' '}
          <EditableSpan
            type="time"
            value={rules.quiet_hours_start ?? '20:00'}
            onSave={(v) => patch('routing', 'quiet_hours_start', v, () => setRules((r) => ({ ...r, quiet_hours_start: v })))}
          />{' '}
          –{' '}
          <EditableSpan
            type="time"
            value={rules.quiet_hours_end ?? '09:00'}
            onSave={(v) => patch('routing', 'quiet_hours_end', v, () => setRules((r) => ({ ...r, quiet_hours_end: v })))}
          />{' '}
          (that&apos;s {fmtTime(rules.quiet_hours_start)}–{fmtTime(rules.quiet_hours_end)}), without ringing me.
        </>
      ),
      on: rules.quiet_hours_enabled,
      onToggle: () => patch('routing', 'quiet_hours_enabled', !rules.quiet_hours_enabled, () => setRules((r) => ({ ...r, quiet_hours_enabled: !r.quiet_hours_enabled })))
    },
    {
      key: 'request',
      sentence: (
        <>
          If a caller asks for a person, transfer to{' '}
          <EditableSpan
            type="tel"
            value={escalationNumber || 'not set'}
            onSave={(v) => patch('employee', 'escalation_phone_number', v, () => setEscalationNumber(v))}
          />
          .
        </>
      ),
      on: rules.transfer_on_customer_request,
      onToggle: () => patch('routing', 'transfer_on_customer_request', !rules.transfer_on_customer_request, () => setRules((r) => ({ ...r, transfer_on_customer_request: !r.transfer_on_customer_request })))
    },
    {
      key: 'urgent',
      sentence: (
        <>
          If it sounds urgent, transfer to{' '}
          <EditableSpan
            type="tel"
            value={escalationNumber || 'not set'}
            onSave={(v) => patch('employee', 'escalation_phone_number', v, () => setEscalationNumber(v))}
          />{' '}
          immediately.
        </>
      ),
      on: rules.urgent_transfer_enabled,
      onToggle: () => patch('routing', 'urgent_transfer_enabled', !rules.urgent_transfer_enabled, () => setRules((r) => ({ ...r, urgent_transfer_enabled: !r.urgent_transfer_enabled })))
    },
    {
      key: 'voicemail',
      sentence: <>If nobody picks up, take a message and text it to me.</>,
      on: rules.voicemail_fallback_enabled,
      onToggle: () => patch('routing', 'voicemail_fallback_enabled', !rules.voicemail_fallback_enabled, () => setRules((r) => ({ ...r, voicemail_fallback_enabled: !r.voicemail_fallback_enabled })))
    }
  ];

  return (
    <div className="bg-bp-surface border border-bp-border" style={{ borderRadius: 16 }}>
      <div className="border-b border-bp-border-soft" style={{ padding: '18px 22px 14px' }}>
        <h2 className="font-grotesk" style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>When someone calls</h2>
        <p className="text-bp-ink-muted" style={{ fontSize: 12.5, marginTop: 2 }}>These are sentences, not settings. Change any underlined part.</p>
      </div>
      {error && <div className="text-danger" style={{ padding: '10px 22px', fontSize: 12.5 }}>{error}</div>}
      {rows.map((r, i) => (
        <div key={r.key} className={i > 0 ? 'border-t border-bp-border-faint' : ''} style={{ padding: '17px 22px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="text-bp-ink-body" style={{ fontSize: 14.5, lineHeight: 1.6, flex: 1 }}>{r.sentence}</div>
          <TogglePill on={r.on} busy={busyField !== null} onClick={r.onToggle} />
        </div>
      ))}
    </div>
  );
}
