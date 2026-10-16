// The full pull (study/PREREGISTRATION.md Amendments 4 and 5). Subcommands:
//   qloo    600 Qloo requests -> data/raw/qloo-pull/<club>__<type>.json   (resumable)
//   llm     1,080 Workers AI calls -> data/raw/llm-pull/<club>__<theme>.json (resumable; --max-neurons N stops early)
//   scores  builds data/derived/scores.json from the saved raw files and prints the counts for the pull record
// Reads ONLY club, city, state, lat, lon from clubs-2025.json. Raw responses are gitignored and never committed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { affinityRowsFromBody, createQlooClient, type QlooType } from "../src/qloo/client";
import { parseClubList, parseScores } from "../src/study/analysis";
import {
  LLM_MODEL, MOVIE_RELEASE_YEAR_MIN, QLOO_RADIUS_M, QLOO_TYPES, THEME_IDS, keptIdsOfType, llmPrompt, llmReplyText, parseLlmInteger, slug,
} from "../src/study/kept-bundles";
import { buildScores, type ClubRow, type LlmRecord } from "../src/study/scores-build";
import type { StudyThemeId } from "../src/study/themes";

const QLOO_DIR = "data/raw/qloo-pull";
const LLM_DIR = "data/raw/llm-pull";
const STATS = "data/raw/pull-stats.jsonl";
const SCORES = "data/derived/scores.json";
const KEYS = ["city", "club", "lat", "lon", "state"];

function loadClubs(): ClubRow[] {
  const rows = JSON.parse(readFileSync("data/derived/clubs-2025.json", "utf8")) as Record<string, unknown>[];
  for (const r of rows) if (Object.keys(r).sort().join() !== KEYS.join()) throw new Error(`clubs-2025.json keys are not exactly ${KEYS}`);
  const names = parseClubList(rows);
  if (names.length !== 120) throw new Error(`expected 120 clubs, found ${names.length}`);
  const clubs = rows.map((r) => ({ club: r.club as string, city: r.city as string, state: r.state as string, lat: r.lat as number, lon: r.lon as number }));
  const slugs = new Set(clubs.map((c) => slug(c.club)));
  if (slugs.size !== clubs.length) throw new Error("club slugs collide");
  return clubs;
}

const log = (entry: Record<string, unknown>) => {
  mkdirSync("data/raw", { recursive: true });
  writeFileSync(STATS, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, { flag: "a" });
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function pullQloo(clubs: ClubRow[]): Promise<void> {
  process.loadEnvFile(".dev.vars");
  mkdirSync(QLOO_DIR, { recursive: true });
  let last: { params: Record<string, string>; body: unknown } | undefined;
  const client = createQlooClient({
    baseUrl: process.env.QLOO_API_URL ?? "",
    apiKey: process.env.QLOO_API_KEY ?? "",
    onResponse: (_path, params, body) => { last = { params, body }; },
  });
  let done = 0, skipped = 0;
  try {
    for (const c of clubs) {
      for (const type of QLOO_TYPES) {
        const file = `${QLOO_DIR}/${slug(c.club)}__${type}.json`;
        if (existsSync(file)) { skipped++; continue; }
        // Amendment 4: one batched call per club per type, POINT + 80 km, release-year floor on movie calls only.
        await client.localAffinity({
          type, entityIds: keptIdsOfType(type), lon: c.lon, lat: c.lat, radiusM: QLOO_RADIUS_M,
          ...(type === "movie" ? { releaseYearMin: MOVIE_RELEASE_YEAR_MIN } : {}),
        });
        writeFileSync(file, `${JSON.stringify({ club: c.club, type, params: last!.params, body: last!.body })}\n`);
        done++;
        if (done % 50 === 0) console.log(`qloo: ${done} new (${skipped} already saved), retries ${JSON.stringify(client.retries)}`);
      }
    }
  } finally {
    log({ stage: "qloo", newFiles: done, skipped, requests: client.requests, retries: client.retries });
    console.log(`qloo: ${done} new, ${skipped} already saved, ${client.requests} HTTP requests this run, retries ${JSON.stringify(client.retries)}`);
  }
}

// ---------- LLM ----------

function cfCreds(): { account: string; token: string } {
  const account = process.env.RAMEN_CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.RAMEN_CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) throw new Error("Ramen Cloudflare account id / token missing from the environment");
  return { account, token };
}

interface Call { text: unknown; neurons: number; httpRetries: number }
class QuotaError extends Error {}

