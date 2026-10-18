/** Canvas effects: the hero's fireworks, moths and confetti, and the finale fireworks. Each loop starts and stops on request. */
import { dpr, reduced } from "./motion";
import { rand } from "./rng";

const PAL: ReadonlyArray<readonly [string, string]> = [
  ["#ffd97a", "#fff1c4"], ["#ff7a9a", "#ffd0dc"], ["#7fe3ff", "#d8f6ff"], ["#c9a0ff", "#efe0ff"], ["#ffffff", "#ffe9b8"],
];
type Pal = readonly [string, string];
const pickPal = (): Pal => PAL[Math.floor(Math.random() * PAL.length)]!;

interface Rocket { sx: number; sy: number; tx: number; ty: number; t: number; dur: number; pal: Pal; dead?: boolean }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; tr: number[] }
interface Moth { cx: number; cy: number; rx: number; ry: number; a: number; ph: number; sp: number; s: number; moth: boolean; x: number; y: number }
interface Confetti { x: number; y: number; vy: number; vx: number; r: number; vr: number; ph: number; s: number; c: string }
interface Flash { x: number; y: number; t: number; c: string }
interface Firefly { x: number; y: number; rx: number; ry: number; a: number; sp: number; ph: number }

function ctxOf(cv: HTMLCanvasElement): CanvasRenderingContext2D {
  const c = cv.getContext("2d");
  if (!c) throw new Error("canvas 2d unavailable");
  return c;
}

function trail(c: CanvasRenderingContext2D, s: Spark, width: number): void {
  c.strokeStyle = s.c;
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(s.tr[0]!, s.tr[1]!);
  for (let i = 2; i < s.tr.length; i += 2) c.lineTo(s.tr[i]!, s.tr[i + 1]!);
  c.stroke();
}

function stepSpark(s: Spark, dt: number, gravity: number): void {
  s.life += dt;
  s.vx *= 0.985;
  s.vy = s.vy * 0.985 + gravity * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.tr.push(s.x, s.y);
  if (s.tr.length > 10) s.tr.splice(0, 2);
}

/** Fireworks over the bowl, moths in the light beams and drifting confetti, on the two canvases inside the hero. */
export class HeroFx {
  private readonly cv: HTMLCanvasElement;
  private readonly cv2: HTMLCanvasElement;
  private readonly c: CanvasRenderingContext2D;
  private readonly c2: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private rockets: Rocket[] = [];
  private sparks: Spark[] = [];
  private moths: Moth[] = [];
  private conf: Confetti[] = [];
  private flash: Flash | null = null;
  private next = 1.6;
  private on = false;
  private raf = 0;
  private last = 0;
  private timers: number[] = [];
  private seeded = false;

  constructor(private readonly hero: HTMLElement) {
    this.cv = hero.querySelector<HTMLCanvasElement>("#fx")!;
    this.cv2 = hero.querySelector<HTMLCanvasElement>("#fx2")!;
    this.c = ctxOf(this.cv);
    this.c2 = ctxOf(this.cv2);
    this.resize();
  }

  resize(): void {
    const r = this.cv.parentElement!.getBoundingClientRect();
    const k = dpr(1.25);
    this.w = r.width;
    this.h = r.height;
    for (const [cv, c] of [[this.cv, this.c], [this.cv2, this.c2]] as const) {
      cv.width = Math.max(1, Math.round(r.width * k));
      cv.height = Math.max(1, Math.round(r.height * k));
      c.setTransform(k, 0, 0, k, 0, 0);
    }
    if (!this.seeded) return;
    this.seedAmbient();
  }

  /** Where the two light banks sit, in canvas pixels. Moths gather around them. */
  private banks(): Array<{ x: number; y: number }> {
    const p = this.cv.getBoundingClientRect();
    return ["#bankL", "#bankR"].flatMap((id) => {
      const e = this.hero.querySelector(id);
      if (!e) return [];
      const b = e.getBoundingClientRect();
      return [{ x: b.left + b.width / 2 - p.left, y: b.top + b.height / 2 - p.top }];
    });
  }

