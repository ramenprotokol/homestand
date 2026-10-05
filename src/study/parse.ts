export interface Night {
  gamePk: number;
  sportId: number;
  clubId: number;
  club: string;
  date: string;
  weekday: number;
  month: number;
  attendance: number;
  doubleHeader: boolean;
  promoNames: string[];
  promoTypes: string[];
  fireworks: boolean;
  giveaway: boolean;
  city: string | null;
  state: string | null;
  lat: number | null;
  lon: number | null;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const rec = (v: unknown): Rec => (isRec(v) ? v : {});
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function parseGame(g: unknown, sportId: number): Night | null {
  if (!isRec(g)) return null;
  const gamePk = num(g.gamePk);
  const date = str(g.officialDate);
  if (gamePk === null || date === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (str(rec(g.status).detailedState) !== "Final") return null;
  const attendance = num(rec(g.gameInfo).attendance);
  if (attendance === null || attendance <= 0) return null;
  const team = rec(rec(rec(g.teams).home).team);
  const clubId = num(team.id);
  const club = str(team.name);
  if (clubId === null || club === null) return null;
  const promos = Array.isArray(g.promotions) ? g.promotions.filter(isRec) : [];
  const promoNames = promos.map((p) => str(p.name)).filter((s): s is string => s !== null);
  const promoTypes = promos.map((p) => str(p.offerType)).filter((s): s is string => s !== null);
  const loc = rec(rec(g.venue).location);
  const coords = rec(loc.defaultCoordinates);
  const day = new Date(`${date}T12:00:00Z`);
  return {
    gamePk,
    sportId,
    clubId,
    club,
    date,
    weekday: day.getUTCDay(),
    month: day.getUTCMonth() + 1,
    attendance,
    doubleHeader: str(g.doubleHeader) !== "N",
    promoNames,
    promoTypes,
    fireworks: promoNames.some((n) => /firework/i.test(n)),
    giveaway: promoTypes.some((t) => t.includes("Giveaway")),
    city: str(loc.city),
    state: str(loc.stateAbbrev),
    lat: num(coords.latitude),
    lon: num(coords.longitude),
  };
}

export function parseSchedule(raw: unknown, sportId: number): Night[] {
  if (!isRec(raw) || !Array.isArray(raw.dates)) return [];
  const out: Night[] = [];
  for (const d of raw.dates) {
    const games = rec(d).games;
    if (!Array.isArray(games)) continue;
    for (const g of games) {
      const n = parseGame(g, sportId);
      if (n) out.push(n);
    }
  }
  return out;
}

export function mergeNights(lists: Night[][]): Night[] {
  const byPk = new Map<number, Night>();
  for (const list of lists) for (const n of list) if (!byPk.has(n.gamePk)) byPk.set(n.gamePk, n);
  return [...byPk.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.gamePk - b.gamePk));
}
