import { useStore } from './store';

/*
 * App-wide micro-interactions, installed once from the Layout:
 *  - a soft ripple on every button press (any page, any component);
 *  - a small confetti burst where you tapped when something becomes complete
 *    (task, habit check-in, milestone, project task, goal).
 * Both are skipped when the user prefers reduced motion. Pure DOM + CSS, no canvas,
 * and particles remove themselves so nothing accumulates.
 */
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
let lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

function completionScore() {
  const s = useStore.getState();
  let score = 0;
  for (const item of s.items ?? []) if (item.status === 'done') score += 1;
  for (const habit of s.habits ?? []) score += habit.log?.length ?? 0;
  for (const goal of s.goals ?? []) { if (goal.status === 'done') score += 1; for (const m of goal.milestones ?? []) if (m.done) score += 1; }
  for (const project of s.projects ?? []) for (const task of project.tasks ?? []) if (task.done) score += 1;
  return score;
}

const COLORS = ['#818cf8', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#38bdf8'];

export function burst(x = lastPointer.x, y = lastPointer.y, count = 14) {
  if (reducedMotion()) return;
  const layer = document.createElement('div');
  layer.className = 'delight-burst';
  layer.style.left = `${x}px`;
  layer.style.top = `${y}px`;
  for (let i = 0; i < count; i += 1) {
    const p = document.createElement('i');
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const dist = 38 + Math.random() * 46;
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(angle) * dist - 18}px`);
    p.style.setProperty('--rot', `${Math.random() * 540 - 270}deg`);
    p.style.background = COLORS[i % COLORS.length];
    if (i % 3 === 0) p.style.borderRadius = '9999px';
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 900);
}

function ripple(event: PointerEvent) {
  lastPointer = { x: event.clientX, y: event.clientY };
  if (reducedMotion() || event.button !== 0) return;
  const el = event.target as HTMLElement | null;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return; // no ripple when tapping into a field
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('.btn, .btn-primary, .btn-outline, .btn-ghost, .btn-danger, .fab, .study-primary, .study-secondary, .chip, .mobile-bottom-nav a, .sidebar-link, .card, .milestone-toggle, .tap-toggle, .tap-check, .tap-action, .week-day, a[href], button');
  if (!target || target.matches(':disabled')) return;
  const rect = target.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2;
  const wave = document.createElement('span');
  wave.className = 'delight-ripple';
  wave.style.width = wave.style.height = `${size}px`;
  wave.style.left = `${event.clientX - rect.left - size / 2}px`;
  wave.style.top = `${event.clientY - rect.top - size / 2}px`;
  if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
  // A separate clipping layer, so the button's own overflow (badges, tooltips) is never changed.
  const host = document.createElement('span');
  host.className = 'delight-ripple-host';
  host.appendChild(wave);
  target.appendChild(host);
  window.setTimeout(() => host.remove(), 600);
}

let installed = false;
export function installDelight() {
  if (installed) return () => undefined;
  installed = true;
  let previous = completionScore();
  const unsubscribe = useStore.subscribe(() => {
    const next = completionScore();
    // Only celebrate a single user-sized step, not cloud hydration or imports.
    if (next > previous && next - previous <= 2) burst();
    previous = next;
  });
  window.addEventListener('pointerdown', ripple, { passive: true, capture: true });
  return () => { installed = false; unsubscribe(); window.removeEventListener('pointerdown', ripple, { capture: true }); };
}
