/** The night ballpark: 13 stacked painted SVG layers built from code. Generic ballpark, no real park or team. */
import { makeRand, type Rand } from "./rng";

let rnd: Rand = makeRand(7);
const R = (): number => rnd.R();
const rr = (a: number, b: number): number => rnd.rr(a, b);
const f1 = (n: number): number => Math.round(n * 10) / 10;

function bankDef(): string {
  let s = '<g id="bank"><rect x="-120" y="-52" width="240" height="104" rx="7" fill="#070a24" stroke="#3b4598" stroke-width="2.4"/><rect x="-120" y="-52" width="240" height="8" rx="4" fill="#2a3278"/>';
  s += '<path d="M-120 -4H120M-120 -30H120" stroke="#1c2262" stroke-width="2"/>';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      const cx = -87.5 + 35 * c;
      const cy = -33 + 22.5 * r;
      s += `<circle cx="${cx}" cy="${cy}" r="10" fill="#10154a" stroke="#4d5ac0" stroke-width="1.6"/><circle cx="${cx}" cy="${cy}" r="7.4" fill="url(#lamp)"/><circle cx="${cx - 2}" cy="${cy - 2}" r="2.2" fill="#fff"/>`;
    }
  }
  return s + "</g>";
}

function towerDef(): string {
  const hi = (y: number): number => 50 - 36 * (-y / 640);
  const ho = (y: number): number => 76 - 50 * (-y / 640);
  let s = '<g id="tower">';
  s += '<path d="M-44 0L-10 -640L10 -640L44 0Z" fill="#0a0d2c" opacity=".9"/>';
  s += '<path d="M-78 0L-26 -640L-11 -640L-52 0Z" fill="url(#steel)"/><path d="M78 0L26 -640L11 -640L52 0Z" fill="url(#steel)"/>';
  s += '<path d="M78 0L26 -640" stroke="#7d8bf0" stroke-width="2" opacity=".55"/><path d="M-52 0L-11 -640" stroke="#5a66c8" stroke-width="1.5" opacity=".4"/>';
  for (let y = 0; y > -630; y -= 64) {
    const y2 = y - 64;
    s += `<path d="M${-hi(y)} ${y}L${hi(y2)} ${y2}M${hi(y)} ${y}L${-hi(y2)} ${y2}M${-hi(y)} ${y}H${hi(y)}" stroke="#2c357f" stroke-width="3" fill="none"/>`;
  }
  for (const y of [-250, -470]) {
    s += `<rect x="${-ho(y) - 12}" y="${y - 4}" width="${2 * ho(y) + 24}" height="9" fill="#141a52" stroke="#3a4496" stroke-width="1.4"/><path d="M${-ho(y) - 12} ${y - 4}v-16M${ho(y) + 12} ${y - 4}v-16M${-ho(y) - 12} ${y - 20}H${ho(y) + 12}" stroke="#3a4496" stroke-width="1.6" fill="none"/>`;
  }
  let lad = "";
  for (let y = -6; y > -640; y -= 15) lad += `M${ho(y) + 7 - 4} ${y}h8`;
  s += `<path d="M${ho(0) + 7} 0L${ho(-640) + 7} -640M${ho(0) + 1} 0L${ho(-640) + 1} -640${lad}" stroke="#4e5bc4" stroke-width="1.3" opacity=".7" fill="none"/>`;
  s += '<path d="M-60 -640L-110 -664M60 -640L110 -664M0 -640V-660" stroke="#2c357f" stroke-width="4" fill="none"/>';
  s += '<rect x="-128" y="-664" width="256" height="11" fill="#141a52" stroke="#4a56b8" stroke-width="1.6"/>';
  s += '<path d="M-128 -664v-16M128 -664v-16M-128 -680H128" stroke="#4a56b8" stroke-width="1.5" fill="none"/>';
  for (let x = -110; x <= 110; x += 22) s += `<path d="M${x} -664v-16" stroke="#3a4496" stroke-width="1"/>`;
  s += '<use href="#bank" y="-724"/>';
  s += '<path d="M0 -776V-846" stroke="#4a56b8" stroke-width="3"/><path d="M0 -846l46 7-46 9z" fill="#c9283c" class="flag"/><path d="M0 -826l38 6-38 7z" fill="#f6ead0" class="flag" style="animation-delay:-1s"/><circle cx="0" cy="-850" r="5" fill="#ff3b3b" class="beacon"/><circle cx="0" cy="-850" r="22" fill="url(#redhalo)" class="beacon"/>';
  return s + "</g>";
}

