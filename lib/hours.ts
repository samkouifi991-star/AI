// Shared business-hours helpers — the single place that understands the
// business_hours / special_hours schema, used by the knowledge-chunk sync,
// the check_business_hours tool, and (via the API routes) every UI that
// edits hours. Nothing here is a second source of truth: it only reads
// and formats what's actually stored in those two tables.

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type HourRow = { day_of_week: number; open_time: string | null; close_time: string | null; is_closed: boolean };
export type HourRange = { openTime: string; closeTime: string };
export type DayHours = { dayOfWeek: number; isClosed: boolean; ranges: HourRange[] };
export type SpecialHourRow = { date: string; is_closed: boolean; open_time: string | null; close_time: string | null; note: string | null };

export function formatTime12h(time: string | null): string {
  if (!time) return '';
  const [hStr, mStr] = time.split(':');
  let h = Number(hStr);
  const m = Number(mStr ?? 0);
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return m === 0 ? `${h}:00 ${period}` : `${h}:${String(m).padStart(2, '0')} ${period}`;
}

/** Groups raw business_hours rows (which may hold multiple ranges per
 * day_of_week — nothing constrains one row per day) into one entry per
 * day with all of its ranges. */
export function groupBusinessHours(rows: HourRow[]): DayHours[] {
  const byDay = new Map<number, HourRow[]>();
  for (const r of rows) {
    byDay.set(r.day_of_week, [...(byDay.get(r.day_of_week) ?? []), r]);
  }
  const result: DayHours[] = [];
  for (let d = 0; d < 7; d++) {
    const dayRows = byDay.get(d) ?? [];
    const openRows = dayRows.filter((r) => !r.is_closed && r.open_time && r.close_time);
    result.push({
      dayOfWeek: d,
      isClosed: openRows.length === 0,
      ranges: openRows.map((r) => ({ openTime: r.open_time!.slice(0, 5), closeTime: r.close_time!.slice(0, 5) })).sort((a, b) => a.openTime.localeCompare(b.openTime))
    });
  }
  return result;
}

export function formatHoursText(days: DayHours[]): string {
  return days
    .map((d) => {
      if (d.isClosed) return `${DAY_NAMES[d.dayOfWeek]}: closed`;
      return `${DAY_NAMES[d.dayOfWeek]}: ${d.ranges.map((r) => `${formatTime12h(r.openTime)}–${formatTime12h(r.closeTime)}`).join(', ')}`;
    })
    .join('\n');
}

export function formatSpecialHoursText(rows: SpecialHourRow[]): string {
  if (rows.length === 0) return '';
  return rows
    .map((r) => {
      const dateLabel = new Date(`${r.date}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const hoursLabel = r.is_closed ? 'closed' : `${formatTime12h(r.open_time)}–${formatTime12h(r.close_time)}`;
      return `${dateLabel}: ${hoursLabel}${r.note ? ` (${r.note})` : ''}`;
    })
    .join('\n');
}

/**
 * Real, timezone-aware "is the business open right now" computation —
 * used by the check_business_hours tool so Ava answers "are you open
 * right now" from actual date math against the saved hours, not from
 * inference over static knowledge-base text (which can't know what time
 * it is "right now" during any given call).
 */
export function computeOpenStatus(
  now: Date,
  timezone: string,
  days: DayHours[],
  specialHours: SpecialHourRow[]
): { isOpenNow: boolean; dayLabel: string; todayHoursLabel: string; note: string | null } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now);
  const weekdayName = parts.find((p) => p.type === 'weekday')?.value ?? 'Sunday';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const nowMinutes = hour * 60 + minute;
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now); // YYYY-MM-DD

  const dayOfWeek = DAY_NAMES.indexOf(weekdayName);
  const special = specialHours.find((s) => s.date === todayIso);

  if (special) {
    if (special.is_closed || !special.open_time || !special.close_time) {
      return { isOpenNow: false, dayLabel: weekdayName, todayHoursLabel: 'closed', note: special.note ?? 'Closed today for a special reason.' };
    }
    const [oh, om] = special.open_time.split(':').map(Number);
    const [ch, cm] = special.close_time.split(':').map(Number);
    const openMin = oh * 60 + om;
    const closeMin = ch * 60 + cm;
    const isOpen = nowMinutes >= openMin && nowMinutes < closeMin;
    return {
      isOpenNow: isOpen,
      dayLabel: weekdayName,
      todayHoursLabel: `${formatTime12h(special.open_time)}–${formatTime12h(special.close_time)}`,
      note: special.note ?? null
    };
  }

  const today = days.find((d) => d.dayOfWeek === dayOfWeek);
  if (!today || today.isClosed || today.ranges.length === 0) {
    return { isOpenNow: false, dayLabel: weekdayName, todayHoursLabel: 'closed', note: null };
  }

  const isOpen = today.ranges.some((r) => {
    const [oh, om] = r.openTime.split(':').map(Number);
    const [ch, cm] = r.closeTime.split(':').map(Number);
    const openMin = oh * 60 + om;
    const closeMin = ch * 60 + cm;
    return nowMinutes >= openMin && nowMinutes < closeMin;
  });

  return {
    isOpenNow: isOpen,
    dayLabel: weekdayName,
    todayHoursLabel: today.ranges.map((r) => `${formatTime12h(r.openTime)}–${formatTime12h(r.closeTime)}`).join(', '),
    note: null
  };
}
