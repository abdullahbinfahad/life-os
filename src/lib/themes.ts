import type { Settings } from './types';

export type ThemeId = Settings['theme'];

export const EARNED_THEMES: Array<{ id: Exclude<ThemeId, 'dark' | 'light'>; title: string; points: number }> = [
  { id: 'paper', title: 'Paper & ink', points: 1_000 },
  { id: 'monochrome', title: 'Monochrome', points: 5_000 },
  { id: 'sapphire', title: 'Sapphire glass', points: 15_000 },
  { id: 'forest', title: 'Emerald Night', points: 50_000 },
];

export function isThemeUnlocked(theme: ThemeId, points: number): boolean {
  const milestone = EARNED_THEMES.find((item) => item.id === theme);
  return !milestone || points >= milestone.points;
}
