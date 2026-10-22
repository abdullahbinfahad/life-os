import { translate as tr } from '../../lib/locales';
import { ClipboardList, RefreshCw } from 'lucide-react';
import type { AdminAuditEntry } from './types';
import { formatAdminDate, safeAuditMetadata, shortIdentifier } from './types';

type Props = { entries: AdminAuditEntry[]; loading: boolean; error: string | null; onRefresh: () => void };

export default function AuditLog({ entries, loading, error, onRefresh }: Props) {
  return <section className="card p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="rounded-xl bg-indigo-500/10 p-2 text-indigo-600 dark:text-indigo-300"><ClipboardList size={18} /></span><div><h2 className="font-semibold">{tr("Recent audit activity")}</h2><p className="mt-1 text-xs muted">{tr("Recent owner-console actions. Credential-like metadata is redacted in this viewer.")}</p></div></div><button className="btn-outline" onClick={onRefresh} disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> {tr("Refresh")}</button></div>
    {error && <div role="alert" className="mt-3 rounded-xl border border-rose-300/60 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-100">{error}</div>}
    <div className="mt-4 max-h-[28rem] divide-y divide-slate-200 overflow-y-auto rounded-xl border border-slate-200 dark:divide-white/10 dark:border-white/10">{!loading && !error && !entries.length && <div className="p-5 text-center text-sm muted">{tr("No audit events were returned.")}</div>}{entries.map((entry) => <article key={entry.id} className="p-3"><div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1"><strong className="text-sm">{entry.action}</strong><time className="text-xs muted">{formatAdminDate(entry.created_at)}</time></div><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] muted"><span>{tr("Actor")}{shortIdentifier(entry.actor_id)}</span><span>{tr("Target")}{shortIdentifier(entry.target_user_id)}</span></div>{entry.metadata !== null && entry.metadata !== undefined && <pre className="mt-2 max-h-28 overflow-auto rounded-lg bg-slate-100 p-2 text-[11px] leading-5 text-slate-700 dark:bg-black/20 dark:text-slate-200">{JSON.stringify(safeAuditMetadata(entry.metadata), null, 2)}</pre>}</article>)}</div>
  </section>;
}
