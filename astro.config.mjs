// @ts-check
import { defineConfig } from "astro/config";

// Static build. Every page is plain HTML in dist/; the only server code is the
// small PHP form handler in server/api, copied into dist/api by scripts/postbuild.mjs.
export default defineConfig({
  site: "https://leadcrystal.co",
  trailingSlash: "always",
  build: { format: "directory" },
  compressHTML: true,
  devToolbar: { enabled: false },
});
