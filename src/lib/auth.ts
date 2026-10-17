import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useStore } from './store';
import { cloudEnabled, supabase } from './supabase';

export type SyncStatus = 'off' | 'loading' | 'saving' | 'saved' | 'error' | 'offline';

interface AuthState {
  ready: boolean;
  session: Session | null;
  user: User | null;
  guest: boolean; // chose "use without account" (this device only)
  sync: SyncStatus;
  lastSynced?: string;
  recovery: boolean; // arrived from a password-reset link
  setGuest: (g: boolean) => void;
  setRecovery: (r: boolean) => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      ready: !cloudEnabled,
      session: null,
      user: null,
      guest: false,
      sync: 'off',
      recovery: false,
      setGuest: (guest) => set({ guest }),
      setRecovery: (recovery) => set({ recovery }),
    }),
    { name: 'life-circle-auth', partialize: (s) => ({ guest: s.guest }) },
  ),
);

/* ------------------------------------------------------------------ */
/* Cloud sync: one JSON document per user, protected by RLS.           */
/* ------------------------------------------------------------------ */

const snapshot = () => {
  const { categories, items, goals, projects, habits, journal, albums, settings } = useStore.getState();
  return { version: 3, categories, items, goals, projects, habits, journal, albums, settings };
};

let unsubscribe: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let applyingRemote = false;
let currentUserId: string | null = null;

async function pushNow() {
  if (!supabase || !currentUserId) return;
  if (!navigator.onLine) { useAuth.setState({ sync: 'offline' }); return; }
  useAuth.setState({ sync: 'saving' });
  const { error } = await supabase
    .from('life_data')
    .upsert({ user_id: currentUserId, data: snapshot(), updated_at: new Date().toISOString() });
  useAuth.setState(error ? { sync: 'error' } : { sync: 'saved', lastSynced: new Date().toISOString() });
  if (error) console.error('Sync failed', error);
}

function schedulePush() {
  if (applyingRemote) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(pushNow, 1200);
}

export async function syncNow() { if (timer) clearTimeout(timer); await pushNow(); }

async function startSync(userId: string) {
  if (!supabase) return;
  if (currentUserId === userId && unsubscribe) return;
  stopSync();
  currentUserId = userId;
  useAuth.setState({ sync: 'loading' });

  const { data, error } = await supabase.from('life_data').select('data, updated_at').eq('user_id', userId).maybeSingle();
  if (error) { useAuth.setState({ sync: 'error' }); console.error(error); return; }

  // Which account does the data in this browser belong to?
  const localOwner = localStorage.getItem('life-circle-owner');

  if (data?.data && Object.keys(data.data).length) {
    applyingRemote = true;
    useStore.getState().importAll(data.data);
    applyingRemote = false;
    useAuth.setState({ sync: 'saved', lastSynced: data.updated_at });
  } else {
    // First sign-in for this account: keep guest data from this device (if it isn't someone else's).
    if (localOwner && localOwner !== userId) useStore.getState().resetAll();
    await pushNow();
  }
  localStorage.setItem('life-circle-owner', userId);
  unsubscribe = useStore.subscribe(schedulePush);
}

function stopSync() {
  unsubscribe?.();
  unsubscribe = null;
  if (timer) clearTimeout(timer);
  currentUserId = null;
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

export function initAuth() {
  if (!supabase) return;
  supabase.auth.getSession().then(({ data }) => {
    useAuth.setState({ session: data.session, user: data.session?.user ?? null, ready: true });
    if (data.session) startSync(data.session.user.id);
  });
  supabase.auth.onAuthStateChange((event, session) => {
    useAuth.setState({ session, user: session?.user ?? null, ready: true });
    if (event === 'PASSWORD_RECOVERY') useAuth.setState({ recovery: true });
    if (session) { useAuth.setState({ guest: false }); startSync(session.user.id); }
    if (event === 'SIGNED_OUT') stopSync();
  });
  window.addEventListener('online', () => currentUserId && pushNow());
  window.addEventListener('beforeunload', () => { if (timer) pushNow(); });
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

const redirectTo = () => window.location.origin + window.location.pathname;

export const auth = {
  google: () => supabase!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } }),
  signUpEmail: (email: string, password: string, name: string) =>
    supabase!.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo(), data: { full_name: name } } }),
  signInEmail: (email: string, password: string) => supabase!.auth.signInWithPassword({ email, password }),
  signUpPhone: (phone: string, password: string, name: string) =>
    supabase!.auth.signUp({ phone, password, options: { data: { full_name: name } } }),
  verifyPhone: (phone: string, token: string) => supabase!.auth.verifyOtp({ phone, token, type: 'sms' }),
  signInPhone: (phone: string, password: string) => supabase!.auth.signInWithPassword({ phone, password }),
  resetPassword: (email: string) => supabase!.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() }),
  updatePassword: (password: string) => supabase!.auth.updateUser({ password }),
  async signOut() {
    await syncNow();
    await supabase!.auth.signOut();
    // Remove this account's data from the device so the next person can't see it.
    useStore.getState().resetAll();
    localStorage.removeItem('life-circle-owner');
  },
  async deleteAccount() {
    const { error } = await supabase!.rpc('delete_my_account');
    if (error) throw error;
    stopSync();
    await supabase!.auth.signOut();
    useStore.getState().resetAll();
    localStorage.removeItem('life-circle-owner');
  },
};

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
export const normalizePhone = (v: string) => {
  const d = v.replace(/[^\d+]/g, '');
  return d.startsWith('+') ? d : d.startsWith('00') ? '+' + d.slice(2) : d ? '+' + d : '';
};
export const isPhone = (v: string) => /^\+[1-9]\d{7,14}$/.test(normalizePhone(v));

export function passwordIssues(pw: string) {
  const issues: string[] = [];
  if (pw.length < 8) issues.push('at least 8 characters');
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) issues.push('upper and lower case letters');
  if (!/\d/.test(pw)) issues.push('a number');
  return issues;
}
export const passwordScore = (pw: string) =>
  Math.min(4, [pw.length >= 8, /[a-z]/.test(pw) && /[A-Z]/.test(pw), /\d/.test(pw), /[^A-Za-z0-9]/.test(pw), pw.length >= 12].filter(Boolean).length);

export function friendlyAuthError(msg?: string) {
  if (!msg) return 'Something went wrong. Please try again.';
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'Wrong email/phone or password.';
  if (m.includes('email not confirmed')) return 'Please confirm your email first — check your inbox.';
  if (m.includes('already registered') || m.includes('already exists')) return 'An account with this email/phone already exists. Try signing in.';
  if (m.includes('unsupported provider') || (m.includes('google') && m.includes('provider'))) return 'Google sign-in is not enabled in the project yet. Use email sign-in for now, or ask the project owner to enable Google under Supabase → Authentication → Sign In / Providers.';
  if (m.includes('phone') && m.includes('provider')) return 'Phone sign-up is not enabled yet on this server. Use email sign-up, or enable Phone under Supabase → Authentication → Sign In / Providers.';
  if (m.includes('rate limit')) return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('token') && m.includes('expired')) return 'That code has expired. Request a new one.';
  return msg;
}