  private seedAmbient(): void {
    this.moths = [];
    this.conf = [];
    if (reduced()) return;
    const b = this.banks();
    if (b.length) {
      for (let i = 0; i < 34; i++) {
        const bk = b[i % b.length]!;
        const big = bk === b[0];
        this.moths.push({ cx: bk.x + (big ? rand(80, 330) : rand(-120, -20)), cy: bk.y + (big ? rand(10, 260) : rand(20, 140)), rx: rand(14, 60), ry: rand(10, 40), a: rand(0, 9), ph: rand(0, 9), sp: rand(0.5, 1.1), s: rand(2.2, 4.2), moth: Math.random() < 0.55, x: 0, y: 0 });
      }
    }
    for (let i = 0; i < 22; i++) this.conf.push({ x: rand(0, this.w), y: rand(0, this.h), vy: rand(14, 34), vx: rand(10, 30), r: rand(0, 6), vr: rand(0.6, 1.8), ph: rand(0, 9), s: rand(2.4, 4.6), c: ["#ffd97a", "#f6ead0", "#ff8fb0", "#8fe9ff", "#fff"][i % 5]! });
  }

  private launch(x: number, y: number, top: number, pal: Pal, fast = false): void {
    this.rockets.push({ sx: x, sy: y, tx: x + rand(-30, 30), ty: top, t: 0, dur: fast ? 0.55 : rand(0.8, 1.1), pal });
  }

