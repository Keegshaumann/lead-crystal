// The signature object: one particle system that morphs between four formations as the
// "How it works" section scrolls. Liquid acid → crystal lattice → sealed cell → recycling loop.
//
// No GSAP in here. The scroll code calls setFormation(f) with a float (0..3); this file
// only draws. init returns null when WebGL is unavailable so the caller can fall back.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from "three";

export type CrystalScene = {
  setFormation: (f: number) => void;
  setPointer: (x: number, y: number) => void;
  setActive: (on: boolean) => void;
  resize: () => void;
  destroy: () => void;
};

// Deterministic random so the formations look the same on every visit.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type V3 = [number, number, number];

function rotate(p: V3, rx: number, ry: number): V3 {
  const [x, y, z] = p;
  const cy = Math.cos(ry),
    sy = Math.sin(ry),
    cx = Math.cos(rx),
    sx = Math.sin(rx);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const y1 = y * cx - z1 * sx;
  const z2 = y * sx + z1 * cx;
  return [x1, y1, z2];
}

function fill(n: number, gen: (i: number, r: () => number) => V3, seed: number) {
  const r = rng(seed);
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = gen(i, r);
    out[i * 3] = p[0];
    out[i * 3 + 1] = p[1];
    out[i * 3 + 2] = p[2];
  }
  return out;
}

const gauss = (r: () => number) => {
  const u = Math.max(r(), 1e-6);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
};

// 0 — Liquid acid: a loose, churning cloud (the shader adds the motion).
function fluid(n: number) {
  return fill(
    n,
    (_, r) => {
      const u = r(),
        v = r(),
        w = Math.cbrt(r());
      const th = 2 * Math.PI * u,
        ph = Math.acos(2 * v - 1);
      const rad = 2.0 * w;
      return [rad * Math.sin(ph) * Math.cos(th) * 0.95, rad * Math.cos(ph) * 0.9, rad * Math.sin(ph) * Math.sin(th)];
    },
    11,
  );
}

// 1 — Crystal lattice: nodes of a cubic grid cut to an octahedral crystal habit,
// with points strung along the bonds so it reads as structure, not blobs.
function lattice(n: number) {
  const s = 0.6;
  const R = 3;
  const nodes: V3[] = [];
  for (let x = -R; x <= R; x++)
    for (let y = -R; y <= R; y++)
      for (let z = -R; z <= R; z++) if (Math.abs(x) + Math.abs(y) + Math.abs(z) <= R) nodes.push([x, y, z]);
  const key = (p: V3) => p.join(",");
  const set = new Set(nodes.map(key));
  const edges: [V3, V3][] = [];
  for (const a of nodes)
    for (const d of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ] as V3[]) {
      const b: V3 = [a[0] + d[0], a[1] + d[1], a[2] + d[2]];
      if (set.has(key(b))) edges.push([a, b]);
    }
  return fill(
    n,
    (i, r) => {
      let p: V3;
      if (i % 4 === 0) {
        const a = nodes[Math.floor(r() * nodes.length)];
        p = [a[0] * s + gauss(r) * 0.035, a[1] * s + gauss(r) * 0.035, a[2] * s + gauss(r) * 0.035];
      } else {
        const [a, b] = edges[Math.floor(r() * edges.length)];
        const t = r();
        p = [
          (a[0] + (b[0] - a[0]) * t) * s + gauss(r) * 0.01,
          (a[1] + (b[1] - a[1]) * t) * s + gauss(r) * 0.01,
          (a[2] + (b[2] - a[2]) * t) * s + gauss(r) * 0.01,
        ];
      }
      return rotate(p, 0.42, 0.72);
    },
    22,
  );
}

