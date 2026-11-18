#!/usr/bin/env python3
"""Import the 6 News articles from the sister site leadcrystaltechnologies.com into Insights.

Lead Crystal Technologies (a WordPress site) is the same company; its News posts are merged into
leadcrystal.co so the two read as one business. This script:

  1. reads the WordPress posts (a saved REST dump, or fetched live), keeps category 3 "News"
  2. strips the QuickCreator/ez-toc markup with clean_article() from import-wp.py, drops the
     "Image Source: pexels/unsplash" credits, title captions, the table of contents and the H1
  3. downloads each in-article image, resizes it to at most 1400px wide and saves it as WebP in
     public/images/insights/<slug>/
  4. writes the articles into src/data/insights.json, replacing entries with the same slug and
     leaving every other article untouched (sorted newest first, like import-wp.py)

Run from the repo root with a Python that has Pillow:
  python3 -I scripts/import-lct-news.py [posts.json] [--cache DIR] [--out FILE]
--cache keeps the downloaded originals (default: a temp folder), --out writes somewhere other
than src/data/insights.json for a dry run. Safe to re-run: images already converted are skipped.
"""
import html
import importlib.util
import io
import json
import os
import re
import sys
import tempfile
import urllib.parse

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = "https://leadcrystaltechnologies.com"
NEWS_CATEGORY = 3
MAX_W = 1400

# Reuse the fetch helper, tag whitelist and text() from the original leadcrystal.co import
_spec = importlib.util.spec_from_file_location("import_wp", os.path.join(ROOT, "scripts/import-wp.py"))
wp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(wp)

