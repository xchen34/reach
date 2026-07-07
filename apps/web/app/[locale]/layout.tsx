import { notFound } from "next/navigation";
import { getDictionary, isSupportedLocale, type Locale } from "@/lib/i18n";

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "fr" }, { locale: "zh" }];
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

