import { translate as tr } from '../lib/locales';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Flame, GraduationCap, Loader2, Lock, Mail, Phone, Repeat, ShieldCheck, Target } from 'lucide-react';
import './Auth.css';
import { FormEvent, useState } from 'react';
import { APP_NAME, Logo } from '../components/Brand';
import { auth, friendlyAuthError, isEmail, isPhone, normalizePhone, passwordIssues, passwordScore, useAuth } from '../lib/auth';
import { cx } from '../lib/utils';

type Mode = 'signin' | 'signup' | 'reset' | 'verify-phone' | 'check-email';
type Method = 'email' | 'phone';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

export default function AuthPage() {
  const setGuest = useAuth((s) => s.setGuest);
  const startupIssue = useAuth((s) => s.syncError?.startsWith('Sign-in check is taking longer') ? s.syncError : '');
  const [mode, setMode] = useState<Mode>('signin');
  const [method, setMethod] = useState<Method>('email');
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const go = (m: Mode) => { setMode(m); setErr(''); setInfo(''); };
  const idValid = method === 'email' ? isEmail(id) : isPhone(id);
  const issues = passwordIssues(pw);
  const score = passwordScore(pw);

  const run = async (fn: () => Promise<{ error: any } | any>) => {
    setBusy(true); setErr(''); setInfo('');
    try {
      const r = await fn();
      if (r?.error) setErr(friendlyAuthError(r.error.message));
      return r;
    } catch (e: any) { setErr(friendlyAuthError(e?.message)); }
    finally { setBusy(false); }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'reset') {
      if (!isEmail(id)) return setErr('Enter a valid email address.');
      const r = await run(() => auth.resetPassword(id.trim()));
      if (r && !r.error) setInfo('If an account exists, a reset link is on its way to your inbox.');
      return;
    }
    if (mode === 'verify-phone') {
      if (!/^\d{6}$/.test(code)) return setErr('Enter the 6-digit code.');
      await run(() => auth.verifyPhone(normalizePhone(id), code));
      return;
    }
    if (!idValid) return setErr(method === 'email' ? 'Enter a valid email address.' : 'Enter your phone number with country code, e.g. +86 138 0000 0000.');
    if (mode === 'signin') {
      if (!pw) return setErr('Enter your password.');
      await run(() => (method === 'email' ? auth.signInEmail(id.trim(), pw) : auth.signInPhone(normalizePhone(id), pw)));
      return;
    }
    if (!name.trim()) return setErr('Please enter your name.');
    if (issues.length) return setErr('Password needs ' + issues.join(', ') + '.');
    if (pw !== pw2) return setErr('Passwords do not match.');
    const r = await run(() => (method === 'email' ? auth.signUpEmail(id.trim(), pw, name.trim()) : auth.signUpPhone(normalizePhone(id), pw, name.trim())));
    if (r && !r.error) {
      if (r.data?.session) return;
      go(method === 'email' ? 'check-email' : 'verify-phone');
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-bg" aria-hidden="true"><span /><span /><span /><i className="auth-grid" /></div>
      <aside className="auth-showcase" aria-hidden="true">
        <div className="flex items-center gap-3"><Logo size={44} /><span className="text-xl font-extrabold tracking-tight">{APP_NAME}</span></div>
        <h2 className="auth-showcase-title">{tr('Your goals, habits, projects and memories — in one calm place.')}</h2>
        <ul className="auth-features">
          <li><Target size={18} /> {tr('Goals with milestones and progress')}</li>
          <li><Repeat size={18} /> {tr('Habits, streaks and daily check-ins')}</li>
          <li><GraduationCap size={18} /> {tr('Study Studio with a focus room')}</li>
          <li><ShieldCheck size={18} /> {tr('Private by default, synced to your account')}</li>
        </ul>
        <div className="auth-preview">
          <div className="auth-preview-card">
            <div className="auth-preview-head"><span>{tr('Good morning')}</span><i /><i /><i /></div>
            <div className="auth-preview-body">
              <svg className="auth-rings" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="50" className="trk" /><circle cx="60" cy="60" r="50" className="arc a" />
                <circle cx="60" cy="60" r="36" className="trk" /><circle cx="60" cy="60" r="36" className="arc b" />
                <circle cx="60" cy="60" r="22" className="trk" /><circle cx="60" cy="60" r="22" className="arc c" />
              </svg>
              <div className="auth-preview-side">
                <div className="auth-habits">{Array.from({ length: 21 }, (_, i) => <i key={i} className={[0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 14, 15, 16, 18, 19, 20].includes(i) ? 'on' : ''} style={{ animationDelay: `${i * 40}ms` }} />)}</div>
                <div className="auth-bars">{[40, 65, 30, 85, 55, 75, 95].map((h, i) => <i key={i} style={{ height: `${h}%`, animationDelay: `${300 + i * 70}ms` }} />)}</div>
              </div>
            </div>
          </div>
          <div className="auth-float auth-float-1"><Flame size={18} className="text-orange-400" /><div><b>{tr('6 day streak')}</b><small>{tr('Morning workout')}</small></div></div>
          <div className="auth-float auth-float-2"><CheckCircle2 size={18} className="text-emerald-400" /><div><b>{tr('Today: 4 of 5 done')}</b><small>{tr('Nice work')}</small></div></div>
        </div>
      </aside>
      <div className="auth-panel">
        <div className="auth-mobile-hero mb-6 flex flex-col items-center text-center lg:hidden">
          <div className="auth-mobile-mark"><Logo size={68} /><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="56" className="arc a" /><circle cx="60" cy="60" r="56" className="arc b" /></svg></div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{APP_NAME}</h1>
          <p className="mt-1 text-sm muted">{tr("A personal system for everything that matters")}</p>
        </div>
        <div className="mb-6 hidden lg:block">
          <h1 className="text-3xl font-extrabold tracking-tight">{mode === 'signup' ? tr('Create your account') : tr('Welcome back')}</h1>
          <p className="mt-1 text-sm muted">{tr("A personal system for everything that matters")}</p>
        </div>
        <div className="auth-card card p-6">
          {startupIssue && <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-100" role="status"><span>{startupIssue}</span><button type="button" className="underline underline-offset-2" onClick={() => window.location.reload()}>{tr("Retry check")}</button></div>}
          {mode === 'check-email' ? (
            <div className="space-y-4 text-center">
              <Mail className="mx-auto text-indigo-500" size={36} />
              <h2 className="text-lg font-semibold">{tr("Confirm your email")}</h2>
              <p className="text-sm muted">{tr("We sent a confirmation link to")}<b>{id}</b>{tr(". Open it to activate your account, then sign in.")}</p>
              <button className="btn-outline w-full" onClick={() => go('signin')}>{tr("Back to sign in")}</button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              {(mode === 'reset' || mode === 'verify-phone') && (
                <button type="button" className="btn-ghost -ml-2 !px-2" onClick={() => go('signin')}><ArrowLeft size={16} /> {tr("Back")}</button>
              )}
              {(mode === 'signin' || mode === 'signup') && (
                <>
                  <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 dark:bg-white/[.05]">
                    {(['signin', 'signup'] as const).map((m) => (
                      <button key={m} type="button" onClick={() => go(m)}
                        className={cx('auth-tab rounded-lg py-2 text-sm font-medium transition', mode === m ? 'is-active bg-white shadow dark:bg-white/10' : 'muted')}>
                        {m === 'signin' ? 'Sign in' : 'Create account'}
                      </button>
                    ))}
                  </div>
                  <button type="button" disabled={busy} onClick={() => run(() => auth.google())}
                    className="btn w-full border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[.04] dark:text-slate-100 dark:hover:bg-white/[.08]">
                    <GoogleIcon /> {tr("Continue with Google")}</button>
                  <div className="flex items-center gap-3 text-xs muted"><span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />{tr("or")}<span className="h-px flex-1 bg-slate-200 dark:bg-white/10" /></div>
                  <div className="flex gap-2">
                    {(['email', 'phone'] as const).map((m) => (
                      <button key={m} type="button" onClick={() => { setMethod(m); setId(''); setErr(''); }}
                        className={cx('chip px-3 py-1.5 text-sm', method === m ? 'bg-indigo-600 text-white' : 'bg-slate-200/60 dark:bg-white/[.06]')}>
                        {m === 'email' ? <Mail size={14} /> : <Phone size={14} />} {m === 'email' ? 'Email' : 'Phone number'}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {mode === 'reset' && <div><h2 className="text-lg font-semibold">{tr("Reset your password")}</h2><p className="text-sm muted">{tr("Enter your account email and we'll send you a secure link.")}</p></div>}
              {mode === 'verify-phone' && <div><h2 className="text-lg font-semibold">{tr("Verify your phone")}</h2><p className="text-sm muted">{tr("Enter the 6-digit code we sent to")}<b>{normalizePhone(id)}</b>.</p></div>}
              {mode === 'signup' && (
                <div><label className="label">{tr("Your name")}</label><input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("Abdullah")} /></div>
              )}
              {mode !== 'verify-phone' && (
                <div>
                  <label className="label">{mode === 'reset' || method === 'email' ? 'Email' : 'Phone number'}</label>
                  <input className={cx('input', id && !(mode === 'reset' ? isEmail(id) : idValid) && '!border-rose-400')}
                    type={mode === 'reset' || method === 'email' ? 'email' : 'tel'}
                    autoComplete={mode === 'reset' || method === 'email' ? 'email' : 'tel'}
                    value={id} onChange={(e) => setId(e.target.value)}
                    placeholder={mode === 'reset' || method === 'email' ? 'you@example.com' : '+86 138 0000 0000'} />
                </div>
              )}
              {mode === 'verify-phone' && (
                <input className="input text-center font-mono text-2xl tracking-[.5em]" inputMode="numeric" maxLength={6} autoFocus
                  value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="••••••" />
              )}
              {(mode === 'signin' || mode === 'signup') && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="label">{tr("Password")}</label>
                    {mode === 'signin' && method === 'email' && <button type="button" className="mb-1 text-xs text-indigo-500 hover:underline" onClick={() => go('reset')}>{tr("Forgot password?")}</button>}
                  </div>
                  <div className="relative">
                    <input className="input pr-10" type={show ? 'text' : 'password'} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" />
                    <button type="button" className="absolute right-2 top-2 muted" onClick={() => setShow(!show)} aria-label={tr("Show password")}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                  </div>
                  {mode === 'signup' && pw && (
                    <div className="mt-2">
                      <div className="flex gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={cx('h-1.5 flex-1 rounded-full', i < score ? ['bg-rose-500', 'bg-orange-500', 'bg-amber-400', 'bg-emerald-500'][score - 1] : 'bg-slate-200 dark:bg-white/10')} />)}</div>
                      {issues.length > 0 && <p className="mt-1 text-xs muted">{tr("Needs")} {issues.join(', ')}.</p>}
                    </div>
                  )}
                </div>
              )}
              {mode === 'signup' && (
                <div><label className="label">{tr("Confirm password")}</label><input className={cx('input', pw2 && pw2 !== pw && '!border-rose-400')} type={show ? 'text' : 'password'} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="••••••••" /></div>
              )}
              {err && <div className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">{err}</div>}
              {info && <div className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">{info}</div>}
              <button className="btn-primary w-full py-2.5" disabled={busy}>
                {busy && <Loader2 size={16} className="animate-spin" />}
                {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Verify'}
              </button>
            </form>
          )}
        </div>
        <button className="mx-auto mt-4 block text-xs muted underline-offset-2 hover:underline" onClick={() => setGuest(true)}>
          <Lock size={11} className="mr-1 inline" />{tr("Continue without an account (saved on this device only)")}</button>
        <a href="#/public" className="mx-auto mt-2 block text-center text-xs text-indigo-500 hover:underline">{tr("Read public journals")}</a>
      </div>
    </div>
  );
}

export function SetNewPassword() {
  const setRecovery = useAuth((s) => s.setRecovery);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const issues = passwordIssues(pw);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (issues.length) return setErr('Password needs ' + issues.join(', ') + '.');
    setBusy(true);
    const { error } = await auth.updatePassword(pw);
    setBusy(false);
    if (error) setErr(friendlyAuthError(error.message)); else setRecovery(false);
  };
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form onSubmit={save} className="card w-full max-w-sm space-y-4 p-6">
        <div className="text-center"><Logo size={48} /><h2 className="mt-2 text-lg font-semibold">{tr("Choose a new password")}</h2></div>
        <input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={tr("New password")} autoFocus />
        {pw && issues.length > 0 && <p className="text-xs muted">{tr("Needs")} {issues.join(', ')}.</p>}
        {err && <div className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{err}</div>}
        <button className="btn-primary w-full" disabled={busy}>{tr("Save password")}</button>
      </form>
    </div>
  );
}
