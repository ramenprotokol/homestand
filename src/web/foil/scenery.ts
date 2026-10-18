/** Painted set dressing for the scenes: the hanging lamp, the pennant garland, bokeh, the stadium ridge and the finale crowd. */
import { h } from "../dom";
import { makeRand } from "./rng";

function svgBox(cls: string, html: string, viewBox: string, extra: Record<string, string> = {}): SVGSVGElement {
  const t = document.createElement("template");
  const attrs = Object.entries({ class: cls, viewBox, "aria-hidden": "true", ...extra }).map(([k, v]) => `${k}="${v}"`).join(" ");
  t.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${html}</svg>`;
  return t.content.firstElementChild as SVGSVGElement;
}

export function bokeh(): HTMLElement {
  const { R } = makeRand(21);
  const el = h("div", { class: "bokeh", "aria-hidden": "true" });
  const bc = ["rgba(255,196,110,.55)", "rgba(255,120,160,.4)", "rgba(150,120,255,.45)", "rgba(255,230,160,.5)"];
  for (let i = 0; i < 18; i++) {
    const s = 40 + R() * 120;
    el.append(h("i", { style: `left:${(R() * 100).toFixed(1)}%;top:${(R() * 100).toFixed(1)}%;width:${s.toFixed(0)}px;height:${s.toFixed(0)}px;--c:${bc[i % 4]};--d:${(6 + R() * 8).toFixed(1)}s;animation-delay:${(-R() * 10).toFixed(1)}s` }));
  }
  return el;
}

export function garland(): SVGSVGElement {
  let g = '<path d="M-20 14Q400 90 800 40T1620 20" fill="none" stroke="#05060f" stroke-width="2.4"/>';
  const cs = ["#c9283c", "#f6ead0", "#f0b94a", "#2c4fbf"];
  for (let i = 0; i < 26; i++) {
    const t = i / 25, x = -20 + 1640 * t;
    const yy = i < 13 ? 14 + 40 * Math.sin(Math.PI * t * 1.05) * 0.9 + 8 : 20 + 30 * Math.sin(Math.PI * (t - 0.5) * 2) * 0.6 + 10;
    g += `<path d="M${(x - 12).toFixed(0)} ${yy.toFixed(0)}L${(x + 12).toFixed(0)} ${yy.toFixed(0)}L${x.toFixed(0)} ${(yy + 34).toFixed(0)}Z" fill="${cs[i % 4]}" opacity=".85"/>`;
  }
  return svgBox("garland", g, "0 0 1600 120", { preserveAspectRatio: "none" });
}

export function lamp(): HTMLElement {
  const el = h("div", { class: "lamp", "aria-hidden": "true" });
  el.append(
    svgBox(
      "",
      '<defs><radialGradient id="lg" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff2c4" stop-opacity=".9"/><stop offset=".35" stop-color="#ffc872" stop-opacity=".35"/><stop offset="1" stop-color="#ffc872" stop-opacity="0"/></radialGradient><linearGradient id="shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1b2260"/><stop offset=".5" stop-color="#3a44a8"/><stop offset="1" stop-color="#141a52"/></linearGradient></defs><g class="swing"><path d="M100 0V150" stroke="#05060f" stroke-width="3"/><circle cx="100" cy="226" r="150" fill="url(#lg)"/><path d="M52 190L148 190L176 220L24 220Z" fill="url(#shade)"/><path d="M24 220H176V228H24Z" fill="#f0b94a"/><ellipse cx="100" cy="228" rx="76" ry="9" fill="#fff6c8"/><ellipse cx="100" cy="230" rx="40" ry="6" fill="#fff"/></g>',
      "0 0 200 380",
    ),
  );
  return el;
}

/** The stadium roofline that rises over the top of a scene, with a few lit windows. */
export function ridge(): HTMLElement {
  const { R } = makeRand(33);
  let lights = "";
  for (let i = 0; i < 70; i++) lights += `<circle cx="${(R() * 1600) | 0}" cy="${(62 + R() * 50) | 0}" r="${(1 + R() * 1.4).toFixed(1)}" fill="${R() < 0.8 ? "#ffd98f" : "#fff"}" opacity="${(0.4 + R() * 0.6).toFixed(2)}"/>`;
  const el = h("div", { class: "ridge", "aria-hidden": "true" });
  el.append(
    svgBox(
      "",
      `<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0e30"/><stop offset="1" stop-color="#070a22"/></linearGradient></defs><path d="M0 120V70L60 62L120 70L180 52L260 64L340 48L430 60L520 40L620 58L720 44L820 62L920 46L1020 60L1120 42L1220 58L1320 48L1420 62L1500 54L1600 66V120Z" fill="url(#sk)"/><g>${lights}</g>`,
      "0 0 1600 120",
      { preserveAspectRatio: "none" },
    ),
  );
  return el;
}

/** Crowd silhouettes with raised arms and glow sticks along the bottom of the Send scene. */
export function crowdBar(): SVGSVGElement {
  const { R } = makeRand(44);
  let cr = "";
  const col = ["#ff8fb0", "#8fe9ff", "#ffd97a", "#b69cff"];
  for (let x = -20; x < 1640; x += R() * 28 + 26) {
    const y = 120 + R() * 50, s = 0.9 + R() * 0.5, arm = R() < 0.28;
    cr += `<ellipse cx="${x.toFixed(0)}" cy="${(y + 40 * s).toFixed(0)}" rx="${(40 * s).toFixed(0)}" ry="${(40 * s).toFixed(0)}" fill="#02030b"/><circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(20 * s).toFixed(0)}" fill="#02030b"/>`;
    if (arm) {
      const c = col[(R() * 4) | 0]!, ax = x + 14 * s, ay = y - 70 * s;
      cr += `<path d="M${(x + 16 * s).toFixed(0)} ${(y + 24 * s).toFixed(0)}L${ax.toFixed(0)} ${ay.toFixed(0)}" stroke="#02030b" stroke-width="${(12 * s).toFixed(0)}" stroke-linecap="round"/><circle cx="${ax.toFixed(0)}" cy="${(ay - 8).toFixed(0)}" r="9" fill="#02030b"/><rect x="${(ax - 3).toFixed(0)}" y="${(ay - 44).toFixed(0)}" width="6" height="40" rx="3" fill="${c}"/><circle cx="${ax.toFixed(0)}" cy="${(ay - 24).toFixed(0)}" r="26" fill="${c}" opacity=".28"/>`;
    }
  }
  cr += '<rect x="-20" y="170" width="1700" height="40" fill="#02030b"/>';
  return svgBox("crowdbar", cr, "0 0 1600 200", { preserveAspectRatio: "none" });
}

/** A marching row of scoreboard bulbs is pure CSS; this is the element that carries it. */
export const bulbs = (): HTMLElement => h("div", { class: "bulbs", "aria-hidden": "true" });