const GRADS = `
  <linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="-900" x2="0" y2="470"><stop offset="0" stop-color="#03051a"/><stop offset=".3" stop-color="#080c30"/><stop offset=".52" stop-color="#14196a"/><stop offset=".68" stop-color="#2d2a96"/><stop offset=".8" stop-color="#5a34a0"/><stop offset=".9" stop-color="#9a3f98"/><stop offset=".96" stop-color="#df6a8e"/><stop offset="1" stop-color="#ffa88a"/></linearGradient>
  <radialGradient id="hglow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffc08e" stop-opacity=".85"/><stop offset=".4" stop-color="#ea5f94" stop-opacity=".42"/><stop offset="1" stop-color="#7a3fa0" stop-opacity="0"/></radialGradient>
  <radialGradient id="violet" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#b05ad8" stop-opacity=".5"/><stop offset="1" stop-color="#6a3ad0" stop-opacity="0"/></radialGradient>
  <radialGradient id="halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6cf" stop-opacity=".95"/><stop offset=".12" stop-color="#ffdf9a" stop-opacity=".6"/><stop offset=".4" stop-color="#f3a24f" stop-opacity=".2"/><stop offset="1" stop-color="#f3a24f" stop-opacity="0"/></radialGradient>
  <radialGradient id="redhalo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff5a5a" stop-opacity=".8"/><stop offset="1" stop-color="#ff5a5a" stop-opacity="0"/></radialGradient>
  <radialGradient id="lamp" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fffef2"/><stop offset=".55" stop-color="#ffe9a8"/><stop offset="1" stop-color="#f5b24a"/></radialGradient>
  <radialGradient id="moonG" cx=".42" cy=".4" r=".62"><stop offset="0" stop-color="#fffaf0"/><stop offset=".7" stop-color="#ece0c8"/><stop offset="1" stop-color="#c8b9ae"/></radialGradient>
  <radialGradient id="moonH" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#d6dcff" stop-opacity=".5"/><stop offset=".3" stop-color="#8e9cf0" stop-opacity=".22"/><stop offset="1" stop-color="#6a78e0" stop-opacity="0"/></radialGradient>
  <radialGradient id="milky" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#c3b5ff" stop-opacity=".26"/><stop offset=".6" stop-color="#9aa6ff" stop-opacity=".1"/><stop offset="1" stop-color="#9aa6ff" stop-opacity="0"/></radialGradient>
  <linearGradient id="steel" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#070a26"/><stop offset=".6" stop-color="#121853"/><stop offset="1" stop-color="#2a3490"/></linearGradient>
  <linearGradient id="cloud" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3aa8" stop-opacity=".5"/><stop offset=".55" stop-color="#b858a8" stop-opacity=".5"/><stop offset="1" stop-color="#ffa48e" stop-opacity=".5"/></linearGradient>
  <linearGradient id="gulf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8559e"/><stop offset=".25" stop-color="#4a3aa0"/><stop offset="1" stop-color="#0d1244"/></linearGradient>
  <linearGradient id="land" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#201a62"/><stop offset="1" stop-color="#07091f"/></linearGradient>
  <radialGradient id="spill" cx=".5" cy=".55" r=".5"><stop offset="0" stop-color="#fff2c4" stop-opacity=".75"/><stop offset=".5" stop-color="#ffc872" stop-opacity=".25"/><stop offset="1" stop-color="#ffc872" stop-opacity="0"/></radialGradient>
  <linearGradient id="dirt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d79a60"/><stop offset="1" stop-color="#955f3c"/></linearGradient>
  <linearGradient id="beamL" gradientUnits="userSpaceOnUse" x1="230" y1="196" x2="860" y2="790"><stop offset="0" stop-color="#fff0c0" stop-opacity=".65"/><stop offset=".5" stop-color="#ffe2a0" stop-opacity=".22"/><stop offset="1" stop-color="#ffe2a0" stop-opacity=".07"/></linearGradient>
  <linearGradient id="beamR" gradientUnits="userSpaceOnUse" x1="1384" y1="424" x2="940" y2="760"><stop offset="0" stop-color="#fff0c0" stop-opacity=".55"/><stop offset="1" stop-color="#ffe2a0" stop-opacity=".05"/></linearGradient>
  <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a6ae0" stop-opacity="0"/><stop offset=".55" stop-color="#9a78e0" stop-opacity=".26"/><stop offset="1" stop-color="#7a6ae0" stop-opacity="0"/></linearGradient>
  <linearGradient id="fgG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#232a86"/><stop offset=".12" stop-color="#0b0f38"/><stop offset="1" stop-color="#03040f"/></linearGradient>
  <radialGradient id="bulb" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff7d6" stop-opacity=".95"/><stop offset=".3" stop-color="#ffcf7a" stop-opacity=".5"/><stop offset="1" stop-color="#ffb24a" stop-opacity="0"/></radialGradient>
  <radialGradient id="glowP" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff8fc0" stop-opacity=".9"/><stop offset="1" stop-color="#ff8fc0" stop-opacity="0"/></radialGradient>
  <radialGradient id="glowT" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#8ff3ff" stop-opacity=".9"/><stop offset="1" stop-color="#8ff3ff" stop-opacity="0"/></radialGradient>`;

const ly = (id: string, inner: string, cls = ""): string => `<div class="ly ${cls}" id="${id}"><svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">${inner}</svg></div>`;

