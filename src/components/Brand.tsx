import { useEffect, useState } from 'react';
import { cx } from '../lib/utils';

export const APP_NAME = 'Life Circle';
const LOADER_COLORS = ['#4f46e5', '#0f9f88', '#db5a32', '#b044a5', '#2879b8'];

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

/** Loading-only runner: cycles through a restrained palette on each page refresh. */
export function LoadingLogo({ size = 56, className }: { size?: number; className?: string }) {
  const [color, setColor] = useState(LOADER_COLORS[0]);
  useEffect(() => {
    try {
      const previous = Number(sessionStorage.getItem('life-circle-loader-color-index') ?? '-1');
      const next = ((Number.isFinite(previous) ? previous : -1) + 1) % LOADER_COLORS.length;
      sessionStorage.setItem('life-circle-loader-color-index', String(next));
      setColor(LOADER_COLORS[next]);
    } catch {
      setColor(LOADER_COLORS[(Date.now() >>> 4) % LOADER_COLORS.length]);
    }
  }, []);
  return (
    <span role="img" aria-label={`${APP_NAME} loading`} className={cx('inline-flex shrink-0 select-none runner-loading', className)} style={{ width: size, height: size, color }}>
      <RunnerGlyph />
    </span>
  );
}
