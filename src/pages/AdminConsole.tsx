import { Activity, Crown, Database, Globe2, HardDrive, RefreshCw, ShieldCheck, Smartphone, Wifi } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { useOwnerAdmin } from '../lib/admin';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';

type Report = {
  checkedAt: string;
  accountRow: string;
  publicJournals: string;
  publicComments: string;
  worker: string;
  accounts: string;
  cloudSnapshots: string;
  backendOwnerVerified: boolean;
};

function Stat({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Activity }) {
  return <section className="card min-w-0 p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><span className="text-sm muted">{label}</span><Icon size={17} className="shrink-0 text-emerald-500" /></div><div className="mt-3 break-words text-xl font-semibold tracking-tight sm:text-2xl">{value}</div><p className="mt-1 break-words text-xs muted">{detail}</p></section>;
}

export default function AdminConsole() {
  const { user, sync, lastSynced } = useAuth();
  const ownerAdmin = useOwnerAdmin();
  const store = useStore();
  const [report, setReport] = useState<Report>({ checkedAt: '', accountRow: 'Not checked', publicJournals: 'Not checked', publicComments: 'Not configured', worker: 'Checking', accounts: 'Waiting for backend verification', cloudSnapshots: 'Waiting for backend verification', backendOwnerVerified: false });
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : false);
  const personalTotals = useMemo(() => store.items.length + store.goals.length + store.projects.length + store.habits.length + store.journal.length + store.albums.length, [store.items.length, store.goals.length, store.projects.length, store.habits.length, store.journal.length, store.albums.length]);

  const refresh = useCallback(async () => {
    if (!ownerAdmin || !user?.id) return;
    setBusy(true);
    const next: Report = { checkedAt: new Date().toISOString(), accountRow: 'Unavailable', publicJournals: 'Unavailable', publicComments: 'Not configured', worker: 'Not supported', accounts: 'Owner verification unavailable', cloudSnapshots: 'Owner verification unavailable', backendOwnerVerified: false };
    try {
      if (supabase) {
        const [self, journals, comments, metrics] = await Promise.all([
          supabase.from('life_data').select('updated_at').eq('user_id', user.id).maybeSingle(),
          supabase.from('public_journals').select('slug', { count: 'exact', head: true }),
          supabase.from('public_journal_comments').select('id', { count: 'exact', head: true }),
          supabase.rpc('lifeos_owner_system_metrics'),
        ]);
        next.accountRow = self.error ? `Unavailable (${self.error.code || 'network'})` : self.data ? `Healthy · updated ${new Date(self.data.updated_at).toLocaleString()}` : 'Ready · no cloud snapshot yet';
        next.publicJournals = journals.error ? `Unavailable (${journals.error.code || 'table not set up'})` : `${journals.count ?? 0} published`;
        next.publicComments = comments.error ? `Not configured (${comments.error.code || 'schema required'})` : `${comments.count ?? 0} comments`;
        const counts = metrics.data as { registered_accounts?: number; cloud_snapshots?: number } | null;
        next.backendOwnerVerified = !metrics.error && !!counts;
        next.accounts = metrics.error ? `Unavailable (${metrics.error.code || 'owner setup required'})` : `${counts?.registered_accounts ?? 0} accounts`;
        next.cloudSnapshots = metrics.error ? 'Owner setup required' : `${counts?.cloud_snapshots ?? 0} saved rows`;
      } else {
        next.accountRow = 'Cloud connection not configured';
        next.publicJournals = 'Cloud connection not configured';
        next.accounts = 'Cloud connection not configured';
        next.cloudSnapshots = 'Cloud connection not configured';
      }
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        next.worker = registration?.active ? 'Active · static assets only' : 'Registered or pending';
      }
    } catch (error) {
      next.accountRow = error instanceof Error ? `Check failed · ${error.message}` : 'Check failed';
    } finally {
      next.checkedAt = new Date().toISOString();
      setReport(next);
      setBusy(false);
    }
  }, [ownerAdmin, user?.id]);

  useEffect(() => {
    const onlineChange = () => setOnline(navigator.onLine);
    window.addEventListener('online', onlineChange);
    window.addEventListener('offline', onlineChange);
    if (ownerAdmin && user?.id) void refresh();
    return () => { window.removeEventListener('online', onlineChange); window.removeEventListener('offline', onlineChange); };
  }, [ownerAdmin, user?.id, refresh]);

  if (!ownerAdmin) return <div className="card mx-auto max-w-xl p-6 text-center"><ShieldCheck className="mx-auto mb-3 text-rose-500" size={28} /><h1 className="text-xl font-semibold">Owner access required</h1><p className="mt-2 text-sm muted">Sign in with the system owner account and enable the owner-console migration to open these diagnostics.</p></div>;

  return <div className="mx-auto max-w-5xl space-y-6">
    <div className="admin-hero relative overflow-hidden rounded-3xl border border-amber-300/30 bg-gradient-to-br from-emerald-950 via-slate-900 to-amber-950 p-5 text-white shadow-2xl shadow-emerald-950/15 sm:p-8">
      <div className="pointer-events-none absolute -right-14 -top-20 h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div><span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/25 bg-amber-100/10 px-3 py-1 text-xs font-semibold text-amber-100"><Crown size={13} /> OWNER · PREMIUM</span><h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">System console</h1><p className="mt-2 max-w-xl text-sm leading-6 text-emerald-50/75">A live, privacy-conscious view of this app, your own cloud record, and public service health.</p></div>
        <button className="btn border border-white/15 bg-white/10 text-white hover:bg-white/15" onClick={() => void refresh()} disabled={busy}><RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> Refresh checks</button>
      </div>
      <div className="relative mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-emerald-50/70"><span>{user?.email ?? 'Verified owner'}</span><span>Role: owner</span><span>Database verification: {report.backendOwnerVerified ? 'confirmed' : 'pending setup'}</span><span>Checked {report.checkedAt ? new Date(report.checkedAt).toLocaleTimeString() : '—'}</span></div>
    </div>

    <section><h2 className="mb-3 text-lg font-semibold">System health</h2><div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Connection" value={online ? 'Online' : 'Offline'} detail={online ? 'Browser can reach the network' : 'Changes remain local until reconnect'} icon={Wifi} />
      <Stat label="Cloud sync" value={sync === 'saved' ? 'Synced' : sync === 'saving' || sync === 'loading' ? 'Working' : sync === 'error' ? 'Needs attention' : sync} detail={lastSynced ? `Last saved ${new Date(lastSynced).toLocaleString()}` : 'This account’s sync status'} icon={Database} />
      <Stat label="Your workspace" value={`${personalTotals} records`} detail={`${store.items.length} plans · ${store.goals.length} goals · ${store.habits.length} habits · ${store.journal.length} journals · ${store.albums.length} albums`} icon={HardDrive} />
      <Stat label="Install & cache" value={report.worker} detail="Caches the app shell and static assets, never private API data" icon={Activity} />
    </div></section>

    <section className="card p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">System-wide aggregates</h2><p className="mt-1 text-sm muted">Counts only, verified on the database; no other person’s private records are returned.</p></div><Globe2 size={18} className="text-emerald-500" /></div><div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Accounts" value={report.accounts} detail="Registered accounts" icon={ShieldCheck} /><Stat label="Cloud snapshots" value={report.cloudSnapshots} detail="Row count only; record contents remain private" icon={Database} /><Stat label="Published journals" value={report.publicJournals} detail="Public entries across the site" icon={Globe2} /><Stat label="Reader comments" value={report.publicComments} detail="Public comment rows" icon={Activity} /></div></section>

    <section className="card p-4 sm:p-6"><div className="flex items-center gap-2"><Smartphone size={18} className="text-emerald-500" /><h2 className="font-semibold">This device & app</h2></div><dl className="mt-4 grid min-w-0 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      <div className="min-w-0"><dt className="muted">App build</dt><dd className="mt-1 break-words font-medium">Life OS · {import.meta.env.MODE}</dd></div>
      <div className="min-w-0"><dt className="muted">Viewport</dt><dd className="mt-1 break-words font-medium">{typeof window !== 'undefined' ? `${window.innerWidth} × ${window.innerHeight}px` : 'Unavailable'}</dd></div>
      <div className="min-w-0"><dt className="muted">Browser</dt><dd className="mt-1 break-words font-medium">{typeof navigator !== 'undefined' ? navigator.userAgent : 'Unavailable'}</dd></div>
      <div className="min-w-0"><dt className="muted">Cloud account row</dt><dd className="mt-1 break-words font-medium">{report.accountRow}</dd></div>
    </dl></section>

    <p className="px-1 text-xs leading-5 muted">Owner tools are limited to account health and aggregate system counts. They do not expose another person’s journal, photos, or private data.</p>
  </div>;
}
