import { DurableObject } from "cloudflare:workers";
import type { CounterPort } from "./ports";

// One SQLite-backed Durable Object holds every counter and gate: the shared Qloo and model daily caps, each client's daily allowances and the
// once-a-day re-check markers. KV keeps only saved results. A Durable Object runs one request at a time and these methods never await, so every
// read-then-write below is atomic: two visitors can never both take the last unit.
//
// Table `c`: k TEXT PRIMARY KEY (e.g. "cap:qloo:2026-11-03", "q:pull:<client>:2026-11-03", "rc:..."), n INTEGER (the count), exp INTEGER (epoch ms).
// A row costs one row written per increase, and a few rows read: about 1 to 3 rows per call against the free plan's 100,000 written and 5,000,000 read a day.
export class Counters extends DurableObject implements CounterPort {
  private readonly sql: SqlStorage;
  private sweeps = 0;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS c (k TEXT PRIMARY KEY, n INTEGER NOT NULL, exp INTEGER NOT NULL)");
  }

  private live(k: string): number {
    const row = this.sql.exec("SELECT n, exp FROM c WHERE k = ?", k).toArray()[0] as { n: number; exp: number } | undefined;
    return row && row.exp > Date.now() ? row.n : 0;
  }

  /** Drops expired rows now and then, so the table stays small. */
  private sweep(): void {
    if (++this.sweeps % 200 === 0) this.sql.exec("DELETE FROM c WHERE exp <= ?", Date.now());
  }

  take(key: string, by: number, cap: number, ttlSec: number): Promise<{ ok: boolean; used: number }> {
    const n = this.live(key);
    if (n + by > cap) return Promise.resolve({ ok: false, used: n });
    this.sql.exec("INSERT INTO c (k, n, exp) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET n = ?, exp = ?", key, n + by, Date.now() + ttlSec * 1000, n + by, Date.now() + ttlSec * 1000);
    this.sweep();
    return Promise.resolve({ ok: true, used: n + by });
  }

  read(keys: string[]): Promise<number[]> {
    return Promise.resolve(keys.map((k) => this.live(k)));
  }

  mark(key: string, ttlSec: number): Promise<boolean> {
    const had = this.live(key) > 0;
    if (!had) {
      this.sql.exec("INSERT INTO c (k, n, exp) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = 1, exp = ?", key, Date.now() + ttlSec * 1000, Date.now() + ttlSec * 1000);
      this.sweep();
    }
    return Promise.resolve(had);
  }

  marked(key: string): Promise<boolean> {
    return Promise.resolve(this.live(key) > 0);
  }
}
