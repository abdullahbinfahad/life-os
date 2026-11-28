import { translate as tr } from '../lib/locales';
import { AlertTriangle, Droplets, LocateFixed, MapPin, RefreshCw, Search, Settings2, Sunrise, Sunset, Wind, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { cx, localeForLanguage } from '../lib/utils';
import { notifyPrefs } from '../lib/notify';
import { WeatherError, cachedWeather, dailyTip, deviceLocation, emojiFor, getWeather, searchPlaces, unitSymbol, weatherAlerts, weatherPlace, windUnit, type Place, type WeatherData } from '../lib/weather';
import './WeatherCard.css';

export function useWeather() {
  const settings = useStore((state) => state.settings);
  const place = weatherPlace(settings);
  const [data, setData] = useState<WeatherData | null>(() => place ? cachedWeather(place.lat, place.lon, place.units) : null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(async (force = false) => {
    if (!place) return;
    setLoading(true);
    try { setData(await getWeather(place.lat, place.lon, place.units, force)); setError(''); }
    catch (problem) { setError(problem instanceof WeatherError ? problem.message : 'Could not load the weather.'); }
    finally { setLoading(false); }
  }, [place?.lat, place?.lon, place?.units]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!place) { setData(null); return; }
    setData(cachedWeather(place.lat, place.lon, place.units));
    void load();
    const timer = window.setInterval(() => void load(), 30 * 60000);
    return () => window.clearInterval(timer);
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, loading, reload: () => void load(true), place };
}

function PlacePicker({ onDone }: { onDone?: () => void }) {
  const settings = useStore((state) => state.settings);
  const updateSettings = useStore((state) => state.updateSettings);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const units = settings.weather?.units ?? 'metric';
  const save = (patch: NonNullable<typeof settings.weather>) => { updateSettings({ weather: { ...(settings.weather ?? {}), ...patch } }); onDone?.(); };
  const locate = async () => {
    setBusy(true); setMessage('');
    try { const position = await deviceLocation(); save({ ...position, name: undefined, useDevice: true }); }
    catch (problem) { setMessage(problem instanceof Error ? tr(problem.message) : tr('Could not get your location.')); }
    finally { setBusy(false); }
  };
  const search = async () => {
    if (!query.trim()) return;
    setBusy(true); setMessage('');
    try { const rows = await searchPlaces(query); setResults(rows); if (!rows.length) setMessage(tr('No places found.')); }
    catch (problem) { setMessage(problem instanceof Error ? tr(problem.message) : tr('Search failed.')); }
    finally { setBusy(false); }
  };
  return <div className="wx-picker">
    <button type="button" className="btn-primary w-full justify-center" disabled={busy} onClick={() => void locate()}><LocateFixed size={16} />{tr('Use my location')}</button>
    <form className="mt-2 flex min-w-0 gap-2" onSubmit={(event) => { event.preventDefault(); void search(); }}>
      <input className="input min-w-0 flex-1" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr('Or search a city…')} aria-label={tr('City')} />
      <button type="submit" className="btn-outline shrink-0" disabled={busy || !query.trim()} aria-label={tr('Search')}><Search size={16} /></button>
    </form>
    {results.length > 0 && <ul className="mt-2 grid gap-1">{results.map((place) => <li key={`${place.lat},${place.lon}`}><button type="button" className="wx-result" onClick={() => save({ lat: Math.round(place.lat * 100) / 100, lon: Math.round(place.lon * 100) / 100, name: place.name, useDevice: false })}><MapPin size={14} />{place.name}<span className="muted">{[place.state, place.country].filter(Boolean).join(', ')}</span></button></li>)}</ul>}
    <div className="mt-2 flex items-center gap-2 text-xs"><span className="muted">{tr('Units')}</span>{(['metric', 'imperial'] as const).map((value) => <button key={value} type="button" className={cx('wx-unit', units === value && 'is-on')} onClick={() => updateSettings({ weather: { ...(settings.weather ?? {}), units: value } })}>{value === 'metric' ? '°C' : '°F'}</button>)}</div>
    {message && <p className="mt-2 text-xs text-rose-500">{message}</p>}
  </div>;
}

