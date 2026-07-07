import Link from "next/link";
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
        <span className="status-pill">{dictionary.home.status}</span>

        <ul className="language-list" aria-label={dictionary.home.languagePicker}>
          <li>
            <Link className="language-link" href="/en">
              English
            </Link>
          </li>
          <li>
            <Link className="language-link" href="/fr">
              Francais
            </Link>
          </li>
          <li>
            <Link className="language-link" href="/zh">
              中文
            </Link>
          </li>
        </ul>

        <div className="section-grid">
          <section className="section-card">
            <h2>{dictionary.home.sections.web.title}</h2>
            <p>{dictionary.home.sections.web.body}</p>
          </section>
          <section className="section-card">
            <h2>{dictionary.home.sections.api.title}</h2>
            <p>{dictionary.home.sections.api.body}</p>
          </section>
          <section className="section-card">
            <h2>{dictionary.home.sections.auth.title}</h2>
            <p>{dictionary.home.sections.auth.body}</p>
          </section>
        </div>
      </div>
    </main>
  );
}

