import type { Category } from './types';
import { DEFAULT_CATEGORIES as BASE_CATEGORIES, TEMPLATE_LIBRARY as BASE_LIBRARY } from './templates';
import { EXTRA_CATEGORIES, EXTRA_LIBRARY } from './templates-extra';
import { EXTENDED_CATEGORIES } from './category-catalog';

/** All categories: the original 12 plus 7 new ones. */
export const DEFAULT_CATEGORIES: Category[] = [...BASE_CATEGORIES, ...EXTRA_CATEGORIES, ...EXTENDED_CATEGORIES];

/** 1,000+ ideas: base + extra, merged per category with duplicates removed. */
export const TEMPLATE_LIBRARY: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const src of [BASE_LIBRARY, EXTRA_LIBRARY]) {
    for (const [k, list] of Object.entries(src)) {
      const seen = new Set((out[k] ?? []).map((t) => t.toLowerCase()));
      out[k] = [...(out[k] ?? []), ...list.filter((t) => { const l = t.toLowerCase(); if (seen.has(l)) return false; seen.add(l); return true; })];
    }
  }
  return out;
})();

export const LIBRARY_COUNT = Object.values(TEMPLATE_LIBRARY).reduce((a, b) => a + b.length, 0);
