import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n";

type AppShellProps = {
  children: ReactNode;
  contentVariant?: "normal" | "wide";
  /**
   * The shell used to render the site header too, which meant every page
   * mounted its own copy and the whole bar repainted on each navigation. The
   * header now lives in app/layout.tsx and persists across routes, so this
   * component is only the page content frame.
   *
   * The header-related props below are accepted so the existing call sites keep
   * compiling; the header derives all of this itself.
   */
  locale?: Locale;
  sectionLabel?: string;
  publicBoardLabel?: string;
  showPublicBoard?: boolean;
  logoutAction?: ReactNode;
  staffDashboardLabel?: string;
  returnToStaffLabel?: string;
  staffLoginLabel?: string;
  logoutLabel?: string;
  logoutSubmittingLabel?: string;
};

export function AppShell({ children, contentVariant = "normal" }: AppShellProps) {
  return <div className={`app-content app-content-${contentVariant}`}>{children}</div>;
}
