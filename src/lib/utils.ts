export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const pad = (n: number) => String(n).padStart(2, '0');
export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toISODate(new Date());
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISODate(d);
};
export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);

export const localeForLanguage = (language?: string) => ({ en: 'en-US', bn: 'bn-BD', hi: 'hi-IN', ar: 'ar-SA', es: 'es-ES' } as Record<string, string>)[language ?? 'en'] ?? 'en-US';
export const fmtDate = (iso?: string, language?: string) =>
  iso ? new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString(localeForLanguage(language), { month: 'short', day: 'numeric', year: 'numeric' }) : '';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));

export function weekStart(iso: string, startsMonday = true) {
  const day = new Date(iso + 'T00:00:00').getDay();
  const offset = startsMonday ? (day + 6) % 7 : day;
  return addDays(iso, -offset);
}

export function weekCount(log: string[], date = today(), startsMonday = true) {
  const start = weekStart(date, startsMonday);
  return log.filter((day) => day >= start && day <= date).length;
}

export function download(filename: string, content: string, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function csvEscape(v: unknown) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** Streak of consecutive days ending today (or yesterday) */
export function streak(log: string[]) {
  const set = new Set(log);
  let d = today();
  if (!set.has(d)) d = addDays(d, -1);
  let n = 0;
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

export function bestStreak(log: string[]) {
  const sorted = [...new Set(log)].sort();
  let best = 0, cur = 0, prev = '';
  for (const d of sorted) {
    cur = prev && daysBetween(prev, d) === 1 ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}
