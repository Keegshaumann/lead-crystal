"""T-ROX logo, redrawn 17 Nov 2026 (proposal). Writes vector SVGs to public/images/trox/ and
PNG exports to assets-src/t-rox-logo/.

The wordmark is Archivo Expanded Black Italic (the site's typeface) turned into outlines and
slanted a little further, with the hyphen drawn as a lightning bolt. It keeps what people
already know from the old logo (the name, the bolt, the amber bar, BATTERIES underneath) and
drops the clip-art dinosaur so it holds up small, in one colour and on a battery label.

Needs fontTools (python -m pip install fonttools) and Google Chrome for the PNG exports.
Run:                        python scripts/trox-logo.py
"""
import subprocess
import tempfile
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / "scripts" / "spec-sheets" / "fonts"
WEB = ROOT / "public" / "images" / "trox"
PNG = ROOT / "assets-src" / "t-rox-logo"

AMBER = "#FFB81C"
INK = "#121217"
WHITE = "#FFFFFF"
SLANT = -7  # extra degrees on top of the font's own 10° italic


def glyph_path(font, ch, x, y=0, scale=1.0):
    """SVG path data for one character, baseline at y, flipped into SVG's y-down space."""
    gs = font.getGlyphSet()
    name = font.getBestCmap()[ord(ch)]
    pen = SVGPathPen(gs)
    gs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, y)))
    return pen.getCommands(), gs[name].width * scale


def bolt(x, y, w, h):
    """A horizontal lightning bolt in the box (x, y, w, h)."""
    pts = [(0.00, 0.64), (0.47, 0.00), (0.43, 0.42), (1.00, 0.34), (0.53, 1.00), (0.57, 0.58)]
    return " ".join(f"{x + px * w:.1f},{y + py * h:.1f}" for px, py in pts)


def wordmark(letters):
    """Lays out T-ROX: returns (svg body, width) in font units, cap height 688, baseline 0."""
    big = TTFont(FONTS / "ArchivoX-900i.ttf")
    parts, x = [], 0
    T, wT = glyph_path(big, "T", x)
    parts.append(f'<path d="{T}" fill="{letters}"/>')
    # the bolt sits where the hyphen was, overlapping the T's arm a touch like the original
    bx, bw, bh = 790, 430, 290
    parts.append(f'<polygon points="{bolt(bx, -344 - bh / 2, bw, bh)}" fill="{AMBER}"/>')
    x = bx + bw - 40
    for ch, kern in (("R", 0), ("O", -38), ("X", -46)):
        x += kern
        d, w = glyph_path(big, ch, x)
        parts.append(f'<path d="{d}" fill="{letters}"/>')
        x += w
    return "".join(parts), x


def descriptor(width, color):
    """BATTERIES, spaced to the width of the wordmark."""
    f = TTFont(FONTS / "ArchivoX-700.ttf")
    word, size = "BATTERIES", 0.235
    widths = [glyph_path(f, c, 0, 0, size)[1] for c in word]
    gap = (width - sum(widths)) / (len(word) - 1)
    out, x = [], 0
    for c, w in zip(word, widths):
        d, _ = glyph_path(f, c, x, 0, size)
        out.append(d)
        x += w + gap
    return f'<path d="{" ".join(out)}" fill="{color}"/>'


def logo(letters, sub, bar_end):
    body, w = wordmark(letters)
    skew = f"skewX({SLANT})"
    # overall box: cap top at -700, BATTERIES under the baseline, bar below that
    pad_l, pad_r = 40, 260
    vb_w, vb_h = w + pad_l + pad_r, 1140
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb_w:.0f} {vb_h}" role="img" aria-label="T-ROX Batteries">
  <g transform="translate({pad_l + 30} 740) {skew}">
    {body}
    <g transform="translate(18 236)">{descriptor(w - 40, sub)}</g>
    <polygon points="0,318 {w * 0.86:.0f},318 {w * 0.86 - 14:.0f},362 -14,362" fill="{AMBER}"/>
    <polygon points="{w * 0.86 + 24:.0f},318 {w - 20:.0f},318 {w - 34:.0f},362 {w * 0.86 + 10:.0f},362" fill="{bar_end}"/>
  </g>
</svg>
"""


def mark(bg, letters, bolt_fill=AMBER):
    """Square badge for avatars and favicons: the T with the bolt under its arm."""
    big = TTFont(FONTS / "ArchivoX-900i.ttf")
    T, _ = glyph_path(big, "T", 0, 0, 0.78)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" role="img" aria-label="T-ROX">
  <rect width="1000" height="1000" rx="180" fill="{bg}"/>
  <g transform="translate(120 735) skewX({SLANT})">
    <path d="{T}" fill="{letters}"/>
    <polygon points="{bolt(420, -300, 400, 270)}" fill="{bolt_fill}"/>
  </g>
  <polygon points="170,820 830,820 820,858 160,858" fill="{bolt_fill}"/>
</svg>
"""


CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def png(svg, out, width):
    """Transparent PNG through headless Chrome, which draws the SVG exactly as browsers do."""
    import re

    vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', svg).group(1).split()]
    height = round(width * vb[3] / vb[2])
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "logo.html"
        page.write_text(f'<html><body style="margin:0;background:transparent">{svg.replace("<svg ", f"<svg width=\"{width}\" height=\"{height}\" ", 1)}</body></html>')
        subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", f"--user-data-dir={tmp}/p", "--hide-scrollbars",
             "--default-background-color=00000000", f"--window-size={width},{height}", f"--screenshot={out}", page.as_uri()],
            check=True, capture_output=True,
        )


def main():
    WEB.mkdir(parents=True, exist_ok=True)
    PNG.mkdir(parents=True, exist_ok=True)
    files = {
        "t-rox-logo-white.svg": logo(WHITE, "#C9C9D1", "#6B6B76"),
        "t-rox-logo-ink.svg": logo(INK, "#4A4A55", "#B9B9C2"),
        "t-rox-mark.svg": mark(INK, WHITE),
        "t-rox-mark-amber.svg": mark(AMBER, INK, INK),
    }
    for name, svg in files.items():
        (WEB / name).write_text(svg)
        png(svg, PNG / name.replace(".svg", ".png"), 2400 if "logo" in name else 1024)
        (PNG / name).write_text(svg)
    print("wrote", ", ".join(files))


if __name__ == "__main__":
    main()
