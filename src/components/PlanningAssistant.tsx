import { useEffect, useState } from 'react';
import { CalendarClock, Check, Loader2, Send, Sparkles, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { translate as tr } from '../lib/locales';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth';

type Turn = { role: 'user' | 'assistant'; content: string };
type Reply = { message: string; proposals: PlannerProposal[]; outOfScope?: boolean };

export type PlannerProposal = {
  title: string;
  dueDate?: string;
  scheduledTime?: string;
  notes: string;
  priority: 1 | 2 | 3 | 4;
};

const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
};

const validProposal = (value: unknown): value is PlannerProposal => {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return typeof p.title === 'string' && p.title.trim().length > 0 && p.title.length <= 200 &&
    typeof p.notes === 'string' && p.notes.length <= 1000 &&
    Number.isInteger(p.priority) && Number(p.priority) >= 1 && Number(p.priority) <= 4 &&
    (p.dueDate === undefined || (typeof p.dueDate === 'string' && validDate(p.dueDate))) &&
    (p.scheduledTime === undefined || (typeof p.scheduledTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.scheduledTime)));
};

const containsSensitiveInfo = (value: string) =>
  /\b[\w.+-]+@[\w.-]+\.[A-Z]{2,}\b/i.test(value) ||
  /(?:\+?\d[\s().-]*){9,}/.test(value) ||
  /\b(?:passport|national id|government id|social security|ssn|aadhaar|nid|credit card|debit card|cvv|bank account)\b/i.test(value) ||
  /\b(?:password|api key|secret key|private key|access token)\b\s*(?:is|:|=)\s*\S+/i.test(value);

