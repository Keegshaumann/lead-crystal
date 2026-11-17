// Homepage choreography. GSAP ScrollTrigger is the single scroll spine; everything that
// moves with the page is scrubbed, so scrolling back rewinds it. Content is fully visible
// without JS: GSAP owns every "from" state.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { CrystalScene } from "./crystal-scene";
import "./smooth"; // makes sure Lenis exists before we hook ScrollTrigger to it
import { heroFx } from "./hero-fx";

gsap.registerPlugin(ScrollTrigger);

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(s));

const lenis = (window as any).__lenis;
if (lenis) lenis.on("scroll", ScrollTrigger.update);

/* ---------------- Background videos: play only while on screen ---------------- */
function videos() {
  const vids = $$<HTMLVideoElement>("video[data-bgvideo]");
  if (reduce) {
    vids.forEach((v) => {
      v.removeAttribute("autoplay");
      v.pause();
    });
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const v = e.target as HTMLVideoElement;
        if (e.isIntersecting) {
          if (v.preload === "none") v.preload = "auto";
          v.play().catch(() => {});
        } else v.pause();
      }
    },
    { rootMargin: "120px 0px" },
  );
  vids.forEach((v) => io.observe(v));
}

/* ---------------- Counters ---------------- */
function counters() {
  const els = $$<HTMLElement>("[data-count]");
  const fmt = (n: number, dec: number) =>
    dec ? n.toFixed(dec) : Math.round(n).toLocaleString("en-US");
  if (reduce) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        const el = e.target as HTMLElement;
        const to = parseFloat(el.dataset.count || "0");
        const dec = parseInt(el.dataset.dec || "0", 10);
        const t0 = performance.now();
        const dur = 1600;
        const tick = (now: number) => {
          const k = Math.min(1, (now - t0) / dur);
          const eased = 1 - Math.pow(1 - k, 4);
          el.firstChild!.nodeValue = fmt(to * eased, dec);
          if (k < 1) requestAnimationFrame(tick);
        };
        el.firstChild!.nodeValue = fmt(0, dec);
        requestAnimationFrame(tick);
      }
    },
    { threshold: 0.4 },
  );
  els.forEach((el) => {
    if (!el.firstChild) el.textContent = el.textContent || "";
    io.observe(el);
  });
}

