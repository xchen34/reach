"use client";

import type { Dictionary, Locale } from "@/lib/i18n";
import { AppShell } from "@/components/app-shell";

type ContactsPageProps = {
  dictionary: Dictionary;
  locale: Locale;
};

type ServiceKind = "medical" | "police" | "fire" | "universal" | "text-relay";

const emergencyNumbers: Array<{
  label: string;
  number: string;
  desc: string;
  service: ServiceKind;
}> = [
  {
    label: "Medical Emergency (SAMU)",
    number: "15",
    desc: "For life-threatening medical situations, ambulance dispatch",
    service: "medical",
  },
  {
    label: "Police Secours",
    number: "17",
    desc: "For security emergencies, accidents, violence, theft",
    service: "police",
  },
  {
    label: "Fire & Rescue (Sapeurs-Pompiers)",
    number: "18",
    desc: "For fires, gas leaks, traffic accidents, domestic rescue",
    service: "fire",
  },
  {
    label: "European Emergency Number",
    number: "112",
    desc: "Universal emergencies (works from any mobile, even without SIM)",
    service: "universal",
  },
  {
    label: "Text/SMS Emergency Number",
    number: "114",
    desc: "For deaf, hard-of-hearing or when speaking is unsafe (SMS/Chat)",
    service: "text-relay",
  },
];

function WhatsAppGlyph() {
  return (
    <svg className="button-whatsapp-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.39c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.9-4.44 9.9-9.9S17.5 2 12.04 2zm0 18.02c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.05-.19-.31a8.14 8.14 0 01-1.25-4.35c0-4.54 3.7-8.23 8.23-8.23 4.54 0 8.23 3.69 8.23 8.23 0 4.54-3.69 8.22-8.23 8.22zm4.52-6.16c-.25-.12-1.47-.72-1.7-.8-.23-.09-.4-.13-.56.12-.17.25-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.39.11-.51.11-.11.25-.29.37-.44.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.42.06-.64.31-.22.25-.85.83-.85 2.02 0 1.2.87 2.35.99 2.51.12.17 1.71 2.61 4.14 3.66.58.25 1.03.4 1.38.51.58.19 1.11.16 1.53.1.46-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.17-.48-.29z" />
    </svg>
  );
}

export function ContactsPage({ dictionary, locale }: ContactsPageProps) {
  return (
    <AppShell
      contentVariant="wide"
      locale={locale}
      publicBoardLabel={dictionary.home.boardCta}
      sectionLabel="Emergency Services & Coordination"
    >
      <div className="contacts-page">
        <div>
          <h1 className="headline headline-compact">Emergency contacts &amp; support groups</h1>
          <p className="lede">
            Quick dispatch services in France and active community support groups.
          </p>
        </div>

        <div className="safety-notice" role="alert">
          <span className="safety-notice-title">Safety notice</span>
          <p>{dictionary.home.emergencyNotice}</p>
        </div>

        <section aria-labelledby="france-emergency-title">
          <h2 className="section-title contacts-section-title" id="france-emergency-title">
            Official France emergency services (24/7)
          </h2>
          <div className="emergency-number-grid">
            {emergencyNumbers.map((item) => (
              <article
                className="detail-card emergency-number-card"
                data-service={item.service}
                key={item.number}
              >
                <div>
                  <div className="emergency-number-head">
                    <span className="emergency-number-label">{item.label}</span>
                    <span className="emergency-number-digits">{item.number}</span>
                  </div>
                  <p className="emergency-number-desc">{item.desc}</p>
                </div>
                <a className="emergency-call-button" href={`tel:${item.number}`}>
                  Call {item.number}
                </a>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="coordination-groups-title">
          <h2 className="section-title contacts-section-title" id="coordination-groups-title">
            Active support &amp; volunteer coordination groups
          </h2>
          <div className="contacts-group-list">
            {dictionary.home.coordinationGroups.map((group) => (
              <article
                className="detail-card contacts-group-card service-card-whatsapp"
                key={group.key}
              >
                <div className="contacts-group-copy">
                  <h3 className="contacts-group-title">{group.title}</h3>
                  <p className="contacts-group-desc">{group.desc}</p>
                </div>
                <a
                  className="button-whatsapp"
                  href={group.href}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <WhatsAppGlyph />
                  {group.cta}
                </a>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
