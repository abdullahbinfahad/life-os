import type { Contact, ContactField, ContactGroup, ContactSocial, SocialPlatform } from './types';
import { addDays, today, uid } from './utils';

export const GROUPS: { id: ContactGroup; label: string; emoji: string; color: string }[] = [
  { id: 'friend', label: 'Friend', emoji: '😊', color: '#f59e0b' },
  { id: 'family', label: 'Family', emoji: '🏡', color: '#ec4899' },
  { id: 'work', label: 'Work', emoji: '💼', color: '#6366f1' },
  { id: 'client', label: 'Client', emoji: '🤝', color: '#10b981' },
  { id: 'mentor', label: 'Mentor', emoji: '🧭', color: '#8b5cf6' },
  { id: 'business', label: 'Business', emoji: '📈', color: '#0ea5e9' },
  { id: 'school', label: 'School', emoji: '🎓', color: '#14b8a6' },
  { id: 'service', label: 'Service', emoji: '🛠️', color: '#64748b' },
  { id: 'other', label: 'Other', emoji: '✨', color: '#94a3b8' },
];
export const groupMeta = (id: ContactGroup) => GROUPS.find((group) => group.id === id) ?? GROUPS[GROUPS.length - 1];

export const PHONE_LABELS = ['Mobile', 'WhatsApp', 'Work', 'Home', 'Office', 'Other'];
export const EMAIL_LABELS = ['Personal', 'Work', 'Other'];
export const CADENCES: { days: number; label: string }[] = [
  { days: 0, label: 'No reminder' }, { days: 7, label: 'Every week' }, { days: 14, label: 'Every 2 weeks' }, { days: 30, label: 'Every month' },
  { days: 90, label: 'Every 3 months' }, { days: 180, label: 'Every 6 months' }, { days: 365, label: 'Every year' },
];

export const SOCIALS: { id: SocialPlatform; label: string; color: string; placeholder: string }[] = [
  { id: 'linkedin', label: 'LinkedIn', color: '#0a66c2', placeholder: 'username or profile link' },
  { id: 'instagram', label: 'Instagram', color: '#e1306c', placeholder: '@username' },
  { id: 'x', label: 'X / Twitter', color: '#64748b', placeholder: '@username' },
  { id: 'facebook', label: 'Facebook', color: '#1877f2', placeholder: 'username or link' },
  { id: 'tiktok', label: 'TikTok', color: '#ee1d52', placeholder: '@username' },
  { id: 'youtube', label: 'YouTube', color: '#ff0000', placeholder: '@channel' },
  { id: 'github', label: 'GitHub', color: '#6e7681', placeholder: 'username' },
  { id: 'telegram', label: 'Telegram', color: '#229ed9', placeholder: '@username' },
  { id: 'whatsapp', label: 'WhatsApp', color: '#25d366', placeholder: 'number with country code' },
  { id: 'wechat', label: 'WeChat', color: '#07c160', placeholder: 'WeChat ID' },
  { id: 'snapchat', label: 'Snapchat', color: '#eab308', placeholder: 'username' },
  { id: 'discord', label: 'Discord', color: '#5865f2', placeholder: 'username' },
  { id: 'website', label: 'Website', color: '#0ea5e9', placeholder: 'example.com' },
  { id: 'other', label: 'Other', color: '#94a3b8', placeholder: 'link or handle' },
];
export const socialMeta = (id: SocialPlatform) => SOCIALS.find((social) => social.id === id) ?? SOCIALS[SOCIALS.length - 1];

const isUrl = (value: string) => /^https?:\/\//i.test(value.trim());
const handle = (value: string) => value.trim().replace(/^@/, '');
const digits = (value: string) => value.replace(/[^\d+]/g, '').replace(/^\+/, '');

