import { translate as tr } from '../lib/locales';
import { BookImage, Camera, ChevronLeft, ChevronRight, GripVertical, ImagePlus, Images, Plus, Search, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '../lib/auth';
import { compressImage, deletePrivateImage, formatBytes, getPrivateImageUrl, uploadPrivateImage } from '../lib/media';
import { useStore } from '../lib/store';
import type { Album, AlbumMemory } from '../lib/types';
import { CountUp } from '../components/ui';
import './Albums.css';

/** Deterministic, pleasant gradient per album so covers without photos still look distinct. */
function albumHue(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}
function coverStyle(seed: string): CSSProperties {
  const h = albumHue(seed);
  return { backgroundImage: `radial-gradient(120% 90% at 0% 0%, hsl(${h} 85% 62% / .95), transparent 60%), radial-gradient(120% 100% at 100% 100%, hsl(${(h + 70) % 360} 80% 55% / .9), transparent 55%), linear-gradient(135deg, hsl(${(h + 200) % 360} 45% 18%), hsl(${(h + 240) % 360} 40% 12%))` };
}

/** Resolves a memory's photo (private signed URL first, legacy URL fallback). */
function useMemoryPhoto(memory: AlbumMemory | undefined, userId?: string) {
  const [url, setUrl] = useState<string | undefined>(memory?.imageUrl);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setError('');
    if (!memory?.imagePath || !userId) { setUrl(memory?.imageUrl); return () => { active = false; }; }
    setUrl(undefined);
    getPrivateImageUrl(userId, memory.imagePath).then((next) => { if (active) setUrl(next); }).catch((reason) => {
      if (!active) return;
      setUrl(memory.imageUrl);
      setError(reason instanceof Error ? reason.message : 'Could not load private photo.');
    });
    return () => { active = false; };
  }, [memory?.imagePath, memory?.imageUrl, userId]);
  return { url, error };
}

function AlbumCover({ album, userId, className = '' }: { album: Album; userId?: string; className?: string }) {
  const coverMemory = album.memories.find((memory) => memory.imagePath || memory.imageUrl);
  const { url } = useMemoryPhoto(coverMemory, userId);
  return <div className={`album-cover ${className}`} style={coverStyle(album.id + album.title)} aria-hidden="true">
    {url ? <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="album-cover-initial">{album.title.trim()[0]?.toUpperCase() ?? '•'}</span>}
  </div>;
}


