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
  syncError?: string;
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
  const { categories, items, goals, projects, habits, journal, albums, settings, trash } = useStore.getState();
  return { version: 4, categories, items, goals, projects, habits, journal, albums, settings, trash };
};

let unsubscribe: (() => void) | null = null;
let realtimeChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let applyingRemote = false;
let currentUserId: string | null = null;
let changeRevision = 0;
let syncedRevision = 0;
let pushPromise: Promise<boolean> | null = null;

function syncErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as any)?.message ?? error ?? 'Unknown error');
  if (/Could not find the table|does not exist|schema cache/i.test(message))
    return 'Cloud storage is not installed yet. The project owner must run supabase/schema.sql in the Supabase SQL Editor.';
  if (/row-level security|permission denied|not allowed/i.test(message))
    return 'Cloud storage rejected this request. Check that the Life OS tables and owner-only RLS policies are installed.';
  return message;
}

async function pushNow() {
  if (!supabase || !currentUserId) return false;
  if (!navigator.onLine) { useAuth.setState({ sync: 'offline' }); return false; }
  if (pushPromise) return pushPromise;
  const owner = currentUserId;
  pushPromise = (async () => {
    useAuth.setState({ sync: 'saving', syncError: undefined });
    try {
      do {
        const revision = changeRevision;
        const { error } = await supabase!
          .from('life_data')
          .upsert({ user_id: owner, data: snapshot(), updated_at: new Date().toISOString() });
        if (error) throw error;
        syncedRevision = revision;
        if (currentUserId !== owner) return false;
      } while (changeRevision !== syncedRevision);
      useAuth.setState({ sync: 'saved', lastSynced: new Date().toISOString(), syncError: undefined });
      return true;
    } catch (error) {
      const message = syncErrorMessage(error);
      if (currentUserId === owner) useAuth.setState({ sync: 'error', syncError: message });
      console.error('Sync failed:', message);
      return false;
    } finally {
      pushPromise = null;
    }
  })();
  return pushPromise;
}

function schedulePush() {
  if (applyingRemote) return;
  changeRevision += 1;
  if (timer) clearTimeout(timer);
  timer = setTimeout(pushNow, 1200);
}

export async function syncNow() {
  if (timer) { clearTimeout(timer); timer = null; }
  return pushNow();
}

async function startSync(userId: string) {
  if (!supabase) return;
  if (currentUserId === userId && unsubscribe) return;
  stopSync();
  currentUserId = userId;
  changeRevision = 0;
  syncedRevision = 0;
  useAuth.setState({ sync: 'loading', syncError: undefined });

  let result;
  try {
    result = await supabase.from('life_data').select('data, updated_at').eq('user_id', userId).maybeSingle();
  } catch (error) {
    const message = syncErrorMessage(error);
    useAuth.setState({ sync: 'error', syncError: message });
    console.error('Cloud load failed:', message);
    unsubscribe = useStore.subscribe(schedulePush);
    return;
  }
  const { data, error } = result;
  if (error) {
    const message = syncErrorMessage(error);
    useAuth.setState({ sync: 'error', syncError: message });
    console.error('Cloud load failed:', message);
    unsubscribe = useStore.subscribe(schedulePush);
    return;
  }

  // Which account does the data in this browser belong to?
  const localOwner = localStorage.getItem('life-circle-owner');

  if (data?.data && Object.keys(data.data).length) {
    applyingRemote = true;
    useStore.getState().importAll(data.data);
    applyingRemote = false;
    useAuth.setState({ sync: 'saved', lastSynced: data.updated_at, syncError: undefined });
  } else {
    // First sign-in for this account: keep guest data from this device (if it isn't someone else's).
    if (localOwner && localOwner !== userId) useStore.getState().resetAll();
    await pushNow();
  }
  localStorage.setItem('life-circle-owner', userId);
  unsubscribe = useStore.subscribe(schedulePush);
  realtimeChannel = supabase.channel(`life-data-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'life_data', filter: `user_id=eq.${userId}` }, async () => {
      // Don't replace newer local work with a concurrent remote snapshot.
      if (currentUserId !== userId || changeRevision !== syncedRevision || applyingRemote) return;
      try {
        const { data: latest, error: latestError } = await supabase!.from('life_data').select('data, updated_at').eq('user_id', userId).maybeSingle();
        if (latestError || !latest?.data || currentUserId !== userId || changeRevision !== syncedRevision) return;
        applyingRemote = true;
        useStore.getState().importAll(latest.data);
        applyingRemote = false;
        useAuth.setState({ sync: 'saved', lastSynced: latest.updated_at, syncError: undefined });
      } catch (error) {
        applyingRemote = false;
        console.warn('Live sync refresh failed:', syncErrorMessage(error));
      }
    })
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('Live sync is temporarily unavailable; changes will still save when this device syncs.');
    });
}

function stopSync() {
  unsubscribe?.();
  unsubscribe = null;
  if (realtimeChannel && supabase) void supabase.removeChannel(realtimeChannel);
  realtimeChannel = null;
  if (timer) clearTimeout(timer);
  timer = null;
  currentUserId = null;
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

export function initAuth() {
  if (!supabase) return;
  const bootTimeout = window.setTimeout(() => {
    if (!useAuth.getState().ready) useAuth.setState({ ready: true, sync: 'error', syncError: 'Sign-in check is taking longer than expected. You can sign in or continue on this device.' });
  }, 2500);
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) useAuth.setState({ sync: 'error', syncError: syncErrorMessage(error) });
    useAuth.setState({ session: data.session, user: data.session?.user ?? null, ready: true });
    if (data.session) startSync(data.session.user.id);
  }).catch((error) => {
    useAuth.setState({ ready: true, sync: 'error', syncError: syncErrorMessage(error) });
  }).finally(() => window.clearTimeout(bootTimeout));
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
    const saved = await syncNow();
    if (!saved) throw new Error(useAuth.getState().syncError || 'Could not save your latest changes. Please retry sync before signing out.');
    const { error } = await supabase!.auth.signOut();
    if (error) throw error;
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
