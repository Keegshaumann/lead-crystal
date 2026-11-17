"""Reads the factory data sheets (assets-src/spec-sheets-factory/*.pdf, page 2) into
src/data/spec-sheets.json, so the redesigned sheets are typeset from the factory numbers
rather than retyped.

Needs PyMuPDF:  python -m pip install pymupdf
Run:            python scripts/spec-sheets/extract.py

Every factory sheet uses the same page-2 template, so values are read by position:
the specification block is the right-hand column (x >= 310 pt), the end-voltage block and
the tables are on the left. Anything that does not parse is reported and the script fails.
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
    """'14.7V/ (25℃)' -> '14.7V'"""
    v = re.sub(r"\s*\(25\s*(?:℃|[º°]\s*C)\)", "", s).strip().rstrip("/").strip()
    return v if v.endswith("V") else v + "V"


def find_y(page, phrase):
    for r in rows(page):
        if phrase in text(r["w"]):
            return r["y"]
    return None


def table(page, y0, y1):
    """A discharge table: header row of durations, then rows '1.60V  v v v ...'."""
    cols, data = None, []
    for r in rows(page, 0, 1e9, y0, y1):
        t = [w[4] for w in r["w"]]
        if t[:2] == ["End", "Voltage"]:
            cols = t[2:]
        elif re.fullmatch(r"\d\.\d+V", t[0]):
            data.append({"endV": t[0], "values": t[1:]})  # strings: keep the factory precision
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
            s["internalResistance"] = val.replace("=<", "≤ ").replace("mΩ", " mΩ").strip()
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
            s["initialCurrent"] = val.replace("Current", "").strip()
        elif re.match(r"[\d.]+V?/?( |$)", val) and (sub.startswith("Float") or group and group.startswith("Float") or sub == "Float"):
            s["floatV"] = clean_v(val)
        elif re.match(r"[\d.]+V?/?( |$)", val) and "cycleV" not in s:
            s["cycleV"] = clean_v(val)
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
    yc = find_y(page, "CONSTANT CURRENT DISCHARGE")
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
        if b[3] > 75:
            box |= pymupdf.Rect(b[:4])
    for img in page.get_image_info():
        box |= pymupdf.Rect(img["bbox"]) & page.rect
    box = (box + (-4, -4, 4, 4)) & page.rect
    svg = page.get_svg_image(text_as_path=True)
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
