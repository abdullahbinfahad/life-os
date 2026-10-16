import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '../components/ui';
import { useStore } from '../lib/store';
import type { Album } from '../lib/types';

export default function Albums() {
  const { albums, addAlbum, updateAlbum, deleteAlbum, addMemory, deleteMemory } = useStore();
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
      {album ? <AlbumEditor album={album} updateAlbum={updateAlbum} deleteAlbum={deleteAlbum} addMemory={addMemory} deleteMemory={deleteMemory} onDeleted={() => setSelected(albums.find((a) => a.id !== album.id)?.id ?? null)} newMemory={newMemory} setNewMemory={setNewMemory} /> : <div className="card grid min-h-64 place-items-center p-8 text-center muted">Choose an album or create one above.</div>}
    </div>
  </div>;
}

function AlbumEditor({ album, updateAlbum, deleteAlbum, addMemory, deleteMemory, onDeleted, newMemory, setNewMemory }: { album: Album; updateAlbum: (id: string, patch: Partial<Album>) => void; deleteAlbum: (id: string) => void; addMemory: (id: string, m: { title: string }) => void; deleteMemory: (id: string, memoryId: string) => void; onDeleted: () => void; newMemory: string; setNewMemory: (v: string) => void }) {
  const add = () => { if (!newMemory.trim()) return; addMemory(album.id, { title: newMemory.trim() }); setNewMemory(''); };
  return <section className="card p-6">
    <div className="mb-5 flex items-start gap-4"><div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 text-indigo-500"><ImagePlus size={26} /></div><div className="min-w-0 flex-1"><input className="w-full bg-transparent text-2xl font-bold outline-none" value={album.title} onChange={(e) => updateAlbum(album.id, { title: e.target.value })} /><textarea className="mt-1 w-full resize-none bg-transparent text-sm muted outline-none" placeholder="Describe this chapter of your life…" value={album.description} onChange={(e) => updateAlbum(album.id, { description: e.target.value })} /></div><button className="btn-ghost text-rose-500" onClick={() => confirm('Delete this album and its memories?') && (deleteAlbum(album.id), onDeleted())}><Trash2 size={16} /></button></div>
    <div className="mb-4 flex gap-2"><input className="input" placeholder="Add a memory, photo story, or milestone…" value={newMemory} onChange={(e) => setNewMemory(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} /><button className="btn-primary" onClick={add}><Plus size={16} /> Add memory</button></div>
    <div className="grid gap-3 sm:grid-cols-2">{album.memories.map((m) => <article key={m.id} className="rounded-2xl border border-slate-200 p-4 dark:border-white/[.08]"><div className="flex items-start justify-between gap-2"><h3 className="font-medium">{m.title}</h3><button className="muted hover:text-rose-500" onClick={() => deleteMemory(album.id, m.id)}><Trash2 size={14} /></button></div><p className="mt-2 text-sm muted">Add a photo URL or note in the next edit pass.</p></article>)}</div>
  </section>;
}
