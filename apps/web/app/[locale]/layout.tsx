import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, isSupportedLocale, type Locale } from "@/lib/i18n";

export function generateStaticParams() {
  return [{ locale: "en" }];
}

export function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Metadata {
  if (!isSupportedLocale(params.locale)) {
    return {};
  }

  const dictionary = getDictionary(params.locale);

  return {
    title: "REACH",
    description: dictionary.home.description,
  };
}

export default function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: { locale: string };
}>) {
  if (!isSupportedLocale(params.locale)) {
    notFound();
  }

  const dictionary = getDictionary(params.locale as Locale);

  return (
    <section aria-label={dictionary.meta.languageLabel}>
      {children}
    </section>
  );
}
