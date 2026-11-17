// "Will it fit?" Draws every battery in a range as an isometric box at true relative scale,
// lined up on one floor, and checks each against the space the visitor types in.
type Item = {
  id: string;
  title: string;
  sub: string;
  ah: number;
  ahLabel: string;
  l: number;
  w: number;
  h: number;
  kg: string;
  terminal: string;
  href: string;
  cta: string;
  img: string | null;
};
type Group = { key: string; label: string; items: Item[] };

const root = document.querySelector<HTMLElement>("[data-fit]");
const json = root?.querySelector<HTMLScriptElement>("[data-fit-json]");

if (root && json) {
  const { groups, start } = JSON.parse(json.textContent || "{}") as { groups: Group[]; start: { group: string; id: string } };
  const NS = "http://www.w3.org/2000/svg";
  const C = Math.cos(Math.PI / 6);
  const S = 0.5;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const stage = root.querySelector<HTMLElement>("[data-fit-stage]")!;
  const svg = root.querySelector<SVGSVGElement>("[data-fit-svg]")!;
  const range = root.querySelector<HTMLInputElement>("[data-fit-range]")!;
  const countEl = root.querySelector<HTMLElement>("[data-fit-count]")!;
  const rotateEl = root.querySelector<HTMLInputElement>("[data-fit-rotate]")!;
  const inputs = Array.from(root.querySelectorAll<HTMLInputElement>("[data-fit-dim]"));
  const card = {
    photo: root.querySelector<HTMLElement>("[data-fit-photo]")!,
    status: root.querySelector<HTMLElement>("[data-fit-status]")!,
    title: root.querySelector<HTMLElement>("[data-fit-title]")!,
    sub: root.querySelector<HTMLElement>("[data-fit-sub]")!,
    specs: root.querySelector<HTMLElement>("[data-fit-specs]")!,
    link: root.querySelector<HTMLAnchorElement>("[data-fit-link]")!,
  };

  let group = groups.find((g) => g.key === start.group) ?? groups[0];
  let sel = Math.max(0, group.items.findIndex((i) => i.id === start.id));
  let layout: { x: number; cx: number }[] = [];
  let boxes: SVGGElement[] = [];
  let scale = 1;
  let originY = 0;
  let tOffsets: number[] = [];

  const space = () => {
    const v = Object.fromEntries(inputs.map((i) => [i.dataset.fitDim!, parseFloat(i.value) || 0])) as { l: number; w: number; h: number };
    return v;
  };
  const hasSpace = () => inputs.some((i) => parseFloat(i.value) > 0);
  const fits = (it: Item) => {
    const s = space();
    const okH = !s.h || it.h <= s.h;
    const plain = (!s.l || it.l <= s.l) && (!s.w || it.w <= s.w);
    const turned = rotateEl.checked && (!s.l || it.w <= s.l) && (!s.w || it.l <= s.w);
    return okH && (plain || turned);
  };

  const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    parent?.appendChild(n);
    return n;
  };

  // world (mm) → screen (px). Box i stands at world (t, -t, 0): moving along (1,-1)
  // is horizontal on screen, so every box shares one floor plane.
  const P = (t: number, a: number, b: number, z: number) => {
    const x = t + a;
    const y = -t + b;
    return [(x - y) * C * scale, originY + (x + y) * S * scale - z * scale];
  };
  const pts = (arr: number[][]) => arr.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");

  function draw() {
    svg.textContent = "";
    const items = group.items;
    const H = stage.clientHeight;
    const padT = 46;
    const padB = 58;
    const maxH = Math.max(...items.map((i) => i.h));
    const maxFoot = Math.max(...items.map((i) => (i.l + i.w) * S));
    // fit the tallest box to the stage height, and the widest to about half the stage width
    // (phones), so several neighbours always stay in view
    const maxW = Math.max(...items.map((i) => (i.l + i.w) * C));
    scale = Math.max(0.05, Math.min((H - padT - padB) / (maxH * 1.08 + maxFoot), (stage.clientWidth * 0.5) / maxW));
    originY = padT + maxH * 1.08 * scale;

    // place boxes left to right with a fixed on-screen gap
    const gapPx = Math.max(28, stage.clientWidth * 0.025);
    tOffsets = [];
    let t = 0;
    items.forEach((it, i) => {
      if (i > 0) {
        const prev = items[i - 1];
        t += (prev.l + it.w) / 2 + gapPx / (2 * C * scale);
      }
      tOffsets.push(t);
    });
    const minX = Math.min(...items.map((it, i) => P(tOffsets[i], 0, it.w, 0)[0]));
    const shift = -minX + 40;
    const maxX = Math.max(...items.map((it, i) => P(tOffsets[i], it.l, 0, 0)[0])) + shift + 40;
    svg.setAttribute("width", String(Math.ceil(maxX)));
    svg.setAttribute("height", String(H));
    svg.setAttribute("viewBox", `0 0 ${Math.ceil(maxX)} ${H}`);

    const defs = el("defs", {}, svg);
    const grid = el("pattern", { id: "fit-grid", width: (2 * C * 40).toFixed(2), height: (2 * S * 40).toFixed(2), patternUnits: "userSpaceOnUse" }, defs);
    el("path", { d: `M0 0 L${2 * C * 40} ${2 * S * 40} M0 ${2 * S * 40} L${2 * C * 40} 0`, stroke: "rgba(190,201,255,0.07)", "stroke-width": 1, fill: "none" }, grid);
    const fade = el("linearGradient", { id: "fit-fade", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el("stop", { offset: "0", "stop-color": "#fff", "stop-opacity": 0 }, fade);
    el("stop", { offset: "0.45", "stop-color": "#fff", "stop-opacity": 1 }, fade);
    el("stop", { offset: "1", "stop-color": "#fff", "stop-opacity": 0.3 }, fade);
    const mask = el("mask", { id: "fit-mask" }, defs);
    el("rect", { x: 0, y: originY - 40, width: maxX, height: H - originY + 40, fill: "url(#fit-fade)" }, mask);
    const glow = el("filter", { id: "fit-glow", x: "-30%", y: "-30%", width: "160%", height: "160%" }, defs);
    el("feGaussianBlur", { stdDeviation: 8, result: "b" }, glow);
    const merge = el("feMerge", {}, glow);
    el("feMergeNode", { in: "b" }, merge);
    el("feMergeNode", { in: "SourceGraphic" }, merge);

    // floor grid
    el("rect", { x: 0, y: 0, width: maxX, height: H, fill: "url(#fit-grid)", mask: "url(#fit-mask)" }, svg);

    const world = el("g", { transform: `translate(${shift.toFixed(1)},0)` }, svg);
    const back = el("g", {}, world);
    const front = el("g", {}, world);
    const over = el("g", {}, world);
    (svg as any)._layers = { back, front, over };

    layout = [];
    boxes = items.map((it, i) => {
      const t0 = tOffsets[i];
      const g = el("g", { class: "bx", "data-i": i }, front) as SVGGElement;
      const L = it.l,
        W = it.w,
        Hh = it.h;
      // faces: front (y = W), side (x = L), top (z = H)
      el("polygon", { class: "f f-front", points: pts([P(t0, 0, W, 0), P(t0, L, W, 0), P(t0, L, W, Hh), P(t0, 0, W, Hh)]) }, g);
      el("polygon", { class: "f f-side", points: pts([P(t0, L, 0, 0), P(t0, L, W, 0), P(t0, L, W, Hh), P(t0, L, 0, Hh)]) }, g);
      el("polygon", { class: "f f-top", points: pts([P(t0, 0, 0, Hh), P(t0, L, 0, Hh), P(t0, L, W, Hh), P(t0, 0, W, Hh)]) }, g);
      // lid seam on the front and side
      const lid = Hh * 0.86;
      el("polyline", { class: "seam", points: pts([P(t0, 0, W, lid), P(t0, L, W, lid), P(t0, L, 0, lid)]) }, g);
      // terminals: red (+) and blue (-)
      const r = Math.max(1.6, Math.min(W, L) * 0.07 * scale);
      const tp = (a: number, b: number) => P(t0, a, b, Hh);
      const [x1, y1] = tp(L * 0.16, W * 0.5);
      const [x2, y2] = tp(L * 0.84, W * 0.5);
      el("ellipse", { class: "term", cx: x1, cy: y1 - r * 0.6, rx: r, ry: r * 0.58, fill: "#ff5a5a" }, g);
      el("ellipse", { class: "term", cx: x2, cy: y2 - r * 0.6, rx: r, ry: r * 0.58, fill: "#4f8bff" }, g);
      // capacity label under the box
      const [lx] = P(t0, L / 2, W / 2, 0);
      const [, ly] = P(t0, L, W, 0);
      const label = el("text", { class: "cap", x: lx, y: ly + 20, "text-anchor": "middle" }, g);
      label.textContent = it.ahLabel;
      const [cx] = P(t0, L / 2, W / 2, Hh / 2);
      layout.push({ x: lx, cx: cx + shift });
      g.addEventListener("click", () => select(i));
      return g;
    });

    paint();
  }

  function envelope() {
    const { back, over } = (svg as any)._layers as { back: SVGGElement; over: SVGGElement };
    back.textContent = "";
    over.textContent = "";
    const s = space();
    if (!(s.l > 0 && s.w > 0 && s.h > 0)) return;
    const it = group.items[sel];
    const t0 = tOffsets[sel];
    const ok = fits(it);
    const col = ok ? "#5fe3a1" : "#ff8a8a";
    // turn the outline with the battery if it only fits turned
    const plain = it.l <= s.l && it.w <= s.w;
    const [L, W] = !plain && rotateEl.checked && it.w <= s.l && it.l <= s.w ? [s.w, s.l] : [s.l, s.w];
    const Hh = s.h;
    const dash = { stroke: col, "stroke-width": 1.4, "stroke-dasharray": "5 5", fill: "none" };
    // hidden edges behind the battery
    el("polyline", { ...dash, opacity: 0.45, points: pts([P(t0, L, 0, 0), P(t0, 0, 0, 0), P(t0, 0, W, 0)]) }, back);
    el("line", { ...dash, opacity: 0.45, x1: P(t0, 0, 0, 0)[0], y1: P(t0, 0, 0, 0)[1], x2: P(t0, 0, 0, Hh)[0], y2: P(t0, 0, 0, Hh)[1] }, back);
    // visible faces in front, nearly clear so the battery shows through
    const face = { ...dash, fill: col, "fill-opacity": 0.05 };
    el("polygon", { ...face, points: pts([P(t0, 0, W, 0), P(t0, L, W, 0), P(t0, L, W, Hh), P(t0, 0, W, Hh)]) }, over);
    el("polygon", { ...face, points: pts([P(t0, L, 0, 0), P(t0, L, W, 0), P(t0, L, W, Hh), P(t0, L, 0, Hh)]) }, over);
    el("polygon", { ...face, points: pts([P(t0, 0, 0, Hh), P(t0, L, 0, Hh), P(t0, L, W, Hh), P(t0, 0, W, Hh)]) }, over);
  }

  function dimensions() {
    const { over } = (svg as any)._layers as { over: SVGGElement };
    const it = group.items[sel];
    const t0 = tOffsets[sel];
    const g = el("g", { class: "dims" }, over);
    const lab = (x: number, y: number, txt: string, anchor = "middle") => {
      const t = el("text", { x, y, "text-anchor": anchor, class: "dim" }, g);
      t.textContent = txt;
    };
    const [ax, ay] = P(t0, 0, it.w, 0);
    const [bx, by] = P(t0, it.l, it.w, 0);
    const [cx, cy] = P(t0, it.l, 0, 0);
    const [hx, hy] = P(t0, 0, it.w, it.h);
    el("line", { x1: ax, y1: ay + 34, x2: bx, y2: by + 34, class: "dline" }, g);
    lab((ax + bx) / 2, (ay + by) / 2 + 52, `L ${it.l}`);
    el("line", { x1: bx + 10, y1: by + 4, x2: cx + 10, y2: cy + 4, class: "dline" }, g);
    lab((bx + cx) / 2 + 26, (by + cy) / 2 + 12, `W ${it.w}`, "start");
    el("line", { x1: ax - 12, y1: ay, x2: hx - 12, y2: hy, class: "dline" }, g);
    lab(ax - 18, (ay + hy) / 2 + 4, `H ${it.h}`, "end");
  }

  function paint() {
    const any = hasSpace();
    let n = 0;
    group.items.forEach((it, i) => {
      const ok = !any || fits(it);
      if (any && ok) n++;
      const b = boxes[i];
      b.classList.toggle("is-sel", i === sel);
      b.classList.toggle("is-fit", any && ok);
      b.classList.toggle("is-out", any && !ok);
      if (i === sel) b.setAttribute("filter", "url(#fit-glow)");
      else b.removeAttribute("filter");
    });
    // the selected box draws last so its glow sits on top
    boxes[sel]?.parentNode?.appendChild(boxes[sel]);
    envelope();
    dimensions();

    countEl.innerHTML = any
      ? `<strong>${n}</strong> of ${group.items.length} ${group.label} models fit.`
      : "Enter any of the three to check fit.";

    // centre the selection
    const c = layout[sel];
    if (c) {
      const x = stage.clientWidth / 2 - c.cx;
      svg.style.transform = `translateX(${x.toFixed(1)}px)`;
    }

    const it = group.items[sel];
    range.max = String(group.items.length - 1);
    range.value = String(sel);
    range.setAttribute("aria-valuetext", `${it.ahLabel}, ${it.title}`);
    card.title.textContent = it.title;
    card.sub.textContent = it.sub;
    card.specs.innerHTML = "";
    const rows: [string, string][] = [
      ["Capacity", it.ahLabel],
      ["L × W × H", `${it.l} × ${it.w} × ${it.h} mm`],
      ["Weight", it.kg],
      ["Terminal", it.terminal || "See spec sheet"],
    ];
    for (const [k, v] of rows) {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      card.specs.append(dt, dd);
    }
    card.link.href = it.href;
    card.link.firstChild!.nodeValue = it.cta + " ";
    card.photo.innerHTML = "";
    if (it.img) {
      const img = new Image(240, 240);
      img.src = it.img;
      img.alt = "";
      img.decoding = "async";
      card.photo.appendChild(img);
    } else {
      const sp = document.createElement("span");
      sp.textContent = "T-ROX";
      card.photo.appendChild(sp);
    }
    const ok = fits(it);
    card.status.dataset.state = any ? (ok ? "fit" : "out") : "";
    card.status.textContent = any ? (ok ? "Fits your space" : "Too big for your space") : "Drawn to scale";
  }

  function select(i: number) {
    sel = Math.max(0, Math.min(group.items.length - 1, i));
    paint();
  }

  // range tabs
  const groupBtns = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-fit-group]"));
  groupBtns.forEach((b) =>
    b.addEventListener("click", () => {
      const g = groups.find((x) => x.key === b.dataset.fitGroup);
      if (!g || g === group) return;
      const prevAh = group.items[sel]?.ah ?? 0;
      group = g;
      // land on the nearest capacity to what was selected
      sel = g.items.reduce((best, it, k) => (Math.abs(it.ah - prevAh) < Math.abs(g.items[best].ah - prevAh) ? k : best), 0);
      groupBtns.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      svg.style.transition = "none";
      draw();
      requestAnimationFrame(() => (svg.style.transition = ""));
    }),
  );

  range.addEventListener("input", () => select(parseInt(range.value, 10)));
  inputs.forEach((i) => i.addEventListener("input", paint));
  rotateEl.addEventListener("change", paint);
  root.querySelector("[data-fit-clear]")!.addEventListener("click", () => {
    inputs.forEach((i) => (i.value = ""));
    paint();
  });

  // swipe / drag on the stage to step through the lineup
  let downX: number | null = null;
  stage.addEventListener("pointerdown", (e) => (downX = e.clientX));
  stage.addEventListener("pointerup", (e) => {
    if (downX === null) return;
    const dx = e.clientX - downX;
    downX = null;
    if (Math.abs(dx) > 36) select(sel + (dx < 0 ? 1 : -1));
  });
  stage.addEventListener("pointercancel", () => (downX = null));

  if (reduce) svg.style.transition = "none";
  root.hidden = false;
  draw();

  let rt = 0;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = window.setTimeout(draw, 160);
  });
}
