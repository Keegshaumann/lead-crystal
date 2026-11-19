// Builds the Leadcrystal technical data sheets (public/downloads/spec-sheets/<SKU>.pdf) in the
// website's design: dark crystal cover, then white specification, discharge and curve pages.
//
//   python scripts/spec-sheets/extract.py            factory PDFs -> src/data/spec-sheets.json
//   python scripts/spec-sheets/extract.py --curves   factory curve pages -> build/curves/*.svg
//   node scripts/spec-sheets/build.mjs [SKU ...]     HTML -> PDF through headless Chrome
//
// The numbers come from the factory sheets (assets-src/spec-sheets-factory/); names, photos and
// highlights from src/data/products.json; T-ROX equivalents from src/data/trox.json.
// Fonts are static instances in fonts/: Chrome writes variable fonts into PDFs as Type 3.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(ROOT, "public/downloads/spec-sheets");
const HTML = path.join(HERE, "build/html");
const CURVES = path.join(HERE, "build/curves");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const SPECS = read("src/data/spec-sheets.json");
const PRODUCTS = new Map(read("src/data/products.json").map((p) => [p.sku, p]));
const TROX = new Map(read("src/data/trox.json").series.flatMap((s) => s.models.map((m) => [m.lc, m.trox])));

const FAMILY = {
  Standard: ["Deep cycle", "CNFJ series"],
  "Front Terminal": ["Front terminal", "CNFT series"],
  EV: ["EV & mobility", "EVFJ series"],
  "High-Cycle": ["High cycle", "HCNFJ series"],
};

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const num = (n) => (Number.isInteger(n) ? String(n) : String(+n.toFixed(2)));
const fileUrl = (p) => pathToFileURL(p).href;
// Ω, ≤ and → are not in Archivo: give them a static system font so nothing falls back to a variable one
const sym = (s) => esc(s).replace(/([Ω≤])/g, '<span class="sym">$1</span>');
const ah = (s) => s.replace(/(\d)Ah/, "$1 Ah");
// a charge voltage given as a range ("14.6 to 14.7V") is set smaller so it stays on one line
const cvClass = (v) => (/ to /.test(v) ? "cv cv--range" : "cv");

// "120 hour rate (1.2A)" -> ["120 h rate", "1.2 A"]
function rate(r) {
  const m = r.match(/^(\d+(?:\.\d+)?) hour rate \(([\d.]+)\s*(m?A)\)$/);
  return m ? [`${m[1]} h rate`, `${m[2]} ${m[3]}`] : [r, ""];
}

// The product summaries open by repeating "12V 100Ah Lead Crystal battery", which the cover
// already says: drop that, keep what it is for.
function summary(text) {
  let t = (text ?? "").replace(/\s+([.,])/g, "$1").trim();
  const m = t.match(/^(?:[\w-]+ )?[\d.]+V [\d.]+Ah (?:[\w-]+ )*?Lead Crystal (?:[\w-]+ )?(?:battery|cell)(?: (?:optimized|designed))?( for [^.]+)?\.\s*/i);
  if (m) t = (m[1] ? "Built" + m[1] + ". " : "") + t.slice(m[0].length);
  return t.trim();
}

// ---------- small SVGs ----------
const ARROW = `<svg class="arr" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 5h7M5.5 2 8.5 5l-3 3" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>`;

