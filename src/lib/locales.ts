import type { Settings } from './types';
import { useStore } from './store';

export type AppLanguage = NonNullable<Settings['language']>;
export const APP_LANGUAGES: Array<{ code: AppLanguage; label: string; native: string; direction?: 'rtl' }> = [
  { code: 'en', label: 'English', native: 'English' },
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
};

export async function preloadAppLanguage(language: AppLanguage): Promise<void> {
  if (language === 'en' || dictionaries[language]) return;
  dictionaries[language] = (await loaders[language]()).default;
}

export function translate(text: string, language: AppLanguage = useStore.getState().settings.language ?? 'en'): string {
  return language === 'en' ? text : dictionaries[language]?.[text] ?? text;
}
