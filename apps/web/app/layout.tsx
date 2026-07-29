import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "REACH",
  description: "每一次上报，都可能帮助挽救生命。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hans">
      <body>{children}</body>
    </html>
  );
}
