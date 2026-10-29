import { translate as tr } from '../lib/locales';
import { Activity, Crown, Database, Globe2, HardDrive, RefreshCw, ShieldCheck, Smartphone, Wifi } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { useOwnerAdmin } from '../lib/admin';
import { supabase } from '../lib/supabase';
import { localeForLanguage } from '../lib/utils';
import { useStore } from '../lib/store';
import AccountDirectory from '../components/admin/AccountDirectory';
import AuditLog from '../components/admin/AuditLog';
import NavigationEditor from '../components/admin/NavigationEditor';
import PrivatePhotoPreviews from '../components/admin/PrivatePhotoPreviews';
import { DEFAULT_NAVIGATION, normalizeNavigationItems, type NavigationItem } from '../lib/navigation';
import type { AdminAccount, AdminAuditEntry } from '../components/admin/types';
import { humanizeAdminError, privatePhotoCandidates } from '../components/admin/types';

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
type SelectedRecord = { account: AdminAccount; snapshot: Record<string, unknown> | null; updatedAt: string | null };
const OWNER_PAGE_SIZE = 100;

function accountListError(error: unknown): string {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const rawCode = typeof record.code === 'string' ? record.code : '';
  const code = /^[A-Z0-9]{3,12}$/.test(rawCode) ? rawCode : '';
  const message = typeof record.message === 'string' ? record.message.toLowerCase() : '';
  const codeLabel = code ? ` (code ${code})` : '';

  if (typeof navigator !== 'undefined' && !navigator.onLine) return `Network unavailable${codeLabel}. Reconnect and retry.`;
  if (error instanceof TypeError || /failed to fetch|networkerror|network request failed|fetch failed/.test(message)) return `Network or offline error${codeLabel}. Check your connection and retry.`;
  if (code === '42501') return `Permission denied${codeLabel}. Sign in with the owner account and confirm the owner-admin migration is installed.`;
  if (code === 'PGRST203') return `Ambiguous RPC overload${codeLabel}. Check the deployed function signature in this project and remove conflicting overloads; then refresh.`;
  if (['PGRST202', 'PGRST205', '42883'].includes(code)) return `RPC function not found in the schema cache${codeLabel}. Confirm the app points to the same Supabase project where the owner-admin migration was applied, verify the function is in the exposed schema (usually public), then refresh the schema cache or wait briefly and retry.`;
  if (error instanceof Error && error.message === 'Unexpected account directory response') return 'Unexpected response from the account-list RPC. No server details are shown; verify the deployed function response shape and retry.';
  if (code) return `Unexpected account-list RPC response${codeLabel}. No server details are shown; verify the backend setup and retry.`;
  return 'Unexpected account-list RPC response. No server details are shown; verify the backend setup and retry.';
}

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

  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [accountOffset, setAccountOffset] = useState(0);
  const [hasMoreAccounts, setHasMoreAccounts] = useState(false);
  const [accountsBusy, setAccountsBusy] = useState(true);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountQuery, setAccountQuery] = useState('');
  const [accountPage, setAccountPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedRecord | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [snapshotText, setSnapshotText] = useState('');
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [snapshotNotice, setSnapshotNotice] = useState('');
  const [navigation, setNavigation] = useState<NavigationItem[]>(() => DEFAULT_NAVIGATION.map(({ to, label, icon, visible }) => ({ to, label, icon, visible })));
  const [navigationBusy, setNavigationBusy] = useState(false);
  const [navigationLoading, setNavigationLoading] = useState(false);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [audit, setAudit] = useState<AdminAuditEntry[]>([]);
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const loadAccountBatch = useCallback(async (offset: number, replace = false) => {
    if (!supabase) { setAccountError(tr('Cloud connection is not configured.')); setAccountsBusy(false); return; }
    if (replace) offset = 0;
    setAccountsBusy(true); setAccountError(null);
    try {
      const { data, error } = await supabase.rpc('lifeos_admin_list_users', { p_limit: OWNER_PAGE_SIZE, p_offset: offset });
      if (error) throw error;
      if (!Array.isArray(data) || data.some((row) => !row || typeof row !== 'object' || typeof (row as Partial<AdminAccount>).user_id !== 'string')) {
        throw new Error('Unexpected account directory response');
      }
      const rows = data as AdminAccount[];
      setAccounts((previous) => replace ? rows : [...previous, ...rows]);
      setAccountOffset(offset + rows.length);
      setHasMoreAccounts(rows.length === OWNER_PAGE_SIZE);
      setAccountPage(0);
    } catch (error) {
      setAccountError(tr(accountListError(error)));
    }
    finally { setAccountsBusy(false); }
  }, []);

  const loadSelected = useCallback(async (account: AdminAccount) => {
    if (!supabase) return;
    setSelectedId(account.user_id); setSelected(null); setDetailBusy(true); setSnapshotNotice('');
    try {
      const { data, error } = await supabase.rpc('lifeos_admin_get_user', { p_user_id: account.user_id });
      if (error) throw error;
      const result = data as { account?: { id?: string; email?: string | null; phone?: string | null; display_name?: string | null; created_at?: string | null; last_sign_in_at?: string | null; email_confirmed?: boolean }; life_data?: { data?: unknown; updated_at?: string } | null } | null;
      const snapshot = result?.life_data?.data && typeof result.life_data.data === 'object' && !Array.isArray(result.life_data.data) ? result.life_data.data as Record<string, unknown> : null;
      const remote = result?.account;
      const selectedAccount: AdminAccount = { ...account, user_id: remote?.id ?? account.user_id, email: remote?.email ?? account.email, phone: remote?.phone ?? account.phone, display_name: remote?.display_name ?? account.display_name, created_at: remote?.created_at ?? account.created_at, last_sign_in_at: remote?.last_sign_in_at ?? account.last_sign_in_at, email_confirmed: remote?.email_confirmed ?? account.email_confirmed, snapshot_updated_at: result?.life_data?.updated_at ?? null, has_snapshot: !!snapshot };
      const next = { account: selectedAccount, snapshot, updatedAt: result?.life_data?.updated_at ?? null };
      setSelected(next);
      setSnapshotText(snapshot ? JSON.stringify(snapshot, null, 2) : '');
    } catch (error) { setSnapshotNotice(humanizeAdminError(error, 'Could not open this account')); }
    finally { setDetailBusy(false); }
  }, []);

  const loadNavigation = useCallback(async () => {
    if (!supabase) return;
    setNavigationLoading(true); setNavigationError(null);
    try {
      const { data, error } = await supabase.from('lifeos_menu_config').select('value').eq('key', 'navigation').maybeSingle();
      if (error) throw error;
      const normalized = normalizeNavigationItems(data?.value);
      if (normalized) setNavigation(normalized);
    } catch (error) { setNavigationError(humanizeAdminError(error, 'Navigation management is not installed')); }
    finally { setNavigationLoading(false); }
  }, []);

  const loadAudit = useCallback(async () => {
    if (!supabase) return;
    setAuditBusy(true); setAuditError(null);
    try {
      const { data, error } = await supabase.rpc('lifeos_admin_list_audit', { p_limit: 50 });
      if (error) throw error;
      setAudit((Array.isArray(data) ? data : []) as AdminAuditEntry[]);
    } catch (error) { setAuditError(humanizeAdminError(error, 'Could not load audit history')); }
    finally { setAuditBusy(false); }
  }, []);

  const saveSnapshot = async () => {
    if (!supabase || !selected?.snapshot || !selected.updatedAt) return;
    let parsed: unknown;
    try { parsed = JSON.parse(snapshotText); } catch { setSnapshotNotice('The workspace editor must contain valid JSON before saving.'); return; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { setSnapshotNotice('The account workspace must be one JSON object.'); return; }
    if (!confirm(`Save these changes to ${selected.account.display_name || selected.account.email || selected.account.user_id.slice(0, 8)}’s workspace? The owner action will be recorded in the audit log.`)) return;
    setSnapshotBusy(true); setSnapshotNotice('');
    try {
      const { data, error } = await supabase.rpc('lifeos_admin_update_user_snapshot', { p_user_id: selected.account.user_id, p_data: parsed, p_expected_updated_at: selected.updatedAt });
      if (error) throw error;
      const updatedAt = typeof data === 'string' ? data : new Date().toISOString();
      setSelected({ ...selected, snapshot: parsed as Record<string, unknown>, updatedAt });
      setSnapshotNotice('Workspace saved. The account’s live sync will receive the update.');
      await loadAudit();
    } catch (error) { setSnapshotNotice(humanizeAdminError(error, 'Could not save workspace')); }
    finally { setSnapshotBusy(false); }
  };

  const saveNavigation = async () => {
    if (!supabase) return;
    if (!confirm('Publish this navigation for every Life OS user? The change will be audit-logged.')) return;
    setNavigationBusy(true); setNavigationError(null);
    try {
      const { error } = await supabase.rpc('lifeos_admin_save_navigation', { p_items: navigation });
      if (error) throw error;
      setNavigationError(null);
      await loadAudit();
    } catch (error) { setNavigationError(humanizeAdminError(error, 'Could not publish navigation')); }
    finally { setNavigationBusy(false); }
  };

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
        next.accountRow = self.error ? `Unavailable (${self.error.code || 'network'})` : self.data ? `Healthy · updated ${new Date(self.data.updated_at).toLocaleString(localeForLanguage(store.settings.language))}` : 'Ready · no cloud snapshot yet';
        next.publicJournals = journals.error ? `Unavailable (${journals.error.code || 'table not set up'})` : `${journals.count ?? 0} published`;
        next.publicComments = comments.error ? `Not configured (${comments.error.code || 'schema required'})` : `${comments.count ?? 0} comments`;
        const counts = metrics.data as { registered_accounts?: number; cloud_snapshots?: number } | null;
        next.backendOwnerVerified = !metrics.error && !!counts;
        next.accounts = metrics.error ? `Unavailable (${metrics.error.code || 'owner setup required'})` : `${counts?.registered_accounts ?? 0} accounts`;
        next.cloudSnapshots = metrics.error ? 'Owner setup required' : `${counts?.cloud_snapshots ?? 0} saved rows`;
      } else {
        next.accountRow = 'Cloud connection not configured'; next.publicJournals = 'Cloud connection not configured'; next.accounts = 'Cloud connection not configured'; next.cloudSnapshots = 'Cloud connection not configured';
      }
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        next.worker = registration?.active ? 'Active · static assets only' : 'Registered or pending';
      }
    } catch (error) { next.accountRow = error instanceof Error ? `Check failed · ${error.message}` : 'Check failed'; }
    finally { next.checkedAt = new Date().toISOString(); setReport(next); setBusy(false); }
  }, [ownerAdmin, user?.id]);

  useEffect(() => {
    const onlineChange = () => setOnline(navigator.onLine);
    window.addEventListener('online', onlineChange); window.addEventListener('offline', onlineChange);
    if (ownerAdmin && user?.id) { void refresh(); void loadAccountBatch(0, true); void loadNavigation(); void loadAudit(); }
    return () => { window.removeEventListener('online', onlineChange); window.removeEventListener('offline', onlineChange); };
  }, [ownerAdmin, user?.id, refresh, loadAccountBatch, loadNavigation, loadAudit]);

  if (!ownerAdmin) return <div className="card mx-auto max-w-xl p-6 text-center"><ShieldCheck className="mx-auto mb-3 text-rose-500" size={28} /><h1 className="text-xl font-semibold">{tr("Owner access required")}</h1><p className="mt-2 text-sm muted">{tr("Sign in with the system owner account and enable the owner-console migration to open these diagnostics.")}</p></div>;

  const activeAccount = selected?.account;
  const photos = selected?.snapshot && activeAccount ? privatePhotoCandidates(selected.snapshot, activeAccount.user_id) : [];

  return <div className="mx-auto max-w-5xl space-y-6">
    <div className="admin-hero relative overflow-hidden rounded-3xl border border-amber-300/30 bg-gradient-to-br from-emerald-950 via-slate-900 to-amber-950 p-5 text-white shadow-2xl shadow-emerald-950/15 sm:p-8">
      <div className="pointer-events-none absolute -right-14 -top-20 h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div><span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/25 bg-amber-100/10 px-3 py-1 text-xs font-semibold text-amber-100"><Crown size={13} /> {tr("OWNER · PREMIUM")}</span><h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">{tr("System console")}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-emerald-50/75">{tr("A live, privacy-conscious view of this app, your own cloud record, and public service health.")}</p></div>
        <button className="btn border border-white/15 bg-white/10 text-white hover:bg-white/15" onClick={() => { void refresh(); void loadAccountBatch(0, true); void loadNavigation(); void loadAudit(); }} disabled={busy || accountsBusy}><RefreshCw size={15} className={busy || accountsBusy ? 'animate-spin' : ''} /> {tr("Refresh checks")}</button>
      </div>
      <div className="relative mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-emerald-50/70"><span>{user?.email ?? 'Verified owner'}</span><span>{tr("Role: owner")}</span><span>{tr("Database verification:")}{report.backendOwnerVerified ? 'confirmed' : 'pending setup'}</span><span>{tr("Checked")}{report.checkedAt ? new Date(report.checkedAt).toLocaleTimeString() : '—'}</span></div>
    </div>

    <section><h2 className="mb-3 text-lg font-semibold">{tr("System health")}</h2><div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label={tr("Connection")} value={online ? 'Online' : 'Offline'} detail={online ? 'Browser can reach the network' : 'Changes remain local until reconnect'} icon={Wifi} />
      <Stat label={tr("Cloud sync")} value={sync === 'saved' ? 'Synced' : sync === 'saving' || sync === 'loading' ? 'Working' : sync === 'error' ? 'Needs attention' : sync} detail={lastSynced ? `Last saved ${new Date(lastSynced).toLocaleString(localeForLanguage(store.settings.language))}` : 'This account’s sync status'} icon={Database} />
      <Stat label={tr("Your workspace")} value={`${personalTotals} records`} detail={`${store.items.length} plans · ${store.goals.length} goals · ${store.habits.length} habits · ${store.journal.length} journals · ${store.albums.length} albums`} icon={HardDrive} />
      <Stat label={tr("Install & cache")} value={report.worker} detail={tr("Caches the app shell and static assets, never private API data")} icon={Activity} />
    </div></section>

    <section className="card p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{tr("System-wide aggregates")}</h2><p className="mt-1 text-sm muted">{tr("Counts only, verified on the database; no other person’s private records are returned.")}</p></div><Globe2 size={18} className="text-emerald-500" /></div><div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label={tr("Accounts")} value={report.accounts} detail={tr("Registered accounts")} icon={ShieldCheck} /><Stat label={tr("Cloud snapshots")} value={report.cloudSnapshots} detail={tr("Row count only; record contents remain private")} icon={Database} /><Stat label={tr("Published journals")} value={report.publicJournals} detail={tr("Public entries across the site")} icon={Globe2} /><Stat label={tr("Reader comments")} value={report.publicComments} detail={tr("Public comment rows")} icon={Activity} /></div></section>

    <section className="card p-4 sm:p-6"><div className="flex items-center gap-2"><Smartphone size={18} className="text-emerald-500" /><h2 className="font-semibold">{tr("This device & app")}</h2></div><dl className="mt-4 grid min-w-0 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      <div className="min-w-0"><dt className="muted">{tr("App build")}</dt><dd className="mt-1 break-words font-medium">{tr("Life OS ·")}{import.meta.env.MODE}</dd></div>
      <div className="min-w-0"><dt className="muted">{tr("Viewport")}</dt><dd className="mt-1 break-words font-medium">{typeof window !== 'undefined' ? `${window.innerWidth} × ${window.innerHeight}px` : 'Unavailable'}</dd></div>
      <div className="min-w-0"><dt className="muted">{tr("Browser")}</dt><dd className="mt-1 break-words font-medium">{typeof navigator !== 'undefined' ? navigator.userAgent : 'Unavailable'}</dd></div>
      <div className="min-w-0"><dt className="muted">{tr("Cloud account row")}</dt><dd className="mt-1 break-words font-medium">{report.accountRow}</dd></div>
    </dl></section>

    <section className="card p-4 sm:p-6"><div className="mb-4"><h2 className="font-semibold">{tr("Cross-account administration")}</h2><p className="mt-1 text-sm leading-6 muted">{tr("Account lookup and workspace changes are authorized on the database and recorded in the private audit trail. Never request or store passwords, tokens, or payment details.")}</p></div>
      <AccountDirectory accounts={accounts} query={accountQuery} onQueryChange={setAccountQuery} page={accountPage} onPageChange={setAccountPage} selectedId={selectedId} onSelect={loadSelected} loading={accountsBusy} error={accountError} onRefresh={() => { setAccounts([]); setAccountOffset(0); setHasMoreAccounts(false); void loadAccountBatch(0, true); }} hasMore={hasMoreAccounts} onLoadMore={() => void loadAccountBatch(accountOffset)} />
      {accounts.length > 0 && <p className="mt-2 text-xs muted">{accounts.length} account records loaded{hasMoreAccounts ? ' · more available' : ' · end of directory'}.</p>}
      {detailBusy && <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-5 text-sm muted dark:border-white/15" role="status">Loading the selected account’s private workspace…</div>}
      {snapshotNotice && <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-100" role="status">{snapshotNotice}</div>}
      {selected && activeAccount && !detailBusy && <div className="mt-4 space-y-4">
        <section className="card min-w-0 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{activeAccount.display_name || activeAccount.email || activeAccount.phone || 'Account'}</h3><p className="mt-1 break-all text-sm muted">{activeAccount.email || activeAccount.phone || activeAccount.user_id}</p></div><span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-200">Private account details</span></div><dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2"><div className="min-w-0"><dt className="muted">Phone</dt><dd className="mt-1 break-words">{activeAccount.phone || 'Not provided'}</dd></div><div><dt className="muted">Email confirmed</dt><dd className="mt-1">{activeAccount.email_confirmed ? 'Yes' : 'No'}</dd></div><div><dt className="muted">Account created</dt><dd className="mt-1 break-words">{activeAccount.created_at ? new Date(activeAccount.created_at).toLocaleString(localeForLanguage(store.settings.language)) : 'Unavailable'}</dd></div><div><dt className="muted">Last sign-in</dt><dd className="mt-1 break-words">{activeAccount.last_sign_in_at ? new Date(activeAccount.last_sign_in_at).toLocaleString(localeForLanguage(store.settings.language)) : 'Not recorded'}</dd></div><div><dt className="muted">Cloud snapshot updated</dt><dd className="mt-1 break-words">{selected.updatedAt ? new Date(selected.updatedAt).toLocaleString(localeForLanguage(store.settings.language)) : 'No snapshot exists'}</dd></div></dl></section>
        {selected.snapshot ? <section className="card min-w-0 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{tr("Private workspace snapshot")}</h3><p className="mt-1 text-xs leading-5 muted">Full account workspace JSON. Saving uses an optimistic version check and writes an audit event.</p></div><button className="btn-primary" onClick={() => void saveSnapshot()} disabled={snapshotBusy || !selected.updatedAt}><Database size={15} />{snapshotBusy ? 'Saving…' : 'Save workspace'}</button></div><textarea className="input mt-4 min-h-[24rem] font-mono text-xs leading-5" spellCheck={false} value={snapshotText} onChange={(event) => setSnapshotText(event.target.value)} aria-label="Selected account private workspace JSON" /></section> : <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm muted dark:border-white/15">This account has no Life OS snapshot. Admin editing never creates a snapshot for an account that has not saved one.</div>}
        {selected.snapshot && <PrivatePhotoPreviews userId={activeAccount.user_id} photos={photos} />}
      </div>}
    </section>

    <NavigationEditor items={navigation} onChange={setNavigation} saving={navigationBusy} error={navigationError} onSave={() => void saveNavigation()} loading={navigationLoading} />
    <AuditLog entries={audit} loading={auditBusy} error={auditError} onRefresh={() => void loadAudit()} />
    <p className="px-1 text-xs leading-5 muted">{tr("Owner tools are restricted by the verified database identity. Cross-account reads, snapshot edits, and private-media preview requests are audit-logged; no passwords, session tokens, or auth secrets are exposed.")}</p>
  </div>;
}
