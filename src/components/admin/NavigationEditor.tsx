import { translate as tr } from '../../lib/locales';
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { DEFAULT_NAVIGATION, NAVIGATION_ICON_NAMES, NAVIGATION_ICONS, SAFE_NAVIGATION_ROUTES, defaultNavigationItemFor, type NavigationItem } from '../../lib/navigation';

type Props = { items: NavigationItem[]; onChange: (items: NavigationItem[]) => void; saving: boolean; error: string | null; onSave: () => void; loading: boolean };

export default function NavigationEditor({ items, onChange, saving, error, onSave, loading }: Props) {
  const [routeToAdd, setRouteToAdd] = useState(SAFE_NAVIGATION_ROUTES[0]);
  const update = (index: number, patch: Partial<NavigationItem>) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const next = [...items];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next);
  };
  const add = () => {
    const item = defaultNavigationItemFor(routeToAdd);
    if (item) onChange([...items, item]);
  };

  return <section className="card p-4 sm:p-5"><div><h2 className="font-semibold">{tr("App-wide navigation")}</h2><p className="mt-1 text-xs leading-5 muted">{tr("This controls the public menu for every Life OS user. Entries are limited to existing internal app routes and safe icons; external links cannot be added.")}</p></div>
    {error && <div role="alert" className="mt-3 rounded-xl border border-rose-300/60 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-100">{error}</div>}
    {loading ? <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-5 text-sm muted dark:border-white/15">{tr("Loading published navigation…")}</div> : <><div className="mt-4 space-y-3">{items.map((item, index) => { const Icon = NAVIGATION_ICONS[item.icon]; return <div key={`${item.to}-${index}`} className="rounded-xl border border-slate-200 p-3 dark:border-white/10"><div className="flex items-center gap-2"><GripVertical size={16} className="shrink-0 muted" /><Icon size={17} className="shrink-0 text-indigo-500" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{DEFAULT_NAVIGATION.find((entry) => entry.to === item.to)?.desc || item.to}</span><button className="btn-ghost !p-1.5" title={tr("Move earlier")} aria-label={`Move ${item.label} earlier`} onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp size={15} /></button><button className="btn-ghost !p-1.5" title={tr("Move later")} aria-label={`Move ${item.label} later`} onClick={() => move(index, 1)} disabled={index === items.length - 1}><ArrowDown size={15} /></button><button className="btn-ghost !p-1.5" title={item.visible ? 'Hide item' : 'Show item'} aria-label={item.visible ? `Hide ${item.label}` : `Show ${item.label}`} onClick={() => update(index, { visible: !item.visible })}>{item.visible ? <Eye size={15} /> : <EyeOff size={15} />}</button><button className="btn-ghost !p-1.5 text-rose-600 dark:text-rose-300" title={tr("Remove item")} aria-label={`Remove ${item.label}`} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button></div><div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_10rem]"><label><span className="label">{tr("Label")}</span><input className="input" value={item.label} onChange={(event) => update(index, { label: event.target.value })} maxLength={80} /></label><label><span className="label">{tr("Icon")}</span><select className="input" value={item.icon} onChange={(event) => update(index, { icon: event.target.value as NavigationItem['icon'] })}>{NAVIGATION_ICON_NAMES.map((icon) => <option key={icon} value={icon}>{icon}</option>)}</select></label><label><span className="label">{tr("Route")}</span><input className="input" value={item.to} disabled /></label></div></div>; })}</div><div className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-200 pt-4 dark:border-white/10"><label className="min-w-[12rem] flex-1"><span className="label">{tr("Add existing internal route")}</span><select className="input" value={routeToAdd} onChange={(event) => setRouteToAdd(event.target.value)}>{SAFE_NAVIGATION_ROUTES.map((route) => <option key={route} value={route}>{route} · {DEFAULT_NAVIGATION.find((item) => item.to === route)?.label}</option>)}</select></label><button className="btn-outline" onClick={add}><Plus size={16} /> {tr("Add item")}</button></div><div className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100"><strong>{tr("Global publication:")}</strong> {tr("saving immediately changes the menu for all users after their next config refresh. Confirm before publishing.")}</div><button className="btn-primary mt-3" onClick={onSave} disabled={saving || !items.length}>{saving ? 'Publishing…' : 'Confirm & publish navigation'}</button></>}
  </section>;
}
