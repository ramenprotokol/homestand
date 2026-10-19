import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);
gsap.ticker.lagSmoothing(0);

export { gsap, ScrollTrigger };

const rm = window.matchMedia("(prefers-reduced-motion: reduce)");

/** True when the visitor asked for less motion. Read at the moment of use, so a change applies to the next thing that moves. */
export const reduced = (): boolean => rm.matches;

/** Pointer devices that can hover get tilt and parallax. Touch devices skip them. */
export const canHover = (): boolean => window.matchMedia("(hover: hover) and (pointer: fine)").matches;

/** Canvases never render above 2x. */
export const dpr = (cap = 2): number => Math.min(window.devicePixelRatio || 1, cap);

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Ease a number toward a target. With reduced motion it jumps. Returns a stop function. */
export function tween(from: number, to: number, dur: number, fn: (v: number) => void, done?: () => void): () => void {
  if (reduced() || dur <= 0) {
    fn(to);
    done?.();
    return () => undefined;
  }
  let raf = 0;
  let live = true;
  const t0 = performance.now();
  const step = (now: number): void => {
    if (!live) return;
    const k = Math.min(1, (now - t0) / dur);
    fn(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) raf = requestAnimationFrame(step);
    else done?.();
  };
  raf = requestAnimationFrame(step);
  return () => {
    live = false;
    cancelAnimationFrame(raf);
  };
}

export const MINUS = "−";
/** "+1.39" or "−2.14": the signed index, with a real minus sign. */
export const fmt = (x: number): string => (x < 0 ? MINUS : "+") + Math.abs(x).toFixed(2);

/** One decimal, for plain-words copy: "\u22122.1". */
export const fmt1 = (x: number | null): string => (x === null ? "n/a" : (x < 0 ? MINUS : x > 0 ? "+" : "") + Math.abs(x).toFixed(1));
