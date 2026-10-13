import { defineConfig } from "vite";
import vinext from "vinext";

/**
 * Vinext (Next.js on Vite) configuration for the Sites runtime.
 *
 * `.mts` rather than `.ts` on purpose: the repository is not `"type": "module"`,
 * so a `.ts` config would be loaded as CommonJS and reject the ESM syntax. This
 * keeps `next.config.mjs` and the CommonJS-compatible scripts working while still
 * giving Vinext a valid ESM config.
 *
 * `vinext check` reports this project at 91% compatible with zero issues. The two
 * partial items are deliberate:
 *  - `images`: venue thumbnails are rendered as plain `<img>` from Qloo's image
 *    host, so no image optimizer is needed and images are served as-is.
 *  - `reactStrictMode`: the App Router is not wrapped by Vinext yet; Next.js
 *    enables strict mode for it by default, so behaviour is unchanged.
 */
export default defineConfig({
  plugins: [vinext()],
});
