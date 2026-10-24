import { translate as tr } from '../lib/locales';
import { BarChart3, CheckCircle2, Circle, Coffee, Pause, Play, RotateCcw, Settings2, Sparkles, Timer, Trophy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/ui';
import { useStore } from '../lib/store';
import type { FocusSession } from '../lib/types';
import { localeForLanguage, today } from '../lib/utils';
import { EARNED_THEMES } from '../lib/themes';

type Mode = 'focus' | 'short' | 'long';
type TimerConfig = { focus: number; short: number; long: number; longEvery: number };
const BASE_CONFIG: TimerConfig = { focus: 25, short: 5, long: 15, longEvery: 4 };
const configKey = 'life-os-pomodoro-config-v1';
const modeMinutes = (mode: Mode, config: TimerConfig) => mode === 'focus' ? config.focus : mode === 'short' ? config.short : config.long;
const clampMinutes = (n: number) => Math.max(1, Math.min(180, Math.round(n || 1)));

export default function Productivity() {
  const state = useStore();
  const [tab, setTab] = useState<'timer' | 'report' | 'settings'>('timer');
  const [mode, setMode] = useState<Mode>('focus');
  const [config, setConfig] = useState<TimerConfig>(() => {
    try { return { ...BASE_CONFIG, ...JSON.parse(localStorage.getItem(configKey) || '{}') }; } catch { return BASE_CONFIG; }
  });
  const [secondsLeft, setSecondsLeft] = useState(BASE_CONFIG.focus * 60);
  const [running, setRunning] = useState(false);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [cycles, setCycles] = useState(0);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState('');
  const [notice, setNotice] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const [timerKind, setTimerKind] = useState<'pomodoro' | 'stopwatch'>('pomodoro');
  const [stopwatchElapsed, setStopwatchElapsed] = useState(0);
  const [stopwatchStartedAt, setStopwatchStartedAt] = useState<number | null>(null);

  useEffect(() => {
    if (stopwatchStartedAt === null) return;
    const tick = () => setStopwatchElapsed(Date.now() - stopwatchStartedAt);
    tick(); const interval = window.setInterval(tick, 250); return () => window.clearInterval(interval);
  }, [stopwatchStartedAt]);

  useEffect(() => { localStorage.setItem(configKey, JSON.stringify(config)); }, [config]);
  useEffect(() => {
    if (!running || !endsAt) return;
    const tick = () => {
      const next = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setSecondsLeft(next);
      if (next <= 0) {
        setRunning(false); setEndsAt(null);
        if (mode === 'focus') {
          const endedAt = new Date().toISOString();
          const start = startedAt ?? new Date(Date.now() - modeMinutes(mode, config) * 60000).toISOString();
          const taskTitle = allTasks.find((task) => task.id === selectedTask)?.title;
          const distraction = Number(window.prompt('Optional: how many minutes felt distracting during this focus session? Enter 0 if none.', '0') ?? '0');
          const focusMinutes = modeMinutes(mode, config);
          const points = state.addFocusSession({ startedAt: start, endedAt, focusMinutes, distractionMinutes: Number.isFinite(distraction) ? distraction : 0, note: taskTitle ? `Task: ${taskTitle}` : undefined });
          setCycles((n) => n + 1); const nextMode: Mode = (cycles + 1) % config.longEvery === 0 ? 'long' : 'short'; setMode(nextMode); setSecondsLeft(modeMinutes(nextMode, config) * 60); setStartedAt(null);
          setNotice(`${tr('Focus complete')} · +${points} ${tr('points')}`);
          if (state.settings.sounds) { try { const audio = new AudioContext(); const oscillator = audio.createOscillator(); const gain = audio.createGain(); oscillator.connect(gain); gain.connect(audio.destination); oscillator.frequency.value = 660; gain.gain.value = .025; oscillator.start(); oscillator.stop(audio.currentTime + .16); oscillator.onended = () => void audio.close(); } catch { /* Audio is optional. */ } }
        } else { setMode('focus'); setSecondsLeft(config.focus * 60); setStartedAt(null); setNotice(tr('Break complete. Ready for another focus session?')); }
      }
    };
    tick(); const interval = window.setInterval(tick, 500); return () => window.clearInterval(interval);
  }, [running, endsAt, mode, config, startedAt, cycles, selectedTask, state]);

  const todayDate = today();
  const privateTasks = state.items.filter((item) => item.status !== 'done' && item.status !== 'dropped' && (item.todayDate === todayDate || item.dueDate === todayDate)).map((item) => ({ id: `item:${item.id}`, title: item.title, dueDate: item.dueDate, done: false, kind: 'library' as const }));
  const projectTasks = state.projects.flatMap((project) => project.tasks.filter((task) => !task.done && (task.dueDate === todayDate)).map((task) => ({ id: `project:${project.id}:${task.id}`, title: `${task.title} · ${project.title}`, dueDate: task.dueDate, done: task.done, kind: 'project' as const })));
  const allTasks = [...privateTasks, ...projectTasks];
  const rewardPoints = state.rewardEvents.reduce((sum, event) => sum + event.points, 0);
  const focusMinutes = state.focusSessions.reduce((sum, session) => sum + session.focusMinutes, 0);
  const distractionMinutes = state.focusSessions.reduce((sum, session) => sum + session.distractionMinutes, 0);
  const todaySessions = state.focusSessions.filter((session) => session.startedAt.slice(0, 10) === today());
  const todayMinutes = todaySessions.reduce((sum, session) => sum + session.focusMinutes, 0);
  const recentSessions = useMemo(() => [...state.focusSessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 40), [state.focusSessions]);
  const badges = [
    { title: 'First focus', earned: state.focusSessions.length > 0, detail: 'Complete your first focus session' },
    { title: 'Focus hour', earned: focusMinutes >= 60, detail: 'Focus for 60 minutes total' },
    { title: 'Routine builder', earned: state.rewardEvents.filter((event) => event.kind === 'habit').length >= 7, detail: 'Check in on 7 routine days' },
    { title: 'Getting things done', earned: state.rewardEvents.filter((event) => event.kind === 'task').length >= 5, detail: 'Complete 5 personal tasks' },
    { title: 'Momentum', earned: rewardPoints >= 500, detail: 'Earn 500 points' },
  ];
  const shareAchievements = async () => {
    const earnedBadges = badges.filter((badge) => badge.earned).map((badge) => tr(badge.title));
    const earnedMedals = EARNED_THEMES.filter((milestone) => rewardPoints >= milestone.points).map((milestone) => tr(milestone.title));
    const payload = `${tr('Productivity achievements')}\n${tr('Earned points')}: ${rewardPoints}\n${tr('Total focus minutes')}: ${focusMinutes}\n${tr('Earned badges')}: ${earnedBadges.length ? earnedBadges.join(', ') : tr('None')}\n${tr('Earned medals')}: ${earnedMedals.length ? earnedMedals.join(', ') : tr('None')}`;
    setShareStatus('');
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ text: payload }); setShareStatus(tr('Shared successfully.')); return; }
      catch (error) { if (error instanceof DOMException && error.name === 'AbortError') { setShareStatus(tr('Sharing canceled.')); return; } }
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(payload);
      setShareStatus(tr('Share is unavailable; summary copied to clipboard.'));
    } catch { setShareStatus(tr('Sharing and clipboard are unavailable.')); }
  };
  const display = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`;

  const setModeSafe = (next: Mode) => { if (running) return; setMode(next); setSecondsLeft(modeMinutes(next, config) * 60); setNotice(''); };
  const start = () => {
    if (secondsLeft <= 0) setSecondsLeft(modeMinutes(mode, config) * 60);
    if (mode === 'focus' && !startedAt) setStartedAt(new Date().toISOString());
    setEndsAt(Date.now() + Math.max(1, secondsLeft) * 1000); setRunning(true); setNotice('');
  };
  const reset = () => { setRunning(false); setEndsAt(null); setSecondsLeft(modeMinutes(mode, config) * 60); setStartedAt(null); };
  const saveConfig = (key: keyof TimerConfig, value: number) => { const next = { ...config, [key]: clampMinutes(value) }; setConfig(next); if (!running) setSecondsLeft(modeMinutes(mode, next) * 60); };

  return <div className="min-w-0">
    <PageHeader title={tr('Productivity')} subtitle={tr('Focus timer, personal tasks, progress reports, and earned rewards')} actions={<div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-white/10 dark:bg-white/[.04]" role="tablist" aria-label={tr('Productivity views')}>
      {([{ id: 'timer', label: tr('Pomodoro'), icon: Timer }, { id: 'report', label: tr('Report'), icon: BarChart3 }, { id: 'settings', label: tr('Settings'), icon: Settings2 }] as const).map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-label={label} title={label} aria-selected={tab === id} onClick={() => setTab(id)} className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 sm:px-2.5 text-sm ${tab === id ? 'bg-white font-semibold text-indigo-700 shadow-sm dark:bg-white/10 dark:text-indigo-200' : 'muted'}`}><Icon size={15} /><span className="hidden sm:inline">{label}</span></button>)}
    </div>} />
    {notice && <p className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200" role="status">{notice}</p>}
    {tab === 'timer' && <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,.75fr)]">
      <section className="card min-w-0 p-4 sm:p-7" aria-label={timerKind === 'pomodoro' ? tr('Pomodoro focus timer') : tr('Stopwatch')}>
        <div className="mx-auto max-w-xl text-center">
          <div className="mb-5 flex justify-center gap-2" role="tablist" aria-label={tr('Timer type')}>
            {([{ id: 'pomodoro', label: tr('Pomodoro'), icon: Timer }, { id: 'stopwatch', label: tr('Stopwatch'), icon: Play }] as const).map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-label={label} title={label} aria-selected={timerKind === id} onClick={() => setTimerKind(id)} className={`inline-flex h-12 min-h-12 w-12 items-center justify-center rounded-xl p-0 transition ${timerKind === id ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 dark:bg-white/[.06] dark:text-slate-200'}`}><Icon size={20} aria-hidden="true" /></button>)}
          </div>
          {timerKind === 'pomodoro' && <>
          <div className="mb-5 flex flex-wrap justify-center gap-2" role="tablist" aria-label={tr('Timer mode')}>
            {([{ id: 'focus', label: tr('Pomodoro'), icon: Timer }, { id: 'short', label: tr('Short break'), icon: Coffee }, { id: 'long', label: tr('Long break'), icon: Coffee }] as const).map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-label={label} title={label} aria-selected={mode === id} disabled={running} onClick={() => setModeSafe(id)} className={`inline-flex min-h-10 items-center justify-center gap-1 rounded-xl px-2 sm:px-3 py-2 text-sm font-medium ${mode === id ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 dark:bg-white/[.06] dark:text-slate-200'} disabled:opacity-70`}><Icon size={15} /><span className="hidden sm:inline">{label}</span></button>)}
          </div>
          <div className="relative mx-auto grid aspect-square w-[min(66vw,18rem)] place-items-center rounded-full" style={{ background: 'conic-gradient(#635BFF 0deg, #635BFF 2deg, transparent 2deg)', boxShadow: 'inset 0 0 0 10px rgba(148,163,184,.16)' }}>
            <div className="grid h-[calc(100%-1.2rem)] w-[calc(100%-1.2rem)] place-content-center rounded-full bg-white dark:bg-[#121722]"><span className="font-mono text-5xl font-semibold tabular-nums tracking-tight sm:text-6xl" aria-live="off">{display}</span><span className="mt-2 text-sm muted">{running ? tr('Time to focus!') : mode === 'focus' ? tr('Ready when you are') : tr('Take a gentle break')}</span></div>
          </div>
          <div className="mt-5 flex justify-center gap-2"><button type="button" className="btn-primary min-w-32 !px-6" onClick={running ? () => setRunning(false) : start}>{running ? <><Pause size={17} />{tr('Pause')}</> : <><Play size={17} />{tr('Start')}</>}</button><button type="button" className="btn-outline" onClick={running ? start : reset} aria-label={tr('Reset timer')}>{running ? <Play size={16} /> : <RotateCcw size={16} />}{running ? tr('Resume') : tr('Reset')}</button></div>
          <p className="mt-4 text-xs muted">{tr('Focus time is private to your account. Screen time in other apps must be self-reported.')}</p>
          </>}
          {timerKind === 'stopwatch' && <>
            <div className="mx-auto grid aspect-square w-[min(66vw,18rem)] place-items-center rounded-full" style={{ boxShadow: 'inset 0 0 0 10px rgba(148,163,184,.16)' }}><div className="grid h-[calc(100%-1.2rem)] w-[calc(100%-1.2rem)] place-content-center rounded-full bg-white dark:bg-[#121722]"><span className="font-mono text-5xl font-semibold tabular-nums tracking-tight sm:text-6xl" aria-live="off">{`${String(Math.floor(stopwatchElapsed / 60000)).padStart(2, '0')}:${String(Math.floor(stopwatchElapsed / 1000) % 60).padStart(2, '0')}`}</span><span className="mt-2 text-sm muted">{stopwatchStartedAt === null ? tr('Ready when you are') : tr('Stopwatch')}</span></div></div>
            <div className="mt-5 flex justify-center gap-2"><button type="button" className="btn-primary min-w-32 !px-6" aria-label={stopwatchStartedAt === null ? tr('Start') : tr('Pause')} onClick={() => setStopwatchStartedAt(stopwatchStartedAt === null ? Date.now() - stopwatchElapsed : null)}>{stopwatchStartedAt === null ? <><Play size={17} />{stopwatchElapsed ? tr('Resume') : tr('Start')}</> : <><Pause size={17} />{tr('Pause')}</>}</button><button type="button" className="btn-outline" aria-label={tr('Reset stopwatch')} onClick={() => { setStopwatchStartedAt(null); setStopwatchElapsed(0); }}><RotateCcw size={16} /><span className="hidden sm:inline">{tr('Reset')}</span></button></div>
            <p className="mt-4 text-xs muted">{tr('Stopwatch time is not saved as a focus session or awarded points.')}</p>
          </>}
        </div>
      </section>
      <section className="card min-w-0 p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="font-semibold">{tr('Tasks')}</h2><p className="text-xs muted">{tr('Private personal work for this session')}</p></div><Sparkles size={18} className="text-indigo-500" /></div>
        <label className="label" htmlFor="focus-task">{tr('Focus on')}</label><select id="focus-task" className="input mb-3" value={selectedTask} onChange={(event) => setSelectedTask(event.target.value)}><option value="">{tr('Choose a task (optional)')}</option>{allTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select>
        <div className="max-h-[24rem] space-y-1 overflow-y-auto">{allTasks.slice(0, 30).map((task) => {
          const [kind, parent, taskId] = task.id.split(':');
          return <div key={task.id} className="flex min-w-0 items-start gap-2 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-white/[.03]"><button type="button" aria-label={tr('Complete task')} className="mt-0.5 shrink-0 text-slate-500 hover:text-emerald-600" onClick={() => { if (kind === 'item') state.toggleItemDone(parent); else if (taskId) state.updateTask(parent, taskId, { done: true }); }}><Circle size={18} /></button><span className="min-w-0 flex-1 break-words text-sm">{task.title}</span>{task.dueDate && <time className="shrink-0 text-xs muted" dateTime={task.dueDate}>{task.dueDate}</time>}</div>;
        })}{!allTasks.length && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm muted">{tr('No open tasks yet. Add a task in your Life Library or Projects.')}</p>}</div>
      </section>
    </div>}
    {tab === 'report' && <div className="space-y-4">{shareStatus && <p className="text-sm muted" role="status" aria-live="polite">{shareStatus}</p>}<div className="flex justify-end"><button type="button" className="btn-outline min-h-10" onClick={shareAchievements}>{tr('Share')}</button></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      [tr('Focus today'), `${todayMinutes} ${tr('min')}`], [tr('Focus all time'), `${focusMinutes} ${tr('min')}`], [tr('Self-reported distraction'), `${distractionMinutes} ${tr('min')}`], [tr('Earned points'), rewardPoints.toLocaleString(localeForLanguage(state.settings.language))]
    ].map(([label, value]) => <section key={label} className="card min-w-0 p-4"><p className="text-sm muted">{label}</p><p className="mt-2 break-words text-2xl font-semibold tabular-nums">{value}</p></section>)}</div>
      <section className="card min-w-0 p-4 sm:p-5"><h2 className="mb-3 flex items-center gap-2 font-semibold"><BarChart3 size={18} />{tr('Recent focus sessions')}</h2>{recentSessions.length ? <div className="divide-y divide-slate-200 dark:divide-white/10">{recentSessions.map((session: FocusSession) => <div key={session.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-3"><div className="min-w-0"><p className="break-words text-sm font-medium">{session.focusMinutes} {tr('min focused')} · {session.distractionMinutes} {tr('min distraction')}</p><time className="text-xs muted" dateTime={session.startedAt}>{new Date(session.startedAt).toLocaleString(localeForLanguage(state.settings.language))}</time>{session.note && <p className="mt-1 break-words text-xs muted">{session.note}</p>}</div><span className="chip shrink-0 bg-indigo-500/10 text-indigo-700 dark:text-indigo-200">+{session.pointsAwarded} {tr('points')}</span></div>)}</div> : <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm muted">{tr('Your focus sessions and progress will appear here.')}</p>}</section>
      <section className="card min-w-0 p-4 sm:p-5"><h2 className="mb-2 flex items-center gap-2 font-semibold"><Trophy size={18} className="text-amber-500" />{tr('Rewards & milestones')}</h2><p className="text-sm muted">{tr('Focus earns 1 point per minute. Personal tasks earn 15 points, due-soon tasks 25, and habits 5. Repeated completions do not award points again.')}</p><div className="mt-3 flex flex-wrap gap-2">{badges.map((badge) => <span key={badge.title} title={tr(badge.detail)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${badge.earned ? 'border-amber-400/50 bg-amber-100 text-amber-900 dark:bg-amber-400/10 dark:text-amber-200' : 'border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-400'}`}>{badge.earned ? '🏅 ' : '○ '}{tr(badge.title)}</span>)}</div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${Math.min(100, rewardPoints / 500)}%` }} /></div><p className="mt-2 text-sm font-medium">{rewardPoints.toLocaleString(localeForLanguage(state.settings.language))} / 50,000 {tr('points for Emerald Night')}</p><div className="mt-3 max-h-56 space-y-1 overflow-y-auto">{state.rewardEvents.slice().reverse().slice(0, 40).map((event) => <p key={event.id} className="flex justify-between gap-2 rounded-lg px-2 py-1.5 text-sm"><span className="min-w-0 break-words">{event.title}</span><span className="shrink-0 font-medium text-indigo-600 dark:text-indigo-300">+{event.points}</span></p>)}</div></section>
      <section className="card min-w-0 p-4 sm:p-5"><h2 className="mb-3 flex items-center gap-2 font-semibold"><Trophy size={18} className="text-amber-500" />{tr('Awards & theme unlocks')}</h2><div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">{EARNED_THEMES.map((milestone, index) => { const earned = rewardPoints >= milestone.points; const progress = Math.min(100, rewardPoints / milestone.points * 100); return <article key={milestone.id} className={`min-w-0 rounded-xl border p-3 transition ${earned ? 'border-amber-400/45 bg-gradient-to-br from-amber-100/80 to-white dark:from-amber-400/10 dark:to-white/[.02]' : 'border-slate-200 bg-slate-50/70 dark:border-white/10 dark:bg-white/[.025]'}`}><div className="flex items-center justify-between gap-2"><span className={`grid h-9 w-9 place-items-center rounded-xl ${earned ? 'bg-amber-400/20 text-amber-700 dark:text-amber-200' : 'bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-400'}`}><Trophy size={17} /></span><span className="text-[11px] font-semibold uppercase tracking-wide muted">{earned ? tr('Unlocked') : `#${index + 1}`}</span></div><h3 className="mt-3 break-words text-sm font-semibold">{tr(milestone.title)}</h3><p className="mt-1 text-xs muted">{milestone.points.toLocaleString(localeForLanguage(state.settings.language))} {tr('points')}</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"><div className={`h-full rounded-full transition-all ${earned ? 'bg-amber-500' : 'bg-indigo-500'}`} style={{ width: `${progress}%` }} /></div></article>; })}</div></section>
    </div>}
    {tab === 'settings' && <section className="card max-w-2xl p-4 sm:p-6"><h2 className="mb-1 font-semibold">{tr('Pomodoro settings')}</h2><p className="mb-4 text-sm muted">{tr('Choose session lengths. The countdown stays accurate when your phone locks or Safari suspends the tab.')}</p><div className="grid gap-4 sm:grid-cols-2">{([{ key: 'focus', label: tr('Focus minutes') }, { key: 'short', label: tr('Short break minutes') }, { key: 'long', label: tr('Long break minutes') }, { key: 'longEvery', label: tr('Long break after focus sessions') }] as const).map(({ key, label }) => <label key={key} className="min-w-0"><span className="label">{label}</span><input className="input" type="number" inputMode="numeric" min="1" max="180" value={config[key]} onChange={(event) => saveConfig(key, Number(event.target.value))} /></label>)}</div><p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm muted dark:bg-white/[.04]">{tr('Focus and self-reported distraction logs are private account data. This website cannot read iPhone Screen Time or activity in other apps.')}</p></section>}
  </div>;
}
