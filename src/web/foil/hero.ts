import { h } from "../dom";
import { HeroFx } from "./fx";
import { onCleanup, onMount, onResize, route, routeContext, whileVisible } from "./lifecycle";
import { canHover, gsap, reduced } from "./motion";
import { fitWorld, grainDataUrl, markHTML, PARALLAX, worldHTML } from "./world";

/** The hero scene: the painted night ballpark, the wordmark over the red stitched diamond, and whatever copy goes on top. */
export function heroShell(copy: Node[]): HTMLElement {
  const world = h("div", { class: "world", id: "world", "aria-hidden": "true" });
  world.innerHTML = worldHTML();
  const mark = h("div", { class: "mark", id: "mark", "aria-hidden": "true" });
  mark.innerHTML = `<svg viewBox="0 0 1000 520" id="markSvg">${markHTML()}</svg>`;
  const grain = h("div", { class: "grain" });
  grain.style.backgroundImage = `url(${grainDataUrl()})`;
  const hero = h(
    "section",
    { class: "hero", id: "hero", "aria-label": "Homestand" },
    h("div", { class: "stage", id: "stage" }, world, h("div", { class: "vig" }), grain),
    h(
      "div",
      { class: "copy", id: "copy" },
      mark,
      h("p", { class: "wordmark", id: "wm", "aria-hidden": "true" }, h("span", null, "HOME"), h("span", null, "STAND")),
      ...copy,
    ),
    h("div", { class: "dim", id: "dim" }),
    h("div", { class: "scrollcue", "aria-hidden": "true" }, "Scroll", h("i")),
  );
  onMount(() => mountHero(hero));
  return hero;
}

function mountHero(hero: HTMLElement): void {
  const ctx = routeContext();
  fitWorld(hero);
  const fx = new HeroFx(hero);
  fx.begin();
  onCleanup(() => fx.destroy());
  whileVisible(
    hero,
    () => {
      hero.classList.remove("paused");
      fx.start();
    },
    () => {
      hero.classList.add("paused");
      fx.stop();
    },
  );
  onResize(() => {
    fitWorld(hero);
    fx.resize();
  });

  if (reduced()) return;

  ctx.add(() => {
    if (canHover()) {
      const layers = PARALLAX.map(([id, d]) => ({
        qx: gsap.quickTo(`#${id}`, "x", { duration: 1.1, ease: "power3.out" }),
        qy: gsap.quickTo(`#${id}`, "y", { duration: 1.1, ease: "power3.out" }),
        d,
      }));
      const move = (e: PointerEvent): void => {
        const nx = e.clientX / window.innerWidth - 0.5, ny = e.clientY / window.innerHeight - 0.5;
        for (const l of layers) {
          l.qx(-nx * l.d);
          l.qy(-ny * l.d * 0.35);
        }
      };
      hero.addEventListener("pointermove", move);
      onCleanup(() => hero.removeEventListener("pointermove", move));
    }

    if (route.entering) {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from("#world", { opacity: 0, duration: 0.9 }, 0)
      .from("#wm", { y: 36, opacity: 0, letterSpacing: ".14em", duration: 0.8 }, 0.25)
      .from(".stitch", { strokeDashoffset: 1, duration: 0.55, stagger: 0.07, ease: "power2.inOut" }, 0.1)
      .from(".ticks", { opacity: 0, duration: 0.5 }, 0.7)
      .from("#sub", { opacity: 0, y: 14, duration: 0.5 }, 0.7)
      .from("#cta", { opacity: 0, y: 12, duration: 0.5 }, 0.85)
      .from(".nav", { opacity: 0, y: -14, duration: 0.6 }, 0.5);
    }

    gsap
      .timeline({ scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 0.6 } })
      .to("#stage", { yPercent: 16, scale: 1.07, ease: "none" }, 0)
      .to("#dim", { opacity: 1, ease: "none" }, 0)
      .to("#copy", { yPercent: -12, opacity: 0, ease: "none" }, 0)
      .to(".scrollcue", { opacity: 0, duration: 0.2 }, 0);
  });
}
