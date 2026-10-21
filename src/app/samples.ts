import { CSV_HEADER, CSV_TEMPLATE, csvField } from "./calendar/csv";
import { SPORT_WORDS, type Sport } from "./kind";

// Four calendars we wrote for the demo: fictional sponsors, no MLB data. April to September 2027 (each date moved forward 52 weeks, so every night keeps its weekday).
// Each has a few locked nights, 3 to 4 classic nights, one ambiguous theme (a name that fits two themes) and one unknown.
type N = [date: string, theme: string, sponsor?: string, locked?: boolean, notes?: string];

const CALENDARS: Record<string, N[]> = {
  biloxi: [
    ["2027-04-09", "Margaritaville Night", "Magnolia Mutual", true, "Sponsor contract signed"],
    ["2027-04-10", "Bluey Day", "Sunrise Dental Group", false, "Day game"],
    ["2027-04-17", "Star Wars Night", "Harbor Credit Union"],
    ["2027-04-23", "Fireworks Friday", "Bayou Bright Energy"],
    ["2027-04-24", "Elvis Night"],
    ["2027-05-01", "Barbie Day", "Pinecrest Auto"],
    ["2027-05-08", "Harry Potter Night"],
    ["2027-05-14", "Military Appreciation Night", "Magnolia Mutual"],
    ["2027-05-15", "Dinosaur Day", "Sunrise Dental Group", false, "Day game"],
    ["2027-05-22", "Marvel Super Heroes Night", "Pinecrest Auto"],
    ["2027-05-29", "Beatles Night"],
    ["2027-06-05", "Dinosaurs & Superheroes", "Harbor Credit Union"],
    ["2027-06-12", "Super Mario Day"],
    ["2027-06-18", "Country Music Night", "Bayou Bright Energy", true, "Post-game concert booked"],
    ["2027-06-19", "Dollar Dog Night"],
    ["2027-06-26", "Taylor Swift Night", "Sunrise Dental Group"],
    ["2027-07-02", "Bad Bunny Night"],
    ["2027-07-10", "Stranger Things Night", "Pinecrest Auto"],
    ["2027-07-17", "Hot Sauce Showdown", "Bayou Bright Energy"],
    ["2027-07-24", "Star Trek Day", "Harbor Credit Union", true, "Sponsor contract signed"],
    ["2027-07-31", "Kenny Chesney Night"],
    ["2027-08-07", "Barbie Night", "Harbor Credit Union"],
    ["2027-08-14", "Grateful Dead Night"],
    ["2027-08-28", "Bobblehead Giveaway", "Magnolia Mutual"],
    ["2027-09-04", "Dolly Parton Night", "Pinecrest Auto", true, "Sponsor contract signed"],
  ],
  albuquerque: [
    ["2027-04-10", "Taylor Swift Night", "Red Mesa Tires"],
    ["2027-04-17", "Bluey Day", "Copper Canyon Bank", false, "Day game"],
    ["2027-04-24", "Hispanic Heritage Night", "Desert Sky Brewing"],
    ["2027-05-01", "Bad Bunny Night"],
    ["2027-05-08", "Princess Day", "", false, "Day game"],
    ["2027-05-15", "Marvel Night", "Red Mesa Tires"],
    ["2027-05-21", "Fireworks Friday", "Desert Sky Brewing"],
    ["2027-05-29", "Stranger Things Night"],
    ["2027-06-05", "Dinosaur Day", "Copper Canyon Bank", false, "Day game"],
    ["2027-06-12", "Country Night", "Desert Sky Brewing", true, "Sponsor contract signed"],
    ["2027-06-19", "Star Wars and Star Trek Night", "Mesa Verde Dental"],
    ["2027-06-26", "Margaritaville Night"],
    ["2027-07-02", "Grateful Dead Night", "Mesa Verde Dental"],
    ["2027-07-10", "Ghostbusters Day", "Red Mesa Tires", false, "Day game"],
    ["2027-07-17", "Chile Roasting Fiesta", "Desert Sky Brewing"],
    ["2027-07-24", "Super Mario Day", "", false, "Day game"],
    ["2027-07-31", "Faith and Family Night", "Copper Canyon Bank"],
    ["2027-08-07", "Wrestling Night"],
    ["2027-08-14", "Garth Brooks Night", "Red Mesa Tires", true, "Sponsor contract signed"],
    ["2027-08-21", "Harry Potter Day", "Mesa Verde Dental", false, "Day game"],
    ["2027-09-04", "Barbie Night"],
    ["2027-09-11", "Jersey Giveaway", "Copper Canyon Bank"],
  ],
  akron: [
    ["2027-04-10", "Bluey Day", "Lakeshore Orthodontics", false, "Day game"],
    ["2027-04-16", "Star Trek Night", "Tallmadge Hardware"],
    ["2027-04-24", "Marvel Super Heroes Day", "Summit Savings", true, "Sponsor contract signed"],
    ["2027-05-01", "Harry Potter Night", "Lakeshore Orthodontics"],
    ["2027-05-07", "Fireworks Friday", "Summit Savings"],
    ["2027-05-15", "Dolly Parton Night"],
    ["2027-05-22", "Veterans Salute Night", "Tallmadge Hardware"],
    ["2027-05-29", "Princess Day", "", false, "Day game"],
    ["2027-06-05", "Star Wars Night", "Summit Savings"],
    ["2027-06-12", "Super Mario Day", "Lakeshore Orthodontics", false, "Day game"],
    ["2027-06-18", "Country Music Night", "Tallmadge Hardware", true, "Post-game concert booked"],
    ["2027-06-26", "Elvis and the Beatles Night", "Summit Savings"],
    ["2027-07-02", "Bad Bunny Night"],
    ["2027-07-10", "Dinosaur Day", "", false, "Day game"],
    ["2027-07-17", "Taylor Swift Night", "Tallmadge Hardware"],
    ["2027-07-24", "Spider-Man Night", "Summit Savings"],
    ["2027-07-31", "Garth Brooks Night"],
    ["2027-08-07", "Harry Potter Day", "Lakeshore Orthodontics", false, "Day game"],
    ["2027-08-14", "Rubber Duck Regatta", "Summit Savings"],
    ["2027-08-21", "Marvel Night", "Tallmadge Hardware"],
    ["2027-08-28", "Bark in the Park"],
    ["2027-09-04", "Star Trek Day", "", false, "Day game"],
    ["2027-09-11", "Hocus Pocus Night", "Lakeshore Orthodontics", true, "Sponsor contract signed"],
    ["2027-09-17", "Kenny Chesney Night"],
  ],
  "portland-me": [
    ["2027-04-17", "Bluey Day", "Pine Tree Pediatrics", false, "Day game"],
    ["2027-04-23", "Star Wars Night", "Casco Bay Seafood Co"],
    ["2027-05-01", "Barbie Day", "", false, "Day game"],
    ["2027-05-08", "Harry Potter Night", "Lighthouse Savings"],
    ["2027-05-15", "Princess Day", "Pine Tree Pediatrics", false, "Day game"],
    ["2027-05-21", "Fireworks Friday", "Lighthouse Savings"],
    ["2027-05-29", "Super Mario Day", "", false, "Day game"],
    ["2027-06-05", "Dinosaur Day", "Pine Tree Pediatrics", false, "Day game"],
    ["2027-06-12", "Taylor Swift Night"],
    ["2027-06-19", "Princess & Dinosaur Day", "Casco Bay Seafood Co"],
    ["2027-06-26", "Margaritaville Night", "Lighthouse Savings", true, "Sponsor contract signed"],
    ["2027-07-02", "Grateful Dead Night"],
    ["2027-07-10", "Elvis Night", "Casco Bay Seafood Co"],
    ["2027-07-17", "Lobster Boat Parade Night", "Lighthouse Savings"],
    ["2027-07-24", "Ghostbusters Day", "", false, "Day game"],
    ["2027-07-31", "Garth Brooks Night", "Casco Bay Seafood Co"],
    ["2027-08-07", "Star Trek Day", "Pine Tree Pediatrics", false, "Day game"],
    ["2027-08-14", "Wrestling Night"],
    ["2027-08-21", "Irish Heritage Night", "Lighthouse Savings"],
    ["2027-09-04", "Yellowstone Night", "Casco Bay Seafood Co", true, "Sponsor contract signed"],
    ["2027-09-11", "Harry Potter Day", "", false, "Day game"],
    ["2027-09-18", "Giveaway Saturday", "Lighthouse Savings"],
  ],
};