# Hand-written fields per article, keyed by the WordPress slug. Slugs are kept (none clash with a
# leadcrystal.co route), so leadcrystaltechnologies.com/<slug>/ maps 1:1 onto leadcrystal.co/<slug>/.
#   image_names: (file name, alt text) for each <img> in source order; the first is the header image
#   fixes:       exact (old, new) replacements on the cleaned HTML: typos, unit exponents, em dashes
SOLAR_ROWS = ("solar-panel-rows", "Rows of ground-mounted solar panels under a cloudy sky")
SOLAR_BESS = ("solar-farm-battery-storage", "Battery storage containers beside a solar farm")
SWAP_PACK = ("swappable-battery-pack", "Person lifting a swappable battery pack out of its compartment")
NINE_VOLT = ("9v-battery", "9V battery standing on a white surface")
META = {
    "top-10-novel-battery-systems-2025": {
        "seoTitle": "Top 10 Novel Battery Systems for Energy Storage",
        "seoDescription": "Ten battery chemistries in development, from lithium-sulfur, solid-state and sodium-ion to flow, zinc-air and organic batteries, and where each is used.",
        "excerpt": "A look at ten battery technologies in energy storage: lithium-sulfur, solid-state, sodium-ion, flow, silicon-anode, LTO, graphene, NanoBolt, zinc-air and organic batteries, with their strengths and main uses.",
        "image_names": [
            SWAP_PACK,
            ("portable-power-unit", "Portable battery power unit on a white background"),
            SOLAR_ROWS,
        ],
        "fixes": [
            ("rapidly—often within minutes—making", "rapidly, often within minutes, making"),
        ],
    },
    "glass-battery-technology-how-it-works": {
        "title": "What Is Glass Battery Technology and How It Works",
        "seoTitle": "Glass Battery Technology Explained: How It Works",
        "seoDescription": "How glass batteries work: a solid glass electrolyte with lithium or sodium metal electrodes. Covers materials, safety, energy density, uses and current hurdles.",
        "excerpt": "Glass batteries pair a solid glass electrolyte with lithium or sodium metal electrodes. This guide covers how they work, the materials involved, their advantages and where the technology stands today.",
        "image_names": [
            ("laptop-lithium-ion-battery", "Lithium-ion battery inside an opened laptop"),
            ("electric-car-charging", "White electric car plugged in at a charging station"),
            NINE_VOLT,
        ],
        "fixes": [
            ("<strong>Higher energy density</strong>—", "<strong>Higher energy density</strong>: "),
            ("<strong>Faster charging</strong>—", "<strong>Faster charging</strong>: "),
            ("<strong>Unparalleled longevity</strong>—", "<strong>Unparalleled longevity</strong>: "),
            ("dendrites—tiny", "dendrites: tiny"),
            ("kJ mol−1", "kJ mol⁻¹"),
            ("<h2>What is Glass Battery Technology?</h2>", "<h2>What Is Glass Battery Technology?</h2>"),
        ],
    },
    "lithium-free-batteries-2025-advancements": {
        "seoTitle": "Lithium-Free Batteries: 2025 Advances and Challenges",
        "seoDescription": "Sodium-ion, magnesium-ion, aluminum-ion and solid-state batteries: why lithium-free chemistries matter, what they offer and what is slowing their adoption.",
        "excerpt": "Why researchers are looking beyond lithium, how sodium-ion, magnesium-ion, aluminum-ion and solid-state batteries compare on safety, cost and sustainability, and the barriers to wider adoption.",
        "image_names": [
            ("solar-panels-wind-turbine-snow", "Solar panels in the snow with a wind turbine behind them"),
            SOLAR_BESS,
            SOLAR_ROWS,
            ("production-challenges-chart", "Bar chart of battery manufacturing challenges: 76% need new or upgraded production lines, 98% make lithium-ion cells while exploring alternatives, 59% cite gigafactory build time, 53% supply chain problems and 60% skills shortages"),
        ],
        "fixes": [
            ("Wh L−1", "Wh L⁻¹"),
            ("mAh cm−2", "mAh cm⁻²"),
        ],
    },
    "agm-vs-lead-glass-batteries-2025": {
        "title": "AGM Batteries vs Lead-Acid Batteries: Which Is Better in 2025?",
        "seoTitle": "AGM vs Lead-Acid Batteries: Which Is Better?",
        "seoDescription": "AGM and flooded lead-acid batteries compared on lifespan, charging, depth of discharge, maintenance, cost and recycling, with a recommendation for each use.",
        "excerpt": "A side-by-side comparison of AGM and conventional flooded lead-acid batteries: how each works, lifespan, charging, maintenance, cost and environmental impact, and which suits each application.",
        "image_names": [
            ("car-engine-bay", "Open engine bay of a car"),
            ("aa-battery-terminals", "Two AA batteries seen from the positive terminal"),
            ("car-battery-engine-bay", "Red-topped car battery beside the fuse box in an engine bay"),
        ],
    },
    "advantages-disadvantages-lead-crystal-battery": {
        "title": "What Are the Advantages and Disadvantages of Lead Crystal Battery Technology?",
        "seoTitle": "Lead Crystal Batteries: Advantages and Disadvantages",
        "seoDescription": "The pros and cons of lead crystal batteries: charging speed, lifespan, temperature range and maintenance, against cost, weight, availability and recycling.",
        "excerpt": "A balanced look at lead crystal battery technology: faster charging, long life, low maintenance and cold-weather performance, set against higher upfront cost, weight, availability and recycling questions.",
        "image_names": [
            ("rechargeable-aa-batteries", "Three green rechargeable AA batteries standing upright"),
            SOLAR_BESS,
            SWAP_PACK,
        ],
        "fixes": [
            # The numbered feature list is split by a tip box; keep its numbering going
            ("</blockquote>\n<ol>\n<li><strong>Low Self-Discharge Rate", "</blockquote>\n<ol start=\"5\">\n<li><strong>Low Self-Discharge Rate"),
        ],
    },
    "what-makes-lead-crystal-batteries-unique": {
        "seoTitle": "What Makes Lead Crystal Batteries Unique",
        "seoDescription": "How lead crystal batteries work: SiO2-based electrolyte, temperature range, lifespan and maintenance-free design, compared with lead-acid, AGM and lithium-ion.",
        "excerpt": "Lead crystal batteries use a SiO2-based electrolyte instead of the liquid acid in conventional lead-acid batteries. This article explains how they work, their safety, temperature range and lifespan, and where they are used.",
        "image_names": [
            ("rechargeable-aa-battery", "Green rechargeable AA battery lying on a yellow surface"),
            ("used-batteries-close-up", "Close-up of the terminals of many used AA batteries"),
            NINE_VOLT,
        ],
        "fixes": [
            ("Batteries—up to 15 years—further", "Batteries, up to 15 years, further"),
            ("919 mAhg−1", "919 mAh g⁻¹"),
        ],
    },
}

# Citation links whose target is gone (404/410, a redirect to an unrelated page, a refused
# connection or an invalid certificate): the link is removed and its text kept. Checked 19 Nov 2026.
DEAD_LINKS = {
    "https://blog.feniceenergy.com/the-future-of-lto-batteries-in-high-cycle-applications/",
    "https://pmarketresearch.com/product/worldwide-solid-state-inverter-market-research-2024-by-type-application-participants-and-countries-forecast-to-2030/worldwide-lead-crystal-battery-market-research-2024-by-type-application-participants-and-countries-forecast-to-2030",
    "https://www.transparencymarketresearch.com/zinc-air-batteries-market.html",
    "https://www.datainsightsmarket.com/reports/absorbent-glass-mat-sealed-battery-100978",
    "https://idstch.com/technology/energy/improved-lead-acid-batteries-including-lead-crystal-and-carbon-foam-batteries-making-comeback/",
    "https://www.onecharge.biz/blog/sodium-ion-vs-lithium-ion-batteries/",
    "https://nichiconbattery.com/long-life-batteries/",
}

