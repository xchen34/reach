import { AnonymousCaseSubmissionFlow } from "@/components/anonymous-case-submission-flow";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getDictionary, type Locale } from "@/lib/i18n";

export default function LocaleHomePage({
  params,
}: {
  params: { locale: Locale };
}) {
  const dictionary = getDictionary(params.locale);

  return (
    <main className="page-shell">
      <div className="page-card">
        <span className="eyebrow">{dictionary.home.eyebrow}</span>
        <h1 className="headline">{dictionary.home.title}</h1>
        <p className="lede">{dictionary.home.description}</p>
        <p className="support-copy">{dictionary.home.privacy}</p>

        <LanguageSwitcher
          currentLocale={params.locale}
          label={dictionary.home.languagePicker}
        />

        <section className="form-panel" aria-labelledby="submission-title">
          <h2 className="section-title" id="submission-title">
            {dictionary.home.form.title}
          </h2>
          <AnonymousCaseSubmissionFlow
            dictionary={dictionary}
            locale={params.locale}
          />
        </section>
      </div>
    </main>
  );
}
