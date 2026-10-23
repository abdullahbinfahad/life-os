import { translate as tr } from '../../lib/locales';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { DEFAULT_NAVIGATION, NAVIGATION_ICON_NAMES, NAVIGATION_ICONS, SAFE_NAVIGATION_ROUTES, defaultNavigationItemFor, type NavigationItem } from '../../lib/navigation';

type Props = { items: NavigationItem[]; onChange: (items: NavigationItem[]) => void; saving: boolean; error: string | null; onSave: () => void; loading: boolean };
type RowProps = {
  item: NavigationItem;
  index: number;
  total: number;
  update: (index: number, patch: Partial<NavigationItem>) => void;
  move: (index: number, direction: -1 | 1) => void;
  remove: (index: number) => void;
};

function SortableNavigationRow({ item, index, total, update, move, remove }: RowProps) {
  const Icon = NAVIGATION_ICONS[item.icon];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.to });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`rounded-xl border border-slate-200 p-3 dark:border-white/10 ${isDragging ? 'z-10 opacity-70 shadow-xl' : ''}`}>
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <button type="button" {...attributes} {...listeners} className="grid h-9 w-9 shrink-0 touch-none place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10" aria-label={`${tr('Reorder')}: ${item.label}`} title={tr('Drag to reorder')}><GripVertical size={16} /></button>
      <Icon size={17} className="shrink-0 text-indigo-500" />
      <span className="min-w-0 flex-1 break-words text-sm font-medium">{DEFAULT_NAVIGATION.find((entry) => entry.to === item.to)?.desc || item.to}</span>
      <button type="button" className="btn-ghost !p-1.5" title={tr('Move earlier')} aria-label={`${tr('Move')} ${item.label} ${tr('earlier')}`} onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp size={15} /></button>
      <button type="button" className="btn-ghost !p-1.5" title={tr('Move later')} aria-label={`${tr('Move')} ${item.label} ${tr('later')}`} onClick={() => move(index, 1)} disabled={index === total - 1}><ArrowDown size={15} /></button>
      <button type="button" className="btn-ghost !p-1.5" title={item.visible ? tr('Hide item') : tr('Show item')} aria-label={item.visible ? `${tr('Hide')} ${item.label}` : `${tr('Show')} ${item.label}`} onClick={() => update(index, { visible: !item.visible })}>{item.visible ? <Eye size={15} /> : <EyeOff size={15} />}</button>
      <button type="button" className="btn-ghost !p-1.5 text-rose-600 dark:text-rose-300" title={tr('Remove item')} aria-label={`${tr('Remove')} ${item.label}`} onClick={() => remove(index)}><Trash2 size={15} /></button>
    </div>
    <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_10rem]">
      <label className="min-w-0"><span className="label">{tr('Label')}</span><input className="input" value={item.label} onChange={(event) => update(index, { label: event.target.value })} maxLength={80} /></label>
      <label className="min-w-0"><span className="label">{tr('Icon')}</span><select className="input" value={item.icon} onChange={(event) => update(index, { icon: event.target.value as NavigationItem['icon'] })}>{NAVIGATION_ICON_NAMES.map((icon) => <option key={icon} value={icon}>{icon}</option>)}</select></label>
      <label className="min-w-0"><span className="label">{tr('Route')}</span><input className="input" value={item.to} disabled /></label>
    </div>
  </div>;
}

export default function NavigationEditor({ items, onChange, saving, error, onSave, loading }: Props) {
  const [routeToAdd, setRouteToAdd] = useState(SAFE_NAVIGATION_ROUTES[0]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const update = (index: number, patch: Partial<NavigationItem>) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const next = [...items];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next);
  };
  const reorder = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const from = items.findIndex((item) => item.to === event.active.id);
    const to = items.findIndex((item) => item.to === event.over?.id);
    if (from >= 0 && to >= 0) onChange(arrayMove(items, from, to));
  };
  const add = () => {
    if (items.some((item) => item.to === routeToAdd)) return;
    const item = defaultNavigationItemFor(routeToAdd);
    if (item) onChange([...items, item]);
  };
  const remove = (index: number) => onChange(items.filter((_, itemIndex) => itemIndex !== index));

  return <section className="card p-4 sm:p-5"><div><h2 className="font-semibold">{tr('App-wide navigation')}</h2><p className="mt-1 text-xs leading-5 muted">{tr('This controls the public menu for every Life OS user. Entries are limited to existing internal app routes and safe icons; external links cannot be added.')}</p></div>
    {error && <div role="alert" className="mt-3 rounded-xl border border-rose-300/60 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-100">{error}</div>}
    {loading ? <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-5 text-sm muted dark:border-white/15">{tr('Loading published navigation…')}</div> : <><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}><SortableContext items={items.map((item) => item.to)} strategy={verticalListSortingStrategy}><div className="mt-4 space-y-3">{items.map((item, index) => <SortableNavigationRow key={item.to} item={item} index={index} total={items.length} update={update} move={move} remove={remove} />)}</div></SortableContext></DndContext><div className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-200 pt-4 dark:border-white/10"><label className="min-w-[12rem] flex-1"><span className="label">{tr('Add existing internal route')}</span><select className="input" value={routeToAdd} onChange={(event) => setRouteToAdd(event.target.value)}>{SAFE_NAVIGATION_ROUTES.filter((route) => !items.some((item) => item.to === route)).map((route) => <option key={route} value={route}>{route} · {DEFAULT_NAVIGATION.find((item) => item.to === route)?.label}</option>)}</select></label><button type="button" className="btn-outline" onClick={add}><Plus size={16} /> {tr('Add item')}</button></div><div className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100"><strong>{tr('Global publication:')}</strong> {tr('saving immediately changes the menu for all users after their next config refresh. Confirm before publishing navigation.')}</div><button type="button" className="btn-primary mt-3" onClick={onSave} disabled={saving || !items.length}>{saving ? tr('Publishing…') : tr('Confirm & publish navigation')}</button></>}
  </section>;
}
