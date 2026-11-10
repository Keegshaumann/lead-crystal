import type { APIRoute } from "astro";
import { SITE } from "../site";

export const GET: APIRoute = () => {
  const body = SITE.noindex
    ? "User-agent: *\nDisallow: /\n"
    : `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE.url}/sitemap.xml\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain" } });
};
