import "./globals.css";
import type { Metadata } from "next";

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
      <body>{children}</body>
    </html>
  );
}
