import { X } from 'lucide-react';
import { create } from 'zustand';

interface Toast { id: number; text: string; action?: { label: string; run: () => void } }
interface ToastState { toasts: Toast[]; push: (t: Omit<Toast, 'id'>) => void; dismiss: (id: number) => void }

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 6000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = (text: string, action?: Toast['action']) => useToasts.getState().push({ text, action });

export default function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="fixed bottom-24 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-2xl dark:bg-white dark:text-slate-900">
          <span>{t.text}</span>
          {t.action && <button className="font-semibold text-indigo-400 hover:underline dark:text-indigo-600" onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>}
          <button className="opacity-60 hover:opacity-100" onClick={() => dismiss(t.id)}><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}