/** A safe https link for a social profile, or null when the network has no public profile URL. */
export function socialUrl(social: Pick<ContactSocial, 'platform' | 'value'>): string | null {
  const value = social.value.trim();
  if (!value) return null;
  if (isUrl(value)) return value;
  const h = encodeURIComponent(handle(value));
  switch (social.platform) {
    case 'linkedin': return `https://www.linkedin.com/in/${h}`;
    case 'instagram': return `https://instagram.com/${h}`;
    case 'x': return `https://x.com/${h}`;
    case 'facebook': return `https://facebook.com/${h}`;
    case 'tiktok': return `https://www.tiktok.com/@${h}`;
    case 'youtube': return `https://youtube.com/@${h}`;
    case 'github': return `https://github.com/${h}`;
    case 'telegram': return `https://t.me/${h}`;
    case 'whatsapp': return digits(value) ? `https://wa.me/${digits(value)}` : null;
    case 'snapchat': return `https://snapchat.com/add/${h}`;
    case 'website': return `https://${value.replace(/^\/+/, '')}`;
    default: return /\.[a-z]{2,}/i.test(value) ? `https://${value}` : null;
  }
}

export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+*#]/g, '')}`;
export const smsHref = (phone: string) => `sms:${phone.replace(/[^\d+]/g, '')}`;
export const whatsappHref = (phone: string) => `https://wa.me/${digits(phone)}`;
export const mapsHref = (contact: Pick<Contact, 'address' | 'city' | 'country'>) => {
  const query = [contact.address, contact.city, contact.country].filter(Boolean).join(', ');
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
};
export const primaryPhone = (contact: Contact) => contact.phones.find((phone) => phone.value.trim())?.value;
export const whatsappNumber = (contact: Contact) => contact.phones.find((phone) => /whatsapp/i.test(phone.label) && phone.value.trim())?.value
  ?? contact.socials.find((social) => social.platform === 'whatsapp' && social.value.trim())?.value
  ?? primaryPhone(contact);
export const primaryEmail = (contact: Contact) => contact.emails.find((email) => email.value.trim())?.value;

export const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
const PALETTE = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#f43f5e', '#84cc16', '#0ea5e9', '#d946ef'];
export function colorFor(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index++) hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
export const subtitle = (contact: Contact) => [contact.jobTitle, contact.company].filter(Boolean).join(' · ');

/* ---------- dates ---------- */
const dayMs = 86400000;
const atNoon = (iso: string) => new Date(`${iso}T12:00:00`).getTime();
export const daysSince = (iso?: string) => iso ? Math.round((atNoon(today()) - atNoon(iso.slice(0, 10))) / dayMs) : Infinity;

/** Next birthday (YYYY-MM-DD), days until it and the age they turn (when the year is known). */
export function nextBirthday(birthday?: string) {
  if (!birthday) return null;
  const match = /^(\d{4}|--)-?(\d{2})-(\d{2})$/.exec(birthday);
  if (!match) return null;
  const [, year, month, day] = match;
  const now = today();
  let target = `${now.slice(0, 4)}-${month}-${day}`;
  if (target < now) target = `${Number(now.slice(0, 4)) + 1}-${month}-${day}`;
  const days = Math.round((atNoon(target) - atNoon(now)) / dayMs);
  const turns = /^\d{4}$/.test(year) ? Number(target.slice(0, 4)) - Number(year) : undefined;
  return { date: target, days, turns };
}

export type Attention = { contact: Contact; kind: 'follow-up' | 'birthday' | 'keep-in-touch'; days: number; label: string };
/** Everything about your network that needs you soon, most urgent first. */
export function networkAttention(contacts: Contact[], horizon = 14): Attention[] {
  const now = today();
  const rows: Attention[] = [];
  for (const contact of contacts) {
    if (contact.followUpDate && contact.followUpDate <= addDays(now, horizon)) {
      const days = Math.round((atNoon(contact.followUpDate) - atNoon(now)) / dayMs);
      rows.push({ contact, kind: 'follow-up', days, label: contact.followUpNote || 'Follow up' });
    }
    const birthday = nextBirthday(contact.birthday);
    if (birthday && birthday.days <= horizon) rows.push({ contact, kind: 'birthday', days: birthday.days, label: birthday.turns ? `Turns ${birthday.turns}` : 'Birthday' });
    if (contact.keepInTouchDays) {
      const since = daysSince(contact.lastContacted ?? contact.createdAt);
      const due = contact.keepInTouchDays - since;
      if (due <= 0) rows.push({ contact, kind: 'keep-in-touch', days: due, label: Number.isFinite(since) ? `Last talked ${since} days ago` : 'Say hello' });
    }
  }
  return rows.sort((a, b) => a.days - b.days);
}

