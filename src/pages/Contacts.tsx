import { translate as tr } from '../lib/locales';
import { ArrowLeft, AtSign, Briefcase, Building2, Cake, Calendar, Check, ChevronDown, ClipboardPaste, Copy, Download, Facebook, Github, Globe, Handshake, Heart, Instagram, Linkedin, Mail, MapPin, MessageCircle, MessageSquareText, MoreHorizontal, Pencil, Phone, PhoneCall, Plus, Search, Send, Share2, Smartphone, Star, Tag, Trash2, Twitter, Upload, UserPlus, Users, X, Youtube } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import type { Contact, ContactField, ContactGroup, ContactInteraction, SocialPlatform } from '../lib/types';
import { addDays, cx, localeForLanguage, today, uid } from '../lib/utils';
import {
  CADENCES, EMAIL_LABELS, GROUPS, PHONE_LABELS, SOCIALS, colorFor, contactPickerSupported, daysSince, downloadText, findDuplicates, groupMeta, initials,
  mapsHref, networkAttention, nextBirthday, parseContactText, parseVCards, pickFromPhone, primaryEmail, primaryPhone, resizePhoto, shareContact, smsHref,
  socialMeta, socialUrl, subtitle, telHref, toVCard, whatsappHref, whatsappNumber,
} from '../lib/contacts';
import { PillSelect, relativeDay, timeAgo } from '../components/projects/team/shared';
import { playFeedback } from '../lib/sounds';
import '../components/projects/team/TeamWorkspace.css';
import './Contacts.css';

type Sort = 'name' | 'recent' | 'contacted' | 'company';
const SOCIAL_ICON: Partial<Record<SocialPlatform, typeof Globe>> = { linkedin: Linkedin, instagram: Instagram, x: Twitter, facebook: Facebook, github: Github, youtube: Youtube, telegram: Send, whatsapp: MessageCircle, website: Globe };
const INTERACTIONS: { kind: ContactInteraction['kind']; label: string; icon: typeof Phone }[] = [
  { kind: 'call', label: 'Called', icon: PhoneCall }, { kind: 'message', label: 'Messaged', icon: MessageSquareText },
  { kind: 'meeting', label: 'Met', icon: Handshake }, { kind: 'email', label: 'Emailed', icon: Mail },
];

export function ContactAvatar({ contact, size = 44, className }: { contact: Pick<Contact, 'name' | 'photo' | 'id'>; size?: number; className?: string }) {
  const color = colorFor(contact.id || contact.name);
  return contact.photo
    ? <img src={contact.photo} alt="" className={cx('ct-avatar', className)} style={{ width: size, height: size }} />
    : <span aria-hidden="true" className={cx('ct-avatar', className)} style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: `linear-gradient(135deg, ${color}, ${color}aa)` }}>{initials(contact.name)}</span>;
}

/* ======================= Editor ======================= */

type Draft = Omit<Contact, 'id' | 'createdAt' | 'updatedAt' | 'interactions'> & { id?: string };
const blankDraft = (): Draft => ({ name: '', phones: [{ id: uid(), label: 'Mobile', value: '' }], emails: [{ id: uid(), label: 'Personal', value: '' }], socials: [], group: 'friend', tags: [], favorite: false, notes: '' });
const toDraft = (contact: Contact): Draft => ({ ...contact, phones: contact.phones.length ? contact.phones : [{ id: uid(), label: 'Mobile', value: '' }], emails: contact.emails.length ? contact.emails : [{ id: uid(), label: 'Personal', value: '' }] });

function Section({ title, icon, open, onToggle, children, hint }: { title: string; icon: ReactNode; open: boolean; onToggle: () => void; children: ReactNode; hint?: string }) {
  return <section className={cx('ct-sec', open && 'is-open')}>
    <button type="button" className="ct-sec-head" aria-expanded={open} onClick={onToggle}><span className="ct-sec-icon">{icon}</span><span className="min-w-0 flex-1 text-left"><b>{tr(title)}</b>{hint && !open && <span className="block truncate text-xs muted">{hint}</span>}</span><ChevronDown size={16} className={cx('shrink-0 transition-transform', open && 'rotate-180')} /></button>
    {open && <div className="ct-sec-body">{children}</div>}
  </section>;
}

function FieldList({ rows, labels, type, placeholder, onChange, addLabel }: { rows: ContactField[]; labels: string[]; type: 'tel' | 'email'; placeholder: string; onChange: (rows: ContactField[]) => void; addLabel: string }) {
  return <div className="grid gap-2">
    {rows.map((row, index) => <div key={row.id} className="ct-field-row">
      <PillSelect className="ct-label-pill" value={labels.includes(row.label) ? row.label : 'Other'} ariaLabel={tr('Label')} onChange={(label) => onChange(rows.map((item) => item.id === row.id ? { ...item, label } : item))} options={labels.map((label) => ({ value: label, label: tr(label) }))} />
      <input className="input min-w-0 flex-1" type={type} inputMode={type === 'tel' ? 'tel' : 'email'} autoComplete="off" value={row.value} placeholder={tr(placeholder)} onChange={(event) => onChange(rows.map((item) => item.id === row.id ? { ...item, value: event.target.value } : item))} aria-label={`${tr(row.label)} ${index + 1}`} />
      <button type="button" className="tap-action !opacity-60" aria-label={tr('Remove')} onClick={() => onChange(rows.filter((item) => item.id !== row.id))}><X size={15} /></button>
    </div>)}
    <button type="button" className="ct-add-line" onClick={() => onChange([...rows, { id: uid(), label: rows.length ? labels[1] ?? labels[0] : labels[0], value: '' }])}><Plus size={14} />{tr(addLabel)}</button>
  </div>;
}

