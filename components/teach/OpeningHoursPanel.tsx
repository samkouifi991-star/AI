'use client';

import { useEffect, useState } from 'react';
import { DAY_NAMES, groupBusinessHours, type HourRow } from '@/lib/hours';

// Display order Monday -> Sunday (the DB's day_of_week stays 0=Sunday..6=Saturday).
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

type Range = { openTime: string; closeTime: string };
type DayState = { dayOfWeek: number; isClosed: boolean; ranges: Range[] };
type SpecialHour = { date: string; is_closed: boolean; open_time: string | null; close_time: string | null; note: string | null };

function defaultDays(): DayState[] {
  return DAY_NAMES.map((_, i) => ({ dayOfWeek: i, isClosed: i === 0, ranges: [{ openTime: '11:00', closeTime: '21:00' }] }));
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

/**
 * "Opening hours" — the one real editor for business_hours, shared by
 * /restaurant-settings, /teach's Business knowledge tab, and onboarding's
 * Teach-her step (via BusinessKnowledgePanel). Whichever surface it's
 * rendered on, it reads and writes the exact same rows through
 * /api/teach/hours and /api/teach/special-hours — there is no second
 * hours source anywhere in the app.
 */
export default function OpeningHoursPanel({ onChanged }: { onChanged?: () => void } = {}) {
  const [days, setDays] = useState<DayState[]>(defaultDays());
  const [timezone, setTimezone] = useState('America/New_York');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [copyFrom, setCopyFrom] = useState<number | null>(null);
  const [copyTargets, setCopyTargets] = useState<Set<number>>(new Set());

  const [specialHours, setSpecialHours] = useState<SpecialHour[]>([]);
  const [newSpecial, setNewSpecial] = useState({ date: '', isClosed: true, openTime: '11:00', closeTime: '21:00', note: '' });
  const [specialBusy, setSpecialBusy] = useState(false);
  const [specialError, setSpecialError] = useState<string | null>(null);

  async function load() {
    const [hoursRes, specialRes] = await Promise.all([
      fetch('/api/teach/hours').then((r) => r.json()),
      fetch('/api/teach/special-hours').then((r) => r.json())
    ]);
    setTimezone(hoursRes.timezone ?? 'America/New_York');
    if (hoursRes.hours?.length) {
      const grouped = groupBusinessHours(hoursRes.hours as HourRow[]);
      setDays(grouped.map((d) => ({ dayOfWeek: d.dayOfWeek, isClosed: d.isClosed, ranges: d.isClosed ? [{ openTime: '11:00', closeTime: '21:00' }] : d.ranges })));
    }
    setSpecialHours(specialRes.specialHours ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateDay(dayOfWeek: number, patch: Partial<DayState>) {
    setDays((ds) => ds.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d)));
  }

  function addRange(dayOfWeek: number) {
    updateDay(dayOfWeek, { ranges: [...(days.find((d) => d.dayOfWeek === dayOfWeek)?.ranges ?? []), { openTime: '17:00', closeTime: '22:00' }] });
  }

  function removeRange(dayOfWeek: number, index: number) {
    const day = days.find((d) => d.dayOfWeek === dayOfWeek);
    if (!day) return;
    updateDay(dayOfWeek, { ranges: day.ranges.filter((_, i) => i !== index) });
  }

  function updateRange(dayOfWeek: number, index: number, patch: Partial<Range>) {
    const day = days.find((d) => d.dayOfWeek === dayOfWeek);
    if (!day) return;
    updateDay(dayOfWeek, { ranges: day.ranges.map((r, i) => (i === index ? { ...r, ...patch } : r)) });
  }

  function applyCopy() {
    if (copyFrom === null || copyTargets.size === 0) return;
    const source = days.find((d) => d.dayOfWeek === copyFrom);
    if (!source) return;
    setDays((ds) => ds.map((d) => (copyTargets.has(d.dayOfWeek) ? { ...d, isClosed: source.isClosed, ranges: source.ranges.map((r) => ({ ...r })) } : d)));
    setCopyFrom(null);
    setCopyTargets(new Set());
  }

  async function save() {
    setStatus('saving');
    setError(null);
    const res = await fetch('/api/teach/hours', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: days.map((d) => ({ dayOfWeek: d.dayOfWeek, isClosed: d.isClosed, ranges: d.isClosed ? [] : d.ranges })) })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus('failed');
      setError(data.error ?? 'Could not save your hours.');
      return;
    }
    setStatus('saved');
    if (data.knowledgeSynced === false) setError(data.error ?? null);
    onChanged?.();
  }

  async function saveSpecial() {
    if (!newSpecial.date) return;
    setSpecialBusy(true);
    setSpecialError(null);
    const res = await fetch('/api/teach/special-hours', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: newSpecial.date,
        isClosed: newSpecial.isClosed,
        openTime: newSpecial.openTime,
        closeTime: newSpecial.closeTime,
        note: newSpecial.note || null
      })
    });
    const data = await res.json().catch(() => ({}));
    setSpecialBusy(false);
    if (!res.ok) {
      setSpecialError(data.error ?? 'Could not save that date.');
      return;
    }
    setNewSpecial({ date: '', isClosed: true, openTime: '11:00', closeTime: '21:00', note: '' });
    const specialRes = await fetch('/api/teach/special-hours').then((r) => r.json());
    setSpecialHours(specialRes.specialHours ?? []);
    onChanged?.();
  }

  async function deleteSpecial(date: string) {
    await fetch('/api/teach/special-hours', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date }) });
    setSpecialHours((rows) => rows.filter((r) => r.date !== date));
    onChanged?.();
  }

  if (loading) return <div className="text-bp-ink-muted" style={{ fontSize: 13 }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="text-bp-ink-faint" style={{ fontSize: 12 }}>All times shown in {timezone} (your business timezone).</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {DISPLAY_ORDER.map((dow) => {
          const day = days.find((d) => d.dayOfWeek === dow)!;
          return (
            <div key={dow} className="border border-bp-border" style={{ borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 96, fontSize: 13.5, fontWeight: 500 }}>{DAY_NAMES[dow]}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                  <input
                    type="checkbox"
                    checked={!day.isClosed}
                    onChange={(e) => updateDay(dow, { isClosed: !e.target.checked })}
                  />
                  Open
                </label>
                {day.isClosed ? (
                  <span className="text-bp-ink-faint" style={{ fontSize: 13 }}>Closed</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                    {day.ranges.map((r, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="time" className="input" style={{ width: 120 }} value={r.openTime} onChange={(e) => updateRange(dow, i, { openTime: e.target.value })} />
                        <span className="text-bp-ink-faint">–</span>
                        <input type="time" className="input" style={{ width: 120 }} value={r.closeTime} onChange={(e) => updateRange(dow, i, { closeTime: e.target.value })} />
                        {day.ranges.length > 1 && (
                          <button className="text-danger" style={{ fontSize: 12 }} onClick={() => removeRange(dow, i)}>Remove</button>
                        )}
                      </div>
                    ))}
                    <button className="text-bp-accent" style={{ fontSize: 12, textAlign: 'left' }} onClick={() => addRange(dow)}>
                      + Add another time range
                    </button>
                  </div>
                )}
                <button
                  className="btn-secondary text-xs"
                  style={{ marginLeft: 'auto', flexShrink: 0 }}
                  onClick={() => {
                    setCopyFrom(dow);
                    setCopyTargets(new Set());
                  }}
                >
                  Copy to other days
                </button>
              </div>

              {copyFrom === dow && (
                <div className="border-t border-bp-border-faint" style={{ marginTop: 10, paddingTop: 10 }}>
                  <div className="text-bp-ink-muted" style={{ fontSize: 12, marginBottom: 6 }}>Copy {DAY_NAMES[dow]}&apos;s hours to:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
                    {DISPLAY_ORDER.filter((d) => d !== dow).map((d) => (
                      <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5 }}>
                        <input
                          type="checkbox"
                          checked={copyTargets.has(d)}
                          onChange={(e) => {
                            const next = new Set(copyTargets);
                            if (e.target.checked) next.add(d);
                            else next.delete(d);
                            setCopyTargets(next);
                          }}
                        />
                        {DAY_NAMES[d]}
                      </label>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-secondary text-xs" onClick={applyCopy} disabled={copyTargets.size === 0}>Copy</button>
                    <button className="text-xs text-bp-ink-faint" onClick={() => setCopyFrom(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn-primary" onClick={save} disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving…' : 'Save hours'}
        </button>
        {status === 'saved' && !error && <span className="text-success" style={{ fontSize: 12.5 }}>Saved — searchable on the next call.</span>}
        {status === 'saved' && error && <span className="text-warning" style={{ fontSize: 12.5 }}>Saved, but {error}</span>}
        {status === 'failed' && <span className="text-danger" style={{ fontSize: 12.5 }}>Failed to save{error ? `: ${error}` : '.'}</span>}
      </div>

      <div className="border-t border-bp-border-faint" style={{ paddingTop: 16 }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 4 }}>Special hours &amp; temporary closures</h3>
        <p className="text-bp-ink-faint" style={{ fontSize: 12, marginBottom: 10 }}>For holidays or one-day closures — overrides the normal weekly hours for that date only.</p>

        {specialHours.length > 0 && (
          <div className="border border-bp-border" style={{ borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}>
            {specialHours.map((s, i) => (
              <div key={s.date} className={i > 0 ? 'border-t border-bp-border-faint' : ''} style={{ padding: '9px 13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 13 }}>
                  <strong>{new Date(`${s.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
                  {' — '}
                  {s.is_closed ? 'Closed' : `${s.open_time?.slice(0, 5)}–${s.close_time?.slice(0, 5)}`}
                  {s.note && <span className="text-bp-ink-faint"> ({s.note})</span>}
                </div>
                <button className="text-xs text-danger" onClick={() => deleteSpecial(s.date)}>Remove</button>
              </div>
            ))}
          </div>
        )}

        {specialError && <div className="text-sm text-danger bg-red-50 rounded-lg px-3 py-2" style={{ marginBottom: 8 }}>{specialError}</div>}

        <div className="border border-dashed border-bp-border-input" style={{ borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" className="input" style={{ width: 160 }} value={newSpecial.date} onChange={(e) => setNewSpecial((s) => ({ ...s, date: e.target.value }))} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}>
              <input type="checkbox" checked={newSpecial.isClosed} onChange={(e) => setNewSpecial((s) => ({ ...s, isClosed: e.target.checked }))} />
              Closed all day
            </label>
            {!newSpecial.isClosed && (
              <>
                <input type="time" className="input" style={{ width: 120 }} value={newSpecial.openTime} onChange={(e) => setNewSpecial((s) => ({ ...s, openTime: e.target.value }))} />
                <span className="text-bp-ink-faint">–</span>
                <input type="time" className="input" style={{ width: 120 }} value={newSpecial.closeTime} onChange={(e) => setNewSpecial((s) => ({ ...s, closeTime: e.target.value }))} />
              </>
            )}
          </div>
          <input className="input" placeholder="Note (e.g. Closed for Thanksgiving)" value={newSpecial.note} onChange={(e) => setNewSpecial((s) => ({ ...s, note: e.target.value }))} />
          <button className="btn-secondary text-xs" style={{ alignSelf: 'flex-start' }} onClick={saveSpecial} disabled={specialBusy || !newSpecial.date}>
            {specialBusy ? 'Saving…' : '+ Add date'}
          </button>
        </div>
      </div>
    </div>
  );
}