function layerSky(): string {
  return `<rect x="-600" y="-1100" width="2800" height="1580" fill="url(#sky)"/>
  <ellipse cx="800" cy="486" rx="1100" ry="200" fill="url(#hglow)"/>
  <ellipse cx="900" cy="330" rx="1000" ry="150" fill="url(#violet)"/>
  <ellipse cx="880" cy="170" rx="980" ry="90" transform="rotate(-22 880 170)" fill="url(#milky)"/><ellipse cx="780" cy="-120" rx="900" ry="80" transform="rotate(-22 780 -120)" fill="url(#milky)" opacity=".7"/>
  <circle cx="690" cy="158" r="260" fill="url(#moonH)"/><circle cx="690" cy="158" r="44" fill="url(#moonG)"/><circle cx="676" cy="146" r="9" fill="#cdbfb0" opacity=".5"/><circle cx="704" cy="172" r="6" fill="#cdbfb0" opacity=".5"/><circle cx="694" cy="136" r="4" fill="#cdbfb0" opacity=".4"/>`;
}

function layerStars(): [string, string, string] {
  const g = ["", "", ""];
  let glints = "";
  for (let i = 0; i < 340; i++) {
    const y = rr(-980, 440);
    const x = rr(-300, 1900);
    const band = Math.abs(y - -0.4 * (x - 880) - 170) < 110;
    if (!band && R() < 0.25) continue;
    const r = R() < 0.08 ? rr(1.4, 2.1) : rr(0.5, 1.2);
    const c = R() < 0.15 ? "#ffd9b0" : R() < 0.3 ? "#c8d4ff" : "#fff";
    g[i % 3] += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${c}" opacity="${f1(rr(0.5, 1))}"/>`;
  }
  for (const [x, y, s] of [[330, 60, 9], [1180, 40, 7], [960, 250, 6], [1450, 150, 8], [120, 300, 6], [640, 320, 5]] as const) {
    glints += `<path d="M${x - s * 2.2} ${y}H${x + s * 2.2}M${x} ${y - s * 2.2}V${y + s * 2.2}" stroke="#fff" stroke-width="1" opacity=".7"/><circle cx="${x}" cy="${y}" r="${s * 0.5}" fill="#fff" opacity=".9"/>`;
  }
  return [g[0]!, g[1]!, g[2]! + glints];
}

function layerClouds(): string {
  const cloud = (x: number, y: number, w: number, h: number, op: number): string =>
    `<g opacity="${op}"><path d="M${x} ${y}c${w * 0.1} ${-h} ${w * 0.28} ${-h * 0.9} ${w * 0.4} ${-h * 0.5}c${w * 0.1} ${-h * 0.7} ${w * 0.3} ${-h * 0.7} ${w * 0.4} ${-h * 0.1}c${w * 0.12} ${-h * 0.3} ${w * 0.2} ${-h * 0.2} ${w * 0.2} ${h * 0.6}c${-w * 0.3} ${h * 0.5} ${-w * 0.7} ${h * 0.4} ${-w} 0z" fill="url(#cloud)"/></g>`;
  return cloud(40, 330, 560, 76, 0.8) + cloud(900, 300, 680, 86, 0.75) + cloud(380, 420, 440, 40, 0.6) + cloud(1180, 410, 520, 46, 0.65) + cloud(-240, 260, 520, 62, 0.5);
}

