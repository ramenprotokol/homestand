import "./foil/foil.css";
import "./styles.css";
import { h } from "./dom";
import { clear } from "./dom";
import { closeDrawer } from "./components";
import { closeWhy } from "./foil/why";
import { resumeClub } from "./flow";
import { route as routeState, runMounts, teardown } from "./foil/lifecycle";
import { state, ui } from "./store";
import { checkView } from "./views/check";
import { fixView } from "./views/fix";
import { sendView } from "./views/send";
import { ownView, pickView, startView } from "./views/start";
import { studyView } from "./views/study";

const STEPS = [
  { hash: "#/check", n: 1, label: "Check" },
  { hash: "#/fix", n: 2, label: "Fix" },
  { hash: "#/send", n: 3, label: "Send" },
] as const;

const app = document.getElementById("app")!;
let lastRoute = "";

function topbar(route: string): HTMLElement {
  const ready = state.analysis !== null;
  return h(
    "header",
    { class: "nav", id: "nav" },
    h("a", { class: "logo brand", href: "#/", "aria-label": "Homestand, start" }, "Homestand"),
    h(
      "nav",
      { "aria-label": "Steps" },
      h(
        "ol",
        { class: "steps" },
        STEPS.map((s) => {
          const current = route === s.hash.slice(1);
          const inner = [h("span", { class: "n" }, String(s.n)), h("span", { class: "label" }, s.label)];
          return h("li", null, ready ? h("a", { class: "step", href: s.hash, "aria-current": current ? "step" : null }, ...inner) : h("span", { class: "step", "aria-disabled": "true" }, ...inner));
        }),
      ),
    ),
    h(
      "div",
      { class: "nav-r" },
      state.market ? h("span", { class: "club" }, h("i"), state.market.label.replace(/ (sample )?club$/, "")) : null,
      h("a", { class: "out study-link", href: "#/study", "aria-current": route === "/study" ? "page" : null, "data-testid": "study-link" }, "The Study"),
    ),
  );
}

function view(route: string): HTMLElement {
  // A reload on Fix or Send re-checks the saved club first: show Check's loading or error screen until it is ready.
  if ((route === "/fix" || route === "/send") && !state.analysis && (ui.loading || ui.error)) return checkView();
  switch (route) {
    case "/sample": return pickView();
    case "/own": return ownView();
    case "/check": return checkView();
    case "/fix": return fixView();
    case "/send": return sendView();
    case "/study": return studyView();
    default: return startView();
  }
}

const TITLES: Record<string, string> = { "/check": "Check", "/fix": "Fix", "/send": "Send", "/study": "The Study", "/sample": "Pick a sample club", "/own": "Use your own" };

function render(): void {
  const route = location.hash.replace(/^#/, "") || "/";
  const changed = route !== lastRoute;
  if (changed) {
    closeDrawer(false);
    closeWhy(false);
  }
  lastRoute = route;
  const scroll = window.scrollY;
  // Stop every loop, tween and observer the last screen started before its elements are removed.
  teardown();
  routeState.entering = changed;
  clear(app);
  const main = h("main", { id: "main", tabindex: "-1" });
  main.append(view(route));
  app.append(topbar(route), main);
  document.title = `${TITLES[route] ?? "Your market, not the national chart"} | Homestand`;
  runMounts();
  const nav = document.getElementById("nav")!;
  const solid = (): void => {
    nav.classList.toggle("solid", window.scrollY > 40 || route !== "/");
  };
  solid();
  if (changed) {
    window.scrollTo(0, 0);
    (main.querySelector<HTMLElement>("h1") ?? main).focus({ preventScroll: true });
  } else window.scrollTo(0, scroll);
  navScroll = solid;
}

let navScroll: () => void = () => undefined;
window.addEventListener("scroll", () => navScroll(), { passive: true });
window.addEventListener("hashchange", render);
if (["#/check", "#/fix", "#/send"].includes(location.hash)) resumeClub();
render();
