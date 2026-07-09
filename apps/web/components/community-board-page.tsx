import Link from "next/link";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Dictionary, Locale } from "@/lib/i18n";

const publicBoardMirrorUrl = process.env.NEXT_PUBLIC_COMMUNITY_BOARD_URL ?? "";

type CommunityBoardPageProps = {
  dictionary: Dictionary;
  locale: Locale;
};

export function CommunityBoardPage({
  dictionary,
  locale,
}: CommunityBoardPageProps) {
  const statuses = [
    {
      label: dictionary.board.statuses.unverified.label,
      description: dictionary.board.statuses.unverified.description,
      pillClassName: "status-pill status-pill-warning",
    },
    {
      label: dictionary.board.statuses.safeConfirmed.label,
      description: dictionary.board.statuses.safeConfirmed.description,
      pillClassName: "status-pill",
    },
    {
      label: dictionary.board.statuses.missingReported.label,
      description: dictionary.board.statuses.missingReported.description,
      pillClassName: "status-pill status-pill-alert",
    },
    {
      label: dictionary.board.statuses.needsFollowUp.label,
      description: dictionary.board.statuses.needsFollowUp.description,
      pillClassName: "status-pill status-pill-neutral",
    },
  ];

  return (
    <main className="page-shell">
      <div className="page-card page-card-wide">
        <div className="community-home-toolbar">
          <div>
            <span className="eyebrow">{dictionary.board.eyebrow}</span>
            <h1 className="headline">{dictionary.board.title}</h1>
            <p className="lede">{dictionary.board.description}</p>
          </div>
          <LanguageSwitcher currentLocale={locale} label={dictionary.home.languagePicker} />
        </div>

        <p className="error-banner" role="alert">
          {dictionary.board.emergencyNotice}
        </p>

        <section className="community-entry-section" aria-labelledby="board-actions-title">
          <div className="community-entry-header">
            <div>
              <h2 className="section-title" id="board-actions-title">
                {dictionary.board.actionsTitle}
              </h2>
              <p className="support-copy">{dictionary.board.actionsDescription}</p>
            </div>
            <div className="button-row">
              <Link className="button-secondary" href={`/${locale}`}>
                {dictionary.board.backHome}
              </Link>
              {publicBoardMirrorUrl ? (
                <a
                  className="button-primary"
                  href={publicBoardMirrorUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {dictionary.board.openMirror}
                </a>
              ) : null}
            </div>
          </div>
        </section>

        <section className="community-entry-section" aria-labelledby="board-status-title">
          <h2 className="section-title" id="board-status-title">
            {dictionary.board.statusLegendTitle}
          </h2>
          <div className="section-grid">
            {statuses.map((status) => (
              <article className="detail-card community-action-card" key={status.label}>
                <div className={status.pillClassName}>{status.label}</div>
                <p className="support-copy community-action-copy">{status.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="community-entry-section" aria-labelledby="board-principles-title">
          <h2 className="section-title" id="board-principles-title">
            {dictionary.board.principlesTitle}
          </h2>
          <ul className="community-guidelines-list">
            {dictionary.board.principles.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="community-entry-section" aria-labelledby="board-next-title">
          <h2 className="section-title" id="board-next-title">
            {dictionary.board.nextTitle}
          </h2>
          <p className="support-copy compact-lede">{dictionary.board.nextDescription}</p>
          <div className="section-grid">
            <article className="detail-card community-action-card">
              <h3 className="section-title community-action-title">{dictionary.home.actions.safe.title}</h3>
              <p className="support-copy community-action-copy">{dictionary.board.safePrompt}</p>
              <Link className="button-secondary" href={`/${locale}`}>
                {dictionary.home.actions.safe.cta}
              </Link>
            </article>
            <article className="detail-card community-action-card">
              <h3 className="section-title community-action-title">{dictionary.home.actions.missing.title}</h3>
              <p className="support-copy community-action-copy">{dictionary.board.missingPrompt}</p>
              <Link className="button-secondary" href={`/${locale}`}>
                {dictionary.home.actions.missing.cta}
              </Link>
            </article>
            <article className="detail-card community-action-card">
              <h3 className="section-title community-action-title">{dictionary.home.actions.update.title}</h3>
              <p className="support-copy community-action-copy">{dictionary.board.updatePrompt}</p>
              <Link className="button-secondary" href={`/${locale}`}>
                {dictionary.home.actions.update.cta}
              </Link>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
