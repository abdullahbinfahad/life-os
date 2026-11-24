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
    <div className="toast-stack fixed left-1/2 z-[90] flex w-[min(92vw,28rem)] -translate-x-1/2 flex-col items-center gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast-item flex max-w-full items-center gap-3 rounded-2xl bg-slate-900/95 px-4 py-3 text-sm text-white shadow-2xl backdrop-blur-xl dark:bg-white/95 dark:text-slate-900">
          <span className="min-w-0 flex-1 break-words">{t.text}</span>
          {t.action && <button className="font-semibold text-indigo-400 hover:underline dark:text-indigo-600" onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>}
          <button className="shrink-0 opacity-60 hover:opacity-100" aria-label="Dismiss" onClick={() => dismiss(t.id)}><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}
