import { useEffect, useRef, useState } from 'react';
import { CalendarClock, Check, Loader2, Send, Sparkles, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { translate as tr } from '../lib/locales';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth';

type Turn = { role: 'user' | 'assistant'; content: string };
type Reply = { message: string; proposals: PlannerProposal[]; outOfScope?: boolean };

export type PlannerProposal = {
  entityType: 'task' | 'habit' | 'goal' | 'milestone' | 'library-template';
  title: string;
  description?: string;
  dueDate?: string;
  scheduledTime?: string;
  notes: string;
  priority: 1 | 2 | 3 | 4;
  frequency?: 'daily' | 'weekly';
  targetPerWeek?: number;
  rationale?: string;
  parentGoalId?: string;
  libraryType?: 'goal' | 'idea' | 'experience' | 'skill' | 'place' | 'book' | 'habit' | 'other';
  categoryId?: string;
  proposalKey?: string;
};

const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
};

const validProposal = (value: unknown): value is PlannerProposal => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  return ['task','habit','goal','milestone','library-template'].includes(String(p.entityType)) &&
    typeof p.title === 'string' && p.title.trim().length > 0 && p.title.length <= 200 &&
    typeof p.notes === 'string' && p.notes.length <= 1000 && Number.isInteger(p.priority) && Number(p.priority) >= 1 && Number(p.priority) <= 4 &&
    (p.description === undefined || (typeof p.description === 'string' && p.description.length <= 1000)) &&
    (p.dueDate === undefined || (typeof p.dueDate === 'string' && validDate(p.dueDate))) &&
    (p.scheduledTime === undefined || (typeof p.scheduledTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.scheduledTime))) &&
    (p.frequency === undefined || p.frequency === 'daily' || p.frequency === 'weekly') &&
    (p.targetPerWeek === undefined || (Number.isInteger(p.targetPerWeek) && Number(p.targetPerWeek) >= 1 && Number(p.targetPerWeek) <= 7)) &&
    (p.rationale === undefined || (typeof p.rationale === 'string' && p.rationale.length <= 500)) &&
    (p.parentGoalId === undefined || typeof p.parentGoalId === 'string') &&
    (p.libraryType === undefined || ['goal','idea','experience','skill','place','book','habit','other'].includes(String(p.libraryType)));
};

