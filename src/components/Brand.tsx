import { cx } from '../lib/utils';

export const APP_NAME = 'Life Circle';
export const LOGO = '🧍‍♂️';

/** Full-body man emoji, no background. */
export function Logo({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span role="img" aria-label={APP_NAME} className={cx('inline-block select-none leading-none', className)} style={{ fontSize: size }}>
      {LOGO}
    </span>
  );
}
