/**
 * Encore Commons runs on the Next.js App Router and is kept compatible with the
 * Vinext (Next.js-on-Vite) runtime used by Sites, because Vinext is a drop-in
 * replacement for the `next` CLI and needs no source changes.
 *
 * Server route handlers under app/api are the only place provider credentials
 * are read. Nothing in this config exposes them to the browser bundle.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Provider entity images are rendered from Qloo's image host only.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.qloo.com" },
      { protocol: "https", hostname: "**.qloo.com" },
    ],
  },
  // Server route handlers run in the Node.js runtime locally and in the
  // Cloudflare Workers runtime on Sites; nothing here binds to either.
  poweredByHeader: false,
};

export default nextConfig;