  private burst(x: number, y: number, pal: Pal): void {
    const n = Math.floor(rand(70, 110));
    const big = rand(1, 1.5);
    const ring = Math.random() < 0.4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + rand(-0.05, 0.05);
      const sp = (ring ? 1 : rand(0.35, 1)) * rand(110, 200) * big;
      this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rand(1.1, 1.9), c: pal[Math.random() < 0.7 ? 0 : 1], tr: [] });
    }
    this.flash = { x, y, t: 0, c: pal[0] };
  }

  /** Prime the ambient life and the opening salvo. With reduced motion this draws one still frame and nothing moves. */
  begin(): void {
    this.seeded = true;
    this.seedAmbient();
    if (reduced()) {
      this.drawStatic();
      return;
    }
    this.launch(this.w * 0.5, this.h * 0.62, this.h * 0.34, PAL[0]!, true);
    this.timers.push(window.setTimeout(() => this.launch(this.w * 0.32, this.h * 0.62, this.h * 0.24, PAL[1]!), 700));
    this.timers.push(window.setTimeout(() => this.launch(this.w * 0.7, this.h * 0.62, this.h * 0.3, PAL[3]!), 1500));
    this.next = 1.6;
  }

  /** A static hero frame for reduced motion: two bursts caught mid-air. */
  private drawStatic(): void {
    for (const [fx, fy, pi] of [[0.5, 0.3, 0], [0.74, 0.22, 3]] as const) {
      this.burst(this.w * fx, this.h * fy, PAL[pi]!);
      for (let k = 0; k < 14; k++) for (const s of this.sparks) stepSpark(s, 0.03, 62);
    }
    this.c.clearRect(0, 0, this.w, this.h);
    this.c.globalCompositeOperation = "lighter";
    for (const s of this.sparks) {
      this.c.globalAlpha = Math.max(0, 1 - s.life / s.max);
      trail(this.c, s, 1.6);
    }
    this.c.globalAlpha = 1;
    this.c.globalCompositeOperation = "source-over";
    this.sparks = [];
  }

  start(): void {
    if (this.on || reduced()) return;
    this.on = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.on = false;
    cancelAnimationFrame(this.raf);
  }

  destroy(): void {
    this.stop();
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.rockets = [];
    this.sparks = [];
  }

  private readonly tick = (now: number): void => {
    if (!this.on) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const { c, w, h } = this;
    c.clearRect(0, 0, w, h);
    c.globalCompositeOperation = "lighter";
    this.next -= dt;
    if (this.next <= 0) {
      this.next = rand(0.9, 1.7);
      this.launch(w * rand(0.2, 0.9), h * 0.62, h * rand(0.07, 0.34), pickPal());
    }
    for (const r of this.rockets) {
      r.t += dt / r.dur;
      const e = 1 - Math.pow(1 - Math.min(r.t, 1), 2);
      const x = r.sx + (r.tx - r.sx) * e, y = r.sy + (r.ty - r.sy) * e;
      const tx = r.sx + (x - r.sx) * 0.82, ty = r.sy + (y - r.sy) * 0.82;
      const g = c.createLinearGradient(x, y, tx, ty);
      g.addColorStop(0, "rgba(255,240,200,.9)");
      g.addColorStop(1, "rgba(255,200,120,0)");
      c.strokeStyle = g;
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(tx, ty);
      c.stroke();
      if (r.t >= 1) {
        r.dead = true;
        this.burst(x, y, r.pal);
      }
    }
    this.rockets = this.rockets.filter((r) => !r.dead);
    if (this.flash) {
      const f = this.flash;
      f.t += dt;
      const a = Math.max(0, 1 - f.t / 0.35);
      if (a > 0) {
        const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, Math.max(w, h) * 0.22);
        g.addColorStop(0, `rgba(255,235,190,${0.28 * a})`);
        g.addColorStop(1, "rgba(255,235,190,0)");
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
      } else this.flash = null;
    }
    for (const s of this.sparks) {
      stepSpark(s, dt, 62);
      const a = Math.max(0, 1 - s.life / s.max);
      c.globalAlpha = a;
      trail(c, s, 1.6);
      c.fillStyle = "#fff";
      c.globalAlpha = a * 0.9;
      c.fillRect(s.x - 1, s.y - 1, 2, 2);
    }
    this.sparks = this.sparks.filter((s) => s.life < s.max);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";

    const c2 = this.c2;
    c2.clearRect(0, 0, w, h);
    for (const m of this.moths) {
      m.a += dt * m.sp;
      m.x = m.cx + Math.cos(m.a * 0.9 + m.ph) * m.rx;
      m.y = m.cy + Math.sin(m.a * 1.3 + m.ph) * m.ry;
      const fl = 0.55 + 0.45 * Math.sin(m.a * 14 + m.ph), sz = m.s;
      c2.fillStyle = `rgba(255,244,214,${0.75 * fl + 0.15})`;
      c2.beginPath();
      if (m.moth) {
        c2.ellipse(m.x - sz, m.y, sz * 1.2, sz * 0.55 * (0.4 + fl), -0.5, 0, 6.3);
        c2.ellipse(m.x + sz, m.y, sz * 1.2, sz * 0.55 * (0.4 + fl), 0.5, 0, 6.3);
      } else c2.arc(m.x, m.y, sz * 0.5, 0, 6.3);
      c2.fill();
    }
    for (const q of this.conf) {
      q.y += q.vy * dt;
      q.x += Math.sin(q.y * 0.012 + q.ph) * q.vx * dt;
      q.r += q.vr * dt;
      if (q.y > h + 20) {
        q.y = -20;
        q.x = rand(0, w);
      }
      c2.save();
      c2.translate(q.x, q.y);
      c2.rotate(q.r);
      c2.scale(1, Math.abs(Math.cos(q.r * 0.7)));
      c2.fillStyle = q.c;
      c2.globalAlpha = 0.85;
      c2.fillRect(-q.s, -q.s * 0.6, q.s * 2, q.s * 1.2);
      c2.restore();
    }
    this.raf = requestAnimationFrame(this.tick);
  };
}

export interface FireworkOptions {
  /** Seconds between rockets. */
  rate: number;
  /** Where bursts happen, as a fraction of the canvas height (top, bottom). */
  top: readonly [number, number];
  big: number;
  sparks: number;
  fireflies: number;
}

/** Fireworks and fireflies on one canvas. Used by the Send finale and the landing teaser. */
export class Fireworks {
  private readonly c: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private k = 1;
  private rk: Rocket[] = [];
  private sp: Spark[] = [];
  private ff: Firefly[] = [];
  private on = false;
  private next = 0;
  private raf = 0;
  private last = 0;

  constructor(private readonly cv: HTMLCanvasElement, private readonly opt: FireworkOptions) {
    this.c = ctxOf(cv);
    this.size();
  }

