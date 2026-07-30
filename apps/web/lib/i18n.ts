import { en } from "@/lib/locales/en";

export const dictionaries = {
  en,
} as const;

export type Locale = keyof typeof dictionaries;
export type Dictionary = typeof en;

export function isSupportedLocale(value: string): value is Locale {
  return value in dictionaries;
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
