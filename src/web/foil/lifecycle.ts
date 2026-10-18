import { gsap } from "./motion";

type Cleanup = () => void;

/** True while a route is entered fresh; false when the same route is just redrawn after a state change. Entrances only play on entry. */
export const route = { entering: true };

let cleanups: Cleanup[] = [];
let mounts: Array<() => void> = [];

/** Register something to undo when the route unmounts: a rAF loop, an observer, a listener, a timer. */
export function onCleanup(fn: Cleanup): void {
  cleanups.push(fn);
}

/** Run once the route's DOM is in the page (canvases need a size, observers need an element). */
export function onMount(fn: () => void): void {
  mounts.push(fn);
}

/** Tear the current route down. `render()` calls this before it clears `#app`. */
export function teardown(): void {
  const list = cleanups;
  cleanups = [];
  mounts = [];
  for (const fn of list.reverse()) {
    try {
      fn();
    } catch (err) {
      console.warn("cleanup failed", err);
    }
  }
}

export function runMounts(): void {
  const list = mounts;
  mounts = [];
  for (const fn of list) fn();
}

/**
 * A GSAP context for this route. Tweens, timelines and ScrollTriggers made inside `ctx.add(...)` are killed and reverted
 * when the route unmounts, so none of them outlive their elements.
 */
export function routeContext(): gsap.Context {
  const ctx = gsap.context(() => undefined);
  onCleanup(() => ctx.revert());
  return ctx;
}

/** Call `start` while the element is on screen and the tab is visible; `stop` otherwise. Cleans up with the route. */
export function whileVisible(el: Element, start: () => void, stop: () => void): void {
  let onScreen = false;
  let running = false;
  const sync = (): void => {
    const want = onScreen && !document.hidden;
    if (want && !running) {
      running = true;
      start();
    } else if (!want && running) {
      running = false;
      stop();
    }
  };
  const io = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    sync();
  });
  io.observe(el);
  document.addEventListener("visibilitychange", sync);
  onCleanup(() => {
    io.disconnect();
    document.removeEventListener("visibilitychange", sync);
    if (running) stop();
  });
}

/** Run `fn` after window resize settles. Cleans up with the route. */
export function onResize(fn: () => void, wait = 150): void {
  let t = 0;
  const h = (): void => {
    clearTimeout(t);
    t = window.setTimeout(fn, wait);
  };
  window.addEventListener("resize", h);
  onCleanup(() => {
    clearTimeout(t);
    window.removeEventListener("resize", h);
  });
}
