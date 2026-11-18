"""Reads the factory data sheets (assets-src/spec-sheets-factory/*.pdf, page 2) into
src/data/spec-sheets.json, so the redesigned sheets are typeset from the factory numbers
rather than retyped.

Needs PyMuPDF:  python -m pip install pymupdf
Run:            python scripts/spec-sheets/extract.py

Every factory sheet uses the same page-2 template, so values are read by position:
the specification block is the right-hand column (x >= 310 pt), the end-voltage block and
the tables are on the left. Anything that does not parse is reported and the script fails.

The eight sheets added from leadcrystaltechnologies.com (Nov 2026: 3-EVFJ-265, 6-EVFJ-265/80/60/
40/32/27, 6-CNFT-190) use the same page 2 with a few differences the parser also accepts:
charge voltages given as ranges ("14.6V∼14.7V"), "mO" where the Ω glyph went missing, "53A or
small" as the initial current, and on 6-CNFT-190 a table header without "End Voltage", a
misspelt heading and numbers split in two. None of these occur on the first 54 sheets.
"""
import json
import re
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets-src" / "spec-sheets-factory"
OUT = ROOT / "src" / "data" / "spec-sheets.json"


def rows(page, x0=0, x1=1e9, y0=0, y1=1e9):
    """Words inside the box, grouped into lines by baseline, each line sorted left to right."""
    ws = [w for w in page.get_text("words") if x0 <= w[0] < x1 and y0 <= w[3] < y1]
    ws.sort(key=lambda w: (round(w[3], 1), w[0]))
    out = []
    for w in ws:
        if out and abs(out[-1]["y"] - w[3]) < 2.5:
            out[-1]["w"].append(w)
        else:
            out.append({"y": w[3], "w": [w]})
    for r in out:
        r["w"].sort(key=lambda w: w[0])
    return out


def text(ws):
    return " ".join(w[4] for w in ws).strip()


def clean_v(s):
    """'14.7V/ (25℃)' -> '14.7V';  '14.6V∼14.7V (25℃)' -> '14.6 to 14.7V'"""
    v = re.sub(r"\s*\(25\s*(?:℃|[º°]\s*C)\)", "", s).strip().rstrip("/").strip()
    m = re.fullmatch(r"([\d.]+)\s*V?\s*[~∼～]\s*([\d.]+)\s*V?", v)
    if m:
        return f"{m.group(1)} to {m.group(2)}V"
    return v if v.endswith("V") else v + "V"


# A charge voltage is a number, optionally a range: '14.7V', '14.7V/', '14.6V∼14.7V', '14.4V ~ 14.7V'
CHARGE_V = r"[\d.]+V?/?( |$|\s*[~∼～])"

# Values a factory sheet draws as outlines instead of text, so there is nothing to parse.
# Read off the rendered page (pdftoppm -r 400) and still passed through clean_v.
OUTLINED = {
    "6-CNFT-190": {"cycleV": "14.4V ~ 14.7V (25℃)", "floatV": "13.5V ~ 13.6V (25℃)"},
}


def find_y(page, phrase):
    for r in rows(page):
        if phrase in text(r["w"]):
            return r["y"]
    return None


def joined(ws):
    """Word texts, with numbers the PDF split in two put back together ('1' '.83V' -> '1.83V')."""
    out = []
    for i, w in enumerate(ws):
        p = ws[i - 1] if i else None
        if p and w[4].startswith(".") and re.search(r"\d$", out[-1]) and w[0] - p[2] < 1.5:
            out[-1] += w[4]
        else:
            out.append(w[4])
    return out


def table(page, y0, y1):
    """A discharge table: header row of durations, then rows '1.60V  v v v ...'."""
    cols, data = None, []
    for r in rows(page, 0, 1e9, y0, y1):
        t = joined(r["w"])
        if t[:2] == ["End", "Voltage"]:
            cols = t[2:]
        elif re.fullmatch(r"\d\.\d+V", t[0]):
            data.append({"endV": t[0], "values": t[1:]})  # strings: keep the factory precision
        elif cols is None:
            # header without the 'End Voltage' label, or with it on the line above ('per cell 5min ...')
            durs = [x for x in t if re.fullmatch(r"\d+(?:min|h)", x)]
            if len(durs) >= 5 and t[len(t) - len(durs) :] == durs:
                cols = durs
    return {"cols": cols, "rows": data}


