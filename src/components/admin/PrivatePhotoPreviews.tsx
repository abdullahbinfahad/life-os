import { translate as tr } from '../../lib/locales';
import { ImageOff, Images, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { MEDIA_BUCKET } from '../../lib/media';
import { supabase } from '../../lib/supabase';
import type { PrivatePhotoCandidate } from './types';
import { humanizeAdminError } from './types';

type Props = { userId: string; photos: PrivatePhotoCandidate[] };

export default function PrivatePhotoPreviews({ userId, photos }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestPreview = async (photo: PrivatePhotoCandidate) => {
    if (!supabase) { setError('Private preview is unavailable because the cloud connection is not configured.'); return; }
    setPending(photo.id);
    setError(null);
    try {
      // This RPC must succeed before a signed URL is requested. Never log the signed URL.
      const audit = await supabase.rpc('lifeos_admin_audit_media', { p_user_id: userId, p_path: photo.path });
      if (audit.error) throw new Error(audit.error.message);
      const signed = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(photo.path, 5 * 60);
      if (signed.error || !signed.data?.signedUrl) throw new Error(signed.error?.message || 'Could not create the expiring image preview.');
      setUrls((current) => ({ ...current, [photo.id]: signed.data!.signedUrl }));
    } catch (reason) {
      setError(humanizeAdminError(reason, 'Could not request audited preview'));
    } finally {
      setPending(null);
    }
  };

  return <section className="card p-4 sm:p-5"><div className="flex items-start gap-3"><span className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-300"><Images size={18} /></span><div><h2 className="font-semibold">{tr("Private photo previews")}</h2><p className="mt-1 text-xs leading-5 muted">{tr("Only documented private image paths from this selected workspace are available. Each preview is audited before it is requested and expires in about 5 minutes.")}</p></div></div>
    {error && <div role="alert" className="mt-3 rounded-xl border border-rose-300/60 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-100">{error}</div>}
    {!photos.length ? <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-slate-300 p-4 text-sm muted dark:border-white/15"><ImageOff size={17} /> {tr("No eligible private image paths are present in this snapshot.")}</div> : <div className="mt-4 grid gap-3 sm:grid-cols-2">{photos.map((photo) => <div key={photo.id} className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10"><div className="flex min-w-0 items-center justify-between gap-2 p-3"><span className="truncate text-sm font-medium">{photo.label}</span>{urls[photo.id] ? <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300"><ShieldCheck size={12} /> {tr("Audited · expiring")}</span> : <button className="btn-outline !px-2.5 !py-1.5 text-xs" onClick={() => void requestPreview(photo)} disabled={pending === photo.id}>{pending === photo.id ? <><LoaderCircle size={13} className="animate-spin" /> {tr("Requesting")}</> : 'Request preview'}</button>}</div>{urls[photo.id] && <img src={urls[photo.id]} alt={`Audited preview: ${photo.label}`} className="aspect-[4/3] w-full bg-slate-100 object-cover dark:bg-white/5" referrerPolicy="no-referrer" />}</div>)}</div>}
  </section>;
}
