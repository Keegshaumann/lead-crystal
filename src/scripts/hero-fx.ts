// Hero life: glowing crystal dust drifting up through the shot (pushed aside by the cursor)
// and a gentle sideways parallax on the video. No zoom anywhere: Keegan wants the battery
// to hold one framing. Off for reduced motion; paused when the hero is off screen.
export function heroFx() {
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  const canvas = hero?.querySelector<HTMLCanvasElement>("[data-hero-dust]");
  const media = hero?.querySelector<HTMLElement>("[data-hero-media]");
  if (!hero || !canvas || !media) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0,
    h = 0;

  // one soft glow sprite per colour, drawn once
  const sprite = (rgb: string) => {
    const s = document.createElement("canvas");
    s.width = s.height = 64;
    const g = s.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${rgb},1)`);
    grad.addColorStop(0.18, `rgba(${rgb},0.85)`);
    grad.addColorStop(0.45, `rgba(${rgb},0.22)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return s;
  };
  const SPRITES = [sprite("190,201,255"), sprite("140,117,255"), sprite("255,255,255")];

  type Mote = { x: number; y: number; r: number; vy: number; ph: number; sp: number; a: number; z: number; s: number };
  let motes: Mote[] = [];

  const spawn = (anywhere: boolean): Mote => {
    // weighted toward the right, where the battery and crystals sit
    const bias = w >= 900 ? Math.pow(Math.random(), 0.55) : Math.random();
    const z = 0.4 + Math.random() * 0.6; // depth: nearer motes are bigger, faster, brighter
    return {
      x: bias * w,
      y: anywhere ? Math.random() * h : h + 10,
      r: (1.2 + Math.random() * 3.2) * z,
      vy: (0.18 + Math.random() * 0.5) * z,
      ph: Math.random() * Math.PI * 2,
      sp: 0.004 + Math.random() * 0.01,
      a: 0.25 + Math.random() * 0.6,
      z,
      s: Math.random() < 0.55 ? 0 : Math.random() < 0.7 ? 1 : 2,
    };
  };

  const resize = () => {
    const r = hero.getBoundingClientRect();
    w = r.width;
    h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(140, Math.max(40, (w * h) / 9000)));
    motes = Array.from({ length: n }, () => spawn(true));
  };

  // cursor: parallax target and repel point
  const ptr = { x: -9999, y: -9999, nx: 0, ny: 0, cx: 0, cy: 0 };
  if (fine) {
    hero.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      ptr.x = e.clientX - r.left;
      ptr.y = e.clientY - r.top;
      ptr.nx = ptr.x / r.width - 0.5;
      ptr.ny = ptr.y / r.height - 0.5;
    });
    hero.addEventListener("pointerleave", () => {
      ptr.x = ptr.y = -9999;
      ptr.nx = ptr.ny = 0;
    });
  }

  let raf = 0;
  let running = false;
  let t = 0;
  const frame = () => {
    raf = 0;
    if (!running) return;
    t += 1;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    // ease the parallax (video drifts opposite the cursor; dust drifts with depth)
    ptr.cx += (ptr.nx - ptr.cx) * 0.05;
    ptr.cy += (ptr.ny - ptr.cy) * 0.05;
    media.style.setProperty("--px", `${(-ptr.cx * 22).toFixed(2)}px`);
    media.style.setProperty("--py", `${(-ptr.cy * 14).toFixed(2)}px`);

    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      m.y -= m.vy;
      m.ph += m.sp;
      let x = m.x + Math.sin(m.ph) * 14 * m.z + ptr.cx * 40 * m.z;
      let y = m.y + ptr.cy * 26 * m.z;
      // push away from the cursor
      const dx = x - ptr.x;
      const dy = y - ptr.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 140 * 140) {
        const d = Math.sqrt(d2) || 1;
        const f = (1 - d / 140) * 36;
        m.x += (dx / d) * f * 0.12;
        m.y += (dy / d) * f * 0.12;
        x += (dx / d) * f;
        y += (dy / d) * f;
      }
      if (m.y < -20) motes[i] = spawn(false);
      const tw = 0.65 + Math.sin(t * 0.03 + m.ph * 3) * 0.35; // twinkle
      const size = m.r * 6;
      ctx.globalAlpha = Math.min(1, m.a * tw);
      ctx.drawImage(SPRITES[m.s], x - size / 2, y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  };

  const start = () => {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
    raf = 0;
  };

  new IntersectionObserver(([e]) => (e.isIntersecting && !document.hidden ? start() : stop())).observe(hero);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (hero.getBoundingClientRect().bottom > 0) start();
  });
  let rt = 0;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = window.setTimeout(resize, 150);
  });
  resize();
}
