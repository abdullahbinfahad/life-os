import { useEffect, useState } from 'react';
import { useAuth } from './auth';
import { supabase } from './supabase';

/** Authorization comes from a verified database function, never a local email check. */
export function useOwnerAdmin() {
  const { user, session } = useAuth();
  const [ownerAdmin, setOwnerAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    setOwnerAdmin(false);
    if (!user?.id || !supabase) return () => { active = false; };
    void supabase.rpc('lifeos_is_owner_admin').then(({ data, error }) => {
      if (active) setOwnerAdmin(!error && data === true);
    }, () => { if (active) setOwnerAdmin(false); });
    return () => { active = false; };
  }, [user?.id, session?.access_token]);

  return ownerAdmin;
}
