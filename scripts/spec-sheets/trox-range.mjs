// T-ROX range sheet: public/downloads/T-ROX-range-sheet.pdf (A4, two pages).
// Page 1: brand, AGM vs GEL and the headline figures. Page 2: every model from
// src/data/trox.json and the series matrix. Uses the same fonts and Chrome print as build.mjs.
//   node scripts/spec-sheets/trox-range.mjs
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = path.join(ROOT, "public/downloads/T-ROX-range-sheet.pdf");
const HTML = path.join(HERE, "build/html/T-ROX-range-sheet.html");
const trox = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/trox.json"), "utf8"));
const url = (p) => pathToFileURL(path.join(ROOT, p)).href;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const svg = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const font = (family, file, weight) =>
  `@font-face{font-family:"${family}";src:url("${pathToFileURL(path.join(HERE, "fonts", file)).href}");font-weight:${weight}}`;

const figures = [
  ["1,500+", "cycles", "at 80% depth of discharge, GEL"],
  ["3×", "faster charge", "than flooded lead-acid"],
  ["−20/+50", "°C", "operating range, GEL"],
  ["10+", "years", "service life, GEL"],
];
const matrix = [
  ["AGM", "3-CNFJ-AGM", "6V", "4–180Ah", "Emergency lighting, alarms, medical carts, mobility scooters, small UPS"],
  ["AGM", "6-CNFJ-AGM", "12V", "5–250Ah", "Car starting, mid-sized UPS, security, point of sale, backup power"],
  ["AGM", "6-CNFT-AGM", "12V", "55–190Ah", "Telecom base stations, radio towers, outdoor cabinets"],
  ["AGM", "6-HCNFJ-7.2-AGM", "12V", "9Ah", "High-rate UPS, server rooms, short high-current discharge"],
  ["AGM", "EVFJ-AGM", "6/8/12V", "60–265Ah", "Golf cars, EVs, floor cleaners, aerial platforms, material handling"],
  ["AGM", "CNFJ-AGM", "2V", "100–3,000Ah", "Large UPS, data centres, substations, switchgear, renewables"],
  ["GEL", "3-CNFJ-GEL", "6V", "4–180Ah", "Emergency lighting, alarms, mobility scooters, medical carts, small UPS"],
  ["GEL", "6-CNFJ-GEL", "12V", "5–250Ah", "Off-grid solar, marine starting, RV auxiliary, security, UPS"],
  ["GEL", "6-CNFT-GEL", "12V", "55–190Ah", "Remote base stations, outdoor cabinets, high-temperature sites"],
  ["GEL", "EVFJ-GEL", "6/8/12V", "60–265Ah", "Golf cars, EVs, floor cleaners, marine traction, airport ground support"],
  ["GEL", "CNFJ-GEL", "2V", "100–3,000Ah", "Large UPS, off-grid solar and wind, substations, oil and gas"],
];

const dims = (m) => (m.l ? `${m.l} × ${m.w} × ${m.h}${m.th && m.th !== m.h ? `/${m.th}` : ""}` : "on request");
const modelRows = trox.series
  .map(
    (s) => `<tr class="grp"><th colspan="8">${s.label} <span>Float ${esc(s.float)} · Cycle ${esc(s.cycle)}</span></th></tr>` +
      s.models
        .map(
          (m) => `<tr><td class="codes">${m.trox.map(esc).join(" · ")}</td><td>${s.voltage}V ${m.ah}Ah</td><td>${dims(m)}</td><td>${m.kg ? `${m.kg}` : "–"}</td><td>${esc(m.terminal)}</td><td>${m.floatA ? `${m.floatA} / ${m.cycleA}` : "–"}</td><td>${m.container.toLocaleString("en-US")}</td><td class="lc">${esc(m.lc)}</td></tr>`,
        )
        .join(""),
  )
  .join("");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>T-ROX range sheet · AGM and GEL sealed lead-acid batteries</title>