function ContactEditor({ initial, contacts, onSave, onClose, onOpenExisting }: { initial: Draft; contacts: Contact[]; onSave: (draft: Draft) => void; onClose: () => void; onOpenExisting: (id: string) => void }) {
  const [draft, setDraft] = useState<Draft>(initial);
  const editing = Boolean(initial.id);
  const [open, setOpen] = useState<Record<string, boolean>>({ work: editing || !!initial.company, social: editing && initial.socials.length > 0, place: false, personal: false, touch: false, notes: false });
  const [paste, setPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [photoError, setPhotoError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const toggle = (key: string) => setOpen((current) => ({ ...current, [key]: !current[key] }));
  const duplicates = useMemo(() => findDuplicates(draft, contacts).slice(0, 2), [draft, contacts]);
  const allTags = useMemo(() => [...new Set(contacts.flatMap((contact) => contact.tags))].filter((tag) => !draft.tags.includes(tag)).slice(0, 8), [contacts, draft.tags]);
  const addTag = (value: string) => { const tag = value.trim().replace(/^#/, ''); if (tag && !draft.tags.includes(tag)) set({ tags: [...draft.tags, tag] }); setTagInput(''); };
  const applyPaste = () => {
    const parsed = parseContactText(pasteText);
    setDraft((current) => ({
      ...current,
      name: current.name || parsed.name || '',
      jobTitle: current.jobTitle || parsed.jobTitle, company: current.company || parsed.company,
      phones: [...current.phones.filter((phone) => phone.value.trim()), ...(parsed.phones ?? [])],
      emails: [...current.emails.filter((email) => email.value.trim()), ...(parsed.emails ?? [])],
      socials: [...current.socials, ...(parsed.socials ?? [])],
    }));
    if (parsed.company || parsed.jobTitle) setOpen((current) => ({ ...current, work: true }));
    if (parsed.socials?.length) setOpen((current) => ({ ...current, social: true }));
    setPaste(false); setPasteText('');
  };
  const save = () => {
    if (!draft.name.trim()) return;
    onSave({ ...draft, name: draft.name.trim(), phones: draft.phones.filter((phone) => phone.value.trim()), emails: draft.emails.filter((email) => email.value.trim()), socials: draft.socials.filter((social) => social.value.trim()), tags: tagInput.trim() ? [...draft.tags, tagInput.trim()] : draft.tags });
  };
  const birthdayKnownYear = !draft.birthday?.startsWith('--');

  return <div className="tw-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="tw-modal-card ct-editor" role="dialog" aria-modal="true" aria-labelledby="contact-editor-title">
      <header className="ct-editor-head">
        <button type="button" className="tw-icon-btn" onClick={onClose} aria-label={tr('Close')}><X size={18} /></button>
        <h2 id="contact-editor-title" className="min-w-0 flex-1 truncate text-center text-base font-semibold">{tr(editing ? 'Edit contact' : 'New contact')}</h2>
        <button type="button" className="btn-primary !min-h-9 !px-4" disabled={!draft.name.trim()} onClick={save}>{tr('Save')}</button>
      </header>
      <div className="ct-editor-body">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" className="ct-photo-btn" onClick={() => fileRef.current?.click()} aria-label={tr('Add photo')}>
            <ContactAvatar contact={{ id: draft.id ?? draft.name, name: draft.name || '?', photo: draft.photo }} size={72} />
            <span className="ct-photo-badge"><Pencil size={12} /></span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void resizePhoto(file).then((photo) => { set({ photo }); setPhotoError(''); }).catch(() => setPhotoError(tr('Could not read this image'))); }} />
          <div className="grid min-w-0 flex-1 gap-2">
            <input autoFocus className="input min-w-0 text-base font-semibold" value={draft.name} onChange={(event) => set({ name: event.target.value })} placeholder={tr('Full name')} aria-label={tr('Full name')} maxLength={120} />
            <input className="input min-w-0" value={draft.nickname ?? ''} onChange={(event) => set({ nickname: event.target.value || undefined })} placeholder={tr('Nickname (optional)')} aria-label={tr('Nickname')} maxLength={60} />
          </div>
        </div>
        {draft.photo && <button type="button" className="tw-link-btn mt-1 text-rose-500" onClick={() => set({ photo: undefined })}><Trash2 size={12} />{tr('Remove photo')}</button>}
        {photoError && <p className="mt-1 text-xs text-rose-500">{photoError}</p>}

        {!editing && (paste ? <div className="ct-paste">
          <textarea autoFocus className="input min-h-28 min-w-0 text-sm" value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder={tr('Paste an email signature, business card text or bio. Names, phones, emails and links are filled in for you.')} aria-label={tr('Paste contact details')} />
          <div className="mt-2 flex justify-end gap-2"><button type="button" className="btn-ghost !min-h-9" onClick={() => setPaste(false)}>{tr('Cancel')}</button><button type="button" className="btn-primary !min-h-9" disabled={!pasteText.trim()} onClick={applyPaste}><Check size={15} />{tr('Fill in')}</button></div>
        </div> : <button type="button" className="ct-paste-btn" onClick={() => setPaste(true)}><ClipboardPaste size={16} /><span className="min-w-0 flex-1 text-left"><b className="block text-sm">{tr('Smart paste')}</b><span className="text-xs muted">{tr('Paste a signature or business card and we fill the form')}</span></span></button>)}

        {duplicates.length > 0 && <div className="ct-dupe" role="status"><Users size={15} /><span className="min-w-0 flex-1 text-xs">{tr('Already saved?')} {duplicates.map((contact) => <button key={contact.id} type="button" className="font-semibold underline underline-offset-2" onClick={() => onOpenExisting(contact.id)}>{contact.name}</button>).reduce<ReactNode[]>((acc, node, index) => index ? [...acc, ', ', node] : [node], [])}</span></div>}

        <div className="ct-block">
          <p className="ct-block-title"><Phone size={14} />{tr('Phone')}</p>
          <FieldList rows={draft.phones} labels={PHONE_LABELS} type="tel" placeholder="+1 555 123 4567" addLabel="Add phone" onChange={(phones) => set({ phones })} />
        </div>
        <div className="ct-block">
          <p className="ct-block-title"><Mail size={14} />{tr('Email')}</p>
          <FieldList rows={draft.emails} labels={EMAIL_LABELS} type="email" placeholder="name@example.com" addLabel="Add email" onChange={(emails) => set({ emails })} />
        </div>
        <div className="ct-block">
          <p className="ct-block-title"><Users size={14} />{tr('Relationship')}</p>
          <div className="tw-chip-row !pb-0 flex-wrap">{GROUPS.map((group) => <button key={group.id} type="button" className={cx('tw-chip', draft.group === group.id && 'is-on')} onClick={() => set({ group: group.id })}>{group.emoji} {tr(group.label)}</button>)}</div>
          <div className="mt-2.5 flex items-center gap-3">
            <button type="button" className={cx('tw-chip', draft.favorite && 'is-on')} onClick={() => set({ favorite: !draft.favorite })}><Star size={13} className={cx(draft.favorite && 'fill-current')} />{tr('Favorite')}</button>
            <span className="text-xs muted">{tr('Closeness')}</span>
            <span className="flex" role="radiogroup" aria-label={tr('Closeness')}>{[1, 2, 3, 4, 5].map((level) => <button key={level} type="button" role="radio" aria-checked={draft.closeness === level} aria-label={`${level}`} className="ct-heart" onClick={() => set({ closeness: draft.closeness === level ? undefined : level as Contact['closeness'] })}><Heart size={17} className={cx((draft.closeness ?? 0) >= level ? 'fill-rose-500 text-rose-500' : 'text-slate-400')} /></button>)}</span>
          </div>
        </div>

        <Section title="Work" icon={<Briefcase size={15} />} open={open.work} onToggle={() => toggle('work')} hint={[draft.jobTitle, draft.company].filter(Boolean).join(' · ') || tr('Job title, company, industry')}>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="input min-w-0" value={draft.jobTitle ?? ''} onChange={(event) => set({ jobTitle: event.target.value || undefined })} placeholder={tr('Job title / designation')} aria-label={tr('Job title')} />
            <input className="input min-w-0" value={draft.company ?? ''} onChange={(event) => set({ company: event.target.value || undefined })} placeholder={tr('Company / organization')} aria-label={tr('Company')} />
            <input className="input min-w-0" value={draft.department ?? ''} onChange={(event) => set({ department: event.target.value || undefined })} placeholder={tr('Department / team')} aria-label={tr('Department')} />
            <input className="input min-w-0" value={draft.industry ?? ''} onChange={(event) => set({ industry: event.target.value || undefined })} placeholder={tr('Industry')} aria-label={tr('Industry')} />
          </div>
          <textarea className="input mt-2 min-h-16 min-w-0" value={draft.canHelpWith ?? ''} onChange={(event) => set({ canHelpWith: event.target.value || undefined })} placeholder={tr('Expertise — what can they help with? (e.g. visas, investing, design)')} aria-label={tr('Can help with')} />
        </Section>

        <Section title="Social & web" icon={<AtSign size={15} />} open={open.social} onToggle={() => toggle('social')} hint={draft.socials.length ? draft.socials.map((social) => socialMeta(social.platform).label).join(', ') : tr('LinkedIn, Instagram, X, website…')}>
          <div className="grid gap-2">
            {draft.socials.map((social) => <div key={social.id} className="ct-field-row">
              <PillSelect className="ct-label-pill" value={social.platform} ariaLabel={tr('Network')} onChange={(platform) => set({ socials: draft.socials.map((item) => item.id === social.id ? { ...item, platform } : item) })} options={SOCIALS.map((item) => ({ value: item.id, label: item.label }))} />
              <input className="input min-w-0 flex-1" value={social.value} autoCapitalize="off" autoCorrect="off" placeholder={socialMeta(social.platform).placeholder} onChange={(event) => set({ socials: draft.socials.map((item) => item.id === social.id ? { ...item, value: event.target.value } : item) })} aria-label={socialMeta(social.platform).label} />
              <button type="button" className="tap-action !opacity-60" aria-label={tr('Remove')} onClick={() => set({ socials: draft.socials.filter((item) => item.id !== social.id) })}><X size={15} /></button>
            </div>)}
            <div className="flex flex-wrap gap-1.5">{SOCIALS.filter((item) => !draft.socials.some((social) => social.platform === item.id) || item.id === 'other' || item.id === 'website').slice(0, 9).map((item) => <button key={item.id} type="button" className="tw-chip !min-h-8" onClick={() => set({ socials: [...draft.socials, { id: uid(), platform: item.id, value: '' }] })}><Plus size={12} />{item.label}</button>)}</div>
          </div>
        </Section>

        <Section title="Address" icon={<MapPin size={15} />} open={open.place} onToggle={() => toggle('place')} hint={[draft.city, draft.country].filter(Boolean).join(', ') || tr('Street, city, country, time zone')}>
          <textarea className="input min-h-16 min-w-0" value={draft.address ?? ''} onChange={(event) => set({ address: event.target.value || undefined })} placeholder={tr('Street address')} aria-label={tr('Street address')} />
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <input className="input min-w-0" value={draft.city ?? ''} onChange={(event) => set({ city: event.target.value || undefined })} placeholder={tr('City')} aria-label={tr('City')} />
            <input className="input min-w-0" value={draft.country ?? ''} onChange={(event) => set({ country: event.target.value || undefined })} placeholder={tr('Country')} aria-label={tr('Country')} />
            <input className="input min-w-0" value={draft.timezone ?? ''} onChange={(event) => set({ timezone: event.target.value || undefined })} placeholder={tr('Time zone (e.g. GMT+8)')} aria-label={tr('Time zone')} />
          </div>
        </Section>

        <Section title="Personal" icon={<Cake size={15} />} open={open.personal} onToggle={() => toggle('personal')} hint={draft.birthday ? `${tr('Birthday')} ${draft.birthday.replace(/^--/, '')}` : tr('Birthday, how you met, interests')}>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="min-w-0"><span className="label">{tr('Birthday')}</span>
              {birthdayKnownYear ? <input type="date" className="input min-w-0" value={draft.birthday ?? ''} onChange={(event) => set({ birthday: event.target.value || undefined })} />
                : <input type="text" inputMode="numeric" className="input min-w-0" placeholder="MM-DD" value={draft.birthday?.slice(2) ?? ''} onChange={(event) => { const value = event.target.value.replace(/[^\d-]/g, '').slice(0, 5); set({ birthday: value ? `--${value}` : undefined }); }} />}
              <button type="button" className="tw-link-btn mt-1" onClick={() => set({ birthday: birthdayKnownYear ? (draft.birthday ? `--${draft.birthday.slice(5)}` : '--') : (draft.birthday && /^--\d{2}-\d{2}$/.test(draft.birthday) ? `2000-${draft.birthday.slice(2)}` : undefined) })}>{tr(birthdayKnownYear ? "I don't know the year" : 'I know the year')}</button>
            </label>
            <label className="min-w-0"><span className="label">{tr('Met on')}</span><input type="date" className="input min-w-0" value={draft.metOn ?? ''} onChange={(event) => set({ metOn: event.target.value || undefined })} /></label>
          </div>
          <input className="input mt-2 min-w-0" value={draft.howWeMet ?? ''} onChange={(event) => set({ howWeMet: event.target.value || undefined })} placeholder={tr('How did you meet? (event, place, story)')} aria-label={tr('How we met')} />
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input className="input min-w-0" value={draft.introducedBy ?? ''} onChange={(event) => set({ introducedBy: event.target.value || undefined })} placeholder={tr('Introduced by')} aria-label={tr('Introduced by')} />
            <input className="input min-w-0" value={draft.languages ?? ''} onChange={(event) => set({ languages: event.target.value || undefined })} placeholder={tr('Languages')} aria-label={tr('Languages')} />
          </div>
          <input className="input mt-2 min-w-0" value={draft.interests ?? ''} onChange={(event) => set({ interests: event.target.value || undefined })} placeholder={tr('Interests, family, favorite things…')} aria-label={tr('Interests')} />
        </Section>

        <Section title="Keep in touch" icon={<Calendar size={15} />} open={open.touch} onToggle={() => toggle('touch')} hint={draft.followUpDate ? `${tr('Follow up')} ${draft.followUpDate}` : draft.keepInTouchDays ? CADENCES.find((cadence) => cadence.days === draft.keepInTouchDays)?.label : tr('Reminders to stay in contact')}>
          <span className="label">{tr('Remind me to reach out')}</span>
          <div className="tw-chip-row !pb-0 flex-wrap">{CADENCES.map((cadence) => <button key={cadence.days} type="button" className={cx('tw-chip', (draft.keepInTouchDays ?? 0) === cadence.days && 'is-on')} onClick={() => set({ keepInTouchDays: cadence.days || undefined })}>{tr(cadence.label)}</button>)}</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)]">
            <label className="min-w-0"><span className="label">{tr('Follow-up date')}</span><input type="date" className="input min-w-0" value={draft.followUpDate ?? ''} onChange={(event) => set({ followUpDate: event.target.value || undefined })} /></label>
            <label className="min-w-0"><span className="label">{tr('About')}</span><input className="input min-w-0" value={draft.followUpNote ?? ''} onChange={(event) => set({ followUpNote: event.target.value || undefined })} placeholder={tr('e.g. Send the proposal')} /></label>
          </div>
        </Section>

        <Section title="Tags & notes" icon={<Tag size={15} />} open={open.notes} onToggle={() => toggle('notes')} hint={draft.tags.length ? draft.tags.map((tag) => `#${tag}`).join(' ') : tr('Tags and private notes')}>
          <div className="ct-tags">
            {draft.tags.map((tag) => <span key={tag} className="ct-tag">#{tag}<button type="button" aria-label={`${tr('Remove')} ${tag}`} onClick={() => set({ tags: draft.tags.filter((item) => item !== tag) })}><X size={11} /></button></span>)}
            <input className="ct-tag-input" value={tagInput} onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addTag(tagInput); } else if (event.key === 'Backspace' && !tagInput && draft.tags.length) set({ tags: draft.tags.slice(0, -1) }); }} onBlur={() => tagInput && addTag(tagInput)} placeholder={tr('Add tag…')} aria-label={tr('Add tag')} />
          </div>
          {allTags.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{allTags.map((tag) => <button key={tag} type="button" className="ct-tag-suggest" onClick={() => addTag(tag)}>+ #{tag}</button>)}</div>}
          <textarea className="input mt-2 min-h-24 min-w-0" value={draft.notes} onChange={(event) => set({ notes: event.target.value })} placeholder={tr('Private notes: their kids’ names, what you talked about, gift ideas…')} aria-label={tr('Notes')} />
        </Section>
      </div>
      <footer className="ct-editor-foot"><button type="button" className="btn-ghost" onClick={onClose}>{tr('Cancel')}</button><button type="button" className="btn-primary" disabled={!draft.name.trim()} onClick={save}><Check size={16} />{tr(editing ? 'Save changes' : 'Save contact')}</button></footer>
    </section>
  </div>;
}

/* ======================= Detail ======================= */

function InfoRow({ icon, label, children, actions }: { icon: ReactNode; label?: string; children: ReactNode; actions?: ReactNode }) {
  return <div className="ct-info-row"><span className="ct-info-icon">{icon}</span><div className="min-w-0 flex-1">{label && <p className="text-[11px] font-semibold uppercase tracking-wide muted">{label}</p>}<div className="break-words text-sm">{children}</div></div>{actions && <div className="flex shrink-0 items-center">{actions}</div>}</div>;
}

function ContactDetail({ contact, language, onBack, onEdit, onDelete, onNotice }: { contact: Contact; language: string; onBack: () => void; onEdit: () => void; onDelete: () => void; onNotice: (message: string) => void }) {
  const updateContact = useStore((state) => state.updateContact);
  const locale = localeForLanguage(language);
  const [logNote, setLogNote] = useState('');
  const [notes, setNotes] = useState(contact.notes);
  const [menu, setMenu] = useState(false);
  useEffect(() => setNotes(contact.notes), [contact.id, contact.notes]);
  const phone = primaryPhone(contact);
  const wa = whatsappNumber(contact);
  const email = primaryEmail(contact);
  const map = mapsHref(contact);
  const birthday = nextBirthday(contact.birthday);
  const group = groupMeta(contact.group);
  const since = daysSince(contact.lastContacted);
  const copy = (text: string, what: string) => void navigator.clipboard?.writeText(text).then(() => onNotice(`${tr(what)} ${tr('copied')}`)).catch(() => undefined);
  const log = (kind: ContactInteraction['kind']) => {
    const entry: ContactInteraction = { id: uid(), date: today(), kind, note: logNote.trim() };
    const followDone = contact.followUpDate && contact.followUpDate <= today();
    updateContact(contact.id, { interactions: [entry, ...contact.interactions].slice(0, 200), lastContacted: today(), ...(followDone ? { followUpDate: undefined, followUpNote: undefined } : {}) });
    setLogNote(''); playFeedback('confirm');
    onNotice(tr('Saved to their timeline'));
  };
  const actions = [
    phone && { href: telHref(phone), icon: Phone, label: 'Call' },
    phone && { href: smsHref(phone), icon: MessageSquareText, label: 'Text' },
    wa && { href: whatsappHref(wa), icon: MessageCircle, label: 'WhatsApp', external: true },
    email && { href: `mailto:${email}`, icon: Mail, label: 'Email' },
    map && { href: map, icon: MapPin, label: 'Map', external: true },
  ].filter(Boolean) as { href: string; icon: typeof Phone; label: string; external?: boolean }[];

  return <article className="ct-detail tw-enter" aria-label={contact.name}>
    <div className="ct-detail-top">
      <button type="button" className="btn-ghost -ml-2 !min-h-10 lg:hidden" onClick={onBack}><ArrowLeft size={17} />{tr('Contacts')}</button>
      <span className="flex-1" />
      <button type="button" className="tw-icon-btn" aria-label={tr(contact.favorite ? 'Remove from favorites' : 'Add to favorites')} onClick={() => updateContact(contact.id, { favorite: !contact.favorite })}><Star size={17} className={cx(contact.favorite && 'fill-amber-400 text-amber-400')} /></button>
      <button type="button" className="tw-icon-btn" aria-label={tr('Edit contact')} onClick={onEdit}><Pencil size={16} /></button>
      <span className="relative">
        <button type="button" className="tw-icon-btn" aria-label={tr('More')} aria-expanded={menu} onClick={() => setMenu((value) => !value)}><MoreHorizontal size={17} /></button>
        {menu && <span className="tw-msg-pop is-own !top-full !bottom-auto mt-1" role="menu" onMouseLeave={() => setMenu(false)}>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); void shareContact(contact).then((result) => result !== 'cancelled' && onNotice(tr(result === 'shared' ? 'Contact shared' : 'Contact card downloaded'))); }}><Share2 size={13} />{tr('Share contact card')}</button>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); downloadText(`${contact.name}.vcf`, toVCard(contact)); }}><Download size={13} />{tr('Save to phone contacts (.vcf)')}</button>
          <button type="button" role="menuitem" className="text-rose-500" onClick={() => { setMenu(false); onDelete(); }}><Trash2 size={13} />{tr('Delete')}</button>
        </span>}
      </span>
    </div>

    <header className="ct-hero" style={{ ['--tone' as string]: group.color }}>
      <ContactAvatar contact={contact} size={84} className="ct-hero-avatar" />
      <h2 className="mt-2 break-words text-xl font-bold tracking-tight">{contact.name}{contact.nickname && <span className="text-base font-medium muted"> “{contact.nickname}”</span>}</h2>
      {subtitle(contact) && <p className="mt-0.5 text-sm muted">{subtitle(contact)}</p>}
      <div className="mt-2 flex flex-wrap justify-center gap-1.5">
        <span className="ct-group" style={{ ['--g' as string]: group.color }}>{group.emoji} {tr(group.label)}</span>
        {contact.closeness && <span className="ct-group" style={{ ['--g' as string]: '#f43f5e' }}>{'♥'.repeat(contact.closeness)}</span>}
        {contact.city && <span className="ct-group" style={{ ['--g' as string]: '#64748b' }}><MapPin size={11} />{contact.city}</span>}
      </div>
      {actions.length > 0 && <div className="ct-actions">{actions.map(({ href, icon: Icon, label, external }) => <a key={label} href={href} className="ct-action" {...(external ? { target: '_blank', rel: 'noreferrer' } : {})} onClick={() => { if (label !== 'Map') updateContact(contact.id, { lastContacted: today() }); }}><span><Icon size={18} /></span>{tr(label)}</a>)}</div>}
    </header>

    {(birthday && birthday.days <= 30) || contact.followUpDate ? <div className="ct-alerts">
      {birthday && birthday.days <= 30 && <p className="ct-alert is-bday"><Cake size={15} />{birthday.days === 0 ? tr('Birthday today! 🎉') : `${tr('Birthday')} ${relativeDay(birthday.date, locale)}`}{birthday.turns ? ` · ${tr('turns')} ${birthday.turns}` : ''}</p>}
      {contact.followUpDate && <p className={cx('ct-alert', contact.followUpDate < today() && 'is-late')}><Calendar size={15} /><span className="min-w-0 flex-1">{tr('Follow up')} {relativeDay(contact.followUpDate, locale)}{contact.followUpNote ? ` · ${contact.followUpNote}` : ''}</span><button type="button" className="tw-link-btn" onClick={() => updateContact(contact.id, { followUpDate: undefined, followUpNote: undefined, lastContacted: today() })}><Check size={13} />{tr('Done')}</button></p>}
    </div> : null}

    <div className="ct-cards">
      {(contact.phones.length > 0 || contact.emails.length > 0 || contact.address || contact.city) && <section className="tw-panel">
        <header><h3>{tr('Contact info')}</h3></header>
        {contact.phones.map((item) => <InfoRow key={item.id} icon={<Phone size={15} />} label={tr(item.label)} actions={<>
          <a className="tap-action !opacity-80" href={telHref(item.value)} aria-label={`${tr('Call')} ${item.value}`}><PhoneCall size={15} /></a>
          <a className="tap-action !opacity-80" href={smsHref(item.value)} aria-label={`${tr('Text')} ${item.value}`}><MessageSquareText size={15} /></a>
          <button type="button" className="tap-action !opacity-80" onClick={() => copy(item.value, 'Number')} aria-label={tr('Copy')}><Copy size={14} /></button></>}><a href={telHref(item.value)} className="font-medium tabular-nums">{item.value}</a></InfoRow>)}
        {contact.emails.map((item) => <InfoRow key={item.id} icon={<Mail size={15} />} label={tr(item.label)} actions={<button type="button" className="tap-action !opacity-80" onClick={() => copy(item.value, 'Email')} aria-label={tr('Copy')}><Copy size={14} /></button>}><a href={`mailto:${item.value}`} className="font-medium">{item.value}</a></InfoRow>)}
        {(contact.address || contact.city || contact.country) && <InfoRow icon={<MapPin size={15} />} label={tr('Address')} actions={<button type="button" className="tap-action !opacity-80" onClick={() => copy([contact.address, contact.city, contact.country].filter(Boolean).join(', '), 'Address')} aria-label={tr('Copy')}><Copy size={14} /></button>}>{map ? <a href={map} target="_blank" rel="noreferrer" className="whitespace-pre-line">{[contact.address, [contact.city, contact.country].filter(Boolean).join(', ')].filter(Boolean).join('\n')}</a> : null}{contact.timezone && <span className="block text-xs muted">{contact.timezone}</span>}</InfoRow>}
      </section>}

      {contact.socials.length > 0 && <section className="tw-panel">
        <header><h3>{tr('Social & web')}</h3></header>
        <div className="ct-socials">{contact.socials.map((social) => { const meta = socialMeta(social.platform); const url = socialUrl(social); const Icon = SOCIAL_ICON[social.platform] ?? Globe; const body = <><span className="ct-social-icon" style={{ background: meta.color }}><Icon size={15} /></span><span className="min-w-0 flex-1"><b className="block text-xs">{meta.label}</b><span className="block truncate text-xs muted">{social.value.replace(/^https?:\/\/(www\.)?/, '')}</span></span></>;
          return url ? <a key={social.id} href={url} target="_blank" rel="noreferrer" className="ct-social">{body}</a> : <button key={social.id} type="button" className="ct-social" onClick={() => copy(social.value, meta.label)}>{body}<Copy size={13} className="muted" /></button>; })}</div>
      </section>}

      {(contact.jobTitle || contact.company || contact.department || contact.industry || contact.canHelpWith) && <section className="tw-panel">
        <header><h3>{tr('Work')}</h3></header>
        {(contact.jobTitle || contact.company) && <InfoRow icon={<Briefcase size={15} />} label={tr('Role')}>{[contact.jobTitle, contact.company].filter(Boolean).join(tr(' at '))}</InfoRow>}
        {(contact.department || contact.industry) && <InfoRow icon={<Building2 size={15} />} label={tr('Team & industry')}>{[contact.department, contact.industry].filter(Boolean).join(' · ')}</InfoRow>}
        {contact.canHelpWith && <InfoRow icon={<Handshake size={15} />} label={tr('Can help with')}>{contact.canHelpWith}</InfoRow>}
      </section>}

      {(contact.birthday || contact.howWeMet || contact.metOn || contact.introducedBy || contact.languages || contact.interests) && <section className="tw-panel">
        <header><h3>{tr('Personal')}</h3></header>
        {contact.birthday && birthday && <InfoRow icon={<Cake size={15} />} label={tr('Birthday')}>{new Date(`${birthday.date}T12:00:00`).toLocaleDateString(locale, { month: 'long', day: 'numeric' })}{/^\d{4}/.test(contact.birthday) ? `, ${contact.birthday.slice(0, 4)}` : ''}<span className="text-xs muted"> · {birthday.days === 0 ? tr('today') : `${tr('in')} ${birthday.days} ${tr('days')}`}{birthday.turns ? ` · ${tr('turns')} ${birthday.turns}` : ''}</span></InfoRow>}
        {(contact.howWeMet || contact.metOn) && <InfoRow icon={<Handshake size={15} />} label={tr('How we met')}>{contact.howWeMet}{contact.metOn && <span className="block text-xs muted">{new Date(`${contact.metOn}T12:00:00`).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })}</span>}</InfoRow>}
        {contact.introducedBy && <InfoRow icon={<UserPlus size={15} />} label={tr('Introduced by')}>{contact.introducedBy}</InfoRow>}
        {contact.languages && <InfoRow icon={<Globe size={15} />} label={tr('Languages')}>{contact.languages}</InfoRow>}
        {contact.interests && <InfoRow icon={<Heart size={15} />} label={tr('Interests')}>{contact.interests}</InfoRow>}
      </section>}

      <section className="tw-panel">
        <header><h3>{tr('Keep in touch')}</h3><span className="text-xs muted">{Number.isFinite(since) ? (since === 0 ? tr('Talked today') : `${tr('Last talked')} ${since}d ${tr('ago')}`) : tr('No contact logged yet')}</span></header>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <PillSelect className="pp-goal" icon={<Calendar size={13} />} value={String(contact.keepInTouchDays ?? 0)} ariaLabel={tr('Reminder to reach out')} onChange={(value) => updateContact(contact.id, { keepInTouchDays: Number(value) || undefined })} options={CADENCES.map((cadence) => ({ value: String(cadence.days), label: tr(cadence.label) }))} />
          <label className={cx('tw-meta pp-date', contact.followUpDate && contact.followUpDate < today() && 'is-late')}><Calendar size={12} /><span>{contact.followUpDate ? `${tr('Follow up')} ${relativeDay(contact.followUpDate, locale)}` : tr('Set follow-up')}</span><input type="date" value={contact.followUpDate ?? ''} aria-label={tr('Follow-up date')} onChange={(event) => updateContact(contact.id, { followUpDate: event.target.value || undefined })} /></label>
          {[['Tomorrow', 1], ['Next week', 7], ['In a month', 30]].map(([label, days]) => <button key={label} type="button" className="tw-chip !min-h-8" onClick={() => updateContact(contact.id, { followUpDate: addDays(today(), Number(days)) })}>{tr(String(label))}</button>)}
        </div>
        <div className="mt-3 rounded-xl bg-[var(--tw-surface-2)] p-2.5">
          <input className="input min-w-0 !py-2 text-sm" value={logNote} onChange={(event) => setLogNote(event.target.value)} placeholder={tr('What did you talk about? (optional)')} aria-label={tr('Interaction note')} />
          <div className="mt-2 grid grid-cols-4 gap-1.5">{INTERACTIONS.map(({ kind, label, icon: Icon }) => <button key={kind} type="button" className="ct-log-btn" onClick={() => log(kind)}><Icon size={16} />{tr(label)}</button>)}</div>
          {logNote.trim() && <button type="button" className="tw-link-btn mt-1.5" onClick={() => log('note')}><Plus size={13} />{tr('Save as a note only')}</button>}
        </div>
        {contact.interactions.length > 0 && <ol className="ct-timeline">{contact.interactions.slice(0, 30).map((entry) => { const meta = INTERACTIONS.find((item) => item.kind === entry.kind); const Icon = meta?.icon ?? MessageSquareText; return <li key={entry.id}>
          <span className="ct-tl-dot"><Icon size={12} /></span>
          <div className="min-w-0 flex-1"><p className="text-xs"><b>{tr(meta?.label ?? 'Note')}</b> <span className="muted">· {relativeDay(entry.date, locale)}</span></p>{entry.note && <p className="break-words text-sm">{entry.note}</p>}</div>
          <button type="button" className="tap-action" aria-label={tr('Remove')} onClick={() => updateContact(contact.id, { interactions: contact.interactions.filter((item) => item.id !== entry.id) })}><X size={13} /></button>
        </li>; })}</ol>}
      </section>

      <section className="tw-panel">
        <header><h3>{tr('Notes')}</h3>{notes !== contact.notes && <span className="text-xs muted">{tr('Saving…')}</span>}</header>
        {contact.tags.length > 0 && <div className="mb-2 flex flex-wrap gap-1">{contact.tags.map((tag) => <span key={tag} className="ct-tag">#{tag}</span>)}</div>}
        <textarea className="input min-h-28 min-w-0 text-sm leading-6" value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={() => notes !== contact.notes && updateContact(contact.id, { notes })} placeholder={tr('Private notes: family, preferences, gift ideas, things to remember…')} aria-label={tr('Notes')} />
      </section>
      <p className="text-center text-xs muted">{tr('Added')} {timeAgo(contact.createdAt, locale)} · {tr('Only you can see your contacts.')}</p>
    </div>
  </article>;
}

/* ======================= Page ======================= */

export default function Contacts() {
  const { contacts, addContact, updateContact, deleteContact, importContacts } = useStore();
  const language = useStore((state) => state.settings.language ?? 'en');
  const locale = localeForLanguage(language);
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('c');
  const selected = contacts.find((contact) => contact.id === selectedId) ?? null;
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<ContactGroup | 'all' | 'favorites'>('all');
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>(() => { try { return (localStorage.getItem('lifeos:contacts-sort') as Sort) || 'name'; } catch { return 'name'; } });
  const [editor, setEditor] = useState<Draft | null>(null);
  const [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  useEffect(() => { try { localStorage.setItem('lifeos:contacts-sort', sort); } catch { /* ignore */ } }, [sort]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 2800); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { if (selected) window.scrollTo({ top: 0, behavior: 'smooth' }); }, [selected?.id]);
  useEffect(() => { if (params.get('new') === '1') { setEditor(blankDraft()); const next = new URLSearchParams(params); next.delete('new'); setParams(next, { replace: true }); } }, [params, setParams]);

  const select = (id: string | null) => { const next = new URLSearchParams(params); if (id) next.set('c', id); else next.delete('c'); setParams(next); };
  const attention = useMemo(() => networkAttention(contacts), [contacts]);
  const tags = useMemo(() => [...new Set(contacts.flatMap((contact) => contact.tags))].sort(), [contacts]);
  const q = query.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, '');
  const shown = useMemo(() => contacts.filter((contact) => {
    if (group === 'favorites' && !contact.favorite) return false;
    if (group !== 'all' && group !== 'favorites' && contact.group !== group) return false;
    if (tag && !contact.tags.includes(tag)) return false;
    if (!q) return true;
    const hay = [contact.name, contact.nickname, contact.jobTitle, contact.company, contact.department, contact.industry, contact.city, contact.country, contact.notes, contact.canHelpWith, contact.interests, contact.howWeMet, ...contact.tags, ...contact.emails.map((email) => email.value), ...contact.socials.map((social) => social.value)].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q) || (qDigits.length >= 3 && contact.phones.some((phone) => phone.value.replace(/\D/g, '').includes(qDigits)));
  }).sort((a, b) => sort === 'recent' ? b.createdAt.localeCompare(a.createdAt)
    : sort === 'contacted' ? (b.lastContacted ?? '').localeCompare(a.lastContacted ?? '')
    : sort === 'company' ? (a.company ?? '~').localeCompare(b.company ?? '~') || a.name.localeCompare(b.name)
    : a.name.localeCompare(b.name, locale)), [contacts, group, tag, q, qDigits, sort, locale]);
  const sections = useMemo(() => {
    if (sort !== 'name' && sort !== 'company') return [{ key: '', rows: shown }];
    const map = new Map<string, Contact[]>();
    for (const contact of shown) { const key = sort === 'company' ? (contact.company || tr('No company')) : (/[\p{L}]/u.test(contact.name[0] ?? '') ? contact.name[0].toLocaleUpperCase(locale) : '#'); map.set(key, [...(map.get(key) ?? []), contact]); }
    return [...map.entries()].map(([key, rows]) => ({ key, rows }));
  }, [shown, sort, locale]);
  const favorites = contacts.filter((contact) => contact.favorite);
  const birthdaysSoon = contacts.filter((contact) => (nextBirthday(contact.birthday)?.days ?? 99) <= 30).length;
  const followUps = attention.filter((row) => row.kind !== 'birthday').length;

  const save = (draft: Draft) => {
    if (draft.id) { const { id, ...patch } = draft; updateContact(id, patch); setNotice(tr('Contact updated')); setEditor(null); select(id); }
    else { const id = addContact(draft); playFeedback('add'); setNotice(tr('Contact saved')); setEditor(null); select(id); }
  };
  const runImport = (rows: Array<Partial<Contact> & { name: string }>) => {
    const fresh = rows.filter((row) => !findDuplicates(row, contacts).length);
    const count = importContacts(fresh);
    setNotice(`${tr('Imported')} ${count} ${tr(count === 1 ? 'contact' : 'contacts')}${rows.length - fresh.length ? ` · ${rows.length - fresh.length} ${tr('already saved')}` : ''}`);
  };
  const remove = (contact: Contact) => { if (confirm(`${tr('Delete')} ${contact.name}? ${tr('You can restore it from Trash.')}`)) { deleteContact(contact.id); select(null); setNotice(tr('Moved to Trash')); } };

  const list = <div className="min-w-0 space-y-3">
    <div className="tw-toolbar">
      <div className="tw-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr('Search name, company, phone, tag…')} aria-label={tr('Search contacts')} />{query && <button type="button" onClick={() => setQuery('')} aria-label={tr('Clear')}><X size={14} /></button>}</div>
      <PillSelect className="pp-sort" value={sort} ariaLabel={tr('Sort contacts')} onChange={setSort} options={[{ value: 'name', label: tr('A–Z') }, { value: 'recent', label: tr('Newest') }, { value: 'contacted', label: tr('Recent chats') }, { value: 'company', label: tr('Company') }]} />
    </div>
    <div className="tw-chip-row" role="tablist" aria-label={tr('Filter contacts')}>
      <button type="button" role="tab" aria-selected={group === 'all'} className={cx('tw-chip', group === 'all' && 'is-on')} onClick={() => setGroup('all')}>{tr('All')}<b>{contacts.length}</b></button>
      {favorites.length > 0 && <button type="button" role="tab" aria-selected={group === 'favorites'} className={cx('tw-chip', group === 'favorites' && 'is-on')} onClick={() => setGroup('favorites')}><Star size={12} />{tr('Favorites')}<b>{favorites.length}</b></button>}
      {GROUPS.map((item) => { const count = contacts.filter((contact) => contact.group === item.id).length; return count ? <button key={item.id} type="button" role="tab" aria-selected={group === item.id} className={cx('tw-chip', group === item.id && 'is-on')} onClick={() => setGroup(item.id)}>{item.emoji} {tr(item.label)}<b>{count}</b></button> : null; })}
    </div>
    {tags.length > 0 && <div className="tw-chip-row !-mt-1">{tags.map((item) => <button key={item} type="button" className={cx('ct-tag-filter', tag === item && 'is-on')} onClick={() => setTag(tag === item ? null : item)}>#{item}</button>)}</div>}
    {shown.length === 0 ? <div className="tw-empty"><span>🔍</span><p className="font-semibold">{tr('No one matches')}</p><button type="button" className="tw-link-btn" onClick={() => { setQuery(''); setGroup('all'); setTag(null); }}>{tr('Clear filters')}</button></div>
      : sections.map((section) => <div key={section.key || 'all'} className="min-w-0">
        {section.key && <h3 className="ct-letter">{section.key}</h3>}
        <div className="tw-list">{section.rows.map((contact) => { const phone = primaryPhone(contact); const email = primaryEmail(contact); return <div key={contact.id} className={cx('ct-row', selected?.id === contact.id && 'is-active')}>
          <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => select(contact.id)}>
            <ContactAvatar contact={contact} size={42} />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1"><b className="truncate text-sm font-semibold">{contact.name}</b>{contact.favorite && <Star size={12} className="shrink-0 fill-amber-400 text-amber-400" />}</span>
              <span className="block truncate text-xs muted">{subtitle(contact) || contact.city || phone || email || tr(groupMeta(contact.group).label)}</span>
            </span>
          </button>
          {phone && <a className="ct-quick" href={telHref(phone)} aria-label={`${tr('Call')} ${contact.name}`} onClick={() => updateContact(contact.id, { lastContacted: today() })}><Phone size={15} /></a>}
          {phone ? <a className="ct-quick hidden sm:grid" href={smsHref(phone)} aria-label={`${tr('Text')} ${contact.name}`}><MessageSquareText size={15} /></a> : email ? <a className="ct-quick" href={`mailto:${email}`} aria-label={`${tr('Email')} ${contact.name}`}><Mail size={15} /></a> : null}
        </div>; })}</div>
      </div>)}
  </div>;

  return <div className="tw-root ct-page min-w-0">
    <header className={cx('ct-head', selected && 'ct-m-hide')}>
      <div className="min-w-0 flex-1">
        <p className="ct-eyebrow"><Users size={13} />{tr('Network')}</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{tr('Contacts')}</h1>
        <p className="mt-0.5 text-sm muted">{tr('Everyone who matters — how to reach them, who they are, and when to reconnect.')}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="relative">
          <button type="button" className="btn-outline !min-h-10 !px-3" aria-expanded={menu} onClick={() => setMenu((value) => !value)} aria-label={tr('Import and export')}><Upload size={16} /><span className="hidden sm:inline">{tr('Import')}</span></button>
          {menu && <span className="tw-msg-pop is-own !top-full !bottom-auto mt-1 !min-w-[14rem]" role="menu" onMouseLeave={() => setMenu(false)}>
            {contactPickerSupported() && <button type="button" role="menuitem" onClick={() => { setMenu(false); void pickFromPhone().then(runImport).catch(() => setNotice(tr('Could not open your phone contacts'))); }}><Smartphone size={14} />{tr('Pick from phone contacts')}</button>}
            <button type="button" role="menuitem" onClick={() => { setMenu(false); importRef.current?.click(); }}><Upload size={14} />{tr('Import .vcf file')}</button>
            <button type="button" role="menuitem" disabled={!contacts.length} onClick={() => { setMenu(false); downloadText(`contacts-${today()}.vcf`, contacts.map(toVCard).join('\r\n')); }}><Download size={14} />{tr('Export all (.vcf)')}</button>
          </span>}
        </span>
        <input ref={importRef} type="file" accept=".vcf,text/vcard,text/x-vcard" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void file.text().then((text) => { const rows = parseVCards(text); if (rows.length) runImport(rows); else setNotice(tr('No contacts found in that file')); }); }} />
        <button type="button" className="btn-primary !min-h-10" onClick={() => setEditor(blankDraft())}><UserPlus size={16} /><span>{tr('Add')}</span></button>
      </div>
    </header>

    {notice && <div className="tw-notice ct-toast" role="status"><Check size={15} />{notice}</div>}

    {contacts.length === 0 ? <div className="tw-empty mt-2">
      <span>📇</span><p className="text-lg font-semibold">{tr('Build your personal network')}</p>
      <p className="max-w-md text-sm muted">{tr('Save the people you meet with their phone, socials, address, job and how you met — and get reminded to stay in touch, follow up and wish them happy birthday.')}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <button type="button" className="btn-primary" onClick={() => setEditor(blankDraft())}><UserPlus size={16} />{tr('Add first contact')}</button>
        {contactPickerSupported() && <button type="button" className="btn-outline" onClick={() => void pickFromPhone().then(runImport).catch(() => undefined)}><Smartphone size={15} />{tr('From phone')}</button>}
        <button type="button" className="btn-outline" onClick={() => importRef.current?.click()}><Upload size={15} />{tr('Import .vcf')}</button>
      </div>
    </div> : <>
      <div className={cx('tw-stats mt-1', selected && 'ct-m-hide')}>
        {([['People', contacts.length, Users, '#6366f1', () => setGroup('all')], ['Favorites', favorites.length, Star, '#f59e0b', () => setGroup('favorites')], ['To reach out', followUps, Calendar, followUps ? '#f43f5e' : '#64748b', undefined], ['Birthdays (30d)', birthdaysSoon, Cake, '#ec4899', undefined]] as const).map(([label, value, Icon, tone, onClick]) => <button key={label} type="button" className="tw-stat" style={{ ['--tone' as string]: tone }} onClick={onClick ?? undefined}><span className="tw-stat-icon"><Icon size={16} /></span><b>{value}</b><span>{tr(label)}</span></button>)}
      </div>

      {attention.length > 0 && <section className={cx('ct-attention', selected && 'ct-m-hide')} aria-label={tr('Needs your attention')}>
        <p className="ct-attention-title">{tr('Reach out soon')}</p>
        <div className="ct-attention-row">{attention.slice(0, 12).map((row) => <button key={`${row.kind}:${row.contact.id}`} type="button" className={cx('ct-att', `is-${row.kind}`, row.days < 0 && 'is-late')} onClick={() => select(row.contact.id)}>
          <ContactAvatar contact={row.contact} size={36} />
          <span className="min-w-0 flex-1 text-left"><b className="block truncate text-sm">{row.contact.name}</b><span className="block truncate text-xs">{row.kind === 'birthday' ? '🎂 ' : row.kind === 'follow-up' ? '📌 ' : '👋 '}{row.kind === 'birthday' ? (row.days === 0 ? tr('Birthday today') : `${relativeDay(addDays(today(), row.days), locale)} · ${tr(row.label)}`) : row.kind === 'follow-up' ? `${relativeDay(addDays(today(), row.days), locale)} · ${row.label}` : tr(row.label)}</span></span>
        </button>)}</div>
      </section>}

      <div className="ct-layout">
        <div className={cx('min-w-0', selected && 'ct-m-hide')}>{list}</div>
        <div className={cx('ct-detail-col min-w-0', !selected && 'ct-m-hide')}>
          {selected ? <ContactDetail key={selected.id} contact={selected} language={language} onBack={() => select(null)} onEdit={() => setEditor(toDraft(selected))} onDelete={() => remove(selected)} onNotice={setNotice} />
            : <div className="ct-placeholder"><Users size={30} /><p className="font-semibold">{tr('Select a contact')}</p><p className="text-sm muted">{tr('Their details, quick actions and your shared history appear here.')}</p></div>}
        </div>
      </div>
    </>}

    {editor && <ContactEditor initial={editor} contacts={contacts} onSave={save} onClose={() => setEditor(null)} onOpenExisting={(id) => { setEditor(null); select(id); }} />}
  </div>;
}
