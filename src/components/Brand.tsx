import { useState } from 'react';
import { cx } from '../lib/utils';

export const APP_NAME = 'Life Circle';

function RunnerGlyph() {
  return (
    <svg viewBox="0 0 256 256" className="h-full w-full" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="153" cy="43" r="17" fill="currentColor" stroke="none" />
        <path d="M137 76 119 122l20 42" strokeWidth="20" />
        <path d="m133 82-35 24-35-8" strokeWidth="17" />
        <path d="m140 82 31 21 35-10" strokeWidth="17" />
        <path d="m133 159-39 53" strokeWidth="20" />
        <path d="m137 159 47 27 25 35" strokeWidth="20" />
      </g>
    </svg>
  );
}

export function Logo({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span role="img" aria-label={APP_NAME} className={cx('inline-flex shrink-0 select-none text-indigo-600 dark:text-indigo-400', className)} style={{ width: size, height: size }}>
      <RunnerGlyph />
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

/** A calm loading mark; only the orbit and a small vertical drift move. */
export function LoadingLogo({ size = 56, className }: { size?: number; className?: string }) {
  const [color] = useState(pageLoaderColor);
  return (
    <span role="img" aria-label={`${APP_NAME} loading`} className={cx('loading-mark', className)} style={{ width: size, height: size, color }}>
      <span className="loading-halo" aria-hidden="true" />
      <span className="loading-orbit" aria-hidden="true" />
      <span className="loading-glyph" aria-hidden="true"><RunnerGlyph /></span>
    </span>
  );
}