function normalizeReply(value: unknown, request: string): Reply {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('malformed');
  const raw = value as Record<string, unknown>;
  if (typeof raw.message !== 'string' || raw.message.length > 2000 || !Array.isArray(raw.proposals) || raw.proposals.length > 5) throw new Error('malformed');
  if (raw.outOfScope === true) return { message: raw.message, outOfScope: true, proposals: [] };

  const typed = raw.proposals.every((proposal) => proposal && typeof proposal === 'object' &&
    ['task', 'habit', 'goal', 'milestone', 'library-template'].includes(String((proposal as Record<string, unknown>).entityType)));
  if (typed) {
    if (!raw.proposals.every(validProposal)) throw new Error('malformed');
    return { message: raw.message, outOfScope: raw.outOfScope === true, proposals: raw.proposals };
  }

  // Older deployed functions return the same proposals array without entityType.
  // Route only clear user intent; all results remain editable and require confirmation.
  const text = request.toLocaleLowerCase();
  const asksLibrary = /\b(life library|library template|template)\b/.test(text) && /\b(save|store|keep|add)\b/.test(text);
  const asksMilestones = /\b(milestone|milestones|checkpoint|checkpoints)\b/.test(text);
  const existingGoalMilestones = asksMilestones && /\b(existing|my|current)\b/.test(text) && /\bgoal\b/.test(text);
  const asksHabit = /\b(habit|habits|routine|routines)\b/.test(text);
  const asksGoal = /\b(goal|objective)\b/.test(text) || (/\bplan\b/.test(text) && /\b(achieve|attain|reach|pass)\b/.test(text));
  const asksTask = /\b(task|tasks|schedule|today|tomorrow|to-do|todo|weekend|this week)\b/.test(text);
  const detailedGoalPlan = asksGoal && /\b(detailed|step.by.step|roadmap|milestones?|checkpoints?|plan)\b/.test(text);
  const destinations: PlannerProposal['entityType'][] = asksLibrary ? ['library-template']
    : existingGoalMilestones ? ['milestone']
    : [
        ...(asksGoal ? ['goal' as const] : []),
        ...(asksHabit ? ['habit' as const] : []),
        ...(asksMilestones ? ['milestone' as const] : []),
        ...(asksTask ? ['task' as const] : []),
      ];
  if (!destinations.length) {
    return { message: tr('Please clarify whether this should be a task, habit, goal, milestone, or Life Library item.'), proposals: [] };
  }

  const legacy = raw.proposals.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const item = entry as Record<string, unknown>;
    const title = typeof item.title === 'string' ? item.title.trim().slice(0, 200) : '';
    if (!title) return null;
    const notes = typeof item.notes === 'string' ? item.notes.slice(0, 1000) : '';
    const priority = Number.isInteger(item.priority) && Number(item.priority) >= 1 && Number(item.priority) <= 4 ? Number(item.priority) as PlannerProposal['priority'] : 3;
    const dueDate = typeof item.dueDate === 'string' && validDate(item.dueDate) ? item.dueDate : undefined;
    const scheduledTime = typeof item.scheduledTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.scheduledTime) ? item.scheduledTime : undefined;
    return { title, notes, priority, ...(dueDate ? { dueDate } : {}), ...(scheduledTime ? { scheduledTime } : {}) };
  }).filter((item): item is NonNullable<typeof item> => item !== null);

  const proposals: PlannerProposal[] = [];
  for (let index = 0; index < legacy.length; index += 1) {
    if (asksLibrary && index > 0) break;
    if (asksGoal && !existingGoalMilestones && !detailedGoalPlan && !asksHabit && !asksTask && index > 0) break;
    if (asksGoal && asksHabit && !asksTask && !detailedGoalPlan && index > 1) break;
    const entityType = existingGoalMilestones ? 'milestone'
      : asksLibrary ? 'library-template'
      : destinations[index] ?? (detailedGoalPlan && asksGoal ? 'milestone' : destinations[destinations.length - 1]);
    const item = legacy[index];
    const daily = /\b(daily|every day|each day)\b/.test(text);
    const weekly = text.match(/\b([1-7])\s*(?:times|x)\s*(?:a|per|each)\s*week\b/);
    proposals.push({
      ...item,
      entityType,
      ...(entityType === 'goal' ? { description: item.notes } : {}),
      ...(entityType === 'habit' ? { rationale: item.notes, ...(daily ? { frequency: 'daily' as const } : weekly ? { frequency: 'weekly' as const, targetPerWeek: Number(weekly[1]) } : {}) } : {}),
      ...(entityType === 'library-template' ? { libraryType: /\bgoal\b/.test(text) ? 'goal' as const : 'idea' as const } : {}),
    });
  }
  return { message: raw.message, outOfScope: raw.outOfScope === true, proposals };
}

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
  const categories = useStore((state) => state.categories);
  const goals = useStore((state) => state.goals);
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
  const confirmedBatch = useRef<string | null>(null);
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
      const reply = normalizeReply(data, text);
      setTurns((prev) => [...prev, { role: 'assistant' as const, content: reply.message }].slice(-6));
      const proposalStamp = Date.now().toString(36);
      confirmedBatch.current = null;
      setProposals(reply.proposals.map((proposal, index) => ({
        ...proposal,
        proposalKey: `${proposalStamp}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        categoryId: proposal.entityType === 'habit'
          ? categories.find((category) => category.id === 'health')?.id ?? categories[0]?.id
          : categories.find((category) => category.id === 'learning')?.id ?? categories[0]?.id,
        // Parent IDs are chosen from the local review form; never trust a model-supplied identifier.
        parentGoalId: undefined,
      })));
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
    const incompleteHabit = chosen.some((proposal) => proposal.entityType === 'habit' && (!proposal.frequency || (proposal.frequency === 'weekly' && !proposal.targetPerWeek)));
    const incompleteMilestone = chosen.some((proposal) => {
      if (proposal.entityType !== 'milestone' || !proposal.parentGoalId) return proposal.entityType === 'milestone';
      if (!proposal.parentGoalId.startsWith('planned:')) return !goals.some((goal) => goal.id === proposal.parentGoalId);
      const parentKey = proposal.parentGoalId.slice('planned:'.length);
      const parentIndex = proposals.findIndex((candidate) => candidate.proposalKey === parentKey && candidate.entityType === 'goal');
      return parentIndex < 0 || !selected[parentIndex];
    });
    if (incompleteHabit || incompleteMilestone) {
      setError(tr(incompleteHabit ? 'Please choose habit recurrence and weekly target when applicable.' : 'Please choose the parent Goal for this milestone.'));
      return;
    }
    const batchKey = chosen.map((proposal) => proposal.proposalKey ?? `${proposal.entityType}:${proposal.title}`).sort().join('|');
    if (confirmedBatch.current === batchKey) return;
    confirmedBatch.current = batchKey;
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
            <div className="flex min-w-0 flex-wrap items-center gap-2"><input type="checkbox" className="accent-indigo-600" checked={!!selected[index]} onChange={(event) => setSelected({ ...selected, [index]: event.target.checked })} aria-label={tr('Select proposal')} /><select className="input w-32 shrink-0" value={proposal.entityType} aria-label={tr('Proposal type')} onChange={(event) => setProposals((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, entityType: event.target.value as PlannerProposal['entityType'], ...(event.target.value === 'library-template' ? { libraryType: item.libraryType ?? 'idea' } : {}) } : item))}><option value="task">{tr('task')}</option><option value="habit">{tr('habit')}</option><option value="goal">{tr('goal')}</option><option value="milestone">{tr('milestone')}</option><option value="library-template">{tr('Life Library template')}</option></select><input className="input min-w-0 flex-1 font-medium" maxLength={200} value={proposal.title} onChange={(event) => setProposals((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} aria-label={tr('Proposal title')} /></div>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-indigo-600">{tr(proposal.entityType === 'library-template' ? 'Life Library template' : proposal.entityType)} · {tr(proposal.entityType === 'milestone' ? 'Destination: selected Goal' : proposal.entityType === 'goal' ? 'Destination: Goals' : proposal.entityType === 'habit' ? 'Destination: Habits' : proposal.entityType === 'library-template' ? 'Destination: Life Library' : 'Destination: Tasks')}</p>
            {(proposal.entityType === 'task' || proposal.entityType === 'milestone' || proposal.entityType === 'goal') && <label className="mt-2 block text-xs muted">{tr(proposal.entityType === 'goal' ? 'Target date' : 'Due date')}<input type="date" className="input mt-1 w-full" value={proposal.dueDate ?? ''} onChange={(event) => setProposals((xs) => xs.map((item, i) => i === index ? { ...item, dueDate: event.target.value || undefined } : item))} /></label>}
            {proposal.entityType === 'task' && <div className="mt-2 grid grid-cols-2 gap-2"><label className="text-xs muted">{tr('Scheduled time')}<input type="time" className="input mt-1 w-full" value={proposal.scheduledTime ?? ''} onChange={(e) => setProposals(xs => xs.map((x,i) => i===index ? {...x,scheduledTime:e.target.value||undefined}:x))}/></label><label className="text-xs muted">{tr('Priority')}<select className="input mt-1 w-full" value={proposal.priority} onChange={(e) => setProposals(xs => xs.map((x,i) => i===index ? {...x,priority:Number(e.target.value) as PlannerProposal['priority']}:x))}>{[1,2,3,4].map(n=><option key={n}>{n}</option>)}</select></label></div>}
            {proposal.entityType === 'habit' && <div className="mt-2 grid grid-cols-2 gap-2"><label className="text-xs muted">{tr('Recurrence')}<select className="input mt-1 w-full" value={proposal.frequency ?? ''} onChange={(e) => setProposals(xs => xs.map((x,i) => i===index ? {...x,frequency:(e.target.value || undefined) as PlannerProposal['frequency']}:x))}><option value="">{tr('Choose')}</option><option value="daily">{tr('Daily')}</option><option value="weekly">{tr('Weekly')}</option></select></label>{proposal.frequency === 'weekly' && <label className="text-xs muted">{tr('Target per week')}<input type="number" min="1" max="7" className="input mt-1 w-full" value={proposal.targetPerWeek ?? ''} onChange={(e) => setProposals(xs => xs.map((x,i) => i===index ? {...x,targetPerWeek:Number(e.target.value)||undefined}:x))}/></label>}<label className="col-span-2 text-xs muted">{tr('Rationale')}<textarea className="input mt-1 w-full" value={proposal.rationale ?? ''} onChange={(e) => setProposals(xs => xs.map((x,i) => i===index ? {...x,rationale:e.target.value}:x))}/></label></div>}
            {proposal.entityType === 'milestone' && <label className="mt-2 block text-xs muted">{tr('Parent Goal')}<select className="input mt-1 w-full" value={proposal.parentGoalId ?? ''} onChange={(e) => setProposals(xs => xs.map((x,i) => i===index ? {...x,parentGoalId:e.target.value||undefined}:x))}><option value="">{tr('Choose a Goal')}</option>{goals.map(goal=><option key={goal.id} value={goal.id}>{goal.title}</option>)}{proposals.map((goal, goalIndex) => goal.entityType === 'goal' && <option key={goal.proposalKey} value={`planned:${goal.proposalKey}`}>{tr('New Goal in this plan')}: {goal.title}{selected[goalIndex] ? '' : ` · ${tr('not selected')}`}</option>)}</select></label>}
            {proposal.entityType === 'library-template' && <label className="mt-2 block text-xs muted">{tr('Life Library type')}<select className="input mt-1 w-full" value={proposal.libraryType ?? 'idea'} onChange={(e) => setProposals(xs => xs.map((x,i) => i===index ? {...x,libraryType:e.target.value as PlannerProposal['libraryType']}:x))}>{['goal','idea','experience','skill','place','book','habit','other'].map(type=><option key={type}>{type}</option>)}</select></label>}
            {(proposal.entityType === 'goal' || proposal.entityType === 'library-template') && <label className="mt-2 block text-xs muted">{tr('Description')}<textarea className="input mt-1 w-full" value={proposal.description ?? proposal.notes} onChange={(e) => setProposals(xs => xs.map((x,i) => i===index ? {...x,description:e.target.value}:x))}/></label>}
            {proposal.entityType === 'task' && <label className="mt-2 block text-xs muted">{tr('Notes')}<textarea className="input mt-1 w-full" maxLength={1000} value={proposal.notes} onChange={(e) => setProposals(xs => xs.map((x,i) => i===index ? {...x,notes:e.target.value}:x))}/></label>}
            {categories.length > 0 && <label className="mt-2 block text-xs muted">{tr('Category')}<select className="input mt-1 w-full" value={proposal.categoryId ?? categories[0].id} onChange={(e) => setProposals((xs) => xs.map((item, i) => i === index ? { ...item, categoryId: e.target.value } : item))}>{categories.map((category) => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}</select></label>}
          </article>)}
          <div className="flex gap-2"><button type="button" className="btn-outline" onClick={() => { setProposals([]); setSelected({}); }}>{tr('Cancel')}</button><button type="button" className="btn-primary" disabled={!proposals.some((_, index) => selected[index] && proposals[index].title.trim())} onClick={addSelected}><Check size={16} className="mr-1 inline" /><CalendarClock size={16} className="mr-1 inline" />{tr('Use selected proposals')}</button></div>
        </div>}
      </div>
    </section>}
  </>;
}
