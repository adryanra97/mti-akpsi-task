/**
 * Tata letak akar: font, metadata, dan skrip tema (dengan nonce CSP) sebelum halaman dirender.
 */
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ServerAgent", template: "%s · ServerAgent" },
  description: "Dashboard verdict performa release candidate sebelum promosi Dev ke Production.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f4f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1220" },
  ],
};

const themeScript = `(function(){try{var t=localStorage.getItem('sa-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}})()`;

/**
 * Elemen html dan body untuk seluruh aplikasi.
 *
 * Parameters
 * ----------
 * children : ReactNode
 *     Isi halaman.
 *
 * Returns
 * -------
 * Promise<JSX.Element>
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