function chargeChart(t) {
  if (!t?.tempC?.length) return "";
  const W = 640, H = 190, L = 44, R = 12, T = 12, B = 30;
  const x0 = t.tempC[0], x1 = t.tempC.at(-1);
  const all = [...t.cycle, ...t.float];
  const y0 = Math.floor(Math.min(...all) * 10) / 10 - 0.05, y1 = Math.ceil(Math.max(...all) * 10) / 10 + 0.05;
  const X = (v) => L + ((v - x0) / (x1 - x0)) * (W - L - R);
  const Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const grid = [];
  for (let v = Math.ceil(y0 * 10) / 10; v <= y1 + 1e-9; v += 0.1)
    grid.push(`<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="g"/><text x="${L - 7}" y="${Y(v) + 3}" text-anchor="end">${v.toFixed(1)}</text>`);
  for (let v = x0; v <= x1; v += 10)
    grid.push(`<line y1="${T}" y2="${H - B}" x1="${X(v)}" x2="${X(v)}" class="g g--v"/><text x="${X(v)}" y="${H - B + 14}" text-anchor="middle">${v}</text>`);
  const line = (ys, cls) => `<polyline class="${cls}" points="${t.tempC.map((x, i) => `${X(x).toFixed(1)},${Y(ys[i]).toFixed(1)}`).join(" ")}"/>`;
  const dots = (ys, cls) => t.tempC.map((x, i) => `<circle class="${cls}" cx="${X(x).toFixed(1)}" cy="${Y(ys[i]).toFixed(1)}" r="1.9"/>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" aria-label="Charge voltage per cell against temperature">
    ${grid.join("")}
    <line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" class="axis"/>
    ${line(t.cycle, "l-cycle")}${line(t.float, "l-float")}${dots(t.cycle, "d-cycle")}${dots(t.float, "d-float")}
    <text x="${W - R}" y="${H - 4}" text-anchor="end" class="ax">Temperature (°C)</text>
    <text x="4" y="${T + 2}" class="ax" transform="rotate(-90 4 ${T + 2})" text-anchor="end">V / cell</text>
  </svg>`;
}

// Front and side elevations to scale, with dimension lines.
function elevations(d) {
  const W = 320, H = 150, pad = 36, padR = 14, gap = 30;
  const th = d.totalHeight || d.height;
  const s = Math.min((W - pad - padR - gap) / (d.length + d.width), (H - 36) / th);
  const box = (x, w, label, wLabel) => {
    const bw = w * s, bh = d.height * s, tt = (th - d.height) * s, top = 10 + tt, bottom = top + bh;
    const tw = Math.max(5, Math.min(bw * 0.12, 16));
    const terms = tt > 0.8
      ? `<rect class="term" x="${x + bw * 0.14}" y="${top - tt}" width="${tw}" height="${tt}"/><rect class="term" x="${x + bw * 0.86 - tw}" y="${top - tt}" width="${tw}" height="${tt}"/>`
      : "";
    return `${terms}<rect class="case" x="${x}" y="${top}" width="${bw}" height="${bh}" rx="1.5"/>
      <line class="lid" x1="${x}" x2="${x + bw}" y1="${top + Math.min(bh * 0.16, 9)}" y2="${top + Math.min(bh * 0.16, 9)}"/>
      <g class="dim"><line x1="${x}" x2="${x + bw}" y1="${bottom + 11}" y2="${bottom + 11}"/><line x1="${x}" x2="${x}" y1="${bottom + 7}" y2="${bottom + 15}"/><line x1="${x + bw}" x2="${x + bw}" y1="${bottom + 7}" y2="${bottom + 15}"/></g>
      <text class="dl" x="${x + bw / 2}" y="${bottom + 23}" text-anchor="middle">${num(w)}</text>
      <text class="vl" x="${x + bw / 2}" y="${top + bh / 2 + 3}" text-anchor="middle">${label}</text>
      ${wLabel ?? ""}`;
  };
  const fx = pad, sx = pad + d.length * s + gap;
  const top = 10, bottom = 10 + th * s;
  const hdim = (x) => `<g class="dim"><line x1="${x}" x2="${x}" y1="${top}" y2="${bottom}"/><line x1="${x - 4}" x2="${x + 4}" y1="${top}" y2="${top}"/><line x1="${x - 4}" x2="${x + 4}" y1="${bottom}" y2="${bottom}"/></g>
    <text class="dl" x="${x - 6}" y="${(top + bottom) / 2 + 3}" text-anchor="end">${num(th)}</text>`;
  return `<svg class="elev" viewBox="0 0 ${W} ${H}" aria-label="Case dimensions in millimetres">
    ${hdim(fx - 9)}${box(fx, d.length, "FRONT")}${box(sx, d.width, "SIDE")}
  </svg>`;
}

// For the models without a photo (EV models and 6-CNFT-190): an isometric drawing of the case, to
// its proportions. Front-terminal models get their two terminals on the short end, not the lid.
function silhouette(d, sku, front = false) {
  const th = d.totalHeight || d.height;
  const k = 230 / (d.length * 0.866 + d.width * 0.866);
  const L = d.length * k, W = d.width * k, H = d.height * k, T = (th - d.height) * k;
  const c = 0.866, s = 0.5;
  // origin = front-bottom-left corner; x runs right-down along the length, y left-down along the width
  const P = (x, y, z) => [x * c - y * c, x * s + y * s - z];
  const pts = (...a) => a.map((p) => P(...p).map((v) => v.toFixed(1)).join(",")).join(" ");
  const ox = W * c + 10, oy = H + T + 10;
  const term = (x, y) => {
    const r = Math.max(4, Math.min(L, W) * 0.05);
    const [cx, cy] = P(x, y, H);
    return `<rect x="${(cx - r).toFixed(1)}" y="${(cy - T - r * 0.5).toFixed(1)}" width="${(2 * r).toFixed(1)}" height="${(T + r * 0.5).toFixed(1)}" class="st"/><ellipse cx="${cx.toFixed(1)}" cy="${(cy - T - r * 0.5).toFixed(1)}" rx="${r.toFixed(1)}" ry="${(r * 0.55).toFixed(1)}" class="stt"/>`;
  };
  // a terminal on the short end (the x = L face), seen in that face's plane, standing out along +x
  const endTerm = (y, z) => {
    const r = Math.max(3.5, Math.min(W, H) * 0.07);
    const [cx, cy] = P(L, y, z);
    const [dx, dy] = P(r * 0.8, 0, 0);
    const face = (x0, y0) => `matrix(${-c} ${s} 0 1 ${x0.toFixed(1)} ${y0.toFixed(1)})`;
    return `<circle r="${r.toFixed(1)}" class="st" transform="${face(cx, cy)}"/><circle r="${(r * 0.55).toFixed(1)}" class="stt" transform="${face(cx + dx, cy + dy)}"/>`;
  };
  const [lx, ly] = P(L * 0.5, W, H * 0.42);
  return `<svg class="silhouette" viewBox="0 0 ${(L * c + W * c + 20).toFixed(0)} ${(L * s + W * s + H + T + 20).toFixed(0)}" aria-hidden="true">
    <g transform="translate(${ox.toFixed(1)} ${oy.toFixed(1)})">
      <polygon class="f-side" points="${pts([L, 0, 0], [L, W, 0], [L, W, H], [L, 0, H])}"/>
      <polygon class="f-front" points="${pts([0, W, 0], [L, W, 0], [L, W, H], [0, W, H])}"/>
      <polygon class="f-top" points="${pts([0, 0, H], [L, 0, H], [L, W, H], [0, W, H])}"/>
      <polyline class="f-lid" points="${pts([0, W, H * 0.84], [L, W, H * 0.84], [L, 0, H * 0.84])}"/>
      ${front ? endTerm(W * 0.28, H * 0.92) + endTerm(W * 0.72, H * 0.92) : term(L * 0.16, W * 0.5) + term(L * 0.84, W * 0.5)}
      <text class="f-label" text-anchor="middle" transform="matrix(${c} ${s} 0 1 ${lx.toFixed(1)} ${ly.toFixed(1)})">${esc(sku)}</text>
    </g>
  </svg>`;
}

// ---------- page furniture ----------
function runningHead(s, p) {
  return `<header class="rh">
    <img src="${fileUrl(path.join(HERE, "assets/logo-ink.png"))}" alt="Leadcrystal" class="rh-logo">
    <p class="mono rh-id"><b>${esc(s.sku)}</b><span>${esc(s.voltage)} ${esc(ah(s.ratedCapacity))}</span><span>Technical data sheet</span></p>
  </header>`;
}
function foot(s, n, dark = false) {
  return `<footer class="ft${dark ? " ft--dark" : ""}">
    <p class="mono"><span>leadcrystal.co</span><span>info@leadcrystal.co</span><span>Riyadh, Kingdom of Saudi Arabia</span></p>
    <p class="mono">${esc(s.sku)} <span class="pg">${String(n).padStart(2, "0")} / 04</span></p>
  </footer>`;
}
const sectionTitle = (n, title, note = "") =>
  `<div class="st-row"><p class="st-n mono">${n}</p><h2 class="st-t">${title}</h2>${note ? `<p class="st-note">${note}</p>` : ""}</div>`;

// ---------- pages ----------
function cover(s, p) {
  const [fam, series] = FAMILY[p.family] ?? ["Lead crystal", ""];
  const d = s.dims;
  const cells = Math.round(parseFloat(s.voltage) / 2);
  const trox = TROX.get(s.sku);
  const tiles = [
    ["Nominal voltage", parseFloat(s.voltage), "V", `${cells} cell${cells > 1 ? "s" : ""}`],
    ["Rated capacity", parseFloat(s.ratedCapacity), "Ah", s.ratedRate.replace("hour", "h")],
    ["Dimensions", `${num(d.length)} × ${num(d.width)} × ${num(d.totalHeight)}`, "mm", "L × W × total H"],
    ["Weight", num(s.weightKg), "kg", "approximately"],
    ["Terminal", s.terminal, "", s.terminalOptional ? `optional ${s.terminalOptional}` : "standard"],
    ["Max discharge", s.maxDischarge.replace(/A \(5 s\)/, ""), "A", "for 5 seconds"],
    ["Internal resistance", s.internalResistance.replace(" mΩ", ""), "mΩ", "fully charged, 25 °C"],
    ["Charge voltage", s.floatV.replace("V", ""), "V", `float · cycle ${s.cycleV}`],
  ];
  const photo = p.image
    ? `<img class="cv-photo" src="${fileUrl(path.join(ROOT, "public", p.image))}" alt="${esc(p.name)}">`
    : `<div class="cv-photo cv-photo--line">${silhouette(d, s.sku, p.family === "Front Terminal")}</div>`;
  return `<section class="page cover">
    <img class="cv-bg" src="${fileUrl(path.join(HERE, "assets/crystal.jpg"))}" alt="">
    <div class="cv-shade"></div>
    <header class="cv-top">
      <img src="${fileUrl(path.join(HERE, "assets/logo-white.png"))}" alt="Leadcrystal" class="cv-logo">
      <p class="mono cv-kind">Technical data sheet</p>
    </header>
    <div class="cv-head">
      <p class="eyebrow mono">${esc(fam)} · ${esc(series)}</p>
      <h1 class="cv-sku">${esc(s.sku)}</h1>
    </div>
    <div class="cv-main">
      <div class="cv-copy">
        <p class="cv-name">${esc(s.voltage)} ${esc(ah(s.ratedCapacity))} lead crystal ${s.voltage === "2V" ? "cell" : "battery"}</p>
        <p class="cv-sum">${esc(summary(p.summary))}</p>
        <ul class="cv-hl">${(p.attributes ?? []).slice(0, 5).map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
      </div>
      ${photo}
    </div>
    <div class="cv-tiles">
      ${tiles
        .map(([k, v, u, n]) => `<div class="tile"><p class="mono tk">${k}</p><p class="tv">${sym(v)}${u ? `<small>${sym(u)}</small>` : ""}</p><p class="tn">${sym(n)}</p></div>`)
        .join("")}
    </div>
    ${
      trox
        ? `<p class="cv-trox"><span class="mono">T-ROX</span> Same case as T-ROX <b>${trox.map(esc).join("</b> and <b>")}</b>, so it drops straight into an existing T-ROX space.</p>`
        : ""
    }
    ${foot(s, 1, true)}
  </section>`;
}

function specPage(s, p) {
  const d = s.dims;
  const inch = (mm) => (mm / 25.4).toFixed(2);
  const row = (k, v, sub = "") => `<tr><th>${k}</th><td>${v}${sub ? `<span class="sub">${sub}</span>` : ""}</td></tr>`;
  const group = (title, rows) => `<tbody><tr class="grp"><th colspan="2" class="mono">${title}</th></tr>${rows.join("")}</tbody>`;
  const cells = Math.round(parseFloat(s.voltage) / 2);
  return `<section class="page paper">
    ${runningHead(s, p)}
    ${sectionTitle("01", "Specification", "Manufacturer's data at 25 °C unless stated")}
    <div class="spec-grid">
      <table class="spec">
        ${group("Electrical", [
          row("Nominal voltage", esc(s.voltage), `${cells} × 2V cell${cells > 1 ? "s" : ""}`),
          row(`Rated capacity`, esc(ah(s.ratedCapacity)), esc(s.ratedRate)),
          row("Chemistry", "Lead crystal", "SiO<sub>2</sub> electrolyte, valve regulated"),
          row("Internal resistance", sym(s.internalResistance), "fully charged, 25 °C"),
          row("Max discharge current", esc(s.maxDischarge.replace(/(\d)A/, "$1 A")), "25 °C"),
        ])}
        ${group(
          "Capacity at 25 °C",
          s.capacities.map((c) => {
            const [r, i] = rate(c.rate);
            return row(r, esc(ah(c.value)), i ? `at ${esc(i)}` : "");
          }),
        )}
        ${group("Dimensions and weight", [
          row("Length", `${num(d.length)} mm`, `${inch(d.length)} in`),
          row("Width", `${num(d.width)} mm`, `${inch(d.width)} in`),
          row("Height", `${num(d.height)} mm`, `${inch(d.height)} in`),
          row("Total height", `${num(d.totalHeight)} mm`, `top of terminal · ${inch(d.totalHeight)} in`),
          row("Weight", `${num(s.weightKg)} kg`, `approx. ${(s.weightKg * 2.20462).toFixed(1)} lb`),
          row("Terminal", esc(s.terminal), s.terminalOptional ? `optional ${esc(s.terminalOptional)}` : "standard"),
        ])}
        ${group(
          "Self-discharge at 25 °C",
          s.selfDischarge.map((x) => row(`After ${x.months} months`, esc(x.value), "capacity remaining")),
        )}
      </table>
      <div class="spec-side">
        <div class="charge">
          <p class="mono cap">Charging · constant voltage</p>
          <div class="charge-row"><p class="ck">Cycle use</p><p class="${cvClass(s.cycleV)}">${esc(s.cycleV)}</p><p class="cn">at 25 °C${s.initialCurrent ? `, initial current up to ${esc(s.initialCurrent.replace(/(\d)A/, "$1 A"))}` : ""}</p></div>
          <div class="charge-row"><p class="ck">Float / standby</p><p class="${cvClass(s.floatV)}">${esc(s.floatV)}</p><p class="cn">at 25 °C</p></div>
        </div>
        <div class="elev-box">
          <p class="mono cap">Case, to scale · mm</p>
          ${elevations(d)}
        </div>
        ${
          s.endVoltage.length
            ? `<div class="endv"><p class="mono cap">End voltage by discharge current</p><table class="mini">${s.endVoltage
                .map((e) => `<tr><th>${esc(e.current.replace("0.05C or below or Intermittent discharge", "0.05C or less, or intermittent").replace(/ of current close to it/, ", or close to it"))}</th><td>${esc(e.endV)} V</td></tr>`)
                .join("")}</table></div>`
            : ""
        }
      </div>
    </div>
    ${
      s.chargeVsTemp?.tempC
        ? `<div class="ct">
      <div class="ct-head"><p class="mono cap">Charge voltage against temperature · per cell</p>
        <p class="legend mono"><span class="k k--cycle"></span>Cycle charge <span class="k k--float"></span>Float charge</p></div>
      ${chargeChart(s.chargeVsTemp)}
      <table class="ct-t mono">
        <tr><th>°C</th>${s.chargeVsTemp.tempC.map((v) => `<td>${v}</td>`).join("")}</tr>
        <tr><th>Cycle</th>${s.chargeVsTemp.cycle.map((v) => `<td>${v.toFixed(2)}</td>`).join("")}</tr>
        <tr><th>Float</th>${s.chargeVsTemp.float.map((v) => `<td>${v.toFixed(2)}</td>`).join("")}</tr>
      </table>
      <p class="fine">Volts per cell. Multiply by ${cells} for the ${esc(s.voltage)} battery${cells > 1 ? ` (at 25 °C: ${(s.chargeVsTemp.cycle[s.chargeVsTemp.tempC.indexOf(25)] * cells).toFixed(2)} V cycle, ${(s.chargeVsTemp.float[s.chargeVsTemp.tempC.indexOf(25)] * cells).toFixed(2)} V float)` : ""}.</p>
    </div>`
        : ""
    }
    ${foot(s, 2)}
  </section>`;
}

function dischargeTable(t, unit) {
  return `<table class="dt mono">
    <thead><tr><th>End V<br>per cell</th>${t.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
    <tbody>${t.rows.map((r) => `<tr><th>${esc(r.endV)}</th>${r.values.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>`;
}

function dischargePage(s, p) {
  return `<section class="page paper">
    ${runningHead(s, p)}
    ${sectionTitle("02", "Discharge performance", "Manufacturer's data at 25 °C")}
    <div class="dblock">
      <div class="dhead"><h3>Constant current discharge</h3><p class="mono cap">Amperes · by end voltage per cell and duration</p></div>
      ${dischargeTable(s.constantCurrent)}
    </div>
    <div class="dblock">
      <div class="dhead"><h3>Constant power discharge</h3><p class="mono cap">Watts per cell · by end voltage per cell and duration</p></div>
      ${dischargeTable(s.constantPower)}
    </div>
    <div class="why">
      <p class="mono cap">Why lead crystal</p>
      <div class="why-grid">
        <div><h4>Performance</h4><p>Discharges deeper and cycles more often, in extreme heat and cold too, and recovers to full rated capacity again and again for a longer service life.</p></div>
        <div><h4>Technology</h4><p>Micro-porous absorbent glass mat, high-purity lead calcium selenium plates and an SiO<sub>2</sub> electrolyte that sets into a white crystalline powder.</p></div>
        <div><h4>Cleaner and safer</h4><p>Less acid, no cadmium and no antimony. Up to 99% recyclable and classed as non-hazardous goods for transport.</p></div>
        <div><h4>Where it works</h4><p>Telecoms, UPS, petrochemical and marine, defence, renewable energy, health care, manufacturing, transport and electric mobility.</p></div>
      </div>
      <p class="certs mono"><span>ISO 9001</span><span>ISO 14001</span><span>CE</span><span>UL</span><span>IEC</span><span>99% recyclable</span></p>
    </div>
    ${foot(s, 3)}
  </section>`;
}

function curvesPage(s, p) {
  const svgPath = path.join(CURVES, `${s.sku}.svg`);
  if (!fs.existsSync(svgPath)) throw new Error(`no curves for ${s.sku}: run extract.py --curves`);
  const svg = fs.readFileSync(svgPath, "utf8").replace(/^<\?xml[^>]*>\s*/, "");
  return `<section class="page paper">
    ${runningHead(s, p)}
    ${sectionTitle("03", "Performance curves", "Manufacturer's test curves")}
    <div class="curves">${svg}</div>
    <div class="close">
      <img src="${fileUrl(path.join(HERE, "assets/logo-white.png"))}" alt="Leadcrystal" class="close-logo">
      <div class="close-c mono">
        <p><span>Sales and quotes</span>info@leadcrystal.co</p>
        <p><span>Tenders</span>bidteam@leadcrystal.co</p>
        <p><span>Web</span>leadcrystal.co</p>
      </div>
      <p class="close-n">Figures are the manufacturer's test data and may change without notice. Confirm critical values with Leadcrystal before you order. Lead Crystal Technologies, in partnership with Bin Othaimeen Group in the Middle East and North Africa.</p>
    </div>
    ${foot(s, 4)}
  </section>`;
}

// ---------- document ----------
const font = (family, file, weight, style = "normal") =>
  `@font-face{font-family:"${family}";src:url("${fileUrl(path.join(HERE, "fonts", file))}");font-weight:${weight};font-style:${style}}`;

const CSS = fs.readFileSync(path.join(HERE, "sheet.css"), "utf8");
const FONTS = [
  font("LC Archivo", "Archivo-400.ttf", 400),
  font("LC Archivo", "Archivo-500.ttf", 500),
  font("LC Archivo", "Archivo-600.ttf", 600),
  font("LC Archivo", "Archivo-700.ttf", 700),
  font("LC Archivo X", "ArchivoX-700.ttf", 700),
  font("LC Archivo X", "ArchivoX-800.ttf", 800),
  font("LC Plex Mono", "ibm-plex-mono-latin-400-normal.woff2", 400),
  font("LC Plex Mono", "ibm-plex-mono-latin-500-normal.woff2", 500),
].join("\n");

function html(sku) {
  const s = SPECS[sku];
  const p = PRODUCTS.get(sku);
  if (!s || !p) throw new Error(`unknown SKU ${sku}`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(sku)} ${esc(s.voltage)} ${esc(ah(s.ratedCapacity))} lead crystal battery · Technical data sheet</title>
<meta name="author" content="Leadcrystal"><meta name="subject" content="Technical data sheet">
<style>${FONTS}\n${CSS}</style></head><body>
${cover(s, p)}${specPage(s, p)}${dischargePage(s, p)}${curvesPage(s, p)}
</body></html>`;
}

function chrome(htmlFile, pdfFile) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lc-sheet-"));
  return new Promise((resolve, reject) => {
    const c = spawn(CHROME, [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profile}`,
      "--allow-file-access-from-files",
      "--no-pdf-header-footer",
      "--virtual-time-budget=8000",
      `--print-to-pdf=${pdfFile}`,
      fileUrl(htmlFile),
    ]);
    let err = "";
    c.stderr.on("data", (d) => (err += d));
    c.on("close", (code) => {
      fs.rmSync(profile, { recursive: true, force: true });
      code === 0 && fs.existsSync(pdfFile) ? resolve() : reject(new Error(`chrome ${code} for ${htmlFile}\n${err.slice(-800)}`));
    });
  });
}

const want = process.argv.slice(2);
const skus = want.length ? want : Object.keys(SPECS);
fs.mkdirSync(HTML, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const queue = [...skus];
let done = 0;
async function worker() {
  while (queue.length) {
    const sku = queue.shift();
    const h = path.join(HTML, `${sku}.html`);
    fs.writeFileSync(h, html(sku));
    await chrome(h, path.join(OUT, `${sku}.pdf`));
    done++;
    process.stdout.write(`\r${done}/${skus.length} ${sku}        `);
  }
}
await Promise.all(Array.from({ length: Math.min(6, skus.length) }, worker));
console.log(`\nwrote ${skus.length} sheets to ${path.relative(ROOT, OUT)}`);
