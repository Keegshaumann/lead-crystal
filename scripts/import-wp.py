#!/usr/bin/env python3
"""One-time import of the old WordPress site (leadcrystal.co) into this repo.

Pulls products, articles and their SEO titles/descriptions from the public
WordPress/WooCommerce REST APIs, downloads product photos, spec sheets and
the two marketing PDFs, and writes:

  src/data/products.json   54 batteries with specs, attributes and old URLs
  src/data/insights.json   the 6 articles (cleaned HTML)
  assets-src/              original images (converted to WebP by optimise-images.sh)
  public/downloads/        spec sheets, company profile, TCO whitepaper

Run from the repo root:  python3 -I scripts/import-wp.py
Safe to re-run: files already downloaded are skipped.
"""
import html
import json
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://leadcrystal.co"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36"


def get(url, binary=False, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            return data if binary else data.decode("utf-8")
        except Exception as e:  # the old server resets connections under load
            if i == tries - 1:
                raise
            print(f"  retry {i + 1} {url}: {e}", file=sys.stderr)
            time.sleep(2 + i * 3)


def get_json(path):
    return json.loads(get(BASE + path))


def download(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    data = get(url, binary=True)
    with open(dest, "wb") as f:
        f.write(data)
    time.sleep(0.4)


def text(s):
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def model_family(sku, name):
    if "HCNFJ" in sku:
        return "High-Cycle"
    if "EVFJ" in sku:
        return "EV"
    if "CNFT" in sku:
        return "Front Terminal"
    return "Standard"


def parse_product(p, yoast):
    d = p["description"]
    heading = re.search(r"<h2>(.*?)</h2>", d, re.S)
    intro = re.search(r"</h2>\s*<p>(.*?)</p>", d, re.S)
    attrs_block = re.search(r"Product Attributes</h3>\s*<ul>(.*?)</ul>", d, re.S)
    attrs = [text(a) for a in re.findall(r"<li>(.*?)</li>", attrs_block.group(1), re.S)] if attrs_block else []
    specs = []
    for k, v in re.findall(r"<tr>\s*<td>(.*?)</td>\s*<td>(.*?)</td>\s*</tr>", d, re.S):
        specs.append({"label": text(k), "value": text(v)})
    pdf = re.search(r'href="([^"]+\.pdf)"', d)
    spec_map = {s["label"]: s["value"] for s in specs}
    voltage = int(re.sub(r"\D", "", spec_map.get("Voltage", "0")) or 0)
    capacity = float(re.sub(r"[^\d.]", "", spec_map.get("Capacity", "0")) or 0)
    weight = spec_map.get("Weight", "")
    sku = p["sku"]
    image = p["images"][0]["src"] if p["images"] else None
    y = yoast.get(p["slug"]) or {}
    return {
        "id": p["id"],
        "sku": sku,
        "slug": p["slug"],
        "name": html.unescape(p["name"]),
        "family": model_family(sku, p["name"]),
        "voltage": voltage,
        "capacityAh": capacity,
        "weight": weight,
        "summary": text(p["short_description"]),
        "heading": text(heading.group(1)) if heading else html.unescape(p["name"]),
        "intro": text(intro.group(1)) if intro else "",
        "attributes": attrs,
        "specs": specs,
        "tags": [t["name"] for t in p["tags"]],
        "oldImage": image,
        "image": f"/images/products/{sku}.webp" if image else None,
        "oldSpecSheet": pdf.group(1) if pdf else None,
        "specSheet": f"/downloads/spec-sheets/{sku}.pdf" if pdf else None,
        "seoTitle": html.unescape(y.get("title") or ""),
        "seoDescription": html.unescape(y.get("description") or ""),
        "oldUrl": p["permalink"].replace(BASE, ""),
    }


ALLOWED_TAGS = {"p", "h2", "h3", "h4", "ul", "ol", "li", "strong", "em", "a", "table", "thead",
                "tbody", "tr", "th", "td", "br", "hr", "blockquote", "sup", "sub"}


def clean_article(h):
    # The whitepaper call-out box uses inline styles and a popup link. Replace it with a marker
    # the page template renders as a proper download panel.
    h = re.sub(r'<div style="[^"]*">\s*<span[^>]*>.*?</span>\s*(<br\s*/?>)?\s*<a[^>]*whitepaper-pop[^>]*>.*?</a>\s*</div>',
               "<!--WHITEPAPER-->", h, flags=re.S)
    h = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", h, flags=re.S)
    h = re.sub(r"</?(center|div|span)[^>]*>", "", h)

    def tag(m):
        closing, name, attrs = m.group(1), m.group(2).lower(), m.group(3) or ""
        if name not in ALLOWED_TAGS:
            return ""
        if closing:
            return f"</{name}>"
        if name == "a":
            href = re.search(r'href="([^"]*)"', attrs)
            href = href.group(1) if href else "#"
            href = href.replace(BASE, "")
            if href in ("/products/", "/shop/"):
                href = "/catalogue/"
            ext = href.startswith("http")
            return f'<a href="{href}"' + (' rel="noopener" target="_blank"' if ext else "") + ">"
        if name in ("th", "td"):
            span = re.search(r'colspan="(\d+)"', attrs)
            return f'<{name} colspan="{span.group(1)}">' if span else f"<{name}>"
        return f"<{name}>"

    h = re.sub(r"<(/?)([a-zA-Z0-9]+)([^>]*)>", tag, h)
    h = re.sub(r"<p>\s*</p>", "", h)
    h = re.sub(r"\n{3,}", "\n\n", h)
    return h.strip()


def main():
    os.chdir(ROOT)
    print("products...")
    products = get_json("/wp-json/wc/store/v1/products?per_page=100")
    yoast_p = {x["slug"]: x.get("yoast_head_json") for x in get_json("/wp-json/wp/v2/product?per_page=100&_fields=slug,yoast_head_json")}
    out = [parse_product(p, yoast_p) for p in products]
    out.sort(key=lambda x: (x["voltage"], x["family"] != "Standard", x["capacityAh"]))
    for p in out:
        if p["oldImage"]:
            ext = os.path.splitext(p["oldImage"])[1].lower()
            download(p["oldImage"], f"assets-src/products/{p['sku']}{ext}")
        if p["oldSpecSheet"]:
            download(p["oldSpecSheet"], f"public/downloads/spec-sheets/{p['sku']}.pdf")
    with open("src/data/products.json", "w") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
    print(f"  {len(out)} products, {sum(1 for p in out if p['image'])} with photos")

    print("articles...")
    cats = {c["id"]: html.unescape(c["name"]) for c in get_json("/wp-json/wp/v2/categories?per_page=100")}
    posts = get_json("/wp-json/wp/v2/posts?per_page=100")
    articles = []
    for p in posts:
        y = p.get("yoast_head_json") or {}
        body = clean_article(p["content"]["rendered"])
        articles.append({
            "slug": p["slug"],
            "title": html.unescape(p["title"]["rendered"]),
            "date": p["date"][:10],
            "modified": p["modified"][:10],
            "categories": [cats.get(c, "") for c in p["categories"]],
            "excerpt": text(p["excerpt"]["rendered"]).replace(" [&hellip;]", "").replace(" […]", ""),
            "seoTitle": html.unescape(y.get("title") or ""),
            "seoDescription": html.unescape(y.get("description") or ""),
            "readingMinutes": max(2, round(len(text(body).split()) / 220)),
            "html": body,
        })
    articles.sort(key=lambda a: a["date"], reverse=True)
    with open("src/data/insights.json", "w") as f:
        json.dump(articles, f, indent=1, ensure_ascii=False)
    print(f"  {len(articles)} articles")

    print("brand + marketing files...")
    files = {
        "/wp-content/uploads/2026/03/4.png": "assets-src/brand/logo-wordmark-white.png",
        "/wp-content/uploads/2026/03/Lead-Crystal-Logo-Icon-2000x2000-Background-White-White-Icon-Black-Background-Curved.png": "assets-src/brand/icon-curved.png",
        "/wp-content/uploads/2026/03/cropped-Lead-Crystal-Logo-Icon-2000x2000-Background-White-White-Icon-Black-Background-Circle-270x270.png": "assets-src/brand/icon-circle-270.png",
        "/wp-content/uploads/2026/03/LeadCrsta-Battery-Technology-Header-Hero-1920x1300-1.jpg": "assets-src/site/hero.jpg",
        "/wp-content/uploads/2026/03/Lead-Crystal-Battery-Solutions-KSA-Crystals-V1.jpg": "assets-src/site/crystals.jpg",
        "/wp-content/uploads/2023/11/Lead-Crystal-Energy-Solutions-KSA-Globe-Line-V1-1.jpg": "assets-src/site/globe.jpg",
        "/wp-content/uploads/2026/03/Lead-Crystal-Energy-Solutions-KSA-Pitch-Swirls-Segment-1-V1-optimised.png": "assets-src/site/swirls.png",
        "/wp-content/uploads/2026/03/Lead-Crystal-Energy-Solutions-KSA-Device-Graph-V1.png": "assets-src/site/device-graph.png",
        "/wp-content/uploads/2026/06/Leadcrystal-company-profile.pdf": "public/downloads/Leadcrystal-company-profile.pdf",
        "/wp-content/uploads/2026/06/Leadcrystal_TCO_White_Paper_v3.1_June2026.pdf": "assets-src/private/Leadcrystal_TCO_White_Paper_v3.1_June2026.pdf",
    }
    for src, dest in files.items():
        download(BASE + src, dest)
    print("done")


if __name__ == "__main__":
    main()
