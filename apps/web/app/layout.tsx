import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Beacon",
  description: "Accessibility-first crisis reporting foundation",
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

