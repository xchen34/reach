import { getDictionary, type Locale } from "@/lib/i18n";

export default function ShareTokenLoading({
  params,
}: {
  params: { locale: Locale };
}) {
  const dictionary = getDictionary(params.locale);

  return (
    <main className="page-shell">
      <div className="page-card">
        <span className="eyebrow">{dictionary.share.eyebrow}</span>
        <h1 className="headline share-headline">{dictionary.share.title}</h1>
        <p className="lede">{dictionary.share.loading}</p>
      </div>
    </main>
  );
}
