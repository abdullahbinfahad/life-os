import { translate as tr } from '../lib/locales';
import { Check, Download, GripVertical, ImagePlus, Lock, Plus, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PageHeader } from '../components/ui';
import { useStore } from '../lib/store';
import { syncNow, useAuth } from '../lib/auth';
import { useOwnerAdmin } from '../lib/admin';
import { compressImage, deletePrivateImage, formatBytes, getPrivateImageUrl, uploadPrivateImage } from '../lib/media';
import type { Settings as SettingsData } from '../lib/types';
import { cloudEnabled, supabase } from '../lib/supabase';
import { csvEscape, download, localeForLanguage, parseCSV, today } from '../lib/utils';
import { APP_LANGUAGES } from '../lib/locales';
import { playFeedback } from '../lib/sounds';
import { EARNED_THEMES, isThemeUnlocked } from '../lib/themes';
import { createClient } from '@supabase/supabase-js';

function SortableCategoryRow({ category, count, onUpdate, onDelete }: { category: { id: string; icon: string; color: string; name: string }; count: number; onUpdate: (patch: { icon?: string; color?: string; name?: string }) => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.65 : 1 }} className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 p-2 dark:border-white/[.06]">
    <button type="button" className="btn-ghost !p-1.5 touch-none" aria-label={`${tr('Reorder')} ${category.name}`} title={tr('Drag to reorder')} {...attributes} {...listeners}><GripVertical size={15} /></button>
    <input aria-label={tr('Category icon')} className="w-10 rounded-lg bg-transparent text-center text-lg outline-none" value={category.icon} onChange={(e) => onUpdate({ icon: e.target.value })} />
    <input aria-label={tr('Category color')} type="color" className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent" value={category.color} onChange={(e) => onUpdate({ color: e.target.value })} />
    <input aria-label={tr('Category name')} className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={category.name} onChange={(e) => onUpdate({ name: e.target.value })} />
    <span className="text-xs muted">{count}</span>
    <button type="button" aria-label={`${tr('Delete')} ${category.name}`} className="btn-ghost !p-1.5 text-rose-500" onClick={onDelete}><Trash2 size={14} /></button>
  </div>;
}