function layerFar(): string {
  let ref = "", rip = "", boats = "", tl = "", tb = "", fw = "";
  for (let i = 0; i < 30; i++) ref += `<rect x="${f1(rr(640, 740))}" y="${f1(rr(470, 500))}" width="${f1(rr(10, 38))}" height="1.6" fill="#fff0d8" opacity="${f1(rr(0.1, 0.42))}"/>`;
  for (let i = 0; i < 46; i++) rip += `<rect x="${f1(rr(-100, 1700))}" y="${f1(rr(474, 502))}" width="${f1(rr(20, 80))}" height="1" fill="#ffb6c8" opacity="${f1(rr(0.05, 0.24))}"/>`;
  for (const [x, y] of [[240, 480], [420, 476], [1010, 484], [1290, 478], [1530, 482]] as const) {
    boats += `<circle cx="${x}" cy="${y}" r="1.6" fill="#ffe7a8"/><circle cx="${x}" cy="${y}" r="9" fill="url(#bulb)" opacity=".8"/><rect x="${x - 0.7}" y="${y + 2}" width="1.4" height="14" fill="#ffd890" opacity=".35"/>`;
  }
  for (let i = 0; i < 280; i++) {
    const x = rr(-150, 1750);
    const y = rr(497, 537);
    const c = R() < 0.7 ? "#ffd596" : R() < 0.5 ? "#fff3dc" : R() < 0.5 ? "#ff9ab8" : "#8fe9ff";
    tl += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rr(0.7, 1.8))}" fill="${c}" opacity="${f1(rr(0.5, 1))}"/>`;
  }
  for (const [x, y, w] of [[1190, 430, 46], [1250, 452, 34], [1316, 418, 40], [360, 448, 38], [420, 462, 30], [1100, 470, 26]] as const) {
    tb += `<rect x="${x}" y="${y}" width="${w}" height="${520 - y}" fill="#0b0e36"/><rect x="${x + w - 5}" y="${y}" width="5" height="${520 - y}" fill="#3a3a94" opacity=".6"/>`;
    for (let wy = y + 8; wy < 510; wy += 10) for (let wx = x + 5; wx < x + w - 7; wx += 8) if (R() < 0.55) tb += `<rect x="${wx}" y="${wy}" width="3" height="4" fill="${R() < 0.8 ? "#ffd98f" : "#fff"}" opacity="${f1(rr(0.5, 0.95))}"/>`;
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * 6.283;
    fw += `<circle cx="${f1(Math.cos(a) * 36)}" cy="${f1(Math.sin(a) * 36)}" r="2.1" fill="${["#ff9ab8", "#ffe08a", "#8fe9ff"][i % 3]}"/><path d="M0 0L${f1(Math.cos(a) * 36)} ${f1(Math.sin(a) * 36)}" stroke="#7c86e0" stroke-width=".7" opacity=".6"/>`;
  }
  let roofs = "M-200 540L-200 520";
  for (let x = -200; x < 1800; x += rr(14, 34)) roofs += `L${f1(x)} ${f1(rr(514, 524))}L${f1(x + rr(8, 18))} ${f1(rr(512, 528))}`;
  roofs = `<path d="${roofs}L1800 540Z" fill="#0b0a30"/><rect x="-200" y="530" width="2000" height="20" fill="#07071f"/>`;
  return `<rect x="-300" y="464" width="2300" height="52" fill="url(#gulf)"/><ellipse cx="690" cy="470" rx="70" ry="8" fill="#fff4d0" opacity=".3"/>${ref}${rip}${boats}
  <path d="M-200 520Q200 506 560 514T1100 512T1800 518V570H-200Z" fill="url(#land)"/>${tb}
  <g transform="translate(1470 470)"><path d="M-22 50L0 0L22 50" stroke="#2a3290" stroke-width="2.2" fill="none"/><circle r="36" fill="none" stroke="#6c78d8" stroke-width="1.4" opacity=".8"/>${fw}<circle r="3" fill="#cfd6ff"/></g>
  ${roofs}${tl}`;
}

type Pt = [number, number];

