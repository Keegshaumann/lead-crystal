// Smooth wheel scrolling on every page (touch scrolling stays native).
// Skipped entirely for people who ask for reduced motion.
import Lenis from "lenis";

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let lenis: Lenis | null = null;

if (!reduce) {
  lenis = new Lenis({
    autoRaf: true,
    lerp: 0.11,
    wheelMultiplier: 1,
    // anchor links scroll smoothly; the sticky-header gap comes from html's scroll-padding-top
    anchors: true,
    // let native scrolling handle anything that scrolls on its own
    prevent: (node) => node.closest("dialog, [data-lenis-prevent], .table-scroll, .rail") !== null,
  });
}

(window as any).__lenis = lenis;