function dateInZone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export default function PlanningAssistant({ onAddItems }: { onAddItems: (proposals: PlannerProposal[]) => void }) {
  const appLanguage = useStore((state) => state.settings.language ?? 'en');
  const { user, setGuest } = useAuth();
  const [open, setOpen] = useState(false);
  const [acknowledgedForUser, setAcknowledgedForUser] = useState<string | null>(() => {
    const id = useAuth.getState().user?.id;
    if (!id || typeof window === 'undefined') return null;
    try { return window.localStorage.getItem(`lifeos-planner-consent-v1:${id}`) === 'accepted' ? id : null; } catch { return null; }
  });
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [proposals, setProposals] = useState<PlannerProposal[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const acknowledged = Boolean(user?.id && acknowledgedForUser === user.id);

  useEffect(() => {
    if (!user?.id) return;
    try {
      if (window.localStorage.getItem(`lifeos-planner-consent-v1:${user.id}`) === 'accepted') setAcknowledgedForUser(user.id);
    } catch { /* If storage is blocked, acknowledgement lasts for this open session only. */ }
  }, [user?.id]);

  const acknowledgeDataUse = (accepted: boolean) => {
    if (!accepted || !user?.id) return;
    try { window.localStorage.setItem(`lifeos-planner-consent-v1:${user.id}`, 'accepted'); } catch { /* Session-only fallback. */ }
    setAcknowledgedForUser(user.id);
  };

  async function send() {
    const text = input.trim();
    if (!text || busy || !acknowledged) return;
    if (!user || !supabase) { setError(tr('Planning assistant requires a signed-in account.')); return; }
    const next: Turn[] = [...turns, { role: 'user' as const, content: text }].slice(-6);
    if (next.some((turn) => containsSensitiveInfo(turn.content))) {
      setError(tr('Sensitive details detected. Remove them before sending; do not share contact details, identity numbers, payment details, passwords, or secrets.'));
      return;
    }
    setError(''); setBusy(true); setInput('');
    setTurns(next);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('auth');
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const { data, error: invokeError } = await supabase.functions.invoke('lifeos-planner', {
        body: { turns: next, language: appLanguage, localDate: dateInZone(new Date(), timezone), timezone },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (invokeError) {
        const status = (invokeError as { context?: { status?: number } }).context?.status;
        throw new Error(status === 422 ? 'sensitive' : status === 429 ? 'quota' : status === 401 || status === 403 ? 'auth' : status === 404 || status === 503 ? 'setup' : status === 502 ? 'upstream' : status === 400 ? 'malformed' : 'network');
      }
      const reply = data as Reply;
      if (!reply || typeof reply.message !== 'string' || reply.message.length > 2000 || !Array.isArray(reply.proposals) || reply.proposals.length > 5 || !reply.proposals.every(validProposal)) throw new Error('malformed');
      setTurns((prev) => [...prev, { role: 'assistant' as const, content: reply.message }].slice(-6));
      setProposals(reply.proposals);
      setSelected(Object.fromEntries(reply.proposals.map((_, index) => [index, true])));
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : 'network';
      setError(tr(code === 'sensitive' ? 'Sensitive details detected. Remove them before sending; do not share contact details, identity numbers, payment details, passwords, or secrets.' : code === 'auth' ? 'Planning assistant sign-in error.' : code === 'quota' ? 'Daily planning limit reached. Try again tomorrow.' : code === 'setup' ? 'Planning assistant setup is incomplete. Deploy the lifeos-planner function, apply its planner usage migration, and set the GEMINI_API_KEY secret in Supabase.' : code === 'upstream' ? 'The AI provider is temporarily unavailable. Please try again shortly.' : code === 'malformed' ? 'The assistant returned an invalid response. Please retry.' : 'Planning assistant is unavailable. Check your connection and try again.'));
      setTurns((prev) => prev.slice(0, -1));
      setInput(text);
    } finally { setBusy(false); }
  }

  const addSelected = () => {
    const chosen = proposals.filter((proposal, index) => selected[index] && proposal.title.trim());
    if (!chosen.length) return;
    onAddItems(chosen);
    setProposals([]); setSelected({}); setOpen(false);
  };

  return <>
    <button type="button" className="fixed bottom-[calc(10rem+env(safe-area-inset-bottom))] right-4 z-40 grid h-12 w-12 place-items-center rounded-full border border-indigo-500/30 bg-white/75 text-indigo-700 shadow-lg shadow-indigo-900/10 backdrop-blur-xl transition hover:scale-105 active:scale-95 dark:bg-slate-900/75 dark:text-indigo-200 lg:bottom-24 lg:right-6" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="lifeos-planning-panel" aria-label={tr(open ? 'Close planning assistant' : 'Open planning assistant')} title={tr(open ? 'Close planning assistant' : 'Open planning assistant')}>
      {open ? <X size={20} /> : <Sparkles size={20} />}
    </button>
    {open && <section id="lifeos-planning-panel" role="dialog" aria-label={tr('Planning assistant')} className="fixed bottom-[calc(13rem+env(safe-area-inset-bottom))] right-3 z-[80] max-h-[min(68dvh,44rem)] w-[min(94vw,34rem)] overflow-y-auto rounded-2xl shadow-2xl lg:bottom-[7rem] lg:right-6">
      <div className="card p-4 sm:p-5">
        <header className="mb-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2"><Sparkles size={18} className="shrink-0 text-indigo-500" /><div className="min-w-0"><h2 className="font-semibold">{tr('Planning assistant')}</h2><p className="text-xs muted">{tr('Planning and scheduling only')}</p></div></div>
          <button type="button" className="btn-ghost shrink-0 !p-2" aria-label={tr('Close planning assistant')} onClick={() => setOpen(false)}><X size={17} /></button>
        </header>
        {!user ? <div className="space-y-3"><p className="text-sm muted">{tr('Planning assistant requires a signed-in account.')}</p><button type="button" className="btn-outline" onClick={() => { setOpen(false); setGuest(false); }}>{tr('Sign in')}</button></div> : !acknowledged ? <div className="space-y-3 text-sm">
          <p>{tr('Before your first request: Gemini Developer API free-tier prompts and responses may be used to improve Google products and may be reviewed by humans. Do not enter sensitive, confidential, or identifying information.')}</p>
          <p className="text-xs muted">{tr('Only your last six chat messages, selected app language, local date, and timezone are sent. Life OS account records are not attached, and this conversation is not saved by Life OS.')}</p>
          <p className="text-xs muted">{tr('The assistant only helps with planning and scheduling. It cannot read or change your account data. The free provider may impose additional rate limits.')}</p>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 accent-indigo-600" checked={acknowledged} onChange={(event) => acknowledgeDataUse(event.target.checked)} /><span>{tr('I understand and acknowledge this data-use and possible human-review tradeoff.')}</span></label>
          <p className="text-xs muted">{tr('This acknowledgement is remembered for this account on this device; you will not be asked again here.')}</p>
        </div> : <>
          <div className="mb-3 max-h-40 space-y-2 overflow-y-auto text-sm" aria-live="polite">
            {turns.map((turn, index) => <p key={index} className={turn.role === 'user' ? 'ml-8 rounded-2xl rounded-br-md bg-indigo-500/10 p-3' : 'mr-8 rounded-2xl rounded-bl-md bg-slate-500/10 p-3'}>{turn.content}</p>)}
          </div>
          <div className="flex gap-2"><textarea className="input min-h-10 flex-1 resize-y" rows={2} maxLength={2000} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder={tr('Ask for help planning tasks or scheduling…')} aria-label={tr('Planning message')} /><button type="button" className="btn-primary self-end" disabled={busy || !input.trim()} onClick={() => void send()} aria-label={tr('Send planning request')}>{busy ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}</button></div>
          {busy && <p className="mt-2 text-xs muted" role="status">{tr('Planning…')}</p>}
          {error && <p role="alert" className="mt-2 text-sm text-rose-600">{error}</p>}
        </>}
        {proposals.length > 0 && <div className="mt-4 space-y-3 border-t border-slate-200 pt-3 dark:border-white/10">
          <p className="text-sm muted">{tr('Review and edit suggestions. Nothing is saved until you confirm with the app.')}</p>
          {proposals.map((proposal, index) => <article key={index} className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-indigo-600" checked={!!selected[index]} onChange={(event) => setSelected({ ...selected, [index]: event.target.checked })} /><input className="input min-w-0 flex-1 font-medium" maxLength={200} value={proposal.title} onChange={(event) => setProposals((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} aria-label={tr('Proposal title')} /></label>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3"><label className="text-xs muted">{tr('Due date')}<input type="date" className="input mt-1 w-full" value={proposal.dueDate ?? ''} onChange={(event) => setProposals((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, dueDate: event.target.value || undefined } : item))} /></label><label className="text-xs muted">{tr('Scheduled time')}<input type="time" className="input mt-1 w-full" value={proposal.scheduledTime ?? ''} onChange={(event) => setProposals((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, scheduledTime: event.target.value || undefined } : item))} /></label><label className="text-xs muted">{tr('Priority')}<select className="input mt-1 w-full" value={proposal.priority} onChange={(event) => setProposals((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, priority: Number(event.target.value) as PlannerProposal['priority'] } : item))}>{[1, 2, 3, 4].map((number) => <option key={number} value={number}>{number}</option>)}</select></label></div>
            <label className="mt-2 block text-xs muted">{tr('Notes')}<textarea className="input mt-1 w-full" maxLength={1000} value={proposal.notes} onChange={(event) => setProposals((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, notes: event.target.value } : item))} /></label>
          </article>)}
          <button type="button" className="btn-primary" disabled={!proposals.some((_, index) => selected[index] && proposals[index].title.trim())} onClick={addSelected}><Check size={16} className="mr-1 inline" /><CalendarClock size={16} className="mr-1 inline" />{tr('Use selected proposals')}</button>
        </div>}
      </div>
    </section>}
  </>;
}
