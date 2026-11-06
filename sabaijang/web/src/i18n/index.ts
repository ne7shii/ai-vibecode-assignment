// i18n: every page/area owns a dictionary file in src/i18n/<area>.ts shaped { th: {...}, en: {...} }.
// Pages read lang from the [lang] route segment. No external i18n library.
export type Lang = 'th' | 'en';
export const LANGS: Lang[] = ['th', 'en'];
export const isLang = (v: string | undefined): v is Lang => v === 'th' || v === 'en';
export type Dict<T> = { th: T; en: T };
export const pick = <T,>(d: Dict<T>, lang: Lang): T => d[lang] ?? d.th;
/** Pick th/en from objects like { nameTh, nameEn } or { th, en }. */
export function tx(o: { th?: string; en?: string } | null | undefined, lang: Lang): string {
  if (!o) return '';
  return (lang === 'en' ? o.en : o.th) ?? o.th ?? '';
}
export function txf<T extends Record<string, unknown>>(o: T, base: string, lang: Lang): string {
  return String(o[`${base}${lang === 'en' ? 'En' : 'Th'}`] ?? o[`${base}Th`] ?? '');
}
