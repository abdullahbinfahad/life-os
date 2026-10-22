import { translate as tr } from '../lib/locales';
import { ArrowLeft, Eye, EyeOff, Loader2, Lock, Mail, Phone, ShieldCheck } from 'lucide-react';
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
  const [adminAccessAck, setAdminAccessAck] = useState(false);
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
    if ((mode === 'signin' || mode === 'signup') && !adminAccessAck) return setErr('Please read and acknowledge the account privacy notice to continue.');
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
    <div className="relative grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={64} />
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{APP_NAME}</h1>
          <p className="mt-1 text-sm muted">{tr("A personal system for everything that matters")}</p>
        </div>
        <div className="card p-6">
          {startupIssue && <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-100" role="status"><span>{startupIssue}</span><button type="button" className="underline underline-offset-2" onClick={() => window.location.reload()}>{tr("Retry check")}</button></div>}
          {(mode === 'signin' || mode === 'signup') && <label className="mb-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs leading-5 dark:border-white/10 dark:bg-white/[.025]">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600" checked={adminAccessAck} onChange={(event) => setAdminAccessAck(event.target.checked)} />
            <span><strong className="font-semibold">{tr("Account privacy notice.")}</strong> {tr("Your records are isolated from other users. A verified system owner can access and edit account records for service administration. Do not store passwords, payment details, government-ID numbers, or other secrets here.")}</span>
          </label>}
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
                        className={cx('rounded-lg py-2 text-sm font-medium transition', mode === m ? 'bg-white shadow dark:bg-white/10' : 'muted')}>
                        {m === 'signin' ? 'Sign in' : 'Create account'}
                      </button>
                    ))}
                  </div>
                  <button type="button" disabled={busy || !adminAccessAck} onClick={() => run(() => auth.google())}
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
                      {issues.length > 0 && <p className="mt-1 text-xs muted">{tr("Needs")}{issues.join(', ')}.</p>}
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
        <div className="mt-4 flex items-start gap-2 px-2 text-xs muted">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-500" />
          <span>{tr("Your data is private to your account. It's encrypted in transit (HTTPS) and at rest, and database rules make sure only you can read or change it.")}</span>
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
        {pw && issues.length > 0 && <p className="text-xs muted">{tr("Needs")}{issues.join(', ')}.</p>}
        {err && <div className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{err}</div>}
        <button className="btn-primary w-full" disabled={busy}>{tr("Save password")}</button>
      </form>
    </div>
  );
}