function layerBowl(): string {
  const H = 835;
  const A: Pt = [300, 625], C: Pt = [800, 478], B: Pt = [1300, 625];
  const A2: Pt = [285, 632], C2: Pt = [800, 466], B2: Pt = [1315, 632];
  const q = (a: Pt, c: Pt, b: Pt, t: number): Pt => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];
  const arc = (a: Pt, c: Pt, b: Pt, n: number): Pt[] => Array.from({ length: n + 1 }, (_, i) => q(a, c, b, i / n));
  const rxE = 880 * 0.8, ryE = 290 * 0.8, ecy0 = H + 30;
  const aR = Math.atan2((B2[1] - ecy0) / ryE, (B2[0] - 800) / rxE);
  const aL = Math.PI - aR;
  const FGarc: Pt[] = [];
  for (let i = 0; i <= 48; i++) {
    const a = aR + (aL - aR) * (i / 48);
    FGarc.push([800 + Math.cos(a) * rxE, ecy0 + Math.sin(a) * ryE]);
  }
  const F2: Pt[] = [...arc(A2, C2, B2, 24), ...FGarc];
  const inPoly = (x: number, y: number, P: Pt[]): boolean => {
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const [xi, yi] = P[i]!, [xj, yj] = P[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const ecx = 800, ecy = H + 30;
  let crowd = "", seat = "", lamps = "", ads = "", stripes = "", tiers = "";
  const tc = ["#070a2c", "#0c1042", "#131a5e", "#1c2478", "#262e90"];
  [1, 0.9, 0.8, 0.7, 0.6].forEach((k, i) => {
    const rx = 880 * k, ry = 290 * k;
    tiers += `<ellipse cx="${ecx}" cy="${ecy}" rx="${rx}" ry="${ry}" fill="${tc[i]}"/><ellipse cx="${ecx}" cy="${ecy}" rx="${rx}" ry="${ry}" fill="none" stroke="#0a0d38" stroke-width="3" opacity=".7"/>`;
  });
  for (let a2 = 0; a2 < 360; a2 += 2) {
    const t = (a2 * Math.PI) / 180;
    seat += `M${f1(ecx + Math.cos(t) * 880 * 0.6)} ${f1(ecy + Math.sin(t) * 290 * 0.6)}L${f1(ecx + Math.cos(t) * 880)} ${f1(ecy + Math.sin(t) * 290)}`;
  }
  for (let i = 0; i < 1900; i++) {
    const a2 = rr(0, 6.2832), k = 0.6 + 0.4 * Math.sqrt(R());
    const x = ecx + Math.cos(a2) * 880 * k, y = ecy + Math.sin(a2) * 290 * k;
    if (y > 905 || inPoly(x, y, F2)) continue;
    const c = R() < 0.45 ? "#ffe9b8" : R() < 0.4 ? "#fff" : R() < 0.5 ? "#ff9ab8" : "#9fdcff";
    crowd += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rr(0.7, 1.8))}" fill="${c}" opacity="${f1(rr(0.4, 0.95))}"/>`;
  }
  for (let a2 = 0; a2 < 360; a2 += 1.6) {
    const t = (a2 * Math.PI) / 180, x = ecx + Math.cos(t) * 880 * 0.795, y = ecy + Math.sin(t) * 290 * 0.795;
    if (inPoly(x, y, F2) || y > 905) continue;
    lamps += `<circle cx="${f1(x)}" cy="${f1(y)}" r="2" fill="#ffd98a"/>`;
  }
  const adc = ["#c9283c", "#2c4fbf", "#f0b94a", "#3dd6b5", "#f6ead0", "#c9283c"];
  for (let i = 0; i < 22; i++) {
    const t1 = 0.05 + i * 0.0425, t2 = t1 + 0.034, p1 = q(A, C, B, t1), p2 = q(A, C, B, t2);
    ads += `<path d="M${f1(p1[0])} ${f1(p1[1] + 2)}L${f1(p2[0])} ${f1(p2[1] + 2)}L${f1(p2[0])} ${f1(p2[1] + 13)}L${f1(p1[0])} ${f1(p1[1] + 13)}Z" fill="${adc[i % 6]}" opacity=".9"/>`;
  }
  for (let r = 1000; r > 90; r -= 40) stripes += `<ellipse cx="800" cy="${H}" rx="${r}" ry="${r * 0.42}" fill="${((r / 40) | 0) % 2 ? "#2fae6c" : "#1a7a50"}" opacity=".32"/>`;
  let sb = "";
  for (let r = 0; r < 4; r++) for (let c = 0; c < 16; c++) sb += `<circle cx="${728 + c * 9.6}" cy="${508 + r * 8.5}" r="2.2" fill="${c > 4 && c < 11 && r > 0 && r < 3 ? "#8fe9ff" : "#ffd98a"}" opacity="${f1(rr(0.6, 1))}"/>`;
  const wallPath = `M${A2[0]} ${A2[1]}Q${C2[0]} ${C2[1]} ${B2[0]} ${B2[1]}`;
  const fan = `M800 ${H}L${A[0]} ${A[1]}Q${C[0]} ${C[1]} ${B[0]} ${B[1]}Z`;
  return `<defs><clipPath id="fanClip"><path d="${fan}"/></clipPath><radialGradient id="foul" gradientUnits="userSpaceOnUse" cx="800" cy="800" r="560"><stop offset="0" stop-color="#14684a"/><stop offset=".6" stop-color="#0c4f3e"/><stop offset="1" stop-color="#083a32"/></radialGradient><radialGradient id="grass2" gradientUnits="userSpaceOnUse" cx="800" cy="770" r="400"><stop offset="0" stop-color="#58cf88"/><stop offset=".4" stop-color="#26955d"/><stop offset=".75" stop-color="#0f6048"/><stop offset="1" stop-color="#093f36"/></radialGradient></defs>
   <rect x="-300" y="536" width="2200" height="420" fill="#07091f"/>
   <g><rect x="700" y="494" width="200" height="62" rx="4" fill="#0a0e34" stroke="#3a4396" stroke-width="2"/>${sb}<rect x="722" y="545" width="156" height="8" fill="#16205a"/>
     <path d="M440 560L500 536L580 536L596 560Z M1004 560L1020 536L1100 536L1160 560Z" fill="#0b0f36" stroke="#2b3490" stroke-width="1.5"/><rect x="772" y="476" width="56" height="18" fill="#04122a"/></g>
   ${tiers}
   <path d="${seat}" stroke="#080b34" stroke-width="1.6" opacity=".5"/>
   ${lamps}${crowd}
   <ellipse cx="${ecx}" cy="${ecy}" rx="884" ry="292" fill="none" stroke="#070a28" stroke-width="12"/>
   <path d="M${A2[0] - 5} ${A2[1] + 4}A880 290 0 0 0 -90 ${ecy + 30}M${B2[0] + 5} ${B2[1] + 4}A880 290 0 0 1 1690 ${ecy + 30}" fill="none" stroke="#b7c0ff" stroke-width="2" opacity=".6"/>
   <path d="M${A2[0] - 6} ${A2[1] + 8}A874 286 0 0 0 -80 ${ecy + 26}M${B2[0] + 6} ${B2[1] + 8}A874 286 0 0 1 1680 ${ecy + 26}" fill="none" stroke="#ffd58a" stroke-width="2.4" stroke-dasharray="2 9" opacity=".85"/>
   <path d="M${F2.map((p) => f1(p[0]) + " " + f1(p[1])).join("L")}Z" fill="url(#foul)"/>
   <path d="M${FGarc.map((p) => f1(p[0]) + " " + f1(p[1])).join("L")}" fill="none" stroke="#a46d44" stroke-width="15"/>
   <path d="M${FGarc.map((p) => f1(p[0]) + " " + f1(p[1] - 9)).join("L")}" fill="none" stroke="#0c2f78" stroke-width="9"/>
   <path d="M${FGarc.map((p) => f1(p[0]) + " " + f1(p[1] - 12.5)).join("L")}" fill="none" stroke="#7d96f0" stroke-width="1.8" opacity=".8"/>
   <path d="${wallPath}" fill="none" stroke="#0d3a36" stroke-width="12"/>${ads}
   <path d="M${A[0]} ${A[1]}Q${C[0]} ${C[1]} ${B[0]} ${B[1]}" fill="none" stroke="#f0d060" stroke-width="2.4"/>
   <path d="${fan}" fill="url(#grass2)"/>
   <g clip-path="url(#fanClip)">${stripes}
     <path d="M312 646Q800 506 1288 646" fill="none" stroke="#a46d44" stroke-width="16" opacity=".9"/>
     <ellipse cx="800" cy="778" rx="178" ry="76" fill="url(#dirt)"/>
     <path d="M800 818L892 780L800 742L708 780Z" fill="#4fc283"/>
     <path d="M800 818L892 780L800 742L708 780Z" fill="none" stroke="#fff" stroke-width="1.4" opacity=".4"/>
     <ellipse cx="800" cy="${H + 6}" rx="56" ry="22" fill="url(#dirt)"/>
     <path d="M800 ${H}L930 780L800 726L670 780Z" fill="none" stroke="#fff" stroke-width="1.6" opacity=".35"/>
     <path d="M800 ${H}L${A[0]} ${A[1]}M800 ${H}L${B[0]} ${B[1]}" stroke="#fff" stroke-width="2.6" opacity=".7"/>
     <ellipse cx="800" cy="781" rx="17" ry="6" fill="#e0b078"/><rect x="795" y="779" width="10" height="2.4" fill="#fff"/>
     <ellipse cx="800" cy="745" rx="480" ry="180" fill="url(#spill)" opacity=".7"/>
   </g>
   <path d="M797 ${H - 5}h6v4l-3 3l-3 -3zM926 777h9v4h-9zM665 777h9v4h-9zM796 724h9v4h-9z" fill="#fff"/>
   <path d="M${A[0]} ${A[1]}V540M${B[0]} ${B[1]}V540" stroke="#f0d060" stroke-width="4"/><path d="M${A[0] - 1} ${A[1]}V540M${B[0] - 1} ${B[1]}V540" stroke="#fff6b0" stroke-width="1" opacity=".8"/><circle cx="${A[0]}" cy="538" r="3.4" fill="#fff6b0"/><circle cx="${B[0]}" cy="538" r="3.4" fill="#fff6b0"/>
   <ellipse cx="800" cy="760" rx="520" ry="170" fill="url(#spill)" opacity=".22"/>`;
}