/* ---------- photos ---------- */
export function resizePhoto(file: Blob, size = 192): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) { URL.revokeObjectURL(url); reject(new Error('Canvas unavailable')); return; }
      const side = Math.min(image.width, image.height);
      context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this image')); };
    image.src = url;
  });
}

/* ---------- smart paste (business card / email signature) ---------- */
export function parseContactText(text: string): Partial<Contact> {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const emails = [...new Set(text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [])];
  const phones = [...new Set((text.match(/(?:\+|00)?\d[\d\s().-]{6,}\d/g) ?? []).map((phone) => phone.trim()).filter((phone) => phone.replace(/\D/g, '').length >= 7))];
  const urls = [...new Set(text.match(/(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)+(?:\/[^\s,;]*)?/gi) ?? [])].filter((url) => !emails.some((email) => email.includes(url.replace(/^https?:\/\//, ''))));
  const socials: ContactSocial[] = [];
  for (const url of urls) {
    const lower = url.toLowerCase();
    const platform: SocialPlatform | null = lower.includes('linkedin.') ? 'linkedin' : lower.includes('instagram.') ? 'instagram' : /(twitter|x)\.com/.test(lower) ? 'x'
      : lower.includes('facebook.') ? 'facebook' : lower.includes('tiktok.') ? 'tiktok' : lower.includes('youtube.') ? 'youtube' : lower.includes('github.') ? 'github'
      : lower.includes('t.me') ? 'telegram' : /\.[a-z]{2,}/.test(lower) && !/^\d/.test(lower) ? 'website' : null;
    if (platform) socials.push({ id: uid(), platform, value: /^https?:/i.test(url) ? url : platform === 'website' ? url : `https://${url}` });
  }
  const handles = text.match(/(?:^|\s)@[\w.]{2,}/g)?.map((value) => value.trim()) ?? [];
  if (handles.length && !socials.some((social) => social.platform === 'instagram')) socials.push({ id: uid(), platform: 'instagram', value: handles[0] });
  const plain = lines.filter((line) => !emails.some((email) => line.includes(email)) && !phones.some((phone) => line.includes(phone)) && !/https?:|www\.|\.com\b/i.test(line));
  const name = plain.find((line) => /^[\p{L}][\p{L}'’.\- ]{1,60}$/u.test(line) && line.split(/\s+/).length <= 5) ?? '';
  const rest = plain.filter((line) => line !== name);
  const titleLine = rest.find((line) => / at |@|,|\|/.test(line)) ?? rest[0];
  let jobTitle: string | undefined; let company: string | undefined;
  if (titleLine) {
    const split = titleLine.split(/\s+at\s+|\s*@\s*|\s*[|,–—-]\s+/i);
    jobTitle = split[0]?.trim() || undefined;
    company = split[1]?.trim() || rest.find((line) => line !== titleLine && line.length < 60);
  }
  return {
    name,
    jobTitle, company,
    phones: phones.map((value, index) => ({ id: uid(), label: index === 0 ? 'Mobile' : 'Work', value })),
    emails: emails.map((value, index) => ({ id: uid(), label: index === 0 ? 'Work' : 'Other', value })),
    socials,
  };
}

/* ---------- vCard ---------- */
const esc = (value: string) => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const unesc = (value: string) => value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
const fold = (line: string) => line.length <= 74 ? line : line.match(/.{1,74}/g)!.join('\r\n ');

export function toVCard(contact: Contact): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${esc(contact.name)}`];
  const parts = contact.name.trim().split(/\s+/);
  lines.push(`N:${esc(parts.length > 1 ? parts[parts.length - 1] : '')};${esc(parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] ?? '')};;;`);
  if (contact.nickname) lines.push(`NICKNAME:${esc(contact.nickname)}`);
  if (contact.company || contact.department) lines.push(`ORG:${esc(contact.company ?? '')}${contact.department ? `;${esc(contact.department)}` : ''}`);
  if (contact.jobTitle) lines.push(`TITLE:${esc(contact.jobTitle)}`);
  for (const phone of contact.phones) if (phone.value) lines.push(`TEL;TYPE=${/work|office/i.test(phone.label) ? 'WORK' : /home/i.test(phone.label) ? 'HOME' : 'CELL'}:${phone.value}`);
  for (const email of contact.emails) if (email.value) lines.push(`EMAIL;TYPE=${/work/i.test(email.label) ? 'WORK' : 'HOME'},INTERNET:${email.value}`);
  if (contact.address || contact.city || contact.country) lines.push(`ADR;TYPE=HOME:;;${esc(contact.address ?? '')};${esc(contact.city ?? '')};;;${esc(contact.country ?? '')}`);
  if (contact.birthday && /^\d{4}-\d{2}-\d{2}$/.test(contact.birthday)) lines.push(`BDAY:${contact.birthday}`);
  for (const social of contact.socials) {
    const url = socialUrl(social);
    if (social.platform === 'website' && url) lines.push(`URL:${url}`);
    else if (social.value) lines.push(`X-SOCIALPROFILE;TYPE=${social.platform}:${url ?? social.value}`);
  }
  const note = [contact.notes, contact.howWeMet && `How we met: ${contact.howWeMet}`, contact.canHelpWith && `Can help with: ${contact.canHelpWith}`].filter(Boolean).join('\n');
  if (note) lines.push(`NOTE:${esc(note)}`);
  if (contact.tags.length) lines.push(`CATEGORIES:${contact.tags.map(esc).join(',')}`);
  if (contact.photo?.startsWith('data:image/jpeg;base64,')) lines.push(`PHOTO;ENCODING=b;TYPE=JPEG:${contact.photo.split(',')[1]}`);
  lines.push('END:VCARD');
  return lines.map(fold).join('\r\n');
}

export function parseVCards(text: string): Array<Partial<Contact> & { name: string }> {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const cards = unfolded.split(/BEGIN:VCARD/i).slice(1);
  const out: Array<Partial<Contact> & { name: string }> = [];
  for (const card of cards) {
    const contact: Partial<Contact> & { name: string } = { name: '', phones: [] as ContactField[], emails: [] as ContactField[], socials: [] as ContactSocial[], tags: [] };
    let structured = '';
    for (const raw of card.split(/\r?\n/)) {
      const colon = raw.indexOf(':');
      if (colon < 0) continue;
      const head = raw.slice(0, colon); const value = raw.slice(colon + 1).trim();
      const key = head.split(';')[0].replace(/^item\d+\./i, '').toUpperCase();
      const params = head.toUpperCase();
      if (!value) continue;
      if (key === 'FN') contact.name = unesc(value);
      else if (key === 'N') structured = value.split(';').slice(0, 2).reverse().filter(Boolean).map(unesc).join(' ');
      else if (key === 'NICKNAME') contact.nickname = unesc(value);
      else if (key === 'ORG') { const [org, dept] = value.split(';'); contact.company = unesc(org ?? '') || undefined; if (dept) contact.department = unesc(dept); }
      else if (key === 'TITLE') contact.jobTitle = unesc(value);
      else if (key === 'TEL') contact.phones!.push({ id: uid(), label: params.includes('WORK') ? 'Work' : params.includes('HOME') ? 'Home' : 'Mobile', value });
      else if (key === 'EMAIL') contact.emails!.push({ id: uid(), label: params.includes('WORK') ? 'Work' : 'Personal', value });
      else if (key === 'ADR') { const parts = value.split(';').map(unesc); contact.address = [parts[2]].filter(Boolean).join(', ') || undefined; contact.city = parts[3] || undefined; contact.country = parts[6] || undefined; }
      else if (key === 'BDAY') { const iso = value.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3').slice(0, 10); if (/^(\d{4}|--)-?\d{2}-\d{2}$/.test(iso)) contact.birthday = iso; }
      else if (key === 'URL') contact.socials!.push({ id: uid(), platform: 'website', value });
      else if (key === 'X-SOCIALPROFILE') { const type = /TYPE=([\w-]+)/.exec(params)?.[1]?.toLowerCase() as SocialPlatform | undefined; contact.socials!.push({ id: uid(), platform: type && SOCIALS.some((social) => social.id === type) ? type : 'other', value }); }
      else if (key === 'NOTE') contact.notes = unesc(value);
      else if (key === 'CATEGORIES') contact.tags = value.split(',').map(unesc).map((tag) => tag.trim()).filter(Boolean);
      else if (key === 'PHOTO' && /ENCODING=B|BASE64/.test(params) && value.length < 120000) contact.photo = `data:image/${/PNG/.test(params) ? 'png' : 'jpeg'};base64,${value}`;
    }
    if (!contact.name) contact.name = structured || contact.emails![0]?.value || contact.phones![0]?.value || '';
    if (contact.name) out.push(contact);
  }
  return out;
}

export function downloadText(filename: string, text: string, type = 'text/vcard') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Share a contact card with the phone's share sheet, falling back to a download. */
export async function shareContact(contact: Contact) {
  const card = toVCard(contact);
  const filename = `${contact.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'contact'}.vcf`;
  try {
    const file = new File([card], filename, { type: 'text/vcard' });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: contact.name }); return 'shared'; }
  } catch (error) { if ((error as Error)?.name === 'AbortError') return 'cancelled'; }
  downloadText(filename, card);
  return 'downloaded';
}

/** Android Chrome can pick people straight from the phone's address book. */
export const contactPickerSupported = () => typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;
export async function pickFromPhone(): Promise<Array<Partial<Contact> & { name: string }>> {
  const picker = (navigator as unknown as { contacts: { select: (props: string[], options: { multiple: boolean }) => Promise<Array<{ name?: string[]; email?: string[]; tel?: string[]; address?: Array<{ addressLine?: string[]; city?: string; country?: string }> }>> } }).contacts;
  const picked = await picker.select(['name', 'email', 'tel', 'address'], { multiple: true });
  return picked.map((row) => ({
    name: row.name?.[0] ?? row.email?.[0] ?? row.tel?.[0] ?? '',
    phones: (row.tel ?? []).map((value, index) => ({ id: uid(), label: index ? 'Other' : 'Mobile', value })),
    emails: (row.email ?? []).map((value, index) => ({ id: uid(), label: index ? 'Other' : 'Personal', value })),
    address: row.address?.[0]?.addressLine?.join(', '), city: row.address?.[0]?.city, country: row.address?.[0]?.country,
  })).filter((row) => row.name);
}

/** People who may already be saved (same phone digits, email or name). */
export function findDuplicates(draft: Partial<Contact>, contacts: Contact[]) {
  const phoneSet = new Set((draft.phones ?? []).map((phone) => phone.value.replace(/\D/g, '').slice(-9)).filter((value) => value.length >= 7));
  const emailSet = new Set((draft.emails ?? []).map((email) => email.value.trim().toLowerCase()).filter(Boolean));
  const name = draft.name?.trim().toLowerCase();
  return contacts.filter((contact) => contact.id !== draft.id && (
    (name && contact.name.trim().toLowerCase() === name)
    || contact.phones.some((phone) => phoneSet.has(phone.value.replace(/\D/g, '').slice(-9)))
    || contact.emails.some((email) => emailSet.has(email.value.trim().toLowerCase()))
  ));
}
