import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Beacon",
  description: "Community coordination workspace for safe check-ins, missing reports, and public status updates",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