function layerMidTowers(): string {
  return '<use href="#tower" transform="translate(432 640) scale(.27)"/><use href="#tower" transform="translate(1196 600) scale(.25)"/><use href="#tower" transform="translate(1384 800) scale(.52)"/>';
}

function lampHalos(): string {
  let o = "";
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      o += `<circle cx="${230 - 87.5 + 35 * c}" cy="${176 - 33 + 22.5 * r}" r="27" fill="url(#halo)" opacity=".9"/>`;
      o += `<circle cx="${f1(1384 + (-87.5 + 35 * c) * 0.52)}" cy="${f1(800 - 724 * 0.52 - 33 * 0.52 + 22.5 * r * 0.52)}" r="14" fill="url(#halo)" opacity=".9"/>`;
    }
  }
  return o;
}

function layerLight(): string {
  const by = (y: number, s: number): number => y - 724 * s;
  return `<g>
     <path d="M158 198L302 198L1200 830L500 800Z" fill="url(#beamL)" opacity=".5"/>
     <path d="M190 198L270 198L1040 818L620 790Z" fill="url(#beamL)" opacity=".75"/>
     <path d="M222 198L238 198L900 800L760 780Z" fill="url(#beamL)"/>
     <path d="M1340 424L1428 424L1000 780L700 740Z" fill="url(#beamR)" opacity=".6"/>
     <path d="M1362 424L1406 424L960 770L800 748Z" fill="url(#beamR)"/>
     <path d="M424 ${by(640, 0.27)}L440 ${by(640, 0.27)}L520 700L420 690Z" fill="url(#beamL)" opacity=".5"/>
     <path d="M1188 ${by(600, 0.25)}L1204 ${by(600, 0.25)}L1080 700L1130 700Z" fill="url(#beamR)" opacity=".5"/>
     <circle cx="432" cy="${by(640, 0.27)}" r="100" fill="url(#halo)" opacity=".85"/><circle cx="1196" cy="${by(600, 0.25)}" r="96" fill="url(#halo)" opacity=".85"/>
     <circle id="bankR" cx="1384" cy="${by(800, 0.52)}" r="180" fill="url(#halo)"/>
     <circle id="bankL" cx="230" cy="176" r="320" fill="url(#halo)"/><ellipse cx="230" cy="190" rx="540" ry="340" fill="url(#halo)" opacity=".28"/>
     <rect x="-140" y="170" width="740" height="12" fill="url(#halo)" opacity=".55"/>${lampHalos()}
   </g>`;
}

