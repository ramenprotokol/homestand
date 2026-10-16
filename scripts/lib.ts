import { readFileSync, writeFileSync } from "node:fs";
import { COMMITTED_IDS, activeLibrary, type IdMap } from "../src/app/themes/ids";
import { THEME_LIBRARY } from "../src/app/themes/library";
import { createQlooClient, type QlooType } from "../src/qloo/client";

export const IDS_PATH = new URL("../src/app/data/entity-ids.json", import.meta.url);
export const REF_PATH = new URL("../src/app/data/reference-stats.json", import.meta.url);
export const dry = process.argv.includes("--dry");

export interface IdsFile {
  _note: string;
  ids: IdMap;
  /** Entities dropped for having no local affinity at the sample markets (kept so a re-run does not bring them back). */
  dropped?: Record<string, string>;
}

export const readIds = (): IdsFile => JSON.parse(readFileSync(IDS_PATH, "utf8")) as IdsFile;
export const writeIds = (f: IdsFile): void => writeFileSync(IDS_PATH, JSON.stringify(f, null, 2) + "\n");

export function client() {
  if (!process.env.QLOO_API_KEY || !process.env.QLOO_API_URL) throw new Error("QLOO_API_KEY / QLOO_API_URL missing (run through npm: they load from .dev.vars)");
  return createQlooClient({ baseUrl: process.env.QLOO_API_URL, apiKey: process.env.QLOO_API_KEY, delayMs: 300 });
}

/** Live library from the committed IDs (never synthetic). */
export const liveLibrary = () => activeLibrary(readIds().ids, false);

export const allEntities = () => THEME_LIBRARY.flatMap((t) => t.entities.map((e) => ({ ...e, theme: t.id })));

export const typesOf = (lib: ReturnType<typeof liveLibrary>): QlooType[] => [...new Set(lib.flatMap((t) => t.entities.map((e) => e.type)))];

export function announce(what: string, requests: number): void {
  console.log(`${what}: ${requests} Qloo request${requests === 1 ? "" : "s"}${dry ? " (dry run: none made)" : ""}`);
}

export { COMMITTED_IDS };
