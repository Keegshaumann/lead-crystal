# leadcrystal.co

Custom rebuild of the Leadcrystal website (Bin Othaimeen Group). Replaces the old WordPress +
Elementor + UiCore/Outgrid + WooCommerce site that ran on Effentii's InMotion server, which has
to be vacated by **25 November 2026**.

- **Static site** built with [Astro](https://astro.build) 7. Every page is plain HTML in `dist/`.
- **One small PHP handler** (`server/api/`) for the contact form, newsletter sign-up and the gated
  TCO whitepaper download. No database, no plugins, no third-party libraries.
- Runs on any Apache + PHP 8.1+ host (Hostinger shared hosting, cPanel) or nginx + PHP-FPM.

## Commands

```bash
npm install          # once
npm run dev          # live-reload preview at http://localhost:4321 (forms don't work here)
npm run build        # builds dist/ (pages + api + .htaccess)
php -S 127.0.0.1:8787 -t dist scripts/php-router.php   # preview the built site WITH working forms
```

## What's where

| Path | What |
| --- | --- |
| `src/data/products.json` | The 54 batteries: specs, attributes, SEO title/description, old URLs. Edit here to change a product. |
| `src/data/insights.json` | The 6 articles (HTML body + SEO fields). |
| `src/site.ts` | Site name, contact email/phone (blank = hidden), GA4 ID, headline figures. |
| `src/lib/catalogue.ts` | Product families, applications (from tags), helpers. |
| `src/pages/` | Home, catalogue, `product/[slug]`, `product-category/[cat]`, insights, articles at `/[slug]/`, contact, 404, sitemap, robots. |
| `src/components/` | Header, footer, catalogue filter, range map, product card, whitepaper dialog. |
| `public/images/` | WebP product photos and site imagery (generated, see below). |
| `public/downloads/` | Spec sheets (one PDF per model) and the company profile. |
| `assets-src/` | Originals from the WordPress media library (kept because the old server is going away). `private/` (not in git) holds the gated whitepaper. |
| `server/api/` | `contact.php`, `whitepaper.php`, `lib.php`, `config.example.php`. |
| `scripts/import-wp.py` | One-time import from the old site (already run 10 Nov 2026). |
| `scripts/optimise-images.sh` | Converts `assets-src` images to WebP in `public/images`. |
| `scripts/postbuild.mjs` | Copies the API into `dist/`, places the whitepaper, writes `.htaccess`. |

### Adding or changing a product

1. Edit `src/data/products.json` (copy an existing entry; `slug` becomes `/product/<slug>/`).
2. Photo: drop `<SKU>.png` into `assets-src/products/` and run `npm run images`.
3. Spec sheet: save as `public/downloads/spec-sheets/<SKU>.pdf`.
4. `npm run build` and deploy.

## Deploying (Hostinger, builds from GitHub)

Hostinger builds the site itself from `main` of `Keegshaumann/lead-crystal`, the same way
In The Light Roofing is set up. **Every push to `main` goes live.**

Settings in hPanel (Websites → leadcrystal.co → GitHub / Node.js deployment):

| Setting | Value |
| --- | --- |
| Repository / branch | `Keegshaumann/lead-crystal`, `main` |
| Node.js version | 24 (Astro 7 needs 22.23 or newer) |
| Install command | `npm ci` (or Hostinger's default `npm install`) |
| Build command | `npm run build` |
| Output directory | `dist` |

The build output includes `.htaccess` (redirects, HTTPS, headers) and `api/*.php`, so the
LiteSpeed/Apache side needs no other configuration. On any hostname other than
leadcrystal.co (e.g. the temporary `*.hostingersite.com` domain) every response carries
`X-Robots-Tag: noindex`, so the preview can't compete with the real domain in Google.

### One-time server setup (outside the repo, survives every deploy)

The repo is **public**, so secrets and the gated whitepaper live on the server only. In File
Manager, one level **above** `public_html` (i.e. `domains/leadcrystal.co/`), create:

```
leadcrystal-private/
├── config.php      ← copy of server/api/config.example.php, filled in (recipients + SMTP mailbox)
└── whitepaper.pdf  ← Leadcrystal_TCO_White_Paper_v3.1_June2026.pdf (kept locally in assets-src/private/)
```

Submissions are logged to `leadcrystal-private/data/submissions.jsonl` even if email fails.
Then test the contact form, the newsletter box and the whitepaper form once each.

**Manual upload instead:** `npm run build` and upload the contents of `dist/` (including the
dotfiles) to `public_html/`. **nginx:** `.htaccess` is ignored; port the rules from
`dist/.htaccess` and deny `/api/private/` and `/api/lib.php`.

## Old URLs (SEO)

Kept exactly: `/`, `/catalogue/`, `/contact/`, `/insights/`, all 54 `/product/<slug>/`,
`/product-category/{2v,6v,8v,12v}/` and the 6 articles at `/<slug>/`.

Redirected (301) by `.htaccess`: shop/cart/checkout/my-account, product tags, brand,
`/product-category/battery/` and `/products/` to `/catalogue/`; blog categories, authors and feeds
to `/insights/`; every old spec sheet PDF and product photo under `/wp-content/uploads/` to its new
file. `wp-admin`, `wp-login.php`, `xmlrpc.php`, `wp-json` and other `wp-content` paths return 410.

## Not carried over (decide with the client)

- **reCAPTCHA** keys belong to the Google account Troy handed over; replaced by a honeypot,
  fill-time check and per-IP rate limit. Add Cloudflare Turnstile if spam gets through.
- **Mailchimp**: the newsletter box now emails the team and logs the address. No list sync.
- **Google Analytics**: the property sits in the handed-over Google account. Put the GA4
  measurement ID in `src/site.ts` once access is confirmed.
- **Arabic version**: the old site was English only, and so is this one.