def parse(path):
    page = pymupdf.open(path)[1]
    s = {"sku": path.stem}
    problems = []

    # ---- specification column ----
    right = rows(page, 310, 1e9, 100, 470)
    group = None
    caps, selfd = [], []
    pending_weight = False
    for r in right:
        g = text([w for w in r["w"] if w[0] < 360])
        sub = text([w for w in r["w"] if 360 <= w[0] < 465])
        val = text([w for w in r["w"] if w[0] >= 465])
        if g and not g.startswith(("(", "25")):
            group = g
        if g.startswith("Nominal"):
            s["voltage"] = val
        elif g.startswith("Rated"):
            s["ratedCapacity"] = val.replace(" AH", "Ah").replace("AH", "Ah")
        elif g.startswith("(") and "rate" in g and "ratedRate" not in s:
            s["ratedRate"] = g.strip("()")
        elif sub.startswith(("Total Height", "Height", "Length", "Width")):
            key = {"Total": "totalHeight", "Height": "height", "Length": "length", "Width": "width"}[sub.split()[0]]
            m = re.match(r"([\d.]+)\s*mm", val)
            if m:
                s.setdefault("dims", {})[key] = float(m.group(1))
            else:
                problems.append(f"dimension {sub!r}={val!r}")
        elif g.startswith("Weight"):
            pending_weight = True
        elif pending_weight and "kg" in val:
            s["weightKg"] = float(re.match(r"([\d.]+)", val).group(1))
            pending_weight = False
        elif "hour rate" in sub:
            caps.append({"rate": sub, "value": val.replace(" AH", "Ah").replace("AH", "Ah")})
        elif sub.startswith("Fully charged"):
            s["internalResistance"] = val.replace("=<", "≤ ").replace("mO", "mΩ").replace("mΩ", " mΩ").strip()
        elif sub.startswith("Capacity after"):
            m = re.search(r"after (\d+) month", sub)
            selfd.append({"months": int(m.group(1)), "value": val})
        elif g.startswith("Max"):
            s["maxDischarge"] = re.sub(r"(\d)A\s*\(5S\)", r"\1A (5 s)", (sub + " " + val).strip())
        elif sub.startswith("Standard"):
            s["terminal"] = val
        elif sub.startswith("Optional"):
            if val:
                s["terminalOptional"] = val
        elif val.startswith("Current"):
            # '53A or small': the sheet already reads it as a maximum ("initial current up to 53 A")
            s["initialCurrent"] = re.sub(r"\s+or smal\w*$", "", val.replace("Current", "").strip())
        elif re.match(CHARGE_V, val) and (sub.startswith("Float") or group and group.startswith("Float") or sub == "Float"):
            s["floatV"] = clean_v(val)
        elif re.match(CHARGE_V, val) and "cycleV" not in s:
            s["cycleV"] = clean_v(val)
    for k, v in OUTLINED.get(s["sku"], {}).items():
        if k not in s:
            s[k] = clean_v(v)
    s["capacities"] = caps
    s["selfDischarge"] = selfd

    # ---- end voltage by discharge current (not on every sheet) ----
    ev = []
    for r in rows(page, 0, 300, 240, 340):
        label = text([w for w in r["w"] if w[0] < 225])
        val = text([w for w in r["w"] if 225 <= w[0] < 300])
        if label and re.fullmatch(r"[\d.]+", val or ""):
            ev.append({"current": label, "endV": val})
    s["endVoltage"] = ev

    # ---- charge voltage per cell vs temperature ----
    t = {}
    y = find_y(page, "CHARGE vs TEMPERATURE CHART")
    for r in rows(page, 0, 1e9, (y or 480) + 5, (y or 480) + 60):
        words = [w[4] for w in r["w"]]
        nums = [x for x in words if re.fullmatch(r"-?[\d.]+", x)]
        if words[0] == "temperature":
            t["tempC"] = [int(x) for x in nums]
        elif words[0] == "Cycle":
            t["cycle"] = [float(x) for x in nums]
        elif words[0] == "Float":
            t["float"] = [float(x) for x in nums]
    s["chargeVsTemp"] = t

    # ---- discharge tables ----
    # 6-CNFT-190 misspells the first heading 'CONSTANT URRENT DISCHARGE CHARACTERISTICS'
    yc = find_y(page, "CONSTANT CURRENT DISCHARGE") or find_y(page, "DISCHARGE CHARACTERISTICS")
    yp = find_y(page, "DISCHARGE DATA WITH CONSTANT POWER")
    s["constantCurrent"] = table(page, yc, yp)
    s["constantPower"] = table(page, yp, 1e9)

    # ---- checks ----
    for k in ["voltage", "ratedCapacity", "ratedRate", "dims", "weightKg", "internalResistance", "maxDischarge", "terminal", "cycleV", "floatV"]:
        if k not in s:
            problems.append(f"missing {k}")
    if len(s.get("dims", {})) != 4:
        problems.append(f"dims {s.get('dims')}")
    for k in ["constantCurrent", "constantPower"]:
        tb = s[k]
        if not tb["cols"] or len(tb["rows"]) < 5 or any(len(r["values"]) != len(tb["cols"]) for r in tb["rows"]):
            problems.append(f"{k} malformed: {len(tb['cols'] or [])} cols, {[len(r['values']) for r in tb['rows']]}")
    if t and not (len(t.get("tempC", [])) == len(t.get("cycle", [])) == len(t.get("float", []))):
        problems.append(f"chargeVsTemp lengths {[len(v) for v in t.values()]}")
    if len(caps) < 2:
        problems.append(f"capacities {caps}")
    return s, problems


