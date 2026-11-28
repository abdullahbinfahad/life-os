import { translate as tr } from '../lib/locales';
import { Bell, BellOff, BellRing, CalendarClock, ChevronDown, Flame, Moon, Smartphone, Sun, Users, MessageCircle, ListChecks, Vibrate, BadgeCheck } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import './projects/team/TeamWorkspace.css';
import './NotificationSettings.css';
import { useStore } from '../lib/store';
import { isAndroid, isIOS, isStandalone, notifyPrefs, permission, showAppNotification, type NotifyPrefs } from '../lib/notify';
import { cx } from '../lib/utils';

function Toggle({ on, onChange, label }: { on: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={cx('ns-switch', on && 'is-on')}><span /></button>;
}

function Row({ icon, title, hint, on, onChange, children }: { icon: ReactNode; title: string; hint: string; on: boolean; onChange: (value: boolean) => void; children?: ReactNode }) {
  return <div className={cx('ns-row', !on && 'is-off')}>
    <span className="ns-icon">{icon}</span>
    <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{tr(title)}</p><p className="text-xs muted">{tr(hint)}</p>{on && children && <div className="mt-2 flex flex-wrap items-center gap-2">{children}</div>}</div>
    <Toggle on={on} onChange={onChange} label={tr(title)} />
  </div>;
}

export default function NotificationSettings({ onEnable }: { onEnable: (enabled: boolean) => void }) {
  const settings = useStore((state) => state.settings);
  const updateSettings = useStore((state) => state.updateSettings);
  const prefs = notifyPrefs(settings);
  const [perm, setPerm] = useState(permission());
  const [open, setOpen] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  useEffect(() => { const timer = setInterval(() => setPerm(permission()), 1500); return () => clearInterval(timer); }, []);
  const set = (patch: Partial<NotifyPrefs>) => updateSettings({ notify: { ...(settings.notify ?? {}), ...patch } });
  const active = Boolean(settings.browserNotifications && perm === 'granted');
  const ios = isIOS(); const installed = isStandalone(); const android = isAndroid();
  const time = (value: string, onChange: (value: string) => void, label: string) => <label className="ns-time"><span>{tr(label)}</span><input type="time" value={value} onChange={(event) => event.target.value && onChange(event.target.value)} /></label>;

  return <section className="ns-card" aria-label={tr('Notification settings')}>
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <span className={cx('ns-big-icon', active && 'is-on')}>{active ? <BellRing size={20} /> : <BellOff size={20} />}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{tr(active ? 'Notifications are on' : 'Notifications are off')}</p>
        <p className="text-xs muted">{active ? tr('Digest, due work, classes, habits and people — on this device.') : perm === 'denied' ? tr('Blocked in browser settings. Allow notifications for this site, then turn them on.') : ios && !installed ? tr('iPhone/iPad: add Life OS to your Home Screen first.') : tr('Get reminded even when you are in another app or tab.')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {active && <button type="button" className="btn-outline !min-h-10" onClick={() => void showAppNotification({ title: `🔔 ${tr('Test from Life OS')}`, body: tr('If you can see this, reminders will reach you here.'), tag: 'lifeos-test', url: '/notifications', reminderId: undefined }).then((ok) => setTestMsg(tr(ok ? 'Test sent — check your notifications.' : 'This device did not accept the test notification.')))}><Bell size={15} />{tr('Send test')}</button>}
        <button type="button" className={active ? 'btn-ghost !min-h-10' : 'btn-primary !min-h-10'} onClick={() => onEnable(!active)}>{tr(active ? 'Turn off' : 'Turn on')}</button>
      </div>
    </div>
    {testMsg && <p className="mt-2 text-xs muted" role="status">{testMsg}</p>}

    {ios && !installed && <div className="ns-tip"><Smartphone size={16} /><p>{tr('On iPhone and iPad, Apple only allows notifications for apps on the Home Screen: tap')} <b>{tr('Share')}</b> → <b>{tr('Add to Home Screen')}</b>{tr(', open Life OS from there, then tap Turn on.')}</p></div>}
    {android && !installed && <div className="ns-tip"><Smartphone size={16} /><p>{tr('Tip: install Life OS (browser menu → Install app / Add to Home screen) so alerts show with the app icon and a badge count.')}</p></div>}

    <button type="button" className="ns-more" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{tr('Choose what to be notified about')}<ChevronDown size={15} className={cx('transition-transform', open && 'rotate-180')} /></button>
    {open && <div className="ns-list">
      <Row icon={<Sun size={16} />} title="Morning digest" hint="One calm summary of today: due work, classes, birthdays." on={prefs.digest} onChange={(digest) => set({ digest })}>{time(prefs.digestTime, (digestTime) => set({ digestTime }), 'At')}</Row>
      <Row icon={<ListChecks size={16} />} title="Due & overdue work" hint="Tasks, plans and goals due today, with a ✓ Mark done button." on={prefs.due} onChange={(due) => set({ due })} />
      <Row icon={<CalendarClock size={16} />} title="Classes, shifts & planner" hint="Before each class/shift in your Schedule, and planner items at their alert time." on={prefs.schedule} onChange={(schedule) => set({ schedule })}>
        <label className="ns-time"><span>{tr('Remind me')}</span><select value={prefs.scheduleLead} onChange={(event) => set({ scheduleLead: Number(event.target.value) })}>{[0, 5, 10, 15, 20, 30, 45, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes ? `${minutes} ${tr('min before')}` : tr('at start')}</option>)}</select></label>
      </Row>
      <Row icon={<Flame size={16} />} title="Evening habit nudge" hint="If daily habits are still unchecked." on={prefs.habits} onChange={(habits) => set({ habits })}>{time(prefs.habitTime, (habitTime) => set({ habitTime }), 'At')}</Row>
      <Row icon={<Users size={16} />} title="People" hint="Birthdays, follow-ups and keep-in-touch reminders from Contacts." on={prefs.contacts} onChange={(contacts) => set({ contacts })} />
      <Row icon={<MessageCircle size={16} />} title="Team chat" hint="New messages in shared projects when Life OS is in the background." on={prefs.team} onChange={(team) => set({ team })} />
      <Row icon={<Moon size={16} />} title="Quiet hours" hint="No alerts during these hours (they wait until morning)." on={Boolean(prefs.quietStart && prefs.quietEnd && prefs.quietStart !== prefs.quietEnd)} onChange={(on) => set(on ? { quietStart: '22:30', quietEnd: '07:00' } : { quietStart: '00:00', quietEnd: '00:00' })}>{time(prefs.quietStart, (quietStart) => set({ quietStart }), 'From')}{time(prefs.quietEnd, (quietEnd) => set({ quietEnd }), 'To')}</Row>
      <Row icon={<BadgeCheck size={16} />} title="App icon badge" hint="Show how many things are due on the installed app's icon." on={prefs.badge} onChange={(badge) => set({ badge })} />
      <Row icon={<Vibrate size={16} />} title="Vibrate" hint="Short vibration on phones that support it." on={prefs.vibrate} onChange={(vibrate) => set({ vibrate })} />
    </div>}
    <p className="mt-3 text-[11px] leading-4 muted">{tr('Alerts are sent while Life OS is open or running in the background on this device. Closing the app completely pauses them until you open it again.')}</p>
  </section>;
}
