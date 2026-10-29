import type { Settings } from './types';
import { useStore } from './store';

// English fallback source string: Please clarify whether this should be a task, habit, goal, milestone, or Life Library item.
export type AppLanguage = NonNullable<Settings['language']>;
export const APP_LANGUAGES: Array<{ code: AppLanguage; label: string; native: string; direction?: 'rtl' }> = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'zh', label: 'Chinese', native: '简体中文' },
  { code: 'ja', label: 'Japanese', native: '日本語' },
  { code: 'ko', label: 'Korean', native: '한국어' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'ar', label: 'Arabic', native: 'العربية', direction: 'rtl' },
  { code: 'es', label: 'Spanish', native: 'Español' },
];

type Dictionary = Record<string, string>;
const dictionaries: Partial<Record<AppLanguage, Dictionary>> = {};
const loaders: Record<Exclude<AppLanguage, 'en'>, () => Promise<{ default: Dictionary }>> = {
  bn: () => import('./locales/bn'),
  hi: () => import('./locales/hi'),
  ar: () => import('./locales/ar'),
  es: () => import('./locales/es'),
  zh: () => import('./locales/zh'),
  ja: () => import('./locales/ja'),
  ko: () => import('./locales/ko'),
};

export async function preloadAppLanguage(language: AppLanguage): Promise<void> {
  if (language === 'en' || dictionaries[language]) return;
  dictionaries[language] = (await loaders[language]()).default;
}

export function translate(text: string, language: AppLanguage = useStore.getState().settings.language ?? 'en'): string {
  return language === 'en' ? text : dictionaries[language]?.[text] ?? text;
}
