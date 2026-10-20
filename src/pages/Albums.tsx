import { ImagePlus, Plus, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '../components/ui';
import { useAuth } from '../lib/auth';
import { compressImage, deletePrivateImage, formatBytes, getPrivateImageUrl, uploadPrivateImage } from '../lib/media';
import { useStore } from '../lib/store';
import type { Album, AlbumMemory } from '../lib/types';

export default function Albums() {
  const { albums, addAlbum, updateAlbum, deleteAlbum, addMemory, updateMemory, deleteMemory } = useStore();
  const { user } = useAuth();
  const [selected, setSelected] = useState<string | null>(albums[0]?.id ?? null);
  const [newAlbum, setNewAlbum] = useState('');
  const [newMemory, setNewMemory] = useState('');
  const album = albums.find((a) => a.id === selected);

  const createAlbum = () => {
    const title = newAlbum.trim();
    if (!title) return;
    const id = addAlbum({ title });
    setNewAlbum('');
    setSelected(id);
  };

  return <div>
    <PageHeader title="Memory albums" subtitle="Build a visual tree of moments, people and places" actions={<div className="flex gap-2"><input className="input !w-48" placeholder="New album…" value={newAlbum} onChange={(e) => setNewAlbum(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createAlbum()} /><button className="btn-primary" onClick={createAlbum}><Plus size={16} /> Create</button></div>} />
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <section className="card p-3">
        <div className="mb-3 px-2 text-xs font-semibold uppercase tracking-wide muted">Your albums · {albums.length}</div>
        <div className="space-y-1">{albums.map((a) => <button key={a.id} onClick={() => setSelected(a.id)} className={`w-full rounded-xl px-3 py-3 text-left transition ${a.id === selected ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-white/[.05]'}`}><div className="font-medium">{a.title}</div><div className="text-xs opacity-70">{a.memories.length} memories</div></button>)}</div>
        {!albums.length && <p className="p-3 text-sm muted">Create your first album to start a memory tree.</p>}
      </section>
      {album ? <AlbumEditor album={album} userId={user?.id} updateAlbum={updateAlbum} deleteAlbum={deleteAlbum} addMemory={addMemory} updateMemory={updateMemory} deleteMemory={deleteMemory} onDeleted={() => setSelected(albums.find((a) => a.id !== album.id)?.id ?? null)} newMemory={newMemory} setNewMemory={setNewMemory} /> : <div className="card grid min-h-64 place-items-center p-8 text-center muted">Choose an album or create one above.</div>}
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

  useEffect(() => () => {
    if (selectedPreview?.startsWith('blob:')) URL.revokeObjectURL(selectedPreview);
  }, [selectedPreview]);

  const choosePhoto = (file?: File) => {
    if (!file) return;
    if (selectedPreview?.startsWith('blob:')) URL.revokeObjectURL(selectedPreview);
    setSelectedPhoto(file);
    setSelectedPreview(URL.createObjectURL(file));
    setStatus('Photo selected. It will be compressed and uploaded when you add the memory.');
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

  return <section className="card p-6">
    <div className="mb-5 flex items-start gap-4"><div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 text-indigo-500"><ImagePlus size={26} /></div><div className="min-w-0 flex-1"><input className="w-full bg-transparent text-2xl font-bold outline-none" value={album.title} onChange={(e) => updateAlbum(album.id, { title: e.target.value })} /><textarea className="mt-1 w-full resize-none bg-transparent text-sm muted outline-none" placeholder="Describe this chapter of your life…" value={album.description} onChange={(e) => updateAlbum(album.id, { description: e.target.value })} /></div><button className="btn-ghost text-rose-500" disabled={busy} onClick={removeAlbum} title="Delete album"><Trash2 size={16} /></button></div>
    <div className="mb-3 flex gap-2"><input className="input" placeholder="Add a memory, photo story, or milestone…" value={newMemory} onChange={(e) => setNewMemory(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} /><button className="btn-primary" disabled={busy} onClick={add}><Plus size={16} /> {busy ? 'Saving…' : 'Add memory'}</button></div>
    <div className="mb-5 rounded-xl border border-dashed border-slate-300 p-3 dark:border-white/[.12]">
      <div className="flex flex-wrap items-center gap-3">
        {selectedPreview && <img src={selectedPreview} alt="Selected memory preview" className="h-16 w-16 rounded-lg object-cover" />}
        <div className="min-w-0 flex-1"><div className="text-sm font-medium">Optional memory photo</div><p className="text-xs muted">JPEG, PNG, or WebP · compressed in this browser before private upload.</p></div>
        <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => choosePhoto(e.target.files?.[0])} />
        <button type="button" className="btn-outline" disabled={busy} onClick={() => photoInput.current?.click()}><Upload size={15} /> Choose photo</button>
        {selectedPhoto && <button type="button" className="btn-ghost !p-2" onClick={clearSelectedPhoto} title="Remove selected photo"><X size={16} /></button>}
      </div>
    </div>
    {status && <p className="mb-4 text-sm muted" role="status">{status}</p>}
    <div className="grid gap-3 sm:grid-cols-2">{album.memories.map((memory) => <MemoryCard key={memory.id} memory={memory} userId={userId} busy={busyMemoryId === memory.id} onReplace={(file) => replacePhoto(memory, file)} onRemovePhoto={() => removePhoto(memory)} onDelete={() => removeMemory(memory)} />)}</div>
  </section>;
}

function MemoryCard({ memory, userId, busy, onReplace, onRemovePhoto, onDelete }: { memory: AlbumMemory; userId?: string; busy: boolean; onReplace: (file?: File) => void; onRemovePhoto: () => void; onDelete: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState<string | undefined>(memory.imageUrl);
  const [imageError, setImageError] = useState('');

  useEffect(() => {
    let active = true;
    setImageError('');
    if (!memory.imagePath || !userId) {
      setImageUrl(memory.imageUrl);
      return () => { active = false; };
    }
    setImageUrl(undefined);
    getPrivateImageUrl(userId, memory.imagePath).then((url) => {
      if (active) setImageUrl(url);
    }).catch((error) => {
      if (!active) return;
      setImageUrl(memory.imageUrl);
      setImageError(error instanceof Error ? error.message : 'Could not load private photo.');
    });
    return () => { active = false; };
  }, [memory.imagePath, memory.imageUrl, userId]);

  const hasPhoto = Boolean(memory.imagePath || memory.imageUrl);
  return <article className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[.08]">
    {hasPhoto && <div className="relative h-40 bg-slate-100 dark:bg-white/[.04]">{imageUrl ? <img src={imageUrl} alt={memory.title} className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <div className="grid h-full place-items-center px-4 text-center text-xs muted">{imageError || 'Loading private photo…'}</div>}</div>}
    <div className="p-4"><div className="flex items-start justify-between gap-2"><h3 className="font-medium">{memory.title}</h3><button className="muted hover:text-rose-500" disabled={busy} onClick={onDelete} title="Delete memory"><Trash2 size={14} /></button></div>
      <div className="mt-3 flex flex-wrap gap-2"><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { onReplace(e.target.files?.[0]); e.currentTarget.value = ''; }} /><button className="btn-outline !px-2 !py-1 text-xs" disabled={busy} onClick={() => fileInput.current?.click()}><ImagePlus size={14} /> {hasPhoto ? 'Replace photo' : 'Add photo'}</button>{hasPhoto && <button className="btn-ghost !px-2 !py-1 text-xs text-rose-500" disabled={busy} onClick={onRemovePhoto}>Remove photo</button>}</div>
      {busy && <p className="mt-2 text-xs muted">Updating private photo…</p>}
    </div>
  </article>;
}
