import { ContactsPage } from "@/components/contacts-page";
import { getDictionary } from "@/lib/i18n";

export default function ContactsRootPage() {
  const locale = "en";
  const dictionary = getDictionary(locale);

  return <ContactsPage dictionary={dictionary} locale={locale} />;
}