export default function WeatherCard({ compact = false }: { compact?: boolean }) {
  const settings = useStore((state) => state.settings);
  const locale = localeForLanguage(settings.language ?? 'en');
  const { data, error, loading, reload, place } = useWeather();
  const [editing, setEditing] = useState(false);
  const prefs = notifyPrefs(settings);
  if (!place || editing) return <section className="wx-card">
    <header className="wx-head"><span className="text-sm font-semibold">🌤️ {tr('Weather')}</span>{place && <button type="button" className="wx-icon-btn" onClick={() => setEditing(false)} aria-label={tr('Close')}><X size={15} /></button>}</header>
    <p className="mb-3 text-xs muted">{tr('See today’s weather and get alerts before rain, heat or cold — with advice.')}</p>
    <PlacePicker onDone={() => setEditing(false)} />
  </section>;
  const sym = unitSymbol(place.units);
  const now = data?.now;
  const alerts = weatherAlerts(data, compact ? 12 : 24, prefs.hotAt, prefs.coldAt);
  const hours = (data?.slots ?? []).filter((slot) => slot.time > Date.now() - 3600000).slice(0, 8);
  const days = (() => {
    const map = new Map<string, { min: number; max: number; code: number; icon: string; pop: number }>();
    for (const slot of data?.slots ?? []) {
      const key = new Date(slot.time).toDateString();
      const row = map.get(key) ?? { min: Infinity, max: -Infinity, code: slot.code, icon: slot.icon, pop: 0 };
      row.min = Math.min(row.min, slot.temp); row.max = Math.max(row.max, slot.temp); row.pop = Math.max(row.pop, slot.pop);
      const hour = new Date(slot.time).getHours(); if (hour >= 11 && hour <= 14) { row.code = slot.code; row.icon = slot.icon; }
      map.set(key, row);
    }
    return [...map.entries()].slice(0, 5);
  })();
  return <section className={cx('wx-card', compact && 'is-compact')} aria-label={tr('Weather')}>
    <header className="wx-head">
      <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold muted"><MapPin size={12} /><span className="truncate">{place.name ?? now?.city ?? tr('My location')}</span></span>
      <span className="flex items-center">
        <button type="button" className="wx-icon-btn" onClick={reload} aria-label={tr('Refresh weather')}><RefreshCw size={14} className={cx(loading && 'animate-spin')} /></button>
        <button type="button" className="wx-icon-btn" onClick={() => setEditing(true)} aria-label={tr('Weather settings')}><Settings2 size={14} /></button>
      </span>
    </header>
    {error && !now && <p className="wx-error"><AlertTriangle size={14} />{tr(error)}</p>}
    {!now && !error && <div className="wx-skel" />}
    {now && <>
      <div className="wx-main">
        <span className="wx-emoji" aria-hidden="true">{emojiFor(now.code, now.icon)}</span>
        <div className="min-w-0 flex-1">
          <p className="wx-temp">{Math.round(now.temp)}<small>{sym}</small></p>
          <p className="truncate text-sm capitalize">{now.description}</p>
          <p className="text-xs muted">{tr('Feels')} {Math.round(now.feels)}° · {tr('H')} {Math.round(now.max)}° {tr('L')} {Math.round(now.min)}°</p>
        </div>
        {!compact && <div className="wx-facts">
          <span><Droplets size={12} />{now.humidity}%</span>
          <span><Wind size={12} />{Math.round(now.wind)} {windUnit(place.units)}</span>
          <span><Sunrise size={12} />{new Date(now.sunrise).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}</span>
          <span><Sunset size={12} />{new Date(now.sunset).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}</span>
        </div>}
      </div>
      {alerts.length > 0 ? <div className="wx-alerts">{alerts.slice(0, compact ? 2 : 3).map((alert) => <div key={alert.kind} className={cx('wx-alert', `is-${alert.kind}`)}>
        <b>{alert.kind === 'hot' ? '🥵' : alert.kind === 'cold' ? '🥶' : alert.kind === 'wind' ? '💨' : emojiFor(alert.slot.code, alert.slot.icon)} {tr(alert.title)}{alert.at > Date.now() + 30 * 60000 ? ` · ${new Date(alert.at).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}` : ''}</b>
        <span>{tr(alert.advice)}</span>
      </div>)}</div> : <p className="wx-tip">💡 {tr(dailyTip(data) ?? '')}</p>}
      <div className="wx-hours">{hours.map((slot) => <div key={slot.time} className="wx-hour"><span className="muted">{new Date(slot.time).toLocaleTimeString(locale, { hour: 'numeric' })}</span><span className="text-lg leading-none">{emojiFor(slot.code, slot.icon)}</span><b>{Math.round(slot.temp)}°</b>{slot.pop >= 0.3 && <span className="wx-pop">{Math.round(slot.pop * 100)}%</span>}</div>)}</div>
      {!compact && days.length > 1 && <div className="wx-days">{days.map(([key, row], index) => <div key={key} className="wx-day"><span className="w-12 text-xs font-semibold">{index === 0 ? tr('Today') : new Date(key).toLocaleDateString(locale, { weekday: 'short' })}</span><span className="text-base">{emojiFor(row.code, row.icon)}</span>{row.pop >= 0.3 ? <span className="wx-pop w-9">{Math.round(row.pop * 100)}%</span> : <span className="w-9" />}<span className="w-8 text-right text-xs tabular-nums muted">{Math.round(row.min)}°</span><span className="wx-bar"><i style={{ left: `${Math.max(0, (row.min - (days.reduce((m, [, d]) => Math.min(m, d.min), Infinity))) / Math.max(1, days.reduce((m, [, d]) => Math.max(m, d.max), -Infinity) - days.reduce((m, [, d]) => Math.min(m, d.min), Infinity)) * 100)}%`, right: `${Math.max(0, (days.reduce((m, [, d]) => Math.max(m, d.max), -Infinity) - row.max) / Math.max(1, days.reduce((m, [, d]) => Math.max(m, d.max), -Infinity) - days.reduce((m, [, d]) => Math.min(m, d.min), Infinity)) * 100)}%` }} /></span><span className="w-8 text-xs font-semibold tabular-nums">{Math.round(row.max)}°</span></div>)}</div>}
      {error && <p className="mt-2 text-[11px] muted">{tr('Showing saved forecast')} · {tr(error)}</p>}
    </>}
  </section>;
}
