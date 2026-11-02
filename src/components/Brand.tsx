import { useState } from 'react';
import { cx } from '../lib/utils';

export const APP_NAME = 'Life OS';
const MARK_URL = `${import.meta.env.BASE_URL}lifeos-mark.svg`;

export function Logo({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label={APP_NAME}
      className={cx('brand-mark inline-flex shrink-0 select-none', className)}
      style={{ width: size, height: size }}
    >
      <img src={MARK_URL} alt="" draggable={false} className="brand-mark-image" />
    </span>
  );
}

const LOADER_COLORS = ['#34d399', '#60a5fa', '#a78bfa', '#fbbf24', '#fb7185'];
let pageLoaderColor = LOADER_COLORS[Math.floor(Math.random() * LOADER_COLORS.length)];
try {
  const previous = Number(sessionStorage.getItem('life-circle-loader-color-index') ?? '-1');
  const next = ((Number.isFinite(previous) ? previous : -1) + 1) % LOADER_COLORS.length;
  sessionStorage.setItem('life-circle-loader-color-index', String(next));
  pageLoaderColor = LOADER_COLORS[next];
} catch {
  // Storage can be disabled in private browsing; the in-memory color still works.
}

/** A calm, centered loading mark; motion is decorative and disabled for reduced-motion users. */
export function LoadingLogo({ size = 56, className }: { size?: number; className?: string }) {
  const [color] = useState(pageLoaderColor);
  return (
    <span role="img" aria-label={`${APP_NAME} loading`} className={cx('loading-mark', className)} style={{ width: size, height: size, color }}>
      <span className="loading-halo" aria-hidden="true" />
      <span className="loading-orbit" aria-hidden="true" />
      <img src={MARK_URL} alt="" draggable={false} className="loading-glyph" />
    </span>
  );
}