<style>
${font("A", "Archivo-400.ttf", 400)}${font("A", "Archivo-500.ttf", 500)}${font("A", "Archivo-600.ttf", 600)}${font("A", "Archivo-700.ttf", 700)}
${font("AX", "ArchivoX-700.ttf", 700)}${font("AX", "ArchivoX-800.ttf", 800)}
${font("M", "ibm-plex-mono-latin-400-normal.woff2", 400)}${font("M", "ibm-plex-mono-latin-500-normal.woff2", 500)}
@page{size:A4;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:"A",Arial,sans-serif;font-size:8.4pt;line-height:1.45;color:#16161d}
.page{position:relative;width:210mm;height:297mm;overflow:hidden;display:flex;flex-direction:column;break-after:page}
.page:last-child{break-after:auto}
.mono{font-family:"M",Menlo,monospace}
.cap{font-family:"M";font-size:6.3pt;font-weight:500;letter-spacing:.14em;text-transform:uppercase}
/* cover */
.dark{background:#0b0b0e;color:#eeeef1;padding:14mm}
.dark::before{content:"";position:absolute;inset:auto -30mm -40mm 40mm;height:190mm;background:radial-gradient(closest-side,rgba(255,150,30,.26),transparent 70%)}
.dark>*{position:relative}
.top{display:flex;justify-content:space-between;align-items:center;padding-bottom:5mm;border-bottom:.2mm solid rgba(255,255,255,.14)}
.top .cap{color:#a1a3ad}
.logo svg{width:92mm;height:auto;display:block;margin-top:14mm}
h1{font-family:"AX";font-weight:800;font-size:31pt;line-height:.98;letter-spacing:-.035em;margin-top:8mm;max-width:150mm}
.lede{margin-top:5mm;max-width:120mm;font-size:10pt;line-height:1.55;color:#a1a3ad}
.hero{width:172mm;margin:8mm -4mm 0 auto;display:block;filter:drop-shadow(0 8mm 10mm rgba(0,0,0,.6))}
.figs{display:grid;grid-template-columns:repeat(4,1fr);gap:2.4mm;margin-top:auto}
.fig{padding:3.4mm;border:.2mm solid rgba(255,255,255,.12);border-top:.6mm solid #ffb81c;border-radius:1.4mm;background:rgba(18,18,23,.85)}
.fig b{display:block;font-family:"AX";font-weight:800;font-size:17pt;letter-spacing:-.02em;line-height:1}
.fig b small{font-family:"A";font-size:7.5pt;font-weight:500;letter-spacing:0;color:#a1a3ad;margin-left:1mm}
.fig span{display:block;margin-top:1.4mm;font-size:6.6pt;color:#8a8c96}
.chem{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin-top:3mm}
.c{padding:4mm;border:.2mm solid rgba(255,255,255,.14);border-radius:1.4mm;background:linear-gradient(160deg,rgba(255,184,28,.08),rgba(255,184,28,0) 50%),rgba(18,18,23,.85)}
.c .cap{color:#ffb81c}
.c h2{font-family:"AX";font-weight:700;font-size:13pt;letter-spacing:-.01em;margin-top:1.6mm}
.c h2 em{font-style:normal;color:#ffb81c}
.c p{margin-top:1.6mm;font-size:7.6pt;color:#a1a3ad}
.c p b{color:#eeeef1;font-weight:600}
.foot{display:flex;justify-content:space-between;margin-top:6mm;padding-top:3mm;border-top:.2mm solid rgba(255,255,255,.12);font-family:"M";font-size:6.2pt;letter-spacing:.06em;color:#8a8c96}
.foot span+span{margin-left:4mm}
/* table page */
.paper{background:#fff;padding:12mm 14mm 9mm}
.paper::before{content:"";position:absolute;inset:0 0 auto;height:1.8mm;background:linear-gradient(90deg,#ff8a1f,#ffb81c 55%,#ffd54a)}
.rh{display:flex;justify-content:space-between;align-items:center;padding-bottom:3.4mm;border-bottom:.2mm solid #e6e5ee}
.rh svg{width:34mm;height:auto;display:block}
.rh .cap{color:#5b5d68}
h3{font-family:"AX";font-weight:800;font-size:18pt;letter-spacing:-.035em;margin:6mm 0 1.5mm}
.note{font-size:7pt;color:#5b5d68;margin-bottom:3mm}
table{width:100%;border-collapse:collapse}
.models th,.models td{padding:1.05mm 1mm;border-bottom:.2mm solid #e6e5ee;text-align:left;font-size:7pt;vertical-align:middle}
.models thead th{font-family:"M";font-size:5.7pt;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:#a35f00;background:#fff6e3;border-bottom:.3mm solid #ffb81c}
.models td{font-family:"M"}
.models td.codes{font-weight:500;line-height:1.3}
.models td.lc{color:#5b3bff}
.models .grp th{padding-top:3mm;font-family:"A";font-weight:700;font-size:8pt;border-bottom:.3mm solid #16161d}
.models .grp span{margin-left:3mm;font-family:"M";font-weight:400;font-size:6.4pt;color:#5b5d68}
.matrix{margin-top:1mm}
.matrix td{padding:1.1mm 1mm;border-bottom:.2mm solid #e6e5ee;font-size:6.9pt;vertical-align:top}
.matrix td.k{font-family:"M";font-weight:500;color:#a35f00;width:9mm}
.matrix td.s{font-family:"M";font-weight:500;width:30mm}
.matrix td.v{font-family:"M";width:14mm}
.matrix td.a{font-family:"M";width:21mm}
.matrix td.u{color:#5b5d68}
.paper .foot{margin-top:auto;border-top-color:#e6e5ee;color:#5b5d68}
</style></head><body>
<section class="page dark">
  <div class="top"><span class="cap">Range sheet · AGM and GEL</span><span class="cap">Sealed lead-acid (VRLA)</span></div>
  <div class="logo">${svg("public/images/trox/t-rox-logo-white.svg")}</div>
  <h1>Powering progress. Energizing industry.</h1>
  <p class="lede">Sealed, maintenance-free lead-acid batteries from the Bin Othaimeen Group: AGM for fast recharge and high-rate power, GEL for heat, deep cycling and long service life. 2V to 12V, 4Ah to 3,000Ah.</p>
  <img class="hero" src="${url("public/images/trox/range-group.webp")}" alt="">
  <div class="figs">${figures.map(([v, u, n]) => `<div class="fig"><b>${v}<small>${u}</small></b><span>${n}</span></div>`).join("")}</div>
  <div class="chem">
    <div class="c"><p class="cap">Fast · powerful · responsive</p><h2><em>AGM</em> Absorbent glass mat</h2><p>Electrolyte absorbed in fibreglass mats: fast recharge, high-rate discharge and vibration resistance.</p><p><b>Best for</b> UPS, engine starting and dynamic loads.</p></div>
    <div class="c"><p class="cap">Steady · resilient · thermal control</p><h2><em>GEL</em> Silica gel electrolyte</h2><p>Electrolyte held in silica gel: better heat tolerance, deeper discharge and up to 30% longer cycle life than standard AGM.</p><p><b>Best for</b> extreme heat, deep cycling and renewable storage.</p></div>
  </div>
  <div class="foot"><p><span>leadcrystal.co/t-rox</span><span>info@leadcrystal.co</span><span>Distributed by Bin Othaimeen Group, Riyadh</span></p><p>01 / 02</p></div>
</section>
<section class="page paper">
  <div class="rh">${svg("public/images/trox/t-rox-logo-ink.svg")}<span class="cap">Range sheet · standard models</span></div>
  <h3>Standard range</h3>
  <p class="note">Factory dimensions (L × W × H / total height, mm) and weights. Max charge current is float / cycle in amperes. Each model shares its case with the Leadcrystal battery in the last column.</p>
  <table class="models">
    <thead><tr><th>T-ROX</th><th>Rating</th><th>Size mm</th><th>kg</th><th>Terminal</th><th>Max charge A</th><th>Per 22 t container</th><th>Leadcrystal twin</th></tr></thead>
    <tbody>${modelRows}</tbody>
  </table>
  <h3>Series</h3>
  <table class="matrix"><tbody>${matrix.map(([k, s, v, a, u]) => `<tr><td class="k">${k}</td><td class="s">${s}</td><td class="v">${v}</td><td class="a">${a}</td><td class="u">${u}</td></tr>`).join("")}</tbody></table>
  <div class="foot"><p><span>leadcrystal.co/t-rox</span><span>info@leadcrystal.co</span><span>Prices and container quotes on request</span></p><p>02 / 02</p></div>
</section>
</body></html>`;

fs.mkdirSync(path.dirname(HTML), { recursive: true });
fs.writeFileSync(HTML, html);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "trox-sheet-"));
await new Promise((resolve, reject) => {
  const c = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${profile}`, "--no-pdf-header-footer", "--virtual-time-budget=8000", `--print-to-pdf=${OUT}`, pathToFileURL(HTML).href]);
  c.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`chrome exited ${code}`))));
});
fs.rmSync(profile, { recursive: true, force: true });
console.log("wrote", path.relative(ROOT, OUT));
