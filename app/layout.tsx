import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Encore Commons — Different tastes. One great night.",
  description:
    "A Qloo-powered agent that helps friends with different cultural tastes agree on a pre- or post-show venue, explains each person's fit and replans when someone vetoes a choice.",
  applicationName: "Encore Commons",
  icons: { icon: "/icon.png", apple: "/icon.png" },
  openGraph: {
    title: "Encore Commons",
    description: "Different tastes. One great night.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#241634",
  width: "device-width",
  initialScale: 1,
};

/**
 * Root layout.
 *
 * Accessibility: a skip link, a single <main> landmark, a labelled nav and a
 * logical heading order. There is no footer and no attribution strip anywhere:
 * licensing lives in LICENSE and the body of the README instead.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <header className="site-header">
          <Link className="brand" href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="brand-mark"
              src="/icon.png"
              alt="Encore Commons app icon: three interlocking ribbons converging into a sparkle"
              width={40}
              height={40}
            />
            <span className="brand-text">
              <strong>Encore Commons</strong>
              <span>Different tastes. One great night.</span>
            </span>
          </Link>
          <nav className="site-nav" aria-label="Main">
            <Link href="/">Plan a night</Link>
            <Link href="/shortlist">Shortlist</Link>
            <Link href="/trace">Agent trace</Link>
          </nav>
        </header>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