function layerHaze(): string {
  return '<rect x="-300" y="560" width="2200" height="170" fill="url(#haze)"/><rect x="-300" y="330" width="2200" height="150" fill="url(#haze)" opacity=".75"/>';
}

function layerFG(): string {
  let heads = "", back = "";
  const person = (x: number, y: number, s: number, fill: string, arm: number): string => {
    let o = `<ellipse cx="${f1(x)}" cy="${f1(y + 34 * s)}" rx="${f1(34 * s)}" ry="${f1(30 * s)}" fill="${fill}"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(17 * s)}" fill="${fill}"/>`;
    if (R() < 0.22) o += `<path d="M${f1(x - 17 * s)} ${f1(y - 4 * s)}a${f1(17 * s)} ${f1(17 * s)} 0 0 1 ${f1(34 * s)} 0z" fill="${fill}"/>`;
    o += `<path d="M${f1(x - 14 * s)} ${f1(y - 12 * s)}A${f1(17 * s)} ${f1(17 * s)} 0 0 1 ${f1(x + 14 * s)} ${f1(y - 12 * s)}" fill="none" stroke="#7c86e8" stroke-width="1.6" opacity=".4"/>`;
    if (arm) {
      const ax = x + arm * 22 * s, ay = y - 50 * s;
      o += `<path d="M${f1(x + arm * 20 * s)} ${f1(y + 22 * s)}L${f1(ax)} ${f1(ay)}" stroke="${fill}" stroke-width="${f1(11 * s)}" stroke-linecap="round"/><circle cx="${f1(ax)}" cy="${f1(ay - 8 * s)}" r="${f1(9 * s)}" fill="${fill}"/>`;
    }
    return o;
  };
  for (let x = -40; x < 1680; x += rr(34, 52)) back += person(x, rr(838, 858), 0.82, "#070a26", 0);
  for (let x = -20; x < 1680; x += rr(40, 58)) {
    const arm = R() < 0.1 ? (R() < 0.5 ? 1 : -1) : 0;
    heads += person(x, rr(872, 892), 1.1, "#02030b", arm);
  }
  const glow = ([[388, 820, "glowP"], [1010, 828, "glowT"], [1230, 818, "glowP"]] as const)
    .map(([x, y, g]) => `<circle cx="${x}" cy="${y}" r="42" fill="url(#${g})"/><rect x="${x - 2.5}" y="${y - 14}" width="5" height="28" rx="2.5" fill="#fff" opacity=".9"/>`)
    .join("");
  return `<path d="M-200 868C100 846 220 848 420 858S780 882 1000 874S1400 854 1800 872V1000H-200Z" fill="url(#fgG)"/>${back}${heads}
   <path d="M-200 896H1800V1000H-200Z" fill="#02030b"/>${glow}
   <path d="M-100 900C60 780 140 760 250 790L290 1000H-100Z" fill="#03040d"/>
   <path d="M250 790C310 798 340 840 338 880" stroke="#6e7ae4" stroke-width="2" opacity=".4" fill="none"/>`;
}

function layerFGAnim(): string {
  return '<g id="pole"><path d="M1540 884V540" stroke="#03040d" stroke-width="8"/><path d="M1541.5 884V540" stroke="#6e7ae4" stroke-width="1.4" opacity=".5"/><path d="M1540 546l86 14-86 24z" fill="#c9283c" class="flag"/><path d="M1540 596l68 11-68 20z" fill="#f6ead0" class="flag" style="animation-delay:-.8s"/><path d="M1540 640l54 9-54 16z" fill="#2c4fbf" class="flag" style="animation-delay:-1.6s"/><circle cx="1540" cy="536" r="5" fill="#fff4cc"/></g>';
}

/** Ids of the parallax layers and how far each drifts (px) with the pointer. */
export const PARALLAX: ReadonlyArray<readonly [string, number]> = [
  ["gSky", 2], ["gSt1", 3], ["gSt2", 3], ["gSt3", 3], ["gCloud", 6], ["gFar", 7], ["gBowl", 10], ["gMid", 13], ["gHaze", 12], ["gTowerL", 20], ["gLight", 20], ["gFG", 34], ["gFGA", 34],
];

/** The whole world as HTML: shared defs, then the layers back to front with the two effect canvases between them. */
export function worldHTML(): string {
  rnd = makeRand(7);
  const st = layerStars();
  return (
    `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${GRADS}${bankDef()}${towerDef()}</defs></svg>` +
    ly("gSky", layerSky()) + ly("gSt1", st[0], "tw1") + ly("gSt2", st[1], "tw2") + ly("gSt3", st[2], "tw3") +
    ly("gCloud", layerClouds(), "drift") +
    ly("gFar", layerFar()) + ly("gBowl", layerBowl()) + '<canvas id="fx"></canvas>' + ly("gMid", layerMidTowers()) +
    ly("gHaze", layerHaze(), "drift2") + ly("gTowerL", '<g id="tl"><use href="#tower" transform="translate(230 900)"/></g>') +
    ly("gLight", layerLight(), "flick") + '<canvas id="fx2"></canvas>' + ly("gFG", layerFG()) + ly("gFGA", layerFGAnim())
  );
}