// 2 — The sealed cell: a battery case with terminals and a strap handle.
function battery(n: number) {
  const W = 3.3,
    H = 1.95,
    D = 1.55;
  const hx = W / 2,
    hy = H / 2,
    hz = D / 2;
  const corners: V3[] = [];
  for (const x of [-hx, hx]) for (const y of [-hy, hy]) for (const z of [-hz, hz]) corners.push([x, y, z]);
  const edges: [V3, V3][] = [];
  for (let a = 0; a < 8; a++)
    for (let b = a + 1; b < 8; b++) {
      const diff = corners[a].filter((v, k) => v !== corners[b][k]).length;
      if (diff === 1) edges.push([corners[a], corners[b]]);
    }
  const lidY = hy - 0.32; // the lid seam
  return fill(
    n,
    (i, r) => {
      const k = r();
      let p: V3;
      if (k < 0.3) {
        const [a, b] = edges[Math.floor(r() * edges.length)];
        const t = r();
        p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      } else if (k < 0.72) {
        // faces, weighted roughly by area; front face denser
        const f = r();
        if (f < 0.34) p = [(r() - 0.5) * W, (r() - 0.5) * H, hz];
        else if (f < 0.5) p = [(r() - 0.5) * W, (r() - 0.5) * H, -hz];
        else if (f < 0.72) p = [(r() - 0.5) * W, hy, (r() - 0.5) * D];
        else if (f < 0.86) p = [hx, (r() - 0.5) * H, (r() - 0.5) * D];
        else p = [-hx, (r() - 0.5) * H, (r() - 0.5) * D];
      } else if (k < 0.8) {
        // lid seam ring
        const t = r() * 2 * (W + D);
        let x: number, z: number;
        if (t < W) (x = -hx + t), (z = hz);
        else if (t < W + D) (x = hx), (z = hz - (t - W));
        else if (t < 2 * W + D) (x = hx - (t - W - D)), (z = -hz);
        else (x = -hx), (z = -hz + (t - 2 * W - D));
        p = [x, lidY, z];
      } else if (k < 0.89) {
        // two terminals
        const side = r() < 0.5 ? -1 : 1;
        const a = r() * Math.PI * 2;
        const rad = 0.13 * Math.sqrt(r());
        p = [side * 1.15 + Math.cos(a) * rad, hy + r() * 0.2, Math.sin(a) * rad];
      } else if (k < 0.96) {
        // strap handle, an arc between the terminals
        const t = r();
        const x = -0.95 + 1.9 * t;
        const y = hy + 0.08 + Math.sin(t * Math.PI) * 0.62;
        p = [x, y, (r() - 0.5) * 0.06];
      } else {
        // label block on the front face
        const t = r();
        const row = Math.floor(r() * 4);
        p = [-1.25 + t * 0.95, -0.05 - row * 0.2, hz + 0.001];
      }
      return rotate(p, 0.22, -0.55);
    },
    33,
  );
}

// 3 — Circular economy: three arrows chasing each other round a loop.
function loop(n: number) {
  const R = 1.95;
  return fill(
    n,
    (i, r) => {
      const seg = Math.floor(r() * 3);
      const start = (seg * 2 * Math.PI) / 3 + 0.18;
      const span = (2 * Math.PI) / 3 - 0.42;
      let p: V3;
      if (r() < 0.86) {
        const a = start + r() * span;
        const tube = 0.17 * Math.sqrt(r());
        const ta = r() * Math.PI * 2;
        const rr = R + Math.cos(ta) * tube;
        p = [Math.cos(a) * rr, Math.sin(a) * rr, Math.sin(ta) * tube];
      } else {
        // arrowhead: a small filled triangle at the leading end of the arc
        const a = start + span;
        const u = r(),
          v = r() * (1 - u);
        const len = 0.5,
          wid = 0.42;
        const along = u * len; // forward along the tangent
        const across = (v - (1 - u) / 2) * wid * 2; // across the tube
        const cx = Math.cos(a),
          sy = Math.sin(a);
        const tx = -sy,
          ty = cx; // tangent
        p = [cx * (R + across) + tx * along, sy * (R + across) + ty * along, (r() - 0.5) * 0.08];
      }
      return rotate(p, -0.22, 0.12);
    },
    44,
  );
}

const PALETTE: [string, string][] = [
  ["#ff9a4d", "#ffd18a"], // liquid acid — amber, the problem
  ["#bec9ff", "#8c75ff"], // crystal — ice and violet
  ["#a08cff", "#e6eaff"], // the cell — violet and white
  ["#7fe0b0", "#bec9ff"], // recycling — mint
];

