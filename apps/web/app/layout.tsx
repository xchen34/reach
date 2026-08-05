import "./globals.css";
import type { Metadata } from "next";
import { GlobalHeader } from "@/components/global-header";

export const metadata: Metadata = {
  title: "REACH",
  description: "Every report can help save a life.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {/* The shell and header live here, above the route, so they persist
            across client-side navigation instead of remounting per page. */}
        <div className="app-shell">
          <GlobalHeader />
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