export default function Albums() {
  const { albums, addAlbum, updateAlbum, deleteAlbum, addMemory, updateMemory, deleteMemory } = useStore();
  const { user } = useAuth();
  const [selected, setSelected] = useState<string | null>(albums[0]?.id ?? null);
  const [newAlbum, setNewAlbum] = useState('');
  const [newMemory, setNewMemory] = useState('');
  const [albumQuery, setAlbumQuery] = useState('');
  const filteredAlbums = albums.filter((a) => a.title.toLocaleLowerCase().includes(albumQuery.trim().toLocaleLowerCase()));
  const album = albums.find((a) => a.id === selected);

  const createAlbum = () => {
    const title = newAlbum.trim();
    if (!title) return;
    const id = addAlbum({ title });
    setNewAlbum('');
    setSelected(id);
  };

  const memoryCount = albums.reduce((n, a) => n + a.memories.length, 0);
  const photoCount = albums.reduce((n, a) => n + a.memories.filter((m) => m.imagePath || m.imageUrl).length, 0);

  return <div className="albums-page">
    <header className="albums-hero">
      <div className="albums-hero-glow" aria-hidden="true" />
      <div className="relative min-w-0">
        <span className="albums-eyebrow"><Sparkles size={13} /> {tr('Private memory space')}</span>
        <h1 className="mt-3 break-words text-3xl font-bold tracking-tight md:text-4xl">{tr('Memory albums')}</h1>
        <p className="mt-2 max-w-xl text-sm text-white/75 md:text-base">{tr('Build a visual tree of moments, people and places')}</p>
        <dl className="albums-stats">
          <div><dt>{tr('Albums')}</dt><dd><CountUp value={albums.length} /></dd></div>
          <div><dt>{tr('Memories')}</dt><dd><CountUp value={memoryCount} /></dd></div>
          <div><dt>{tr('Photos')}</dt><dd><CountUp value={photoCount} /></dd></div>
        </dl>
      </div>
      <form className="albums-create relative" onSubmit={(e) => { e.preventDefault(); createAlbum(); }}>
        <label className="sr-only" htmlFor="new-album-title">{tr('New album…')}</label>
        <input id="new-album-title" className="input" placeholder={tr('Name a new album…')} value={newAlbum} maxLength={120} onChange={(e) => setNewAlbum(e.target.value)} />
        <button type="submit" className="btn-primary shrink-0" disabled={!newAlbum.trim()}><Plus size={16} /> {tr('Create')}</button>
      </form>
    </header>

    {albums.length > 0 && <section className="mt-6" aria-label={tr('Your albums')}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold"><BookImage size={18} className="text-indigo-500" /> {tr('Your albums')} <span className="text-sm font-normal muted">{albums.length}</span></h2>
        {albums.length > 3 && <label className="relative w-full sm:w-64"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 muted" /><input aria-label={tr('Search albums')} className="input !w-full !pl-9" placeholder={tr('Find an album…')} value={albumQuery} onChange={(e) => setAlbumQuery(e.target.value)} /></label>}
      </div>
      <div className="album-rail" role="list">
        {filteredAlbums.map((a) => <button key={a.id} role="listitem" type="button" onClick={() => setSelected(a.id)} aria-pressed={a.id === selected} className={`album-tile ${a.id === selected ? 'is-selected' : ''}`}>
          <AlbumCover album={a} userId={user?.id} />
          <span className="album-tile-meta"><span className="block truncate font-semibold">{a.title || tr('Untitled album')}</span><span className="text-xs opacity-75">{a.memories.length} {tr('memories')}</span></span>
        </button>)}
      </div>
      {filteredAlbums.length === 0 && <p className="p-3 text-sm muted">{tr('No albums match your search.')}</p>}
    </section>}

    <div className="mt-6">
      {album ? <AlbumEditor key={album.id} album={album} userId={user?.id} updateAlbum={updateAlbum} deleteAlbum={deleteAlbum} addMemory={addMemory} updateMemory={updateMemory} deleteMemory={deleteMemory} onDeleted={() => setSelected(albums.find((a) => a.id !== album.id)?.id ?? null)} newMemory={newMemory} setNewMemory={setNewMemory} />
        : <div className="albums-empty card">
          <div className="albums-empty-art" aria-hidden="true"><span /><span /><span /><Camera size={30} /></div>
          <h2 className="text-xl font-semibold">{albums.length ? tr('Choose an album or create one above.') : tr('Start your first album')}</h2>
          <p className="max-w-md text-sm muted">{tr('Create your first album to start a memory tree.')} {tr('Photos are compressed on this device and stored privately in your account.')}</p>
          <button type="button" className="btn-primary" onClick={() => document.getElementById('new-album-title')?.focus()}><Plus size={16} /> {tr('Create an album')}</button>
        </div>}
    </div>
  </div>;
}

type AlbumEditorProps = {
  album: Album;
  userId?: string;
  updateAlbum: (id: string, patch: Partial<Album>) => void;
  deleteAlbum: (id: string) => void;
  addMemory: (id: string, memory: Partial<AlbumMemory> & { title: string }) => void;
  updateMemory: (albumId: string, memoryId: string, patch: Partial<AlbumMemory>) => void;
  deleteMemory: (id: string, memoryId: string) => void;
  onDeleted: () => void;
  newMemory: string;
  setNewMemory: (v: string) => void;
};

function AlbumEditor({ album, userId, updateAlbum, deleteAlbum, addMemory, updateMemory, deleteMemory, onDeleted, newMemory, setNewMemory }: AlbumEditorProps) {
  const photoInput = useRef<HTMLInputElement>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<string>();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyMemoryId, setBusyMemoryId] = useState<string>();
  const [memoryQuery, setMemoryQuery] = useState('');
  const [previewIndex, setPreviewIndex] = useState<number>();
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [dragOver, setDragOver] = useState(false);
  const rememberUrl = useCallback((id: string, url?: string) => setPhotoUrls((current) => (url && current[id] !== url ? { ...current, [id]: url } : current)), []);
  const visibleMemories = album.memories.filter((m) => m.title.toLocaleLowerCase().includes(memoryQuery.trim().toLocaleLowerCase()));
  const gallery = useMemo(() => visibleMemories.filter((m) => photoUrls[m.id]).map((m) => ({ id: m.id, url: photoUrls[m.id], title: m.title })), [visibleMemories, photoUrls]);
  const preview = previewIndex === undefined ? undefined : gallery[previewIndex];
  const step = useCallback((delta: number) => setPreviewIndex((index) => (index === undefined || !gallery.length ? index : (index + delta + gallery.length) % gallery.length)), [gallery.length]);
  const touchStart = useRef<number>();
  const sensors = useSensors(useSensor(PointerSensor), useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const reorder = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    useStore.setState((state) => ({ albums: state.albums.map((current) => {
      if (current.id !== album.id) return current;
      const from = current.memories.findIndex((memory) => memory.id === active.id);
      const to = current.memories.findIndex((memory) => memory.id === over.id);
      return from < 0 || to < 0 ? current : { ...current, memories: arrayMove(current.memories, from, to) };
    }) }));
  };

  useEffect(() => () => {
    if (selectedPreview?.startsWith('blob:')) URL.revokeObjectURL(selectedPreview);
  }, [selectedPreview]);

  useEffect(() => {
    if (previewIndex === undefined) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewIndex(undefined);
      else if (event.key === 'ArrowRight') step(1);
      else if (event.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    const root = document.documentElement; const previous = root.style.overflow; root.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); root.style.overflow = previous; };
  }, [previewIndex, step]);

  const choosePhoto = async (file?: File) => {
    if (!file || busy) return;
    if (selectedPreview?.startsWith('blob:')) URL.revokeObjectURL(selectedPreview);
    setSelectedPhoto(null);
    setSelectedPreview(undefined);
    setBusy(true);
    setStatus('Preparing and compressing photo on this device…');
    try {
      const compressed = await compressImage(file);
      const preview = URL.createObjectURL(compressed.file);
      setSelectedPhoto(compressed.file);
      setSelectedPreview(preview);
      setStatus(`Photo ready (${formatBytes(compressed.file.size)}). It will upload privately when you add the memory.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not prepare this photo.');
    } finally {
      setBusy(false);
      if (photoInput.current) photoInput.current.value = '';
    }
  };

  const clearSelectedPhoto = () => {
    if (selectedPreview?.startsWith('blob:')) URL.revokeObjectURL(selectedPreview);
    setSelectedPhoto(null);
    setSelectedPreview(undefined);
    if (photoInput.current) photoInput.current.value = '';
  };

  const add = async () => {
    const title = newMemory.trim();
    if (!title || busy) return;
    if (selectedPhoto && !userId) {
      setStatus('Sign in to add private photos. Memory text still works in local-only mode.');
      return;
    }

    setBusy(true);
    try {
      let imagePath: string | undefined;
      if (selectedPhoto && userId) {
        setStatus('Compressing photo on this device…');
        const compressed = await compressImage(selectedPhoto);
        setStatus(`Compressed ${formatBytes(compressed.originalBytes)} to ${formatBytes(compressed.file.size)}. Uploading privately…`);
        imagePath = await uploadPrivateImage(userId, compressed.file, 'albums');
      }
      addMemory(album.id, { title, imagePath });
      setNewMemory('');
      clearSelectedPhoto();
      setStatus(imagePath ? 'Memory added with a private photo.' : 'Memory added.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not add this photo.');
    } finally {
      setBusy(false);
    }
  };

  const replacePhoto = async (memory: AlbumMemory, file?: File) => {
    if (!file || busyMemoryId) return;
    if (!userId) {
      setStatus('Sign in to replace a private photo.');
      return;
    }
    setBusyMemoryId(memory.id);
    try {
      setStatus('Compressing replacement photo on this device…');
      const compressed = await compressImage(file);
      setStatus(`Compressed ${formatBytes(compressed.originalBytes)} to ${formatBytes(compressed.file.size)}. Uploading privately…`);
      const nextPath = await uploadPrivateImage(userId, compressed.file, 'albums');
      updateMemory(album.id, memory.id, { imagePath: nextPath, imageUrl: undefined });
      if (memory.imagePath) {
        try {
          await deletePrivateImage(userId, memory.imagePath);
        } catch {
          setStatus('Photo replaced, but the previous private file could not be removed.');
          return;
        }
      }
      setStatus('Private photo replaced.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not replace this photo.');
    } finally {
      setBusyMemoryId(undefined);
    }
  };

  const removePhoto = async (memory: AlbumMemory) => {
    if (!confirm('Remove this memory photo?')) return;
    if (memory.imagePath) {
      if (!userId) {
        setStatus('Sign in to remove this private photo.');
        return;
      }
      setBusyMemoryId(memory.id);
      try {
        await deletePrivateImage(userId, memory.imagePath);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Could not remove this private photo.');
        setBusyMemoryId(undefined);
        return;
      }
      setBusyMemoryId(undefined);
    }
    updateMemory(album.id, memory.id, { imagePath: undefined, imageUrl: undefined });
    setStatus('Memory photo removed.');
  };

  const removeMemory = (memory: AlbumMemory) => {
    if (!confirm(`Delete “${memory.title}”?`)) return;
    // The private object stays in Storage while the memory sits in Trash, so restore keeps the photo.
    deleteMemory(album.id, memory.id);
  };

  const removeAlbum = () => {
    if (!confirm('Delete this album and its memories?')) return;
    // Album metadata and its private image paths are retained together in Trash.
    deleteAlbum(album.id);
    onDeleted();
  };

  const photoTotal = album.memories.filter((m) => m.imagePath || m.imageUrl).length;
  return <section className="album-editor">
    <div className="album-banner">
      <AlbumCover album={album} userId={userId} className="album-banner-bg" />
      <div className="album-banner-shade" aria-hidden="true" />
      <div className="relative flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <span className="albums-eyebrow"><Images size={13} /> {album.memories.length} {tr('memories')} · {photoTotal} {tr('Photos').toLocaleLowerCase()}</span>
          <input aria-label={tr('Album title')} className="album-title-input" value={album.title} onChange={(e) => updateAlbum(album.id, { title: e.target.value })} />
          <textarea aria-label={tr('Album description')} rows={2} className="album-desc-input" placeholder={tr('Describe this chapter of your life…')} value={album.description} onChange={(e) => updateAlbum(album.id, { description: e.target.value })} />
        </div>
        <button className="album-delete" disabled={busy} onClick={removeAlbum} title={tr('Delete album')} aria-label={tr('Delete album')}><Trash2 size={16} /><span className="sm:hidden">{tr('Delete album')}</span></button>
      </div>
    </div>

    <form className={`memory-composer card ${dragOver ? 'is-dragover' : ''}`} onSubmit={(e) => { e.preventDefault(); void add(); }}
      onDragOver={(e) => { if (Array.from(e.dataTransfer.items).some((item) => item.kind === 'file')) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); void choosePhoto(e.dataTransfer.files?.[0]); }}>
      <button type="button" className="memory-drop" disabled={busy} onClick={() => photoInput.current?.click()} aria-label={selectedPreview ? tr('Change photo') : tr('Choose photo')}>
        {selectedPreview ? <img src={selectedPreview} alt={tr('Selected memory preview')} /> : <><Upload size={22} /><span className="text-xs font-medium">{tr('Add photo')}</span></>}
      </button>
      <input ref={photoInput} type="file" accept="image/*,.heic,.heif" hidden onChange={(e) => choosePhoto(e.target.files?.[0])} />
      <div className="min-w-0 flex-1">
        <label className="text-sm font-semibold" htmlFor="new-memory-title">{tr('New moment')}</label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input id="new-memory-title" className="input" maxLength={200} placeholder={tr('Add a memory, photo story, or milestone…')} value={newMemory} onChange={(e) => setNewMemory(e.target.value)} />
          <button type="submit" className="btn-primary shrink-0" disabled={busy || !newMemory.trim()}><Plus size={16} /> {busy ? tr('Saving…') : tr('Add memory')}</button>
        </div>
        <p className="mt-2 text-xs muted">{selectedPhoto ? <button type="button" className="inline-flex items-center gap-1 text-rose-500 hover:underline" onClick={clearSelectedPhoto}><X size={12} /> {tr('Remove selected photo')}</button> : tr('Phone photos, including browser-supported HEIC/HEIF · compressed before private upload.')} <span className="hidden md:inline">{tr('You can also drop a photo here.')}</span></p>
      </div>
    </form>
    {status && <p className="mt-3 break-words rounded-xl bg-indigo-500/[.07] px-3 py-2 text-sm text-indigo-800 dark:text-indigo-200" role="status">{status}</p>}

    <div className="mb-4 mt-6 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{tr('Moments')} <span className="text-sm font-normal muted">{album.memories.length}</span></h2>{album.memories.length > 0 && <label className="relative w-full sm:w-64"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 muted" /><input aria-label={tr('Search memories')} className="input !w-full !pl-9" placeholder={tr('Search this album…')} value={memoryQuery} onChange={(e) => setMemoryQuery(e.target.value)} /></label>}</div>
    {album.memories.length === 0 ? <div className="albums-empty card"><div className="albums-empty-art" aria-hidden="true"><span /><span /><span /><ImagePlus size={28} /></div><p className="text-lg font-semibold">{tr('Your first moment starts here')}</p><p className="max-w-sm text-sm muted">{tr('Add a memory above, then attach a photo whenever you like.')}</p></div>
      : visibleMemories.length === 0 ? <p className="card p-6 text-center text-sm muted">{tr('No memories match your search.')}</p>
      : <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}><SortableContext items={visibleMemories.map((memory) => memory.id)} strategy={rectSortingStrategy}><div className="memory-grid">{visibleMemories.map((memory, index) => <MemoryCard key={memory.id} index={index} memory={memory} userId={userId} busy={busyMemoryId === memory.id} onUrl={rememberUrl} onReplace={(file) => replacePhoto(memory, file)} onRemovePhoto={() => removePhoto(memory)} onDelete={() => removeMemory(memory)} onPreview={() => setPreviewIndex(Math.max(0, gallery.findIndex((item) => item.id === memory.id)))} />)}</div></SortableContext></DndContext>}

    {preview && <div className="lightbox" role="dialog" aria-modal="true" aria-label={preview.title} onClick={() => setPreviewIndex(undefined)}
      onTouchStart={(e) => { touchStart.current = e.touches[0]?.clientX; }}
      onTouchEnd={(e) => { const start = touchStart.current; const end = e.changedTouches[0]?.clientX; touchStart.current = undefined; if (start !== undefined && end !== undefined && Math.abs(end - start) > 50) step(end < start ? 1 : -1); }}>
      <button autoFocus className="lightbox-btn right-4 top-[max(1rem,env(safe-area-inset-top))]" aria-label={tr('Close photo preview')} onClick={() => setPreviewIndex(undefined)}><X size={22} /></button>
      {gallery.length > 1 && <><button className="lightbox-btn lightbox-nav left-3" aria-label={tr('Previous')} onClick={(e) => { e.stopPropagation(); step(-1); }}><ChevronLeft size={24} /></button><button className="lightbox-btn lightbox-nav right-3" aria-label={tr('Next')} onClick={(e) => { e.stopPropagation(); step(1); }}><ChevronRight size={24} /></button></>}
      <figure key={preview.id} className="lightbox-figure" onClick={(e) => e.stopPropagation()}>
        <img src={preview.url} alt={preview.title} />
        <figcaption><span className="font-medium">{preview.title}</span>{gallery.length > 1 && <span className="opacity-70"> · {(previewIndex ?? 0) + 1} / {gallery.length}</span>}</figcaption>
      </figure>
    </div>}
  </section>;
}

function MemoryCard({ memory, index, userId, busy, onUrl, onReplace, onRemovePhoto, onDelete, onPreview }: { memory: AlbumMemory; index: number; userId?: string; busy: boolean; onUrl: (id: string, url?: string) => void; onReplace: (file?: File) => void; onRemovePhoto: () => void; onDelete: () => void; onPreview: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: memory.id });
  const fileInput = useRef<HTMLInputElement>(null);
  const { url: imageUrl, error: imageError } = useMemoryPhoto(memory, userId);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { onUrl(memory.id, imageUrl); }, [memory.id, imageUrl, onUrl]);
  const hasPhoto = Boolean(memory.imagePath || memory.imageUrl);
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, animationDelay: `${Math.min(index, 12) * 40}ms` };
  return <article ref={setNodeRef} style={style} className={`memory-card ${hasPhoto ? 'has-photo' : 'is-text'} ${isDragging ? 'is-dragging' : ''}`}>
    {hasPhoto ? <div className="memory-photo">
      {imageUrl ? <button type="button" className="group block h-full w-full" onClick={onPreview} aria-label={`${tr('Preview photo')}: ${memory.title}`}>
        <img src={imageUrl} alt={memory.title} loading="lazy" onLoad={() => setLoaded(true)} className={loaded ? 'is-loaded' : ''} referrerPolicy="no-referrer" />
        <span className="memory-photo-caption">{memory.title}</span>
      </button> : <div className="grid h-full place-items-center px-4 text-center text-xs muted">{imageError || <span className="skeleton-block absolute inset-0 rounded-none" />}</div>}
    </div> : <div className="memory-quote" style={coverStyle(memory.id)}><span aria-hidden="true">“</span><p>{memory.title}</p></div>}
    <div className="memory-body">
      <button ref={setActivatorNodeRef} type="button" aria-label={`${tr('Drag to reorder')}: ${memory.title}`} className="memory-grip" {...attributes} {...listeners}><GripVertical size={16} /></button>
      <h3 className="min-w-0 flex-1 truncate text-sm font-medium" title={memory.title}>{memory.title}</h3>
      <input ref={fileInput} type="file" accept="image/*,.heic,.heif" hidden onChange={(e) => { onReplace(e.target.files?.[0]); e.currentTarget.value = ''; }} />
      <button className="memory-action" disabled={busy} onClick={() => fileInput.current?.click()} title={hasPhoto ? tr('Replace photo') : tr('Add photo')} aria-label={`${hasPhoto ? tr('Replace photo') : tr('Add photo')}: ${memory.title}`}><ImagePlus size={15} /></button>
      {hasPhoto && <button className="memory-action" disabled={busy} onClick={onRemovePhoto} title={tr('Remove photo')} aria-label={`${tr('Remove photo')}: ${memory.title}`}><X size={15} /></button>}
      <button className="memory-action hover:!text-rose-500" disabled={busy} onClick={onDelete} title={tr('Delete memory')} aria-label={`${tr('Delete memory')}: ${memory.title}`}><Trash2 size={14} /></button>
    </div>
    {busy && <p className="px-3 pb-3 text-xs muted">{tr('Updating private photo…')}</p>}
  </article>;
}
