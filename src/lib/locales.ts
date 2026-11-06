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
const sharedProjectFallbacks: Partial<Record<AppLanguage, Dictionary>> = {
  zh: {
    'No admin is assigned. Project members can claim the admin role.': '当前尚未指定项目管理员。项目成员可以认领管理员角色。',
    'Become admin': '成为管理员',
    'Members may change the project status while no admin is assigned.': '未指定管理员时，项目成员可以更改项目状态。',
    'Your project role is now Admin.': '你的项目角色现在是管理员。',
  },
  ja: {
    'No admin is assigned. Project members can claim the admin role.': 'プロジェクト管理者がまだ設定されていません。メンバーは管理者ロールを引き受けられます。',
    'Become admin': '管理者になる',
    'Members may change the project status while no admin is assigned.': '管理者がいない場合、メンバーはプロジェクトのステータスを変更できます。',
    'Your project role is now Admin.': 'あなたのプロジェクトロールは管理者になりました。',
  },
  ko: {
    'No admin is assigned. Project members can claim the admin role.': '현재 프로젝트 관리자가 지정되어 있지 않습니다. 멤버가 관리자 역할을 맡을 수 있습니다.',
    'Become admin': '관리자 되기',
    'Members may change the project status while no admin is assigned.': '관리자가 없을 때 멤버가 프로젝트 상태를 변경할 수 있습니다.',
    'Your project role is now Admin.': '프로젝트 역할이 관리자로 변경되었습니다.',
  },
  bn: {
    'No admin is assigned. Project members can claim the admin role.': 'এখনো কোনো প্রজেক্ট অ্যাডমিন নির্ধারিত নেই। একজন সদস্য অ্যাডমিনের দায়িত্ব নিতে পারেন।',
    'Become admin': 'অ্যাডমিন হন',
    'Members may change the project status while no admin is assigned.': 'অ্যাডমিন না থাকলে সদস্যরা প্রজেক্টের অবস্থা পরিবর্তন করতে পারবেন।',
    'Your project role is now Admin.': 'আপনার প্রজেক্টের ভূমিকা এখন অ্যাডমিন।',
  },
  hi: {
    'No admin is assigned. Project members can claim the admin role.': 'अभी कोई प्रोजेक्ट एडमिन नियुक्त नहीं है। कोई सदस्य एडमिन की भूमिका ले सकता है।',
    'Become admin': 'एडमिन बनें',
    'Members may change the project status while no admin is assigned.': 'एडमिन न होने पर सदस्य प्रोजेक्ट की स्थिति बदल सकते हैं।',
    'Your project role is now Admin.': 'आपकी प्रोजेक्ट भूमिका अब एडमिन है।',
  },
  ar: {
    'No admin is assigned. Project members can claim the admin role.': 'لم يتم تعيين مسؤول للمشروع بعد. يمكن لأحد الأعضاء تولي دور المسؤول.',
    'Become admin': 'تولَّ دور المسؤول',
    'Members may change the project status while no admin is assigned.': 'يمكن للأعضاء تغيير حالة المشروع عند عدم وجود مسؤول.',
    'Your project role is now Admin.': 'أصبح دورك في المشروع الآن مسؤولاً.',
  },
  es: {
    'No admin is assigned. Project members can claim the admin role.': 'Aún no hay un administrador del proyecto. Un miembro puede asumir ese rol.',
    'Become admin': 'Convertirme en administrador',
    'Members may change the project status while no admin is assigned.': 'Los miembros pueden cambiar el estado del proyecto mientras no haya un administrador.',
    'Your project role is now Admin.': 'Tu rol en el proyecto ahora es administrador.',
  },
};
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
  return language === 'en' ? text : dictionaries[language]?.[text] ?? sharedProjectFallbacks[language]?.[text] ?? text;
}