// A made-up summer concert calendar for a sample amphitheatre (venue mode): May to September 2027, fictional sponsors, no real venue or
// company. Every act is one that plays amphitheatres (our declared booking tier). Five signed headliners (locked), nine tentative holds naming touring acts, two tribute nights and two classic dates.
// The holds are ours: they are not anyone's real offers.
const VENUE_CALENDARS: Record<string, N[]> = {
  raleigh: [
    ["2027-05-07", "Dave Matthews Band", "Sunbelt Cooling", true, "Contract signed"],
    ["2027-05-15", "Zac Brown Band", "", false, "Tentative hold, offer out"],
    ["2027-05-22", "Avril Lavigne", "Triangle Taproom", false, "Tentative hold, offer out"],
    ["2027-05-29", "Yacht Rock Night", "Brightwater Bank", false, "Tribute night"],
    ["2027-06-05", "Luke Bryan", "Longleaf Mutual", true, "Contract signed"],
    ["2027-06-12", "Fireworks & Symphony", "Oakleaf Credit Union"],
    ["2027-06-18", "Pierce the Veil", "", false, "Tentative hold, offer out"],
    ["2027-06-26", "Journey", "Triangle Taproom", false, "Tentative hold, offer out"],
    ["2027-07-02", "Old Dominion", "", false, "Tentative hold"],
    ["2027-07-10", "Phish", "Sunbelt Cooling", true, "Contract signed"],
    ["2027-07-17", "The Revivalists", "", false, "Tentative hold"],
    ["2027-07-24", "Stevie Nicks", "Oakleaf Credit Union", false, "Tentative hold, offer out"],
    ["2027-07-31", "Local Battle of the Bands", "Brightwater Bank"],
    ["2027-08-07", "Cage the Elephant", "", false, "Tentative hold"],
    ["2027-08-14", "The Lumineers", "Longleaf Mutual", true, "Contract signed"],
    ["2027-08-21", "Emo Night", "Triangle Taproom", false, "Tribute night"],
    ["2027-08-28", "Darius Rucker", "", false, "Tentative hold, offer out"],
    ["2027-09-04", "Jason Aldean", "Oakleaf Credit Union", true, "Contract signed"],
  ],
};

