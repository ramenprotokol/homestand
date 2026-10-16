import "./styles.css";
import { closeDrawer } from "./components";
import { clear, h } from "./dom";
import { state } from "./store";
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
    { class: "topbar" },
    h("a", { class: "brand", href: "#/" }, "Homestand"),
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
    h("a", { class: "study-link", href: "#/study", "aria-current": route === "/study" ? "page" : null, "data-testid": "study-link" }, "The Study"),
  );
}

function view(route: string): HTMLElement {
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

function render(): void {
  const route = location.hash.replace(/^#/, "") || "/";
  const changed = route !== lastRoute;
  if (changed) closeDrawer(false);
  lastRoute = route;
  const scroll = window.scrollY;
  clear(app);
  const main = h("main", { id: "main", tabindex: "-1" });
  main.append(view(route));
  app.append(topbar(route), main);
  document.title = `${{ "/check": "Check", "/fix": "Fix", "/send": "Send", "/study": "The Study", "/sample": "Pick a sample club", "/own": "Use your own" }[route] ?? "Your market, not the national chart"} | Homestand`;
  if (changed) {
    window.scrollTo(0, 0);
    (main.querySelector<HTMLElement>("h1") ?? main).focus({ preventScroll: true });
  } else window.scrollTo(0, scroll);
}

window.addEventListener("hashchange", render);
render();
