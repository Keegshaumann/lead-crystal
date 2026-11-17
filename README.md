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
| `src/scripts/home.ts` | Homepage motion: GSAP ScrollTrigger choreography, counters, heat simulator, hover videos, conveyor. |
| `src/scripts/crystal-scene.ts` | The Three.js particle scene in "How it works" (liquid → crystal → cell → recycling loop). Loaded only when that section is near. |
| `src/scripts/smooth.ts` | Lenis smooth wheel scrolling on every page (off for reduced motion). |
| `public/media/` | Web-ready video loops (MP4) and their poster frames (WebP). Made by `npm run media`. |
| `scripts/encode-media.sh` | Turns the Higgsfield clips in `assets-src/hf/` into seamless loops in `public/media/`. |
| `src/components/Industries.astro` | Homepage "Core industries served": seven tabs that auto-advance, each with its own video and spec card (after Anduril's Menace-X page). Copy from the company background supplied 17 Nov 2026. |
| `src/components/FitCheck.astro` + `src/scripts/fitcheck.ts` | Catalogue "Will it fit?": every battery drawn to scale (isometric, from its L × W × H) with a space checker. |
| `src/data/trox.json` + `src/components/StandardRange.astro` | Catalogue T-ROX standard range (AGM / GEL VRLA), each model matched to the same-case Leadcrystal battery. Factory dims only; RFQ columns and casing print sizes are deliberately left out. |

### Homepage motion and video (rebuilt 17 Nov 2026)

- Every scroll animation is scrubbed, so scrolling back rewinds it. All content is readable with
  JavaScript off; GSAP sets the starting states, CSS never hides content.
- `prefers-reduced-motion` turns off smooth scrolling, the particle scene (a still image shows
  instead) and every video (posters only).
- Videos only play while on screen. Application cards play their clip on hover (or when mostly
  on screen on phones, unless Save-Data is on).
- The footage is AI-generated with Higgsfield (Nano Banana Pro stills, Kling 3.0 clips); the hero
  shot was built from the real 6-CNFJ-100 product photo. Originals (~170 MB) are in
  `assets-src/hf/`, which is **not in git**; Higgsfield's generation history also keeps them.
  To re-encode: put the clips back in `assets-src/hf/` and run `npm run media`.
- The hero clip is locked-camera on purpose (only the smoke moves); Keegan didn't want the battery zooming.
- Facts on the homepage are the ones the old site and the product data already published
  (6,000+ cycles at 20% DoD, −40 to +65°C, 2.5 h charge, 99% recyclable, 0V recovery). The heat
  simulator's AGM and lithium ranges come from the "What is lead crystal battery technology?"
  article.

### Adding or changing a product

1. Edit `src/data/products.json` (copy an existing entry; `slug` becomes `/product/<slug>/`).
2. Photo: drop `<SKU>.png` into `assets-src/products/` and run `npm run images`.
3. Spec sheet: put the factory PDF in `assets-src/spec-sheets-factory/<SKU>.pdf` and rebuild the
   sheets (below). The site links `public/downloads/spec-sheets/<SKU>.pdf`.
4. `npm run build` and deploy.

### Technical data sheets (redesigned 17 Nov 2026)

The 54 downloadable sheets are typeset in the site's design from the factory numbers, not retyped.
The factory originals (4-page Betta Batteries sheets in the old site's style) stay in
`assets-src/spec-sheets-factory/` as the source.

```bash
python scripts/spec-sheets/extract.py            # factory page 2 -> src/data/spec-sheets.json (fails on anything it can't parse)
python scripts/spec-sheets/extract.py --curves   # factory page 3 -> recoloured SVG curves (scripts/spec-sheets/build/, not committed)
node scripts/spec-sheets/build.mjs [SKU ...]     # -> public/downloads/spec-sheets/*.pdf via headless Chrome (~35 s for all)
node scripts/spec-sheets/trox-range.mjs          # -> public/downloads/T-ROX-range-sheet.pdf
```

`extract.py` needs PyMuPDF (`pip install pymupdf`). Fonts in `scripts/spec-sheets/fonts/` are static
instances of Archivo: Chrome writes variable fonts into PDFs as Type 3, so never point the sheets
at the variable woff2. Check a build with `pdffonts <file> | grep "Type 3"` (should print nothing).
Names, photos and highlights come from `products.json`, T-ROX equivalents from `trox.json`.

### T-ROX

`/t-rox/` is the T-ROX page (copy from the T-ROX profile catalogue V0.1, Aug 2026; models from
`src/data/trox.json`). The logo was redrawn 17 Nov 2026 as a proposal: `python scripts/trox-logo.py`
writes the SVGs to `public/images/trox/` and PNG exports to `assets-src/t-rox-logo/`.

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
   changes**, update `ROOT` in the script and the path in the cron job.

**Live since 15 Nov 2026:** website `leadcrystal.co` on Hostinger (account u531579581, server
srv1340, 193.203.168.52), cron `*/5` → `domains/leadcrystal.co/leadcrystal-private/deploy.sh`.
`leadcrystal.tech` is a parked domain on the same website; `.htaccess` 301s it to leadcrystal.co.
DNS for both domains is **Porkbun's** (default nameservers), not Hostinger's: Hostinger's DNS API
won't take records for a domain that doesn't point at it yet, and Porkbun let us load and check the
zone before switching.

**Email is on Hostinger Email since 16 Nov 2026** (Starter Business, mailboxes info@, denzil@,
bidteam@, sales@, frank@): MX `mx1/mx2.hostinger.com`, autodiscover/autoconfig CNAMEs to
`*.mail.hostinger.com`, DKIM CNAMEs `hostingermail-a/b/c._domainkey`. The website's forms send to
info@ through `smtp.hostinger.com:465` (password only in `leadcrystal-private/config.php`).
Until the old server shuts on 25 Nov 2026, the zone deliberately keeps its leftovers so old mail
apps and webmail still work: `mail.`, `webmail.`, `cpanel.` A records to 216.194.167.167, `+ip4`
in SPF, `default._domainkey` and `_mailchannels`. Remove those after 25 Nov.

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