const VERT = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute float aRand;
  uniform float uMix;
  uniform float uTime;
  uniform float uChaos;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform vec2 uPointer;
  uniform float uPointerForce;
  varying float vRand;
  varying float vFade;
  void main() {
    // per-particle stagger so the morph ripples instead of moving as one block
    float d = clamp(uMix * 1.5 - aRand * 0.5, 0.0, 1.0);
    d = d * d * (3.0 - 2.0 * d);
    vec3 p = mix(aStart, aEnd, d);
    // mid-morph bloom: particles lift outward, then settle
    float burst = sin(d * 3.14159);
    p += normalize(p + vec3(0.0001)) * burst * (0.25 + aRand * 0.45);
    // liquid churn, strongest at formation 0
    p += uChaos * vec3(
      sin(uTime * 0.7 + p.y * 1.6 + aRand * 6.28),
      cos(uTime * 0.55 + p.x * 1.4 + aRand * 3.1),
      sin(uTime * 0.6 + p.z * 1.8 + aRand * 1.7)
    ) * 0.32;
    // breathing shimmer
    p += normalize(p + vec3(0.0001)) * sin(uTime * 1.3 + aRand * 40.0) * 0.012;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    // pointer pushes particles aside (view space)
    vec2 diff = mv.xy - uPointer;
    float dist = length(diff);
    mv.xy += normalize(diff + vec2(0.0001)) * uPointerForce * smoothstep(1.1, 0.0, dist) * 0.55;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.55 + aRand * 0.9) * uPixelRatio / -mv.z;
    vRand = aRand;
    vFade = smoothstep(14.0, 6.0, -mv.z);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform float uOpacity;
  varying float vRand;
  varying float vFade;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5) discard;
    // bright core + soft halo
    float halo = smoothstep(0.5, 0.0, r);
    float core = smoothstep(0.2, 0.0, r);
    float a = halo * halo * 0.45 + core * 0.9;
    vec3 col = mix(uColA, uColB, vRand);
    gl_FragColor = vec4(col, a * uOpacity * vFade);
  }