export default function Settings() {
  const s = useStore();
  const navigate = useNavigate();
  const { user, sync, syncError, lastSynced } = useAuth();
  const ownerAdmin = useOwnerAdmin();
  const rewardPoints = s.rewardEvents.reduce((sum, event) => sum + event.points, 0);
  const categorySensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const reorderCategory = (event: DragEndEvent) => {
    const from = s.categories.findIndex((category) => category.id === event.active.id);
    const to = s.categories.findIndex((category) => category.id === event.over?.id);
    if (from >= 0 && to >= 0 && from !== to) useStore.setState((state) => ({ categories: arrayMove(state.categories, from, to) }));
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const [newCat, setNewCat] = useState({ name: '', icon: '⭐', color: '#6366f1' });
  const [msg, setMsg] = useState('');
  const [backupAction, setBackupAction] = useState<'json-export' | 'csv-export' | 'json-import' | 'csv-import' | null>(null);
  const [backupPassword, setBackupPassword] = useState('');
  const [backupOtp, setBackupOtp] = useState('');
  const [backupCodeSent, setBackupCodeSent] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [importPreview, setImportPreview] = useState<{ format: 'json' | 'csv'; data: any; counts: Record<string, number> } | null>(null);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [erasePassword, setErasePassword] = useState('');
  const [eraseOtp, setEraseOtp] = useState('');
  const [erasePhrase, setErasePhrase] = useState('');
  const [eraseCodeSent, setEraseCodeSent] = useState(false);
  const [eraseBusy, setEraseBusy] = useState(false);
  const [eraseError, setEraseError] = useState('');
  const eraseCancelRef = useRef<HTMLButtonElement>(null);
  const erasePasswordAccount = Boolean(user && ((user.app_metadata?.providers as string[] | undefined) ?? []).some((provider) => provider === 'email' || provider === 'phone'));
  const eraseCloudAccount = Boolean(user && cloudEnabled);
  const eraseBlocked = eraseCloudAccount && sync !== 'saved';

  const openEraseDialog = () => {
    setEraseError(''); setErasePassword(''); setEraseOtp(''); setErasePhrase(''); setEraseCodeSent(false); setEraseOpen(true);
  };
  useEffect(() => {
    if (!eraseOpen) return;
    eraseCancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !eraseBusy) setEraseOpen(false);
      if (event.key === 'Tab') {
        const dialog = document.getElementById('erase-data-dialog');
        const controls = dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [eraseOpen, eraseBusy]);

  const erasePersonalSnapshot = async () => {
    if (eraseBusy || eraseBlocked) return;
    if (!eraseCloudAccount && erasePhrase !== tr('ERASE MY DATA')) { setEraseError(tr('Type the exact confirmation phrase to continue.')); return; }
    setEraseBusy(true); setEraseError('');
    try {
      if (eraseCloudAccount) {
        if (!supabase || !user) throw new Error(tr('Could not verify your account. Please try again.'));
        if (erasePasswordAccount) {
          if (!erasePassword) throw new Error(tr('Enter your current account password to continue.'));
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
          const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
          if (!supabaseUrl || !supabaseKey) throw new Error(tr('Could not verify your account. Please try again.'));
          const verifier = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'lifeos-erase-verification' } });
          try {
            const verification = user.email
              ? await verifier.auth.signInWithPassword({ email: user.email, password: erasePassword })
              : user.phone ? await verifier.auth.signInWithPassword({ phone: user.phone, password: erasePassword }) : null;
            if (!verification) throw new Error(tr('Could not verify your account. Please try again.'));
            if (verification.error) throw verification.error;
            if (verification.data.user?.id !== user.id) throw new Error(tr('Could not verify your account. Please try again.'));
          } finally {
            await verifier.auth.signOut({ scope: 'local' });
          }
        } else {
          if (!eraseCodeSent) {
            const { error } = await supabase.auth.reauthenticate();
            if (error) throw error;
            setEraseCodeSent(true);
            return;
          }
          if (!eraseOtp.trim()) throw new Error(tr('Enter the fresh verification code to continue.'));
          const verification = user.email
            ? await supabase.auth.verifyOtp({ email: user.email, token: eraseOtp.trim(), type: 'reauthentication' })
            : user.phone ? await supabase.auth.verifyOtp({ phone: user.phone, token: eraseOtp.trim(), type: 'reauthentication' }) : null;
          if (!verification) throw new Error(tr('Could not verify your account. Please try again.'));
          if (verification.error) throw verification.error;
        }
      }
      const current = useStore.getState();
      const snapshot = {
        categories: current.categories, items: current.items, goals: current.goals, projects: current.projects,
        habits: current.habits, journal: current.journal, albums: current.albums, settings: current.settings,
        trash: current.trash, focusSessions: current.focusSessions, rewardEvents: current.rewardEvents,
      };
      useStore.getState().resetAll();
      if (eraseCloudAccount) {
        const saved = await syncNow();
        if (!saved) {
          useStore.getState().importAll(snapshot);
          throw new Error(tr('Cloud could not confirm the reset snapshot. Your personal data was restored on this device; nothing was reported as erased.'));
        }
      }
      setEraseOpen(false); setErasePassword(''); setEraseOtp(''); setErasePhrase('');
      setMsg(tr('Personal snapshot erased.'));
    } catch (error) {
      setEraseError(error instanceof Error ? error.message : tr('Account verification failed. Please try again.'));
    } finally {
      setErasePassword('');
      setEraseBusy(false);
    }
  };

  const exportJSON = () => {
    const { categories, items, goals, projects, habits, journal, albums, settings, trash, focusSessions, rewardEvents } = useStore.getState();
    download(`life-circle-backup-${today()}.json`, JSON.stringify({ version: 5, categories, items, goals, projects, habits, journal, albums, settings, trash, focusSessions, rewardEvents }, null, 2));
  };
  const beginBackup = (action: NonNullable<typeof backupAction>) => {
    if (!user) { setMsg('Sign in before importing or exporting private account data.'); return; }
    setBackupPassword(''); setBackupOtp(''); setBackupCodeSent(false); setBackupAction(action);
  };
  const finishBackup = () => {
    const action = backupAction; setBackupAction(null); setBackupPassword(''); setBackupOtp(''); setBackupCodeSent(false);
    if (action === 'json-export') exportJSON();
    else if (action === 'csv-export') exportCSV();
    else if (action === 'json-import') fileRef.current?.click();
    else if (action === 'csv-import') csvRef.current?.click();
  };
  const verifyBackupIdentity = async () => {
    if (!supabase || !user) { setMsg('Sign in with a verified account before handling backups.'); return; }
    setBackupBusy(true);
    try {
      const providers = (user.app_metadata?.providers as string[] | undefined) ?? [];
      const hasPassword = (providers.includes('email') || providers.includes('phone')) && Boolean(user.email || user.phone);
      if (hasPassword && backupPassword) {
        const result = user.email
          ? await supabase.auth.signInWithPassword({ email: user.email, password: backupPassword })
          : await supabase.auth.signInWithPassword({ phone: user.phone!, password: backupPassword });
        if (result.error) throw result.error;
        finishBackup(); return;
      }
      if (!backupCodeSent) {
        const { error } = await supabase.auth.reauthenticate();
        if (error) throw error;
        setBackupCodeSent(true); setMsg('A fresh verification code was sent to your confirmed account contact.');
        return;
      }
      if (!backupOtp.trim()) { setMsg('Enter the verification code to continue.'); return; }
      const verified = user.email
        ? await supabase.auth.verifyOtp({ email: user.email, token: backupOtp.trim(), type: 'reauthentication' })
        : await supabase.auth.verifyOtp({ phone: user.phone!, token: backupOtp.trim(), type: 'reauthentication' });
      if (verified.error) throw verified.error;
      finishBackup();
    } catch (error) { setMsg(error instanceof Error ? error.message : 'Fresh account verification failed.'); }
    finally { setBackupBusy(false); }
  };
  const exportCSV = () => {
    const head = ['title', 'category', 'status', 'priority', 'horizon', 'type', 'dueDate', 'scheduledTime', 'tags', 'notes'];
    const rows = s.items.map((i) => [i.title, s.categories.find((c) => c.id === i.categoryId)?.name, i.status, i.priority, i.horizon, i.type, i.dueDate, i.scheduledTime ?? '', i.tags.join(';'), i.notes].map(csvEscape).join(','));
    download(`life-os-library-${today()}.csv`, [head.join(','), ...rows].join('\n'), 'text/csv');
  };
  const importJSON = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Backup must be a JSON object.');
      const supported = ['categories', 'items', 'goals', 'projects', 'habits', 'journal', 'albums', 'settings', 'trash', 'focusSessions', 'rewardEvents'];
      const present = supported.filter((key) => key in data);
      if (!present.length || present.some((key) => Array.isArray(data[key]) === false && key !== 'settings')) throw new Error('Backup has no valid Life OS collections.');
      const counts = Object.fromEntries(present.map((key) => [key, Array.isArray(data[key]) ? data[key].length : 1]));
      setImportPreview({ format: 'json', data, counts });
    } catch { setMsg('Invalid backup file.'); }
  };
  const importCSV = async (f: File) => {
    const rows = parseCSV(await f.text());
    if (!rows.length) return;
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const hasHeader = head.includes('title');
    const idx = (k: string) => head.indexOf(k);
    const body = hasHeader ? rows.slice(1) : rows;
    const items = body.map((r) => {
      const g = (k: string) => (hasHeader && idx(k) >= 0 ? r[idx(k)]?.trim() : undefined);
      const catName = g('category')?.toLowerCase();
      const cat = s.categories.find((c) => c.name.toLowerCase() === catName || c.id === catName);
      return {
        title: hasHeader ? g('title') ?? '' : r[0],
        categoryId: cat?.id,
        status: (g('status') as any) || undefined,
        priority: g('priority') ? (Number(g('priority')) as any) : undefined,
        horizon: (g('horizon') as any) || undefined,
        dueDate: g('duedate') || undefined,
        scheduledTime: g('scheduledtime') || undefined,
        tags: g('tags') ? g('tags')!.split(/[;|]/).map((x) => x.trim()).filter(Boolean) : [],
        notes: g('notes') ?? '',
      };
    }).filter((i) => i.title).map((i) => Object.fromEntries(Object.entries(i).filter(([, v]) => v !== undefined)) as any);
    if (!items.length) { setMsg('No importable rows were found in that CSV.'); return; }
    setImportPreview({ format: 'csv', data: items, counts: { items: items.length } });
  };

  const applyImport = (mode: 'merge' | 'replace') => {
    if (!importPreview) return;
    if (importPreview.format === 'csv') {
      if (mode === 'replace') useStore.getState().importAll({ ...useStore.getState(), items: [] });
      useStore.getState().addItems(importPreview.data);
      setMsg(`${mode === 'merge' ? 'Merged' : 'Replaced library with'} ${importPreview.data.length} CSV items.`);
    } else {
      const incoming = importPreview.data as Record<string, unknown>;
      if (mode === 'replace') useStore.getState().importAll(incoming);
      else {
        const current = useStore.getState() as unknown as Record<string, unknown>;
        const arrayKeys = ['categories', 'items', 'goals', 'projects', 'habits', 'journal', 'albums', 'trash', 'focusSessions', 'rewardEvents'];
        const merged: Record<string, unknown> = { ...current, ...incoming };
        for (const key of arrayKeys) if (Array.isArray(incoming[key])) {
          const byId = new Map<string, Record<string, unknown>>();
          for (const row of [...(Array.isArray(current[key]) ? current[key] as Record<string, unknown>[] : []), ...(incoming[key] as Record<string, unknown>[])]) if (row && typeof row.id === 'string') byId.set(row.id, row);
          merged[key] = [...byId.values()];
        }
        merged.settings = { ...(current.settings as object ?? {}), ...(incoming.settings as object ?? {}) };
        useStore.getState().importAll(merged);
      }
      setMsg(`Backup ${mode === 'merge' ? 'merged' : 'restored'}.`);
    }
    setImportPreview(null);
  };

  return (
    <div className="max-w-4xl">
      <PageHeader title={tr("Settings")} subtitle={tr("Templates, imports, exports, privacy")} />
      {msg && <div className="mb-4 rounded-xl bg-emerald-500/15 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">{msg}</div>}

      <section className="card mb-6 p-6">
        <h3 className="mb-4 font-semibold">{tr("Profile & preferences")}</h3>
        <div className="mb-5"><ProfilePhotoControl settings={s.settings} userId={user?.id} updateSettings={s.updateSettings} /></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label">{tr("Your name")}</label><input className="input" value={s.settings.name} onChange={(e) => s.updateSettings({ name: e.target.value })} /></div>
          <div><label className="label">{tr("Profile photo URL")}</label><input className="input" type="url" placeholder={tr("https://…")} value={s.settings.avatarUrl ?? ''} onChange={(e) => s.updateSettings({ avatarUrl: e.target.value || undefined })} /><p className="mt-1 text-xs muted">{tr("Optional external-image fallback. Private uploads are shown first.")}</p></div>
          <div className="min-w-0"><label className="label">{tr("Birthday")}</label><input className="input min-w-0 max-w-full min-h-11" type="date" value={s.settings.birthday ?? ''} onChange={(e) => s.updateSettings({ birthday: e.target.value || undefined })} /></div>
          <div><label className="label">{tr("Location")}</label><input className="input" placeholder={tr("City, country")} value={s.settings.location ?? ''} onChange={(e) => s.updateSettings({ location: e.target.value || undefined })} /></div>
          <div><label className="label">{tr("Week starts")}</label><select className="input" value={s.settings.weekStartsMonday ? 'mon' : 'sun'} onChange={(e) => s.updateSettings({ weekStartsMonday: e.target.value === 'mon' })}><option value="mon">{tr("Monday")}</option><option value="sun">{tr("Sunday")}</option></select></div>
          <div><label className="label" htmlFor="system-language">{tr("System language")}</label><select id="system-language" className="input" value={s.settings.language ?? 'en'} onChange={(e) => s.updateSettings({ language: e.target.value as NonNullable<SettingsData['language']> })}>{APP_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.native} · {language.label}</option>)}</select><p className="mt-1 text-xs muted">{tr("The interface changes immediately. Your entries stay in the language you wrote them.")}</p></div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 dark:border-white/10"><label htmlFor="interaction-sounds" className="min-w-0"><span className="block text-sm font-medium">{tr("Soft interaction sounds")}</span><span className="block text-xs muted">{tr("Optional focus, countdown, stopwatch-minute, submit, error, and notification sounds.")}</span></label><input id="interaction-sounds" type="checkbox" className="h-5 w-5 shrink-0 accent-indigo-600" checked={s.settings.sounds ?? false} onChange={(e) => { const enabled = e.target.checked; s.updateSettings({ sounds: enabled }); if (enabled) window.setTimeout(() => playFeedback('confirm'), 0); }} /></div>
          <div className="sm:col-span-3">
            <div className="mb-2"><span className="label">{tr("Appearance")}</span><p className="text-xs muted">{tr("Choose your look here. The sidebar stays focused on navigation.")}</p></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {([
                { value: 'dark', title: 'Night glass', detail: 'Original dark theme', preview: 'linear-gradient(135deg,#182131,#0b0d12 62%,#253344)' },
                { value: 'light', title: 'Clean light', detail: 'Original bright theme', preview: 'linear-gradient(135deg,#dbeafe,#ffffff 52%,#d1fae5)' },
                ...EARNED_THEMES.map((item) => ({ value: item.id, title: item.title, detail: 'Earn this premium theme', preview: item.id === 'paper' ? 'linear-gradient(135deg,#e7dcc5,#faf7ef 52%,#d2c5aa)' : item.id === 'monochrome' ? 'linear-gradient(135deg,#080808,#3a3a3a 52%,#f7f7f7)' : item.id === 'sapphire' ? 'radial-gradient(ellipse at 78% 4%,rgba(59,130,246,.48),transparent 55%),linear-gradient(140deg,#12213e,#080d19 76%)' : 'radial-gradient(ellipse at 78% 4%,rgba(52,211,153,.42),transparent 55%),linear-gradient(140deg,#13291f,#07100c 76%)' })),
              ] as const).map((choice) => {
                const selected = s.settings.theme === choice.value;
                const milestone = EARNED_THEMES.find((item) => item.id === choice.value);
                const locked = !ownerAdmin && !isThemeUnlocked(choice.value, rewardPoints) && !selected;
                const detail = milestone ? ownerAdmin ? tr('Owner access') : `${tr(locked ? 'Unlock at' : 'Unlocked')} · ${milestone.points.toLocaleString(localeForLanguage(s.settings.language))} ${tr('points')}` : tr(choice.detail);
                return <button key={choice.value} type="button" aria-pressed={selected} aria-disabled={locked} title={locked ? `${tr('Unlock at')} ${milestone?.points.toLocaleString(localeForLanguage(s.settings.language))} ${tr('points')}` : undefined} disabled={locked} onClick={() => s.updateSettings({ theme: choice.value }, ownerAdmin)}
                  className={`theme-choice min-w-0 rounded-2xl border p-3 text-left transition duration-200 disabled:cursor-not-allowed disabled:opacity-65 ${selected ? 'is-selected border-indigo-500 ring-2 ring-indigo-500/25' : 'border-slate-200 hover:border-indigo-400/70 dark:border-white/10'}`}>
                  <span className="theme-preview relative mb-3 flex h-14 items-end gap-1.5 overflow-hidden rounded-xl border border-black/5 p-2 dark:border-white/10" style={{ background: choice.preview }} aria-hidden="true">
                    <span className="h-2/3 w-[17%] rounded-t bg-white/15 backdrop-blur-sm" />
                    <span className="h-full w-[17%] rounded-t bg-emerald-400/65" />
                    <span className="h-1/2 w-[17%] rounded-t bg-white/20" />
                    <span className="mb-1 h-1 w-[28%] rounded-full bg-white/55" />
                    {milestone && <span className="theme-preview-glow absolute -right-4 -top-5 h-16 w-16 rounded-full bg-indigo-300/35 blur-xl" />}
                  </span>
                  <span className="flex items-center justify-between gap-2 text-sm font-semibold"><span>{tr(choice.title)}</span>{selected && <Check size={16} className="shrink-0 text-indigo-500" aria-label={tr("Selected")} />}</span>
                  <span className="mt-1 block text-xs leading-5 muted">{detail}</span>
                </button>;
              })}
            </div>
          </div>
          <div className="sm:col-span-3"><label className="label">{tr("Short bio")}</label><textarea className="input min-h-20" placeholder={tr("What matters to you?")} value={s.settings.bio ?? ''} onChange={(e) => s.updateSettings({ bio: e.target.value || undefined })} /></div>
        </div>
      </section>

      <section className="card mb-6 p-6">
        <h3 className="mb-1 font-semibold">{tr("Categories")}</h3>
        <p className="mb-4 text-sm muted">{tr("Organize your life areas. Deleting a category moves its items to another.")}</p>
        <DndContext sensors={categorySensors} collisionDetection={closestCenter} onDragEnd={reorderCategory}>
          <SortableContext items={s.categories.map((category) => category.id)} strategy={rectSortingStrategy}>
            <div className="grid gap-2 sm:grid-cols-2">{s.categories.map((category) => <SortableCategoryRow key={category.id} category={category} count={s.items.filter((item) => item.categoryId === category.id).length} onUpdate={(patch) => s.updateCategory(category.id, patch)} onDelete={() => confirm(`Delete category "${category.name}"?`) && s.deleteCategory(category.id)} />)}</div>
          </SortableContext>
        </DndContext>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className="input !w-16 shrink-0 text-center" value={newCat.icon} onChange={(e) => setNewCat({ ...newCat, icon: e.target.value })} aria-label={tr("New category icon")} />
          <input type="color" className="h-10 w-10 shrink-0 cursor-pointer rounded-xl" value={newCat.color} onChange={(e) => setNewCat({ ...newCat, color: e.target.value })} aria-label={tr("New category color")} />
          <input className="input min-w-[120px] flex-1 basis-32" placeholder={tr("New category name")} value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} />
          <button className="btn-primary shrink-0" aria-label={tr("Add category")} onClick={() => { if (newCat.name.trim()) { s.addCategory(newCat); setNewCat({ name: '', icon: '⭐', color: '#6366f1' }); } }}><Plus size={16} /></button>
        </div>
      </section>

      <section className="card mb-6 p-6">
        <h3 className="mb-1 font-semibold">{tr("Import & export")}</h3>
        <p className="mb-4 text-sm muted">{tr("CSV import accepts a header row with:")}<code>title, category, status, priority, horizon, dueDate, tags, notes</code> {tr("— or just one title per line.")}</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline" onClick={() => beginBackup('json-export')}><Download size={16} /> {tr("Full backup (JSON)")}</button>
          <button className="btn-outline" onClick={() => beginBackup('csv-export')}><Download size={16} /> {tr("Library (CSV)")}</button>
          <button className="btn-outline" onClick={() => beginBackup('json-import')}><Upload size={16} /> {tr("Restore backup")}</button>
          <button className="btn-outline" onClick={() => beginBackup('csv-import')}><Upload size={16} /> {tr("Import CSV")}</button>
          <button className="btn-outline" onClick={() => { s.loadDemo(); setMsg('Demo data added.'); }}>{tr("Load demo data")}</button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && importJSON(e.target.files[0])} />
          <input ref={csvRef} type="file" accept=".csv,.txt" hidden onChange={(e) => e.target.files?.[0] && importCSV(e.target.files[0])} />
        </div>
      </section>

      <section className="card mb-6 flex min-w-0 flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center sm:p-5" aria-label={tr("Trash")}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300"><Trash2 size={16} /></span>
            <h3 className="font-semibold">{tr("Trash")}</h3>
          </div>
          <p className="mt-2 text-sm muted">{tr("Deleted items stay here until you restore them or permanently remove them.")}</p>
          <p className="mt-1 max-w-3xl text-xs muted">{tr("The summary shows only the count. Open Trash to review titles, types, and deletion dates, restore items or permanently delete them.")}</p>
        </div>
        <button className="btn-outline min-h-11 shrink-0 self-start sm:self-center" aria-label={`${tr("Trash")} · ${s.trash.length} ${tr("items")}`} title={tr("Trash")} onClick={() => navigate('/trash')}><Trash2 size={15} /><span className="tabular-nums">{s.trash.length}</span></button>
      </section>

      <section className="card mb-6 p-6">
        <h3 className="mb-2 flex items-center gap-2 font-semibold"><Lock size={16} /> {tr("Privacy")}</h3>
        <p className="text-sm muted">{user && cloudEnabled
          ? 'Your signed-in record is isolated from other user accounts by database row-level security. A verified system owner can access and edit account records for service administration. Uploaded photos are stored in a private bucket and shown with signed URLs. A copy also stays in this browser for offline use. Do not store passwords, payment details, government-ID numbers, or other secrets here.'
          : cloudEnabled
            ? 'Your data is saved on this device until you sign in. Cloud records are isolated by account, but a verified system owner can access and edit account records. Direct photo uploads require sign-in so they are never embedded in local JSON. Do not store passwords, payment details, government-ID numbers, or other secrets here.'
            : 'Your data is stored only in this browser. Configure cloud authentication to protect it in an account and sync across devices. Direct photo uploads require a private signed-in cloud account; external image URLs still work. Export a backup regularly.'}</p>
        {cloudEnabled && user && <div className={`mt-3 text-xs ${sync === 'error' ? 'text-rose-500' : 'muted'}`} role="status">
          {sync === 'error' ? `Cloud sync failed: ${syncError || 'Please retry.'}` : sync === 'saved' ? `Synced${lastSynced ? ` · ${new Date(lastSynced).toLocaleString(localeForLanguage(s.settings.language))}` : ''}` : sync === 'offline' ? 'Offline · changes remain on this device and will sync when connected.' : sync === 'saving' ? 'Saving to your private cloud account…' : sync === 'loading' ? 'Loading your private cloud data…' : 'Cloud sync is ready.'}
        </div>}
        <div className="mt-3 text-xs muted">{s.items.length} {tr("items ·")}{s.goals.length} {tr("goals ·")}{s.projects.length} {tr("projects ·")}{s.habits.length} {tr("habits ·")}{s.journal.length} {tr("journal entries ·")}{s.albums.length} {tr("albums")}</div>
        <button className="btn-danger mt-4" type="button" disabled={eraseBlocked || eraseBusy} title={eraseBlocked ? tr('Wait until cloud sync is saved before resetting your personal snapshot.') : undefined} onClick={openEraseDialog}><Trash2 size={16} /> {tr("Erase all data")}</button>
      </section>

      <section className="card p-6">
        <h3 className="mb-3 font-semibold">{tr("Keyboard shortcuts")}</h3>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {[['N', 'Quick add'], ['⌘/Ctrl + K', 'Search & command palette'], ['G then O/T/L/G/P/C/H/I/J/S', 'Go to page'], ['⌘/Ctrl + Enter', 'Submit quick add']].map(([k, v]) => (
            <div key={k} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 rounded-lg bg-slate-100 px-3 py-2 dark:bg-white/[.04]"><span className="min-w-0 break-words">{v}</span><kbd className="break-words text-right text-xs font-mono muted">{k}</kbd></div>
          ))}
        </div>
      </section>
      {backupAction && <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setBackupAction(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="backup-verify-title" className="card w-full max-w-md p-5 shadow-2xl">
          <h2 id="backup-verify-title" className="text-lg font-semibold">{tr('Verify it is you')}</h2>
          <p className="mt-1 text-sm muted">{tr('Fresh account verification is required before private data import or export.')}</p>
          {(user?.app_metadata?.providers?.includes('email') || user?.app_metadata?.providers?.includes('phone')) && <label className="mt-4 block"><span className="label">{tr('Account password')}</span><input className="input" type="password" autoComplete="current-password" value={backupPassword} onChange={(event) => setBackupPassword(event.target.value)} /></label>}
          {(!user?.app_metadata?.providers?.includes('email') || backupCodeSent) && <div className="mt-4"><button className="btn-outline mb-3 w-full" type="button" disabled={backupBusy || backupCodeSent} onClick={() => void verifyBackupIdentity()}>{backupCodeSent ? tr('Verification code sent') : tr('Send fresh verification code')}</button>{backupCodeSent && <label className="block"><span className="label">{tr('Verification code')}</span><input className="input" inputMode="numeric" autoComplete="one-time-code" value={backupOtp} onChange={(event) => setBackupOtp(event.target.value)} /></label>}</div>}
          {msg && <p className="mt-3 break-words text-sm muted" role="status">{msg}</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-2"><button className="btn-outline" type="button" disabled={backupBusy} onClick={() => setBackupAction(null)}>{tr('Cancel')}</button>{(user?.app_metadata?.providers?.includes('email') || user?.app_metadata?.providers?.includes('phone')) && <button className="btn-primary" type="button" disabled={backupBusy || !backupPassword} onClick={() => void verifyBackupIdentity()}>{backupBusy ? tr('Verifying…') : tr('Verify and continue')}</button>}{(!(user?.app_metadata?.providers?.includes('email') || user?.app_metadata?.providers?.includes('phone')) || backupCodeSent) && <button className="btn-primary" type="button" disabled={backupBusy || !backupOtp.trim()} onClick={() => void verifyBackupIdentity()}>{backupBusy ? tr('Verifying…') : tr('Verify and continue')}</button>}</div>
        </section>
      </div>}
      {eraseOpen && <div className="fixed inset-0 z-[120] grid place-items-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !eraseBusy) setEraseOpen(false); }}>
        <section id="erase-data-dialog" role="dialog" aria-modal="true" aria-labelledby="erase-data-title" aria-describedby="erase-data-description" className="card my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto p-5 shadow-2xl sm:p-6">
          <h2 id="erase-data-title" className="text-lg font-semibold text-rose-600 dark:text-rose-400">{tr('Erase all data')}</h2>
          <p id="erase-data-description" className="mt-2 text-sm leading-6 muted">{tr('This resets your personal Life OS snapshot on this device and, for signed-in cloud accounts, saves the empty snapshot to your account. It does not delete your Supabase Auth account.')}</p>
          <p className="mt-2 rounded-lg bg-amber-500/10 p-3 text-sm leading-6 text-amber-900 dark:text-amber-200">{tr('Separately stored public posts, shared workspaces, and media resources are outside this personal snapshot reset and are not deleted.')}</p>
          {eraseCloudAccount && <>
            <p className="mt-3 text-sm muted">{tr('Confirm your identity before resetting the cloud snapshot.')}</p>
            {erasePasswordAccount
              ? <label className="mt-3 block"><span className="label">{tr('Current account password')}</span><input className="input" type="password" autoComplete="current-password" value={erasePassword} onChange={(event) => setErasePassword(event.target.value)} disabled={eraseBusy} /></label>
              : <div className="mt-3">
                {!eraseCodeSent
                  ? <button type="button" className="btn-outline" disabled={eraseBusy} onClick={() => void erasePersonalSnapshot()}>{tr('Send fresh verification code')}</button>
                  : <label className="block"><span className="label">{tr('Verification code')}</span><input className="input" inputMode="numeric" autoComplete="one-time-code" value={eraseOtp} onChange={(event) => setEraseOtp(event.target.value)} disabled={eraseBusy} /></label>}
              </div>}
          </>}
          {!eraseCloudAccount && <label className="mt-4 block"><span className="label">{tr('Type this phrase to confirm:')} <strong>{tr('ERASE MY DATA')}</strong></span><input className="input" autoComplete="off" value={erasePhrase} onChange={(event) => setErasePhrase(event.target.value)} disabled={eraseBusy} /></label>}
          {eraseCloudAccount && sync !== 'saved' && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400" role="status">{tr('Reset is unavailable until cloud sync is saved and online.')}</p>}
          {eraseError && <p className="mt-3 break-words text-sm text-rose-600 dark:text-rose-400" role="alert">{eraseError}</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-2"><button ref={eraseCancelRef} className="btn-outline" type="button" disabled={eraseBusy} onClick={() => setEraseOpen(false)}>{tr('Cancel')}</button><button className="btn-danger" type="button" disabled={eraseBusy || eraseBlocked || (eraseCloudAccount ? (erasePasswordAccount ? !erasePassword : !eraseCodeSent || !eraseOtp.trim()) : erasePhrase !== tr('ERASE MY DATA'))} onClick={() => void erasePersonalSnapshot()}>{eraseBusy ? tr('Resetting…') : tr('Erase personal snapshot')}</button></div>
        </section>
      </div>}
      {importPreview && <div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setImportPreview(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="import-preview-title" className="card w-full max-w-lg p-5 shadow-2xl">
          <h2 id="import-preview-title" className="text-lg font-semibold">{tr('Review backup before import')}</h2>
          <p className="mt-1 break-words text-sm muted">{importPreview.format === 'json' ? tr('JSON backup') : tr('CSV library import')} · {tr('Choose merge to keep current records, or replace to replace the matching data.')}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{Object.entries(importPreview.counts).map(([key, count]) => <div key={key} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[.03]"><span className="block break-words capitalize muted">{key}</span><strong className="tabular-nums">{count}</strong></div>)}</div>
          <p className="mt-4 rounded-lg bg-amber-500/10 p-3 text-xs leading-5 text-amber-900 dark:text-amber-200">{importPreview.format === 'csv' ? tr('Replace affects only the Life Library items. Other account data stays unchanged.') : tr('Replace overwrites the listed account collections. Merge combines records by ID, with imported values taking precedence for matching IDs.')}</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2"><button className="btn-outline" type="button" onClick={() => setImportPreview(null)}>{tr('Cancel')}</button><button className="btn-outline" type="button" onClick={() => applyImport('merge')}>{tr('Merge')}</button><button className="btn-primary" type="button" onClick={() => applyImport('replace')}>{tr('Replace')}</button></div>
        </section>
      </div>}
    </div>
  );
}


function ProfilePhotoControl({ settings, userId, updateSettings }: { settings: SettingsData; userId?: string; updateSettings: (patch: Partial<SettingsData>) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | undefined>(settings.avatarUrl);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusIsError, setStatusIsError] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setImageFailed(false);
    if (!settings.avatarPath || !userId) {
      setPreview(settings.avatarUrl);
      return () => { active = false; };
    }
    setPreview(undefined);
    getPrivateImageUrl(userId, settings.avatarPath).then((url) => {
      if (active) setPreview(url);
    }).catch((error) => {
      if (!active) return;
      setPreview(settings.avatarUrl);
      setStatus(error instanceof Error ? error.message : 'Could not load your private profile photo.');
    });
    return () => { active = false; };
  }, [settings.avatarPath, settings.avatarUrl, userId]);

  const upload = async (file?: File) => {
    if (!file || busy) return;
    if (!userId) {
      setStatusIsError(true);
      setStatus('Sign in to upload a private profile photo.');
      return;
    }
    setBusy(true);
    setStatusIsError(false);
    setImageFailed(false);
    let localPreview: string | undefined;
    try {
      setStatus('Preparing and compressing photo on this device…');
      const compressed = await compressImage(file);
      localPreview = URL.createObjectURL(compressed.file);
      setPreview(localPreview);
      setStatus(`Compressed ${formatBytes(compressed.originalBytes)} to ${formatBytes(compressed.file.size)}. Uploading privately…`);
      const nextPath = await uploadPrivateImage(userId, compressed.file, 'avatars');
      const nextUrl = await getPrivateImageUrl(userId, nextPath);
      const oldPath = settings.avatarPath;
      updateSettings({ avatarPath: nextPath });
      setPreview(nextUrl);
      const synced = await syncNow();
      if (!synced) {
        setStatusIsError(true);
        setStatus('Photo uploaded privately, but account sync did not finish. Retry sync before closing this page; the previous photo was kept safe.');
        return;
      }
      if (oldPath) {
        try {
          await deletePrivateImage(userId, oldPath);
        } catch {
          setStatusIsError(true);
          setStatus('Profile photo updated, but the previous private file could not be removed.');
          return;
        }
      }
      setStatusIsError(false);
      setStatus('Private profile photo updated.');
    } catch (error) {
      setStatusIsError(true);
      setPreview(settings.avatarUrl);
      if (settings.avatarPath) getPrivateImageUrl(userId, settings.avatarPath).then(setPreview).catch(() => setImageFailed(true));
      setStatus(error instanceof Error ? error.message : 'Could not update your profile photo.');
    } finally {
      if (localPreview) URL.revokeObjectURL(localPreview);
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async () => {
    if (!settings.avatarPath && !settings.avatarUrl) return;
    if (!confirm('Remove your profile photo?')) return;
    if (settings.avatarPath) {
      if (!userId) {
        setStatus('Sign in to remove your private profile photo.');
        return;
      }
      setBusy(true);
      updateSettings({ avatarPath: undefined, avatarUrl: undefined });
      const synced = await syncNow();
      if (!synced) {
        setStatusIsError(true);
        setStatus('Photo was removed on this device, but account sync did not finish. Retry sync before closing this page; the private file was kept safe.');
        setBusy(false);
        return;
      }
      try {
        await deletePrivateImage(userId, settings.avatarPath);
      } catch (error) {
          setStatusIsError(true);
          setStatus(error instanceof Error ? error.message : 'Could not remove your private profile photo.');
        setBusy(false);
        return;
      }
    }
    updateSettings({ avatarPath: undefined, avatarUrl: undefined });
    setPreview(undefined);
    setStatusIsError(false);
    setStatus('Profile photo removed.');
    setBusy(false);
  };

  return <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] items-center gap-4 rounded-2xl border border-slate-200 p-4 dark:border-white/[.08] sm:flex">
    <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-indigo-500/15 text-indigo-500">{preview && !imageFailed ? <img src={preview} alt={tr("Profile preview")} onError={() => { setImageFailed(true); setStatusIsError(true); setStatus('Photo could not be displayed. Check your connection, reload the page, or upload again.'); }} className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <ImagePlus size={24} />}</div>
    <div className="min-w-0 sm:flex-1"><div className="font-medium">{tr("Profile photo")}</div><p className="mt-1 text-sm leading-5 muted">{tr("Choose a photo from your phone. JPEG, PNG, WebP, and browser-supported HEIC/HEIF are compressed on this device, then stored privately in your account.")}</p>{status && <p className={`mt-2 break-words text-xs ${statusIsError ? 'text-rose-600 dark:text-rose-400' : 'muted'}`} role={statusIsError ? 'alert' : 'status'}>{status}</p>}</div>
    <input ref={input} type="file" accept="image/*,.heic,.heif" hidden onChange={(e) => upload(e.target.files?.[0])} />
    <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-2 sm:col-auto"><button type="button" className="btn-outline" disabled={busy} onClick={() => input.current?.click()}><Upload size={16} /> {busy ? 'Saving…' : 'Save profile photo'}</button>
    {(settings.avatarPath || settings.avatarUrl) && <button type="button" className="btn-ghost text-rose-600 dark:text-rose-400" disabled={busy} onClick={remove} title={tr("Remove profile photo")}><Trash2 size={16} /> <span>{tr("Remove")}</span></button>}</div>
  </div>;
}