async function callModel(prompt: string, creds: { account: string; token: string }): Promise<Call> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${creds.account}/ai/run/${LLM_MODEL}`;
  let httpRetries = 0;
  let last = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }], temperature: 0 }),
      });
      const raw = await res.text();
      if (res.status === 401 || res.status === 403) throw new QuotaError(`Workers AI auth failure: HTTP ${res.status}`);
      if (res.ok) {
        const j = JSON.parse(raw) as { success?: boolean; result?: { usage?: { neurons?: number } } };
        if (j.success === false) throw new Error(`Workers AI success=false: ${raw.slice(0, 300)}`);
        return { text: llmReplyText(j.result), neurons: j.result?.usage?.neurons ?? 0, httpRetries };
      }
      last = `HTTP ${res.status} ${raw.slice(0, 200)}`;
      if (/neuron|daily|quota|limit/i.test(raw) && res.status !== 429) throw new QuotaError(last);
      if (res.status < 500 && res.status !== 429) throw new QuotaError(last);
    } catch (e) {
      if (e instanceof QuotaError) throw e;
      last = e instanceof Error ? e.message : String(e);
    }
    httpRetries++;
    await sleep(1000 * 2 ** attempt);
  }
  throw new QuotaError(`Workers AI still failing after 5 tries: ${last}`);
}

async function pullLlm(clubs: ClubRow[], maxNeurons: number, limit: number): Promise<void> {
  mkdirSync(LLM_DIR, { recursive: true });
  const creds = cfCreds();
  const jobs = clubs.flatMap((c) => THEME_IDS.map((t) => ({ c, t, file: `${LLM_DIR}/${slug(c.club)}__${t}.json` }))).filter((j) => !existsSync(j.file));
  const todo = jobs.slice(0, limit);
  console.log(`llm: ${todo.length} to do now (${jobs.length} not yet saved of ${clubs.length * THEME_IDS.length})`);
  let neurons = 0, calls = 0, httpRetries = 0, nonInteger = 0, stop = false, gate = 0;
  const worker = async () => {
    for (;;) {
      if (stop) return;
      const job = todo.shift();
      if (!job) return;
      const wait = Math.max(0, gate - Date.now());
      gate = Math.max(gate, Date.now()) + 250; // ~4 calls/s across workers
      if (wait) await sleep(wait);
      if (neurons >= maxNeurons) { stop = true; todo.unshift(job); return; }
      const prompt = llmPrompt(job.c.city, job.c.state, job.t);
      try {
        const replies: unknown[] = [];
        const first = await callModel(prompt, creds);
        replies.push(first.text); neurons += first.neurons; calls++; httpRetries += first.httpRetries;
        if (parseLlmInteger(first.text) === null) {
          nonInteger++;
          const second = await callModel(prompt, creds); // Amendment 5: one identical retry
          replies.push(second.text); neurons += second.neurons; calls++; httpRetries += second.httpRetries;
        }
        writeFileSync(job.file, `${JSON.stringify({ club: job.c.club, theme: job.t, prompt, replies, neurons: first.neurons })}\n`);
      } catch (e) {
        stop = true;
        console.error(`llm: STOPPED at ${job.c.club} / ${job.t}: ${e instanceof Error ? e.message : String(e)}`);
        process.exitCode = 1;
      }
      if (calls % 100 === 0) console.log(`llm: ${calls} calls, ${neurons.toFixed(1)} neurons, ${nonInteger} first-try non-integers`);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  log({ stage: "llm", calls, neurons, httpRetries, nonIntegerFirstReplies: nonInteger, remaining: todo.length });
  console.log(`llm: ${calls} HTTP-level calls this run, ${neurons.toFixed(1)} neurons, ${httpRetries} HTTP retries, ${nonInteger} non-integer first replies; ${todo.length} still to do`);
}

// ---------- scores ----------

function writeScores(clubs: ClubRow[]): void {
  const missingFiles: string[] = [];
  for (const c of clubs) {
    for (const t of QLOO_TYPES) if (!existsSync(`${QLOO_DIR}/${slug(c.club)}__${t}.json`)) missingFiles.push(`${c.club}/${t}`);
    for (const t of THEME_IDS) if (!existsSync(`${LLM_DIR}/${slug(c.club)}__${t}.json`)) missingFiles.push(`${c.club}/${t}`);
  }
  if (missingFiles.length) throw new Error(`${missingFiles.length} raw files are not saved yet (e.g. ${missingFiles.slice(0, 3).join(", ")}); finish the pull first`);
  const read = (f: string) => JSON.parse(readFileSync(f, "utf8")) as Record<string, unknown>;
  const out = buildScores({
    clubs,
    pulledAt: new Date().toISOString(),
    readQloo: (club, type: QlooType) => read(`${QLOO_DIR}/${slug(club)}__${type}.json`).body,
    readLlm: (club, theme: StudyThemeId): LlmRecord => ({ replies: read(`${LLM_DIR}/${slug(club)}__${theme}.json`).replies as unknown[] }),
  });
  parseScores(JSON.parse(JSON.stringify(out.scores)));
  mkdirSync("data/derived", { recursive: true });
  writeFileSync(SCORES, `${JSON.stringify(out.scores, null, 2)}\n`);
  // Entities that came back with no affinity at all, for the pull record.
  const perEntityNull: Record<string, number> = {};
  for (const c of clubs) for (const type of QLOO_TYPES) {
    for (const r of affinityRowsFromBody(read(`${QLOO_DIR}/${slug(c.club)}__${type}.json`).body, keptIdsOfType(type))) {
      if (r.affinity === null) perEntityNull[r.name || r.entityId] = (perEntityNull[r.name || r.entityId] ?? 0) + 1;
    }
  }
  console.log(JSON.stringify({ pulledAt: out.scores.pulledAt, missing: out.missing, llmRetried: out.llmRetried, llmNonInteger: out.llmNonInteger, nationalPopularity: out.popularity.perTheme, perEntityPopularity: out.popularity.perEntity, clubsWithNullAffinityByEntity: perEntityNull }, null, 2));
  console.log(`wrote ${SCORES}`);
}

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name: string, dflt: number) => { const i = rest.indexOf(name); return i >= 0 ? Number(rest[i + 1]) : dflt; };
const clubs = loadClubs();
if (cmd === "qloo") await pullQloo(clubs);
else if (cmd === "llm") await pullLlm(clubs, flag("--max-neurons", Infinity), flag("--limit", Infinity));
else if (cmd === "scores") writeScores(clubs);
else { console.error("usage: tsx study/pull.ts qloo | llm [--max-neurons N] [--limit N] | scores"); process.exit(2); }
