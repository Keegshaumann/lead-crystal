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

## Deploying (Hostinger, plain Git deploy)

Hostinger never runs Node here. On every push to `main`, the GitHub Action in
`.github/workflows/deploy.yml` builds the site and commits the finished files to the **`deploy`**
branch. Hostinger's per-website Git feature pulls that branch into `public_html`.

This route deliberately does **not** use hPanel's "Connect with GitHub". That connection allows one
GitHub account per hPanel login, and Ronnie's account is the one connected, so switching it would
stop his sites auto-deploying.

hPanel setup (once):

1. Add the website as a **plain PHP/HTML website** (not "Node.js web app"). PHP 8.2 or newer.
2. Empty `public_html` (Hostinger's first Git pull needs an empty folder).
3. Websites → leadcrystal.co → Advanced → **Git**. Use the repository URL option, not "Connect with
   GitHub":
   - Repository: `https://github.com/Keegshaumann/lead-crystal.git`
   - Branch: **`deploy`**
   - Directory: leave blank (= `public_html`)
4. Auto-deploy: an hPanel cron job runs every 5 minutes and pulls the `deploy` branch into
   `public_html`:

   ```
   */5 * * * *  /bin/sh /home/u531579581/domains/<site>/leadcrystal-private/deploy.sh
   ```

   The script is `server/hostinger-deploy.sh` in this repo (a copy lives in `leadcrystal-private/`).
   It logs every deploy and any error to `leadcrystal-private/deploy.log`. **If the website's folder
   changes** (e.g. when leadcrystal.co replaces the temporary domain), update `ROOT` in the script
   and the path in the cron job.

After that, every push to `main` is live within about 5 minutes. `https://<site>/version.txt`
shows the commit that's live. If a change doesn't show up, check the run under the repo's
**Actions** tab, then the cron job's output in hPanel.

`.htaccess` (redirects, HTTPS, headers) and `api/*.php` are part of the build, so nothing else needs
configuring. On any hostname other than leadcrystal.co (e.g. the temporary `*.hostingersite.com`
domain) every response carries `X-Robots-Tag: noindex`.

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