// A made-up basketball calendar for a sample team in Boise (any-sport mode): November 2027 to April 2028, fictional sponsors, no real team.
// The nights come from the same theme library the baseball samples use. Three locked nights, five proven promos, one ambiguous name and one unknown.
const SPORT_CALENDARS: Record<string, N[]> = {
  boise: [
    ["2027-11-12", "T-Shirt Night", "Sawtooth Savings"],
    ["2027-11-13", "Bluey Day", "Gem State Dental", false, "Matinee"],
    ["2027-11-20", "Harry Potter Night", "Foothills Brewing"],
    ["2027-11-27", "Military Appreciation Night", "Capitol Credit Union"],
    ["2027-12-03", "The Grinch Night", "Gem State Dental"],
    ["2027-12-11", "Princess Day", "Snake River Auto", false, "Matinee"],
    ["2027-12-18", "Marvel Super Heroes Night", "Sawtooth Savings", true, "Sponsor contract signed"],
    ["2028-01-07", "Star Wars Night", "Capitol Credit Union"],
    ["2028-01-14", "Stranger Things Night", "Foothills Brewing"],
    ["2028-01-15", "Taylor Swift Night", "Snake River Auto"],
    ["2028-01-21", "Rally Towel Giveaway", "Sawtooth Savings"],
    ["2028-01-22", "Dinosaur Day", "", false, "Matinee"],
    ["2028-01-29", "Country Music Night", "Foothills Brewing", true, "Post-game concert booked"],
    ["2028-02-04", "Marvel and Batman Night", "Gem State Dental"],
    ["2028-02-12", "Black Heritage Night", "Capitol Credit Union"],
    ["2028-02-18", "Bad Bunny Night"],
    ["2028-02-26", "Pro Wrestling Night", "Snake River Auto"],
    ["2028-03-03", "Famous Potato Night", "Sawtooth Savings"],
    ["2028-03-10", "Barbie Night", "Gem State Dental"],
    ["2028-03-18", "Yellowstone Night", "Foothills Brewing", true, "Sponsor contract signed"],
    ["2028-03-25", "Super Mario Day", "", false, "Matinee"],
    ["2028-04-07", "Fan Appreciation Night", "Capitol Credit Union"],
  ],
};

