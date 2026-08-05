import { ContactsPage } from "@/components/contacts-page";
import { getDictionary, type Locale } from "@/lib/i18n";

export default function LocaleContactsPage({
  params,
}: {
  params: { locale: Locale };
}) {
  const dictionary = getDictionary(params.locale);

  return <ContactsPage dictionary={dictionary} locale={params.locale} />;
}
