/* OpenWeatherMap (free tier): current conditions + 5-day / 3-hour forecast, cached on the device. */
import type { Settings } from './types';

const KEY = (import.meta.env.VITE_OPENWEATHER_KEY as string | undefined) || '74351fc4506189169ae562b7e786a8f7';
const API = 'https://api.openweathermap.org';
const TTL = 25 * 60 * 1000;

export type Units = 'metric' | 'imperial';
export interface WeatherNow { temp: number; feels: number; min: number; max: number; humidity: number; wind: number; code: number; main: string; description: string; icon: string; sunrise: number; sunset: number; city: string; at: number }
export interface WeatherSlot { time: number; temp: number; feels: number; code: number; main: string; description: string; icon: string; pop: number; rain: number; wind: number }
export interface WeatherData { now: WeatherNow; slots: WeatherSlot[]; units: Units; fetchedAt: number; lat: number; lon: number }
export interface Place { name: string; lat: number; lon: number; country?: string; state?: string }

export class WeatherError extends Error { constructor(message: string, public kind: 'key' | 'network' | 'location' | 'other') { super(message); } }

async function call<T>(path: string): Promise<T> {
  let response: Response;
  try { response = await fetch(`${API}${path}${path.includes('?') ? '&' : '?'}appid=${KEY}`); }
  catch { throw new WeatherError('Weather is unreachable right now. Check your connection.', 'network'); }
  if (response.status === 401) throw new WeatherError('The weather key is not active yet (new OpenWeatherMap keys can take up to 2 hours).', 'key');
  if (!response.ok) throw new WeatherError(`Weather service error (${response.status}).`, 'other');
  return response.json() as Promise<T>;
}

export async function searchPlaces(query: string): Promise<Place[]> {
  if (!query.trim()) return [];
  const rows = await call<Array<{ name: string; lat: number; lon: number; country?: string; state?: string; local_names?: Record<string, string> }>>(`/geo/1.0/direct?q=${encodeURIComponent(query.trim())}&limit=6`);
  return rows.map((row) => ({ name: row.name, lat: row.lat, lon: row.lon, country: row.country, state: row.state }));
}

export function deviceLocation(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject(new WeatherError('This device cannot share its location.', 'location')); return; }
    navigator.geolocation.getCurrentPosition((position) => resolve({ lat: Math.round(position.coords.latitude * 100) / 100, lon: Math.round(position.coords.longitude * 100) / 100 }),
      () => reject(new WeatherError('Location permission was not given. Pick a city instead.', 'location')), { maximumAge: 30 * 60 * 1000, timeout: 12000 });
  });
}

const cacheKey = (lat: number, lon: number, units: Units) => `lifeos-weather:${lat.toFixed(2)},${lon.toFixed(2)}:${units}`;
export function cachedWeather(lat: number, lon: number, units: Units): WeatherData | null {
  try { const data = JSON.parse(localStorage.getItem(cacheKey(lat, lon, units)) ?? 'null') as WeatherData | null; return data; } catch { return null; }
}

let inflight: Promise<WeatherData> | null = null;
export async function getWeather(lat: number, lon: number, units: Units, force = false): Promise<WeatherData> {
  const cached = cachedWeather(lat, lon, units);
  if (!force && cached && Date.now() - cached.fetchedAt < TTL) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    type Cur = { main: { temp: number; feels_like: number; temp_min: number; temp_max: number; humidity: number }; wind: { speed: number }; weather: Array<{ id: number; main: string; description: string; icon: string }>; sys: { sunrise: number; sunset: number }; name: string; dt: number };
    type Fc = { list: Array<{ dt: number; main: { temp: number; feels_like: number }; weather: Array<{ id: number; main: string; description: string; icon: string }>; pop?: number; rain?: { '3h'?: number }; snow?: { '3h'?: number }; wind: { speed: number } }> };
    const [cur, fc] = await Promise.all([call<Cur>(`/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}`), call<Fc>(`/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${units}`)]);
    const todayKey = new Date().toDateString();
    const todays = fc.list.filter((row) => new Date(row.dt * 1000).toDateString() === todayKey).map((row) => row.main.temp);
    const data: WeatherData = {
      units, lat, lon, fetchedAt: Date.now(),
      now: { temp: cur.main.temp, feels: cur.main.feels_like, min: Math.min(cur.main.temp_min, ...todays), max: Math.max(cur.main.temp_max, ...todays), humidity: cur.main.humidity, wind: cur.wind.speed, code: cur.weather[0]?.id ?? 800, main: cur.weather[0]?.main ?? 'Clear', description: cur.weather[0]?.description ?? '', icon: cur.weather[0]?.icon ?? '01d', sunrise: cur.sys.sunrise * 1000, sunset: cur.sys.sunset * 1000, city: cur.name, at: cur.dt * 1000 },
      slots: fc.list.map((row) => ({ time: row.dt * 1000, temp: row.main.temp, feels: row.main.feels_like, code: row.weather[0]?.id ?? 800, main: row.weather[0]?.main ?? 'Clear', description: row.weather[0]?.description ?? '', icon: row.weather[0]?.icon ?? '01d', pop: row.pop ?? 0, rain: (row.rain?.['3h'] ?? 0) + (row.snow?.['3h'] ?? 0), wind: row.wind.speed })),
    };
    try { localStorage.setItem(cacheKey(lat, lon, units), JSON.stringify(data)); } catch { /* quota */ }
    return data;
  })();
  try { return await inflight; } finally { inflight = null; }
}