/* ---------------- Heat simulator ---------------- */
function simulator() {
  const root = $("[data-sim]");
  if (!root) return;
  const input = $<HTMLInputElement>("[data-sim-input]", root)!;
  const out = $<HTMLOutputElement>("[data-sim-out]", root)!;
  const rows = $$<HTMLElement>("[data-chem]", root);
  const min = parseFloat(input.min);
  const max = parseFloat(input.max);
  const colour = (t: number) => {
    // cool blue → violet → amber → red
    const stops: [number, [number, number, number]][] = [
      [-40, [90, 176, 255]],
      [10, [190, 201, 255]],
      [40, [255, 176, 92]],
      [70, [255, 77, 77]],
    ];
    for (let i = 0; i < stops.length - 1; i++) {
      const [ta, ca] = stops[i];
      const [tb, cb] = stops[i + 1];
      if (t <= tb) {
        const k = Math.max(0, (t - ta) / (tb - ta));
        return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * k)).join(",")})`;
      }
    }
    return "rgb(255,77,77)";
  };
  const update = () => {
    const t = parseFloat(input.value);
    const sign = t > 0 ? "+" : t < 0 ? "−" : "";
    out.value = `${sign}${Math.abs(t)}°C`;
    out.textContent = out.value;
    root.style.setProperty("--heat-col", colour(t));
    const pos = ((t - min) / (max - min)) * 100;
    for (const r of rows) {
      const ok = t >= parseFloat(r.dataset.min!) && t <= parseFloat(r.dataset.max!);
      r.classList.toggle("is-out", !ok);
      const pill = $("[data-pill]", r)!;
      pill.textContent = ok ? "In range" : "Out of range";
      ($("[data-mark]", r) as HTMLElement).style.left = pos + "%";
    }
    input.setAttribute("aria-valuetext", out.value);
  };
  input.addEventListener("input", update);
  update();
}

/* ---------------- Card tilt (fine pointers only) ---------------- */
function tilt() {
  if (!finePointer || reduce) return;
  for (const el of $$<HTMLElement>("[data-tilt]")) {
    const rx = gsap.quickTo(el, "rotationX", { duration: 0.6, ease: "power3" });
    const ry = gsap.quickTo(el, "rotationY", { duration: 0.6, ease: "power3" });
    gsap.set(el, { transformPerspective: 900 });
    let rect: DOMRect | null = null;
    el.addEventListener("pointerenter", () => (rect = el.getBoundingClientRect()));
    el.addEventListener("pointermove", (e) => {
      if (!rect) return;
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      ry(x * 10);
      rx(-y * 8);
    });
    el.addEventListener("pointerleave", () => {
      rect = null;
      rx(0);
      ry(0);
    });
  }
}

/* ---------------- The particle scene (How it works) ---------------- */
function science() {
  const section = $("[data-science]");
  const canvas = $<HTMLCanvasElement>("[data-crystal-canvas]");
  const steps = $("[data-steps]");
  if (!section || !canvas || !steps) return;

  const hudNum = $("[data-hud-num]", section);
  const hudBar = $("[data-hud-bar]", section);
  const hudSteps = $$<HTMLElement>("[data-hud-step]", section);
  const N = hudSteps.length || 4;

  let scene: CrystalScene | null = null;
  let formation = 0;
  let inView = false;

  const fallback = () => document.documentElement.classList.add("no-3d");

  if (reduce) {
    fallback();
  } else {
    // load three.js only when the section is close
    const loader = new IntersectionObserver(
      async (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        loader.disconnect();
        try {
          const mod = await import("./crystal-scene");
          scene = mod.initCrystalScene(canvas);
          if (!scene) return fallback();
          scene.setFormation(formation);
          scene.setActive(inView);
        } catch {
          fallback();
        }
      },
      { rootMargin: "120% 0px" },
    );
    loader.observe(section);
  }

  ScrollTrigger.create({
    trigger: section,
    start: "top bottom",
    end: "bottom top",
    onToggle: (self) => {
      inView = self.isActive;
      scene?.setActive(inView);
    },
  });

  const smooth = (x: number) => x * x * (3 - 2 * x);
  ScrollTrigger.create({
    trigger: steps,
    start: "top top",
    end: "bottom bottom",
    onUpdate: (self) => {
      const p = self.progress * (N - 1);
      const i = Math.min(N - 2, Math.floor(p));
      const frac = p - i;
      // hold each formation while its copy is centred, morph in between
      formation = i + smooth(Math.min(1, Math.max(0, (frac - 0.22) / 0.56)));
      scene?.setFormation(formation);
      const active = Math.round(p);
      if (hudNum) hudNum.textContent = String(active + 1).padStart(2, "0");
      hudSteps.forEach((li, k) => li.classList.toggle("is-on", k === active));
      if (hudBar) hudBar.style.setProperty("--p", String(self.progress));
    },
  });

  // copy panels fade through, fully readable around each step's centre
  if (!reduce) {
    for (const step of $$("[data-step]", steps)) {
      const card = $(".step-card", step);
      if (!card) continue;
      gsap
        .timeline({
          scrollTrigger: { trigger: step, start: "top bottom", end: "bottom top", scrub: true },
        })
        .fromTo(card, { opacity: 0, y: 70 }, { opacity: 1, y: 0, ease: "none", duration: 0.35 })
        .to(card, { opacity: 1, duration: 0.3 })
        .to(card, { opacity: 0, y: -70, ease: "none", duration: 0.35 });
    }
  }

  // pointer pushes the particles
  if (finePointer) {
    let rect: DOMRect | null = null;
    const stage = $(".science-stage", section)!;
    section.addEventListener("pointerenter", () => (rect = stage.getBoundingClientRect()));
    section.addEventListener("pointermove", (e) => {
      if (!scene) return;
      rect ??= stage.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      scene.setPointer(x, y);
    });
    section.addEventListener("pointerleave", () => {
      rect = null;
      scene?.setPointer(NaN, NaN);
    });
    window.addEventListener("scroll", () => (rect = null), { passive: true });
  }

  let t = 0;
  window.addEventListener("resize", () => {
    clearTimeout(t);
    t = window.setTimeout(() => scene?.resize(), 150);
  });
}

/* ---------------- Scroll choreography ---------------- */
function choreography() {
  // page progress bar
  const bar = $("[data-progress]");
  ScrollTrigger.create({
    start: 0,
    end: "max",
    onUpdate: (self) => bar?.style.setProperty("--scroll", self.progress.toFixed(4)),
  });

  // accent per section
  for (const sec of $$<HTMLElement>("[data-accent]")) {
    ScrollTrigger.create({
      trigger: sec,
      start: "top center",
      end: "bottom center",
      onToggle: (self) => {
        if (self.isActive) document.documentElement.dataset.accent = sec.dataset.accent;
      },
    });
  }

  if (reduce) return;

  // hero: copy lifts away; the video keeps one zoom
  const hero = $("[data-hero]");
  if (hero) {
    gsap.to("[data-hero-copy]", {
      y: () => -window.innerHeight * 0.18,
      opacity: 0,
      ease: "none",
      scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true, invalidateOnRefresh: true },
    });
    gsap.to(".hero-foot .stats", {
      y: () => -window.innerHeight * 0.08,
      opacity: 0,
      ease: "none",
      scrollTrigger: { trigger: hero, start: "top top", end: "70% top", scrub: true, invalidateOnRefresh: true },
    });
  }

  // manifesto: words light up as you read
  const words = $$(".manifesto-text .w");
  if (words.length) {
    gsap.fromTo(
      words,
      { opacity: 0.14 },
      {
        opacity: 1,
        ease: "none",
        stagger: 0.1,
        scrollTrigger: { trigger: ".manifesto-text", start: "top 78%", end: "bottom 42%", scrub: true },
      },
    );
  }

  // crystal band: the frame opens out to full bleed
  const band = $("[data-band]");
  if (band) {
    gsap.fromTo(
      "[data-band-media]",
      { clipPath: "inset(9% 7% 9% 7% round 28px)" },
      {
        clipPath: "inset(0% 0% 0% 0% round 0px)",
        ease: "none",
        scrollTrigger: { trigger: band, start: "top bottom", end: "top top", scrub: true },
      },
    );
    gsap.fromTo(
      "[data-band-copy]",
      { y: 80 },
      { y: -40, ease: "none", scrollTrigger: { trigger: band, start: "top bottom", end: "bottom top", scrub: true } },
    );
  }

  // generic reveals (reverse on the way back up)
  for (const el of $$("[data-rv]")) {
    gsap.fromTo(
      el,
      { opacity: 0, y: 40 },
      {
        opacity: 1,
        y: 0,
        duration: 0.9,
        ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 88%", toggleActions: "play none none reverse" },
      },
    );
  }

  // performance tiles
  const ticks = $$<SVGLineElement>("[data-ticks] line");
  if (ticks.length) {
    gsap.fromTo(
      ticks,
      { opacity: 0.12 },
      {
        opacity: 1,
        stagger: 0.02,
        ease: "none",
        scrollTrigger: { trigger: ".tile--cycles", start: "top 80%", end: "bottom 50%", scrub: true },
      },
    );
  }
  const charge = $("[data-charge]");
  if (charge) {
    gsap.fromTo(
      charge,
      { attr: { "stroke-dashoffset": 100 } },
      {
        attr: { "stroke-dashoffset": 0 },
        ease: "none",
        scrollTrigger: { trigger: ".tile--charge", start: "top 85%", end: "bottom 55%", scrub: true },
      },
    );
  }
  const bars = $$(".rg-bar");
  if (bars.length) {
    gsap.fromTo(
      bars,
      { scaleX: 0 },
      {
        scaleX: 1,
        stagger: 0.12,
        ease: "none",
        scrollTrigger: { trigger: ".tile--temp", start: "top 85%", end: "top 40%", scrub: true },
      },
    );
  }

  // the range: horizontal conveyor on wide screens, swipe strip elsewhere
  const mm = gsap.matchMedia();
  mm.add("(min-width: 1000px) and (min-height: 640px)", () => {
    const pin = $("[data-range-pin]");
    const rail = $("[data-rail]");
    const track = $("[data-rail-track]");
    if (!pin || !rail || !track) return;
    rail.style.overflowX = "visible";
    const dist = () => Math.max(0, track.scrollWidth - rail.clientWidth + 2 * parseFloat(getComputedStyle(rail).paddingLeft));
    gsap.to(track, {
      x: () => -dist(),
      ease: "none",
      scrollTrigger: {
        trigger: pin,
        start: "top top",
        end: () => "+=" + dist(),
        pin: true,
        scrub: 1,
        invalidateOnRefresh: true,
      },
    });
    return () => {
      rail.style.overflowX = "";
    };
  });
}

videos();
heroFx();
counters();
simulator();
tilt();
science();
choreography();

// fonts and lazy media change heights; re-measure once everything has settled
window.addEventListener("load", () => ScrollTrigger.refresh());
