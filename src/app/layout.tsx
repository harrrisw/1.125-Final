import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Offhours",
  description:
    "A companion for free time that learns your moods and interests, and lets you join what others are up to.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