`;

export function initCrystalScene(canvas: HTMLCanvasElement): CrystalScene | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;

  const small = window.matchMedia("(max-width: 767px)").matches;
  const COUNT = small ? 4200 : 9000;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 60);
  camera.position.set(0, 0, 9);

  const forms = [fluid(COUNT), lattice(COUNT), battery(COUNT), loop(COUNT)];

  const geo = new BufferGeometry();
  const aStart = new BufferAttribute(new Float32Array(forms[0]), 3);
  const aEnd = new BufferAttribute(new Float32Array(forms[1]), 3);
  const rand = new Float32Array(COUNT);
  const r = rng(7);
  for (let i = 0; i < COUNT; i++) rand[i] = r();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(forms[0]), 3));
  geo.setAttribute("aStart", aStart);
  geo.setAttribute("aEnd", aEnd);
  geo.setAttribute("aRand", new BufferAttribute(rand, 1));

  const colA = new Color(PALETTE[0][0]);
  const colB = new Color(PALETTE[0][1]);
  const mat = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uMix: { value: 0 },
      uTime: { value: 0 },
      uChaos: { value: 1 },
      uSize: { value: small ? 52 : 50 },
      uPixelRatio: { value: dpr },
      uPointer: { value: [99, 99] },
      uPointerForce: { value: 0 },
      uColA: { value: colA },
      uColB: { value: colB },
      uOpacity: { value: 0.9 },
    },
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;

  // dim far stars for depth
  const starN = small ? 350 : 800;
  const sg = new BufferGeometry();
  const sp = fill(
    starN,
    (_, rr) => {
      const th = rr() * Math.PI * 2,
        ph = Math.acos(2 * rr() - 1),
        rad = 7 + rr() * 9;
      return [rad * Math.sin(ph) * Math.cos(th), rad * Math.sin(ph) * Math.sin(th) * 0.6, -Math.abs(rad * Math.cos(ph))];
    },
    99,
  );
  sg.setAttribute("position", new BufferAttribute(sp, 3));
  sg.setAttribute("aStart", new BufferAttribute(sp, 3));
  sg.setAttribute("aEnd", new BufferAttribute(sp, 3));
  const sr = new Float32Array(starN);
  for (let i = 0; i < starN; i++) sr[i] = r();
  sg.setAttribute("aRand", new BufferAttribute(sr, 1));
  const starMat = mat.clone();
  starMat.uniforms.uColA.value = new Color("#6f6a9a");
  starMat.uniforms.uColB.value = new Color("#bec9ff");
  starMat.uniforms.uOpacity.value = 0.55;
  starMat.uniforms.uChaos.value = 0;
  starMat.uniforms.uSize.value = 34;
  const stars = new Points(sg, starMat);
  stars.frustumCulled = false;

  const group = new Group();
  group.add(points);
  scene.add(group, stars);

  let pair = -1;
  let target = 0; // formation float requested by scroll
  let current = 0; // eased value actually drawn
  let active = false;
  let raf = 0;
  let last = performance.now();
  let time = 0;
  const ptr = { x: 99, y: 99, tx: 99, ty: 99, force: 0, tforce: 0 };
  const cam = { x: 0, y: 0 };
  let halfH = 1,
    halfW = 1;
  let offsetX = 0;
  let offsetY = 0;

  function setPair(i: number) {
    if (i === pair) return;
    pair = i;
    (aStart.array as Float32Array).set(forms[i]);
    (aEnd.array as Float32Array).set(forms[Math.min(i + 1, forms.length - 1)]);
    aStart.needsUpdate = true;
    aEnd.needsUpdate = true;
  }
  setPair(0);

  const tmpA = new Color(),
    tmpB = new Color();

  function apply(f: number) {
    const max = forms.length - 1;
    f = Math.max(0, Math.min(max, f));
    const i = Math.min(Math.floor(f), max - 1);
    setPair(i);
    const frac = f - i;
    mat.uniforms.uMix.value = frac;
    mat.uniforms.uChaos.value = Math.max(0, 1 - f * 1.4);
    const a0 = PALETTE[i],
      a1 = PALETTE[i + 1];
    colA.copy(tmpA.set(a0[0]).lerp(tmpB.set(a1[0]), frac));
    colB.copy(tmpA.set(a0[1]).lerp(tmpB.set(a1[1]), frac));
  }

  function frame(now: number) {
    raf = 0;
    if (!active || document.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    current += (target - current) * Math.min(1, dt * 6);
    apply(current);
    mat.uniforms.uTime.value = time;
    starMat.uniforms.uTime.value = time;

    ptr.x += (ptr.tx - ptr.x) * 0.12;
    ptr.y += (ptr.ty - ptr.y) * 0.12;
    ptr.force += (ptr.tforce - ptr.force) * 0.08;
    mat.uniforms.uPointer.value = [ptr.x * halfW - 0, ptr.y * halfH];
    mat.uniforms.uPointerForce.value = ptr.force;

    // gentle sway; the middle formations turn a little, the loop ends facing the camera
    group.rotation.y = Math.sin(time * 0.25) * 0.28 + Math.sin((current * Math.PI) / 3) * 0.4;
    group.rotation.x = Math.sin(time * 0.18) * 0.08;
    group.position.x = offsetX;
    group.position.y = offsetY;

    // eased pointer parallax on the camera
    const px = ptr.tx === 99 ? 0 : ptr.tx;
    const py = ptr.ty === 99 ? 0 : ptr.ty;
    cam.x += (px * 0.35 - cam.x) * 0.05;
    cam.y += (py * 0.22 - cam.y) * 0.05;
    camera.position.x = cam.x;
    camera.position.y = cam.y;
    camera.lookAt(offsetX * 0.15, 0, 0);

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (raf || !active || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the object a sensible size on narrow screens
    camera.position.z = w / h < 0.8 ? 12.5 : w / h < 1.2 ? 10.5 : 9;
    camera.updateProjectionMatrix();
    halfH = camera.position.z * Math.tan((camera.fov * Math.PI) / 360);
    halfW = halfH * camera.aspect;
    // desktop: the copy sits left, so the object moves right
    offsetX = w >= 900 ? Math.min(2.8, halfW * 0.5) : 0;
    // phones: the copy card sits low, so lift the object into the top of the screen
    offsetY = w < 900 ? halfH * 0.42 : 0;
    group.scale.setScalar(w < 900 ? Math.min(1, (halfW * 2) / 4.4) : 1);
    renderer.render(scene, camera);
  }

  const onVis = () => (document.hidden ? cancelAnimationFrame(raf) : start());
  document.addEventListener("visibilitychange", onVis);
  const onLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const onRestored = () => start();
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  resize();
  apply(0);
  renderer.render(scene, camera);

  return {
    setFormation(f) {
      target = f;
    },
    setPointer(x, y) {
      // x, y in -1..1 (NDC), or NaN to release
      if (Number.isNaN(x)) {
        ptr.tforce = 0;
        return;
      }
      ptr.tx = x;
      ptr.ty = y;
      ptr.tforce = 1;
    },
    setActive(on) {
      active = on;
      if (on) start();
      else {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    resize,
    destroy() {
      active = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      geo.dispose();
      sg.dispose();
      mat.dispose();
      starMat.dispose();
      renderer.dispose();
    },
  };
}
