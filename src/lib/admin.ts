import { useEffect, useState } from 'react';
import { useAuth } from './auth';
import { supabase } from './supabase';

export type OwnerAdminStatus = 'checking' | 'owner' | 'not-owner';

/*
 * Authorization comes from a verified database function, never a local email check.
 * The answer is shared per user + session, so the sidebar and the Admin page make one
 * request between them, and the page can show "checking" instead of flashing
 * "Owner access required" before the database has answered.
 */
const cache = new Map<string, Promise<boolean>>();

function checkOwner(key: string): Promise<boolean> {
  const client = supabase;
  if (!client) return Promise.resolve(false);
  let pending = cache.get(key);
  if (!pending) {
    pending = Promise.resolve(client.rpc('lifeos_is_owner_admin')).then(({ data, error }) => !error && data === true, () => false);
    cache.set(key, pending);
    // Never cache a failure forever: allow a retry on the next mount.
    void pending.then((ok) => { if (!ok) cache.delete(key); });
  }
  return pending;
}

export function useOwnerAdminStatus(): OwnerAdminStatus {
  const { user, session, ready } = useAuth();
  const key = user?.id ? `${user.id}:${session?.access_token?.slice(-16) ?? ''}` : '';
  const [state, setState] = useState<{ key: string; status: OwnerAdminStatus }>({ key: '', status: 'checking' });

  useEffect(() => {
    let active = true;
    if (!key || !supabase) { setState({ key, status: 'not-owner' }); return () => { active = false; }; }
    setState({ key, status: 'checking' });
    void checkOwner(key).then((ok) => { if (active) setState({ key, status: ok ? 'owner' : 'not-owner' }); });
    return () => { active = false; };
  }, [key]);

  if (!ready && supabase) return 'checking';
  return state.key === key ? state.status : 'checking';
}

export function useOwnerAdmin() {
  return useOwnerAdminStatus() === 'owner';
}
