import { useId, useState } from 'react';
import { cx } from '../lib/utils';

export const APP_NAME = 'Life OS';
/**
 * The Life OS mark: a rounded app tile with a progress ring (life in motion) and a
 * glowing orbit point. Drawn inline so it is crisp at every size and can animate.
 */
export function LogoMark({ size = 36, spinning = false }: { size?: number; spinning?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className={cx('lifeos-mark', spinning && 'is-spinning')}>
      <defs>
        <linearGradient id={`${id}-tile`} x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" /><stop offset=".55" stopColor="#8b5cf6" /><stop offset="1" stopColor="#ec4899" />
        </linearGradient>
        <radialGradient id={`${id}-shine`} cx="16" cy="10" r="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity=".38" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-arc`} x1="18" y1="18" x2="46" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" /><stop offset="1" stopColor="#e0e7ff" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="18" fill={`url(#${id}-tile)`} />
      <rect x="2" y="2" width="60" height="60" rx="18" fill={`url(#${id}-shine)`} />
      <rect x="2.5" y="2.5" width="59" height="59" rx="17.5" fill="none" stroke="#fff" strokeOpacity=".22" />
      <circle cx="32" cy="32" r="14" fill="none" stroke="#fff" strokeOpacity=".22" strokeWidth="5" />
      <g className="lifeos-mark-arc">
        <circle cx="32" cy="32" r="14" fill="none" stroke={`url(#${id}-arc)`} strokeWidth="5" strokeLinecap="round" strokeDasharray="66 88" transform="rotate(-90 32 32)" />
        <circle cx="18" cy="32" r="4.2" fill="#a5f3fc" />
        <circle cx="18" cy="32" r="7" fill="#a5f3fc" opacity=".28" />
      </g>
      <circle cx="32" cy="32" r="3.4" fill="#fff" />
    </svg>
  );
}

export function Logo({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span role="img" aria-label={APP_NAME} className={cx('brand-mark-v2 inline-flex shrink-0 select-none', className)} style={{ width: size, height: size }}>
      <LogoMark size={size} />
    </span>
  );
}

const LOADER_COLORS = ['#6957e8', '#5546d8', '#27b8cc', '#655bd6'];
let pageLoaderColor = LOADER_COLORS[Math.floor(Math.random() * LOADER_COLORS.length)];
try {
  const previous = Number(sessionStorage.getItem('life-circle-loader-color-index') ?? '-1');
  const next = ((Number.isFinite(previous) ? previous : -1) + 1) % LOADER_COLORS.length;
  sessionStorage.setItem('life-circle-loader-color-index', String(next));
  pageLoaderColor = LOADER_COLORS[next];
} catch {
  // Storage can be disabled in private browsing; the in-memory color still works.
}

/** Loading mark: the logo with its ring turning and a soft pulsing glow (static for reduced motion). */
export function LoadingLogo({ size = 56, className }: { size?: number; className?: string }) {
  const [color] = useState(pageLoaderColor);
  return (
    <span role="img" aria-label={`${APP_NAME} loading`} className={cx('loading-mark-v2', className)} style={{ width: size, height: size, color }}>
      <span className="loading-glow" aria-hidden="true" />
      <LogoMark size={size} spinning />
    </span>
  );
}
