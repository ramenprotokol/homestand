import "./foil/foil.css";
import "./styles.css";
import { h } from "./dom";
import { clear } from "./dom";
import { closeDrawer } from "./components";
import { closeWhy } from "./foil/why";
import { shortLabel } from "../app/kind";
import { openSample, resumeClub, navigate } from "./flow";
import { route as routeState, runMounts, teardown } from "./foil/lifecycle";
import { copy, state, ui } from "./store";
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
    ready ? null : h("a", { class: "pick-first", href: "#/sample", "data-testid": "pick-first" }, "Pick a club to start"),
    h(
      "nav",
      { "aria-label": "Steps", class: ready ? "" : "steps-off" },
      h(
        "ol",
        { class: "steps" },
        STEPS.map((s) => {
          const current = baseOf(route) === s.hash.slice(1);
          const inner = [h("span", { class: "n" }, String(s.n)), h("span", { class: "label" }, s.label)];
          return h("li", null, ready ? h("a", { class: "step", href: s.hash, "aria-current": current ? "step" : null }, ...inner) : h("span", { class: "step", "aria-disabled": "true" }, ...inner));
        }),
      ),
    ),
    h(
      "div",
      { class: "nav-r" },
      state.market ? h("a", { class: "club", href: "#/sample", "data-testid": "change-club", "aria-label": `${shortLabel(state.market.label)}. Change ${copy().team}` }, h("i"), shortLabel(state.market.label), h("span", { class: "club-change" }, `Change ${copy().team}`), h("span", { class: "club-compact" }, "Change")) : null,
      h("a", { class: "study-link", href: "#/study", "aria-current": route === "/study" ? "page" : null, "data-testid": "study-link" }, "The Study"),
    ),
  );
}

/** "/check/biloxi" is the Check screen for one sample club. */
const baseOf = (route: string): string => "/" + (route.split("/")[1] ?? "");

function view(route: string): HTMLElement {
  if (route.startsWith("/check/") && !openSample(route.slice("/check/".length))) {
    navigate("#/sample");
    return h("div");
  }
  route = baseOf(route) === "/check" ? "/check" : route;
  // A reload on Fix or Send re-checks the saved club first: show Check's loading or error screen until it is ready.
  if ((route === "/fix" || route === "/send") && !state.analysis && (ui.loading || ui.error)) return checkView();
  if ((route === "/fix" || route === "/send") && !state.analysis && !ui.loading && !ui.error) {
    ui.pickNote = true;
    navigate("#/sample");
    return h("div");
  }
  switch (route) {
    case "/sample": return pickView();
    case "/own": return ownView();
    case "/check": return checkView();
    case "/fix": return fixView();
    case "/send": return sendView();
    case "/study": return studyView();
    case "/": return startView();
    default: return notFoundView();
  }
}

function notFoundView(): HTMLElement {
  return h("section", { class: "scene" }, h("div", { class: "wrap narrow" }, h("h1", { class: "h2", tabindex: "-1" }, "That page doesn't exist"), h("p", { class: "lede" }, "The link may be old or mistyped."), h("div", { class: "actions" }, h("a", { class: "btn pri", href: "#/", "data-testid": "go-home" }, "Go to the home page"))));
}

const TITLES: Record<string, string> = { "/check": "Check", "/fix": "Fix", "/send": "Send", "/study": "The Study", "/sample": "Pick a sample club", "/own": "Use your own" };

/** The tab title for a route: the screen, plus the club and sport once one is loaded; an unknown route says so. */
function titleOf(route: string): string {
  const base = baseOf(route);
  if (route === "/") return "Your market, not the national chart | Homestand";
  const t = TITLES[base];
  if (t === undefined) return "Page not found | Homestand";
  if ((base === "/check" || base === "/fix" || base === "/send") && state.market) return `${t}: ${state.market.label} (${state.kind === "venue" ? "concert venue" : state.sport}) | Homestand`;
  return `${t} | Homestand`;
}

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
  if (route !== "/sample") ui.pickNote = false;
  document.body.classList.toggle("has-club", state.market !== null);
  clear(app);
  const main = h("main", { id: "main", tabindex: "-1" });
  main.append(view(route));
  app.append(topbar(route), main);
  document.title = titleOf(route);
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
