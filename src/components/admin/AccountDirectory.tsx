import { translate as tr } from '../../lib/locales';
import { Search, UserRound } from 'lucide-react';
import { useMemo } from 'react';
import type { AdminAccount } from './types';
import { formatAdminDate } from './types';

type Props = {
  accounts: AdminAccount[];
  query: string;
  onQueryChange: (value: string) => void;
  page: number;
  onPageChange: (page: number) => void;
  selectedId: string | null;
  onSelect: (account: AdminAccount) => void;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  hasMore: boolean;
  onLoadMore: () => void;
};

const PAGE_SIZE = 20;

export default function AccountDirectory({ accounts, query, onQueryChange, page, onPageChange, selectedId, onSelect, loading, error, onRefresh, hasMore, onLoadMore }: Props) {
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return accounts;
    return accounts.filter((account) => [account.email, account.phone, account.display_name].some((value) => value?.toLowerCase().includes(needle)));
  }, [accounts, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const pageAccounts = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-semibold">{tr("Account directory")}</h2><p className="mt-1 text-xs muted">{tr("Search verified account contact fields and display names. Select an account to inspect its workspace.")}</p></div>
        <button className="btn-outline" onClick={onRefresh} disabled={loading}>{loading ? 'Loading…' : 'Refresh directory'}</button>
      </div>
      <label className="relative mt-4 block">
        <span className="sr-only">{tr("Search accounts by email, phone, or name")}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 muted" size={16} />
        <input className="input pl-9" value={query} onChange={(event) => { onQueryChange(event.target.value); onPageChange(0); }} placeholder={tr("Search email, phone, or name")} />
      </label>
      {error && <div role="alert" className="mt-3 rounded-xl border border-rose-300/60 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-100">{error}</div>}
      <div className="mt-3 max-h-[30rem] space-y-2 overflow-y-auto pr-1">
        {!loading && !error && !pageAccounts.length && <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm muted dark:border-white/15">{tr("No accounts match this search.")}</div>}
        {pageAccounts.map((account) => {
          const selected = account.user_id === selectedId;
          const title = account.display_name || account.email || account.phone || 'Unnamed account';
          return <button key={account.user_id} onClick={() => onSelect(account)} className={`w-full rounded-xl border p-3 text-left transition ${selected ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/30' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[.04]'}`}>
            <div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 dark:bg-white/10"><UserRound size={17} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{title}</span><span className="mt-0.5 block truncate text-xs muted">{account.email || account.phone || 'No contact identifier returned'}</span></span><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${account.has_snapshot ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200/70 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}>{account.has_snapshot ? 'Snapshot' : 'No snapshot'}</span></div>
            <div className="mt-2 text-[11px] muted">{tr("Created")}{formatAdminDate(account.created_at)}</div>
          </button>;
        })}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-3 text-xs dark:border-white/10"><span className="muted">{filtered.length} {query.trim() ? 'matching' : 'loaded'} {tr("account")}{filtered.length === 1 ? '' : 's'} {tr("· page")}{currentPage + 1} {tr("of")}{pages}</span><span className="flex gap-2"><button className="btn-outline !px-2.5 !py-1.5" onClick={() => onPageChange(Math.max(0, currentPage - 1))} disabled={currentPage === 0}>{tr("Previous")}</button><button className="btn-outline !px-2.5 !py-1.5" onClick={() => onPageChange(Math.min(pages - 1, currentPage + 1))} disabled={currentPage >= pages - 1}>{tr("Next")}</button></span></div>
      {hasMore && <button className="btn-outline mt-3 w-full" onClick={onLoadMore} disabled={loading}>{loading ? 'Loading accounts…' : 'Load next 100 accounts'}</button>}
    </section>
  );
}
