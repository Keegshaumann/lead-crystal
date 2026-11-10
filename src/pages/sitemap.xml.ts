import type { APIRoute } from "astro";
import { products, articles, VOLTAGES } from "../lib/catalogue";
import { SITE } from "../site";

export const GET: APIRoute = () => {
  const today = new Date().toISOString().slice(0, 10);
  const urls: [string, string][] = [
    ["/", today],
    ["/catalogue/", today],
    ["/insights/", today],
    ["/contact/", today],
    ...VOLTAGES.map((v) => [`/product-category/${v}v/`, today] as [string, string]),
    ...products.map((p) => [`/product/${p.slug}/`, today] as [string, string]),
    ...articles.map((a) => [`/${a.slug}/`, a.modified] as [string, string]),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, d]) => `  <url><loc>${SITE.url}${u}</loc><lastmod>${d}</lastmod></url>`).join("\n")}
</urlset>
`;
  return new Response(body, { headers: { "Content-Type": "application/xml" } });
};