export const VENUE_CALENDAR_IDS = Object.keys(VENUE_CALENDARS);

export function sampleCsv(marketId: string): string {
  const rows = CALENDARS[marketId] ?? SPORT_CALENDARS[marketId] ?? VENUE_CALENDARS[marketId];
  if (!rows) throw new Error(`No sample calendar for ${marketId}`);
  const lines = rows.map(([d, t, s = "", l = false, n = ""]) => [d, t, s, l ? "yes" : "no", n].map(csvField).join(","));
  return `${CSV_HEADER}\n${lines.join("\n")}\n`;
}

export const SAMPLE_CALENDAR_IDS = Object.keys(CALENDARS);

// "Load an example" on the own-calendar page: 20 nights across kids, family, teen and adult themes, one classic night, one locked
// and sponsored night, and exactly one recognised-but-unscored name (PAW Patrol) to show that the app says so. Every other
// theme is scored live.
const EXAMPLE: N[] = [
  ["2027-04-09", "Fireworks Friday", "Prairie Bank"],
  ["2027-04-10", "Bluey Day", "Sunrise Dental Group", false, "Day game"],
  ["2027-04-17", "Marvel Super Heroes Night", "Harbor Credit Union"],
  ["2027-04-24", "PAW Patrol Day", "", false, "Day game"],
  ["2027-05-01", "Taylor Swift Night"],
  ["2027-05-08", "Barbie Day", "Pinecrest Auto", false, "Day game"],
  ["2027-05-14", "Country Music Night", "Prairie Bank", true, "Post-game concert booked"],
  ["2027-05-15", "Dinosaur Day", "", false, "Day game"],
  ["2027-05-22", "Super Mario Day", "Pinecrest Auto"],
  ["2027-05-29", "Princess Day", "Sunrise Dental Group", false, "Day game"],
  ["2027-06-04", "Beatles Night"],
  ["2027-06-05", "Ghostbusters Day", "", false, "Day game"],
  ["2027-06-12", "Star Trek Night", "Harbor Credit Union"],
  ["2027-06-19", "Stranger Things Night"],
  ["2027-06-26", "Bad Bunny Night", "Sunrise Dental Group"],
  ["2027-07-03", "Elvis Night", "Prairie Bank"],
  ["2027-07-10", "Margaritaville Night", "Pinecrest Auto"],
  ["2027-07-17", "Grateful Dead Night"],
  ["2027-07-24", "Yellowstone Night", "Harbor Credit Union"],
  ["2027-08-07", "Pro Wrestling Night"],
];

const addDays = (iso: string, days: number): string => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
/** Days the example moves forward so each night keeps its weekday and lands in the sport's season. Baseball is not moved. */
const EXAMPLE_SHIFT: Record<Sport, number> = { baseball: 0, basketball: 217, hockey: 203, soccer: 0 };

/** The example calendar. Baseball is the original; another sport moves the dates into its season and uses its own promo and game-time notes. */
export function exampleCsv(sport: Sport = "baseball"): string {
  const w = SPORT_WORDS[sport];
  const rows: N[] = sport === "baseball" ? EXAMPLE : EXAMPLE.map(([d, t, sp, l, n]) => [addDays(d, EXAMPLE_SHIFT[sport]), t === "Fireworks Friday" ? w.promo : t, sp, l, n === "Day game" ? w.dayNote : n]);
  const lines = rows.map(([d, t, s = "", l = false, n = ""]) => [d, t, s, l ? "yes" : "no", n].map(csvField).join(","));
  return `${CSV_HEADER}\n${lines.join("\n")}\n`;
}

/** The header and three starter rows for the paste box and the template download. Baseball is the original text. */
export function csvTemplate(sport: Sport = "baseball"): string {
  const w = SPORT_WORDS[sport];
  if (sport === "baseball") return CSV_TEMPLATE;
  const a = w.dateExample;
  return `${CSV_HEADER}\n${a},Bluey Night,Harbor Credit Union,no,${w.kidsNote}\n${addDays(a, 7)},${w.promo},,no,\n${addDays(a, 28)},Star Wars Night,Gulf Coast Dental,yes,Sponsor contract signed\n`;
}
