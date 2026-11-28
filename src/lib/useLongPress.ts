import { useRef, type MouseEvent, type PointerEvent } from 'react';

/**
 * Long-press (touch or mouse) and double-click both call `onLongPress`; a normal tap still calls `onClick`.
 * Moving the finger more than a few pixels (scrolling) cancels it.
 */
export function useLongPress(onLongPress: () => void, onClick?: () => void, ms = 480) {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const clear = () => { if (timer.current !== null) window.clearTimeout(timer.current); timer.current = null; };
  return {
    onPointerDown: (event: PointerEvent) => {
      if (event.button !== 0) return;
      fired.current = false; start.current = { x: event.clientX, y: event.clientY };
      clear();
      timer.current = window.setTimeout(() => { fired.current = true; try { navigator.vibrate?.(15); } catch { /* unsupported */ } onLongPress(); }, ms);
    },
    onPointerMove: (event: PointerEvent) => {
      if (!start.current) return;
      if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 8) { clear(); start.current = null; }
    },
    onPointerUp: clear,
    onPointerCancel: () => { clear(); start.current = null; },
    onPointerLeave: clear,
    onContextMenu: (event: MouseEvent) => { if (fired.current || timer.current !== null) event.preventDefault(); },
    onDoubleClick: (event: MouseEvent) => { event.preventDefault(); clear(); fired.current = true; onLongPress(); },
    onClick: (event: MouseEvent) => {
      if (fired.current) { event.preventDefault(); event.stopPropagation(); fired.current = false; return; }
      onClick?.();
    },
  };
}