def main():
    out, bad = {}, 0
    for f in sorted(SRC.glob("*.pdf")):
        s, problems = parse(f)
        out[s["sku"]] = s
        if problems:
            bad += 1
            print(f"{f.stem}: " + "; ".join(problems))
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(out)} sheets, {bad} with problems")
    sys.exit(1 if bad else 0)


if __name__ == "__main__" and "--curves" not in sys.argv:
    main()


# ---------------------------------------------------------------------------------------
# Performance curves: the factory's page 3, kept as vector art but restyled for the new
# sheets. The old page header is removed, the art is cropped to its content and the
# factory cyan becomes Leadcrystal violet. Written to scripts/spec-sheets/build/curves/
# (not committed; build.mjs inlines them).
# ---------------------------------------------------------------------------------------
import colorsys

CURVES = ROOT / "scripts" / "spec-sheets" / "build" / "curves"


def _recolour(hexstr):
    r, g, b = (int(hexstr[i : i + 2], 16) / 255 for i in (0, 2, 4))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    deg = h * 360
    if s > 0.25 and 165 <= deg <= 220:  # factory cyan / sky blue -> violet
        r, g, b = colorsys.hls_to_rgb(250 / 360, min(0.8, l * 1.02), min(1.0, s * 1.08))
    elif s < 0.12 and l < 0.5:  # near-black and grey text -> Leadcrystal ink / slate
        r, g, b = (0x16 / 255, 0x16 / 255, 0x1D / 255) if l < 0.25 else (0x5B / 255, 0x5D / 255, 0x68 / 255)
    else:
        return hexstr
    return "".join(f"{round(c * 255):02x}" for c in (r, g, b))


def _hide_empty_masks(svg):
    """The 2026 sheets put fully transparent images (soft mask all zero) behind the curve labels.
    They draw nothing in the PDF, but Chrome leaves a hairline round each one, so hide them.
    The first 54 curve pages have no masks at all."""
    import base64

    blank = {
        m.group(1): not any(pymupdf.Pixmap(base64.b64decode(m.group(2))).samples)
        for m in re.finditer(r'<image id="([\w-]+)"[^>]*?xlink:href="data:image/png;base64,([^"]+)"', svg)
    }
    for m in re.finditer(r'<mask id="([\w-]+)">(.*?)</mask>', svg, re.S):
        # the mask image is inline, or a <use> of an identical one defined earlier
        ids = [a or b for a, b in re.findall(r'<image id="([\w-]+)"|xlink:href="#([\w-]+)"', m.group(2))]
        if ids and all(blank.get(i, False) for i in ids):
            svg = svg.replace(f'<g mask="url(#{m.group(1)})">', f'<g mask="url(#{m.group(1)})" display="none">')
    return svg


def curves(path):
    doc = pymupdf.open(path)
    page = doc[2]
    for w in page.get_text("words"):
        if w[3] < 70:  # the old "6-CNFJ-100 12V/100Ah" running header
            page.add_redact_annot(pymupdf.Rect(w[:4]) + (-1, -1, 1, 1))
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
    box = pymupdf.Rect()
    for d in page.get_drawings():
        r = d["rect"]
        if r.height < 800 and r.width < 580 and r.y1 > 75:  # skip page backgrounds and the old header
            box |= r
    for b in page.get_text("blocks"):
        if b[3] > 75 and b[4].strip():  # the 2026 sheets leave blank text blocks under the old header
            box |= pymupdf.Rect(b[:4])
    for img in page.get_image_info():
        box |= pymupdf.Rect(img["bbox"]) & page.rect
    box = (box + (-4, -4, 4, 4)) & page.rect
    svg = _hide_empty_masks(page.get_svg_image(text_as_path=True))
    svg = re.sub(r"#([0-9a-fA-F]{6})\b", lambda m: "#" + _recolour(m.group(1)), svg)
    svg = re.sub(r'viewBox="[^"]*"', f'viewBox="{box.x0:.1f} {box.y0:.1f} {box.width:.1f} {box.height:.1f}"', svg, count=1)
    svg = re.sub(r'(<svg[^>]*?)\s(width|height)="[^"]*"', r"\1", svg, count=1)
    svg = re.sub(r'(<svg[^>]*?)\s(width|height)="[^"]*"', r"\1", svg, count=1)
    return svg, box


def write_curves():
    CURVES.mkdir(parents=True, exist_ok=True)
    for f in sorted(SRC.glob("*.pdf")):
        svg, box = curves(f)
        (CURVES / f"{f.stem}.svg").write_text(svg)
    print(f"wrote {len(list(CURVES.glob('*.svg')))} curve pages to {CURVES.relative_to(ROOT)}")


if __name__ == "__main__" and "--curves" in sys.argv:
    write_curves()