# Citation links that now redirect: point straight at the current address
MOVED = {
    "https://pmarketresearch.com/chemi/cationic-polymer-flocculant-market/high-performance-lead-crystal-battery-market": "https://pmarketresearch.com/chemi/high-performance-lead-crystal-battery-market/",
    "https://www.ufinebattery.com/blog/do-agm-batteries-last-long/": "https://www.ufinebattery.com/blog/do-agm-batteries-last-longer/",
    "https://www.hankook-atlasbx.com/en/technology/automotive/agm-technology.do": "https://www.hankook-battery.com/en/technology/automotive-agm.do",
    "https://www.capgemini.com/news/press-releases/a-dual-challenge-for-the-battery-industry-ramping-up-production-while-innovating-game-changing-chemistries-for-the-future": "https://www.capgemini.com/news/press-releases/a-dual-challenge-for-the-battery-industry-ramping-up-production-while-innovating-game-changing-chemistries-for-the-future/",
    "https://energsustainsoc.biomedcentral.com/articles/10.1186/s13705-024-00503-x": "https://link.springer.com/article/10.1186/s13705-024-00503-x",
}

# Query parameters that only track the click (Google's srsltid, UTM tags)
TRACKING = re.compile(r"^(srsltid|utm_[a-z]+|gclid|fbclid)$")


def clean_url(u):
    p = urllib.parse.urlsplit(html.unescape(u))
    q = [(k, v) for k, v in urllib.parse.parse_qsl(p.query, keep_blank_values=True) if not TRACKING.match(k)]
    return urllib.parse.urlunsplit((p.scheme, p.netloc, p.path, urllib.parse.urlencode(q), p.fragment))


def original_image(url):
    # WordPress serves resized copies like 1-1024x576.jpg; the original (1200px) has no suffix
    return re.sub(r"-\d+x\d+(\.\w+)$", r"\1", url)


def preclean(h):
    """Strip the QuickCreator/ez-toc wrappers that clean_article() would leave text behind for."""
    images = []

    def img(m):
        tag = m.group(0)
        src = re.search(r'src="([^"]+)"', tag).group(1)
        images.append(original_image(src))
        return f"<!--IMG:{len(images) - 1}-->"

    h = re.sub(r"<img\b[^>]*>", img, h)
    # Table of contents, then the H1 (the page template prints the title)
    h = re.sub(r'<div id="ez-toc-container".*?</nav>\s*</div>', "", h, flags=re.S)
    h = re.sub(r"<h1[^>]*>.*?</h1>", "", h, flags=re.S)
    # Captions: "Image Source: pexels/unsplash" credits and captions that repeat the title
    h = re.sub(r"<figcaption[^>]*>.*?</figcaption>", "", h, flags=re.S)
    h = re.sub(r"<colgroup>.*?</colgroup>", "", h, flags=re.S)
    h = re.sub(r'\s(colspan|rowspan)="1"', "", h)
    # A divider followed by a paragraph sets off the closing summary (it has no heading): keep it
    # as a rule. Dividers between FAQ entries and before sub-headings are dropped.
    h = re.sub(r'<div class="qc-divider-wrapper">\s*<div class="qc-divider"></div>\s*</div>\s*(?=<p>)', "<hr>\n", h)
    h = h.replace("\xa0", " ").replace("&nbsp;", " ")
    return h, images