/** The red painted stitched diamond behind the wordmark. */
export function markHTML(): string {
  const P: Pt[] = [[500, 40], [944, 250], [500, 452], [56, 250]];
  const defs = '<defs><radialGradient id="rglow"><stop offset="0" stop-color="#e03a52" stop-opacity=".4"/><stop offset="1" stop-color="#e03a52" stop-opacity="0"/></radialGradient><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0505f"/><stop offset=".55" stop-color="#d32c44"/><stop offset="1" stop-color="#a21836"/></linearGradient><filter id="rough" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".03 .07" numOctaves="3" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="12"/></filter></defs>';
  let strokes = "", streak = "", ticks = "";
  for (let i = 0; i < 4; i++) {
    const a = P[i]!, b = P[(i + 1) % 4]!;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const o = 26;
    const x1 = a[0] - ux * o, y1 = a[1] - uy * o, x2 = b[0] + ux * o * (i % 2 ? 0.2 : 1.2), y2 = b[1] + uy * o * (i % 2 ? 0.2 : 1.2);
    const bow = (i % 2 ? -1 : 1) * 9, cx = (x1 + x2) / 2 + nx * bow, cy = (y1 + y2) / 2 + ny * bow;
    strokes += `<path class="stitch" d="M${f1(x1)} ${f1(y1)}Q${f1(cx)} ${f1(cy)} ${f1(x2)} ${f1(y2)}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="0"/>`;
    for (const k of [-10, 2, 12]) streak += `<path class="stitch" d="M${f1(x1 + nx * k + ux * 30)} ${f1(y1 + ny * k + uy * 30)}Q${f1(cx + nx * k)} ${f1(cy + ny * k)} ${f1(x2 + nx * k - ux * 50)} ${f1(y2 + ny * k - uy * 50)}" pathLength="1" stroke-dasharray=".42 .05 .22 .06 .15 1"/>`;
    const N = Math.round(L / 46);
    for (let k = 0; k < N; k++) {
      const t = (k + 0.5) / N;
      const px = a[0] + dx * t + nx * (i % 2 ? -1 : 1) * bow * Math.sin(Math.PI * t) * 0.9;
      const py = a[1] + dy * t + ny * (i % 2 ? -1 : 1) * bow * Math.sin(Math.PI * t) * 0.9;
      const tl = (k % 2 ? 1 : -1) * 0.5, ca = Math.cos(tl), sa = Math.sin(tl);
      const vx = nx * ca - ny * sa, vy = nx * sa + ny * ca;
      ticks += `<path d="M${f1(px - vx * 13)} ${f1(py - vy * 13)}L${f1(px + vx * 13)} ${f1(py + vy * 13)}"/>`;
    }
  }
  return `${defs}<ellipse cx="500" cy="262" rx="520" ry="240" fill="url(#rglow)"/>
   <path d="M${P.map((p) => p.join(" ")).join("L")}Z" fill="#c2243c" opacity=".24"/>
   <g filter="url(#rough)" fill="none" stroke-linecap="round"><g stroke="url(#rg)" stroke-width="48" opacity=".86">${strokes}</g><g stroke="#ff9aa4" stroke-width="3.2" opacity=".55">${streak}</g></g>
   <g class="ticks" stroke="#ffe6d8" stroke-width="4.5" stroke-linecap="round" opacity=".9">${ticks}</g>`;
}

/** Film grain tile as a data URL, drawn once. */
let grainUrl = "";
export function grainDataUrl(): string {
  if (grainUrl) return grainUrl;
  const c = document.createElement("canvas");
  c.width = c.height = 160;
  const x = c.getContext("2d");
  if (!x) return "";
  const d = x.createImageData(160, 160);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.random() < 0.5 ? 0 : 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 16 + ((Math.random() * 18) | 0);
  }
  x.putImageData(d, 0, 0);
  grainUrl = c.toDataURL("image/png");
  return grainUrl;
}

export const isPortrait = (): boolean => window.innerWidth <= 820;

/** Fit the 1600x900 world to the hero box: a tall phone view shows the tower and the field. */
export function fitWorld(hero: HTMLElement): void {
  const H = hero.clientHeight || window.innerHeight, W = hero.clientWidth || window.innerWidth;
  const p = isPortrait();
  let vb: string, par: string;
  if (p) {
    const vh = 1700, vw = (vh * W) / H;
    vb = `300 -800 ${f1(vw)} ${vh}`;
    par = "xMidYMax slice";
  } else {
    vb = "0 0 1600 900";
    par = "xMidYMid slice";
  }
  hero.querySelectorAll<SVGSVGElement>(".ly svg").forEach((v) => {
    v.setAttribute("viewBox", vb);
    v.setAttribute("preserveAspectRatio", par);
  });
  hero.querySelector("#tl")?.setAttribute("transform", p ? "translate(150 0)" : "");
}
