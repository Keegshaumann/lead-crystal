// Motion for every page except the homepage, which has its own choreography in home.ts.
// Scroll position is the timeline: blocks rise in as they enter and settle back when you
// scroll up past them, images drift at their own pace, counters run with the page.
// Page-head intros are pure CSS (global.css, "Motion" section) so they never wait on JS.
// Nothing here runs for people who ask for reduced motion, and nothing hides content
// from keyboards or screen readers (opacity only, never visibility).
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./smooth";

const root = document.documentElement;
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (root.dataset.motion === "on" && !reduce) {
  gsap.registerPlugin(ScrollTrigger);
  const lenis = (window as any).__lenis;
  if (lenis) lenis.on("scroll", ScrollTrigger.update);

  // ---------- reveals ----------
  // [selector, stagger]. Anything inside a hidden tab panel is left alone (see the tab hook below).
  const groups: [string, number][] = [
    [".section-head > *, .std-head > *, .range-head > *, .rel-head, .std-series-head", 0.08],
    [
      ".std-card, .tx-figs > li, .tx-chem-card, .tx-match > li, .attrs > li, .rel > *, .trox-band, .std-cta, .tx-tabs, .end-cta, .contact .block, .ab-card, .figs > li, .time > li, .brands, .site-footer .group",
      0.07,
    ],
    [".spec-table tbody tr, .tx-panel:not([hidden]) .tx-panel-head, .tx-panel:not([hidden]) tbody tr", 0.035],
  ];
  const seen = new Set<Element>();
  for (const [selector, stagger] of groups) {
    const els = gsap.utils.toArray<HTMLElement>(selector).filter((el) => {
      if (seen.has(el) || el.closest("[data-panel][hidden], [data-no-motion]")) return false;
      seen.add(el);
      return true;
    });
    if (!els.length) continue;
    els.forEach((el) => el.classList.add("mo"));
    gsap.set(els, { opacity: 0, y: 26 });
    ScrollTrigger.batch(els, {
      start: "top 90%",
      onEnter: (batch) => {
        batch.forEach((el) => el.classList.add("is-in"));
        gsap.to(batch, { opacity: 1, y: 0, duration: 0.85, ease: "power3.out", stagger, overwrite: true });
      },
      onLeaveBack: (batch) => {
        batch.forEach((el) => el.classList.remove("is-in"));
        gsap.to(batch, { opacity: 0, y: 26, duration: 0.45, ease: "power2.in", stagger: stagger / 2, overwrite: true });
      },
    });
  }

  // Tab switches (T-ROX series tables): the newly shown rows cascade in.
  document.addEventListener("panel:shown", (e) => {
    const panel = (e as CustomEvent<HTMLElement>).detail;
    gsap.fromTo(
      panel.querySelectorAll(".tx-panel-head, tbody tr"),
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", stagger: 0.04, overwrite: true },
    );
  });

  // ---------- parallax (scrubbed) ----------
  // [selector, drift in % of the element's height across its pass through the viewport]
  const drift: [string, number][] = [
    [".ph-media", 16],
    [".ahead .g", 22],
    [".prod .visual > :first-child", -9],
    [".tx-visual img", -12],
    [".tx-unit", 26],
    [".tx-glow", 30],
  ];
  for (const [selector, amount] of drift) {
    gsap.utils.toArray<HTMLElement>(selector).forEach((el) => {
      gsap.fromTo(
        el,
        { yPercent: -amount / 2 },
        {
          yPercent: amount / 2,
          ease: "none",
          scrollTrigger: { trigger: el.parentElement ?? el, start: "top bottom", end: "bottom top", scrub: true },
        },
      );
    });
  }

  // ---------- counters ----------
  // A figure like "1,500+" counts up from 0 as it enters; its unit and suffix stay put.
  gsap.utils.toArray<HTMLElement>(".tx-fig, .fig[data-count]").forEach((el) => {
    const node = el.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    const raw = node.textContent ?? "";
    const m = raw.trim().match(/^([\d,]+(?:\.\d+)?)(.*)$/);
    if (!m) return;
    const target = parseFloat(m[1].replace(/,/g, ""));
    const decimals = (m[1].split(".")[1] ?? "").length;
    const fmt = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + m[2];
    const state = { v: 0 };
    const tween = gsap.to(state, {
      v: target,
      duration: 1.6,
      ease: "power2.out",
      paused: true,
      onUpdate: () => (node.textContent = fmt(state.v)),
    });
    node.textContent = fmt(0);
    ScrollTrigger.create({
      trigger: el,
      start: "top 92%",
      onEnter: () => tween.play(),
      onLeaveBack: () => tween.reverse(),
    });
  });

  // ---------- reading progress (articles) ----------
  const prose = document.querySelector<HTMLElement>(".prose");
  if (prose) {
    const bar = document.createElement("div");
    bar.className = "read-progress";
    bar.setAttribute("aria-hidden", "true");
    document.body.append(bar);
    gsap.fromTo(
      bar,
      { scaleX: 0 },
      { scaleX: 1, ease: "none", scrollTrigger: { trigger: prose, start: "top 60%", end: "bottom 60%", scrub: 0.2 } },
    );
  }

  // Images and fonts change heights after load; keep the triggers honest.
  window.addEventListener("load", () => ScrollTrigger.refresh());
}

// ---------- cursor spotlight on cards (fine pointers only, cheap: two custom properties) ----------
const SPOT = ".card, .std-card, .tx-chem-card, .tx-match > li, .tx-figs > li, .trox-band, .acard, .ab-card";
if (!reduce && window.matchMedia("(pointer: fine)").matches) {
  document.addEventListener(
    "pointermove",
    (e) => {
      const card = (e.target as Element | null)?.closest?.<HTMLElement>(SPOT);
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    },
    { passive: true },
  );
}