  size(): void {
    const r = this.cv.parentElement!.getBoundingClientRect();
    this.k = dpr(1.25);
    this.w = r.width;
    this.h = r.height;
    this.cv.width = Math.max(1, Math.round(r.width * this.k));
    this.cv.height = Math.max(1, Math.round(r.height * this.k));
    this.c.setTransform(this.k, 0, 0, this.k, 0, 0);
    this.ff = [];
    for (let i = 0; i < this.opt.fireflies; i++) this.ff.push({ x: rand(0, this.w), y: this.h * rand(0.35, 0.95), rx: rand(10, 60), ry: rand(8, 38), a: rand(0, 9), sp: rand(0.3, 0.9), ph: rand(0, 9) });
  }

  /** One burst right now, so the finale opens with fireworks instead of waiting for a rocket. */
  salvo(n = 3): void {
    for (let i = 0; i < n; i++) this.boom(this.w * rand(0.15, 0.85), this.h * rand(this.opt.top[0], this.opt.top[1]), pickPal());
  }

  private boom(x: number, y: number, pal: Pal): void {
    const n = this.opt.sparks, big = this.opt.big, ring = Math.random() < 0.35;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283, sp = (ring ? 1 : 0.35 + Math.random() * 0.65) * (110 + Math.random() * 100) * big;
      this.sp.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 1.1 + Math.random() * 0.9, c: pal[Math.random() < 0.7 ? 0 : 1], tr: [] });
    }
  }

  /** Draw one frame with a few bursts already in the air. Used when the visitor asked for less motion. */
  drawStill(): void {
    this.salvo(3);
    for (let k = 0; k < 12; k++) for (const s of this.sp) stepSpark(s, 0.04, 60);
    const c = this.c;
    c.clearRect(0, 0, this.w, this.h);
    c.globalCompositeOperation = "lighter";
    for (const s of this.sp) {
      c.globalAlpha = Math.max(0, 1 - s.life / s.max);
      trail(c, s, 1.8);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    this.sp = [];
  }

  start(): void {
    if (this.on || reduced()) return;
    this.on = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.on = false;
    cancelAnimationFrame(this.raf);
  }

  private readonly tick = (now: number): void => {
    if (!this.on) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const { c, w, h, opt } = this;
    c.clearRect(0, 0, w, h);
    c.globalCompositeOperation = "lighter";
    this.next -= dt;
    if (this.next <= 0) {
      this.next = opt.rate * (0.6 + Math.random() * 0.8);
      const sx = w * (0.1 + Math.random() * 0.8);
      this.rk.push({ sx, sy: h * 0.95, tx: sx + (Math.random() - 0.5) * 80, ty: h * (opt.top[0] + Math.random() * (opt.top[1] - opt.top[0])), t: 0, dur: 0.9 + Math.random() * 0.4, pal: pickPal() });
    }
    for (const r of this.rk) {
      r.t += dt / r.dur;
      const e = 1 - Math.pow(1 - Math.min(r.t, 1), 2);
      const x = r.sx + (r.tx - r.sx) * e, y = r.sy + (r.ty - r.sy) * e;
      c.strokeStyle = "rgba(255,230,170,.8)";
      c.lineWidth = 1.8;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(r.sx + (x - r.sx) * 0.85, r.sy + (y - r.sy) * 0.85);
      c.stroke();
      if (r.t >= 1) {
        r.dead = true;
        this.boom(x, y, r.pal);
      }
    }
    this.rk = this.rk.filter((r) => !r.dead);
    for (const s of this.sp) {
      stepSpark(s, dt, 60);
      c.globalAlpha = Math.max(0, 1 - s.life / s.max);
      trail(c, s, 1.8);
    }
    this.sp = this.sp.filter((s) => s.life < s.max);
    c.globalAlpha = 1;
    for (const f of this.ff) {
      f.a += dt * f.sp;
      const x = f.x + Math.sin(f.a) * f.rx, y = f.y + Math.cos(f.a * 0.8) * f.ry, tw = 0.5 + 0.5 * Math.sin(f.a * 3 + f.ph);
      const g = c.createRadialGradient(x, y, 0, x, y, 18);
      g.addColorStop(0, `rgba(255,240,170,${tw})`);
      g.addColorStop(0.25, `rgba(255,214,110,${0.55 * tw})`);
      g.addColorStop(1, "rgba(255,200,80,0)");
      c.fillStyle = g;
      c.fillRect(x - 18, y - 18, 36, 36);
    }
    c.globalCompositeOperation = "source-over";
    this.raf = requestAnimationFrame(this.tick);
  };
}
