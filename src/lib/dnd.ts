import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

/**
 * One drag setup for the whole app.
 * - Mouse on desktop (PointerSensor would also grab touches and lose them to page scrolling).
 * - Touch on phones: a grip handle starts almost immediately; a whole row needs a short
 *   long-press so normal scrolling still works.
 * - Keyboard: Space to pick up, arrows to move, Space to drop.
 */
export function useDragSensors(mode: 'handle' | 'row' = 'row') {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: mode === 'handle' ? 3 : 6 } }),
    useSensor(TouchSensor, { activationConstraint: mode === 'handle' ? { delay: 70, tolerance: 12 } : { delay: 230, tolerance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/** Light haptic tick on phones when a drag starts or drops. */
export const dragHaptic = () => { try { navigator.vibrate?.(12); } catch { /* unsupported */ } };