def postclean(h, slug, images):
    meta = META.get(slug, {})
    # The editor puts the first row of every table in <tbody> as <th> cells: make it a <thead>
    h = re.sub(r"<table>\s*<tbody>\s*(<tr>\s*(?:<th[^>]*>.*?</th>\s*)+</tr>)\s*",
               lambda m: "<table>\n<thead>\n" + m.group(1) + "\n</thead>\n<tbody>\n", h, flags=re.S)

    def link(m):
        href, inner = m.group(1), m.group(2)
        if not href.startswith("http"):
            return m.group(0)
        url = clean_url(href)
        url = MOVED.get(url, url)
        if url in DEAD_LINKS:
            return inner
        return f'<a href="{html.escape(url, quote=True)}" rel="nofollow noopener" target="_blank">{inner}</a>'

    h = re.sub(r'<a href="([^"]*)"[^>]*>(.*?)</a>', link, h, flags=re.S)

    files = meta.get("images", [])
    for i, src in enumerate(images):
        f = files[i] if i < len(files) else None
        if f is None:
            h = h.replace(f"<!--IMG:{i}-->", "")
            continue
        path, w, hgt = f["path"], f["w"], f["h"]
        lazy = ' loading="lazy"' if i else ""
        tag = f'<img src="{path}" alt="{html.escape(f["alt"], quote=True)}" width="{w}" height="{hgt}"{lazy} decoding="async">'
        h = h.replace(f"<!--IMG:{i}-->", "\n" + tag + "\n")

    for old, new in meta.get("fixes", []):
        if old not in h:
            raise SystemExit(f"{slug}: fix not found: {old!r}")
        h = h.replace(old, new)

    h = re.sub(r"<p>\s*</p>", "", h)
    h = re.sub(r"(?<=\S) {2,}", " ", h)
    h = re.sub(r"[ \t]+\n", "\n", h)
    h = re.sub(r"\n{3,}", "\n\n", h)
    return h.strip()


def fetch_image(url, cache):
    name = re.sub(r"[^\w.-]", "_", urllib.parse.urlsplit(url).netloc + urllib.parse.urlsplit(url).path)
    p = os.path.join(cache, name)
    if not (os.path.exists(p) and os.path.getsize(p) > 0):
        data = wp.get(url, binary=True)
        with open(p, "wb") as f:
            f.write(data)
    return p


def save_webp(src_file, dest):
    with Image.open(src_file) as im:
        im = im.convert("RGB")
        if im.width > MAX_W:
            im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
        if not os.path.exists(dest):
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            im.save(dest, "WEBP", quality=80, method=6)
        return im.width, im.height


def main():
    args = sys.argv[1:]
    opts = {"--cache": os.path.join(tempfile.gettempdir(), "lct-news-images"), "--out": "src/data/insights.json"}
    for k in opts:
        if k in args:
            i = args.index(k)
            opts[k] = os.path.abspath(args[i + 1])
            del args[i:i + 2]
    cache, out = opts["--cache"], opts["--out"]
    os.makedirs(cache, exist_ok=True)
    if args:
        with open(args[0]) as f:
            posts = json.load(f)
    else:
        posts = json.loads(wp.get(f"{SRC}/wp-json/wp/v2/posts?categories={NEWS_CATEGORY}&per_page=100"))
    posts = [p for p in posts if NEWS_CATEGORY in p["categories"]]

    os.chdir(ROOT)
    new = []
    for p in posts:
        old_slug = p["slug"]
        meta = META.get(old_slug, {})
        slug = meta.get("slug", old_slug)
        body, images = preclean(p["content"]["rendered"])
        body = wp.clean_article(body)

        files = []
        for n, url in enumerate(images):
            spec = (meta.get("image_names") or [])
            if n >= len(spec) or spec[n] is None:
                files.append(None)
                continue
            name, alt = spec[n]
            dest = f"public/images/insights/{slug}/{name}.webp"
            w, h = save_webp(fetch_image(url, cache), dest)
            files.append({"path": "/" + dest.removeprefix("public/"), "w": w, "h": h, "alt": alt})
        META.setdefault(old_slug, {})["images"] = files
        body = postclean(body, old_slug, images)

        words = len(wp.text(body).split())
        new.append({
            "slug": slug,
            "title": meta.get("title", html.unescape(p["title"]["rendered"])),
            "date": p["date"][:10],
            "modified": p["modified"][:10],
            "categories": meta.get("categories", ["Battery Technology"]),
            "excerpt": meta.get("excerpt", ""),
            "seoTitle": meta.get("seoTitle", ""),
            "seoDescription": meta.get("seoDescription", ""),
            "readingMinutes": max(2, round(words / 220)),
            "html": body,
        })
        print(f"  {slug}: {words} words, {sum(1 for f in files if f)} images")

    with open("src/data/insights.json") as f:
        articles = json.load(f)
    slugs = {a["slug"] for a in new}
    articles = [a for a in articles if a["slug"] not in slugs] + new
    articles.sort(key=lambda a: a["date"], reverse=True)
    with open(out, "w") as f:
        json.dump(articles, f, indent=1, ensure_ascii=False)
    print(f"  {len(new)} imported, {len(articles)} articles in {out}")


if __name__ == "__main__":
    main()