/** Where to get weather for: saved city, or the device location remembered from last time. */
export function weatherPlace(settings: Settings): { lat: number; lon: number; name?: string; units: Units } | null {
  const w = settings.weather;
  if (!w || w.lat === undefined || w.lon === undefined) return null;
  return { lat: w.lat, lon: w.lon, name: w.name, units: w.units ?? 'metric' };
}

/* ---------------- presentation ---------------- */
export function emojiFor(code: number, icon = '01d') {
  const night = icon.endsWith('n');
  if (code >= 200 && code < 300) return '⛈️';
  if (code >= 300 && code < 400) return '🌦️';
  if (code >= 500 && code < 600) return code === 511 ? '🌨️' : code >= 502 ? '🌧️' : '🌦️';
  if (code >= 600 && code < 700) return '❄️';
  if (code >= 700 && code < 800) return '🌫️';
  if (code === 800) return night ? '🌙' : '☀️';
  if (code === 801) return night ? '☁️' : '🌤️';
  if (code === 802) return '⛅';
  return '☁️';
}
export const unitSymbol = (units: Units) => units === 'imperial' ? '°F' : '°C';
export const windUnit = (units: Units) => units === 'imperial' ? 'mph' : 'm/s';
export const toC = (temp: number, units: Units) => units === 'imperial' ? (temp - 32) * 5 / 9 : temp;
export const slotAt = (data: WeatherData | null, time: number) => data?.slots.reduce<WeatherSlot | null>((best, slot) => !best || Math.abs(slot.time - time) < Math.abs(best.time - time) ? slot : best, null) ?? null;

export type WeatherAlertKind = 'storm' | 'rain' | 'snow' | 'hot' | 'cold' | 'wind' | 'fog';
export interface WeatherAlert { kind: WeatherAlertKind; at: number; title: string; advice: string; slot: WeatherSlot }

/** Advice for the next `hours` hours. Thresholds are in °C (converted for °F users). */
export function weatherAlerts(data: WeatherData | null, hours = 6, hotAt = 33, coldAt = 5, now = Date.now()): WeatherAlert[] {
  if (!data) return [];
  const units = data.units;
  const window = data.slots.filter((slot) => slot.time + 3 * 3600000 > now && slot.time <= now + hours * 3600000);
  const alerts: WeatherAlert[] = [];
  const first = <T,>(rows: T[], test: (row: T) => boolean) => rows.find(test);
  const storm = first(window, (slot) => slot.code >= 200 && slot.code < 300);
  if (storm) alerts.push({ kind: 'storm', at: storm.time, slot: storm, title: 'Thunderstorm expected', advice: 'Stay indoors if you can, avoid open areas and trees, and keep your phone charged.' });
  const snow = first(window, (slot) => slot.code >= 600 && slot.code < 700);
  if (snow) alerts.push({ kind: 'snow', at: snow.time, slot: snow, title: 'Snow expected', advice: 'Wear warm, waterproof shoes, leave early and watch for icy paths.' });
  const rain = !storm && first(window, (slot) => (slot.code >= 300 && slot.code < 600 && slot.code !== 511) || (slot.pop >= 0.6 && slot.rain > 0.3));
  if (rain) alerts.push({ kind: 'rain', at: rain.time, slot: rain, title: rain.rain >= 4 || rain.code >= 502 ? 'Heavy rain expected' : 'Rain expected', advice: rain.rain >= 4 || rain.code >= 502 ? 'Take an umbrella and a rain jacket, allow extra travel time and protect your laptop/bag.' : 'Take an umbrella and wear shoes that can get wet.' });
  const hot = first(window, (slot) => toC(slot.feels, units) >= hotAt);
  if (hot) alerts.push({ kind: 'hot', at: hot.time, slot: hot, title: `Very hot · feels like ${Math.round(hot.feels)}${unitSymbol(units)}`, advice: 'Drink water regularly, wear light clothes and sunscreen, and avoid long time in direct sun around midday.' });
  const cold = first(window, (slot) => toC(slot.feels, units) <= coldAt);
  if (cold) alerts.push({ kind: 'cold', at: cold.time, slot: cold, title: `Cold · feels like ${Math.round(cold.feels)}${unitSymbol(units)}`, advice: toC(cold.feels, units) <= -5 ? 'Dress in layers with a hat, gloves and a scarf; limit time outside.' : 'Wear a warm jacket and layers before you head out.' });
  const windy = first(window, (slot) => (units === 'imperial' ? slot.wind / 2.237 : slot.wind) >= 11);
  if (windy) alerts.push({ kind: 'wind', at: windy.time, slot: windy, title: `Strong wind · ${Math.round(windy.wind)} ${windUnit(units)}`, advice: 'Secure loose items, be careful on bikes/scooters, and an umbrella may not help.' });
  const fog = first(window, (slot) => slot.code === 741 || slot.code === 701);
  if (fog) alerts.push({ kind: 'fog', at: fog.time, slot: fog, title: 'Fog or mist', advice: 'Visibility will be low — drive slowly and use headlights.' });
  return alerts.sort((a, b) => a.at - b.at);
}

/** A one-line "what to wear / bring" tip for the current conditions. */
export function dailyTip(data: WeatherData | null): string | null {
  if (!data) return null;
  const alerts = weatherAlerts(data, 12);
  if (alerts.length) return alerts[0].advice;
  const c = toC(data.now.feels, data.units);
  if (c >= 28) return 'Warm day — light clothes and water bottle.';
  if (c <= 12) return 'Cool day — bring a jacket.';
  return 'Pleasant weather — a good day to get outside.';
}
