import { en } from "@/lib/locales/en";
import { fr } from "@/lib/locales/fr";
import { zh } from "@/lib/locales/zh";

export const dictionaries = {
  en,
  fr,
  zh,
} as const;

export type Locale = keyof typeof dictionaries;

export function isSupportedLocale(value: string): value is Locale {
  return value in dictionaries;
}

export function getDictionary(locale: Locale) {
  return dictionaries[locale];
}

