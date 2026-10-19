import { CSV_HEADER, csvField } from "./calendar/csv";

// Four calendars we wrote for the demo: fictional sponsors, no MLB data. April to September 2026.
// Each has a few locked nights, 3 to 4 classic nights, one ambiguous theme (a name that fits two themes) and one unknown.
type N = [date: string, theme: string, sponsor?: string, locked?: boolean, notes?: string];

const CALENDARS: Record<string, N[]> = {
  biloxi: [
    ["2026-04-10", "Margaritaville Night", "Magnolia Mutual", true, "Sponsor contract signed"],
    ["2026-04-11", "Bluey Day", "Sunrise Dental Group", false, "Day game"],
    ["2026-04-18", "Star Wars Night", "Harbor Credit Union"],
    ["2026-04-24", "Fireworks Friday", "Bayou Bright Energy"],
    ["2026-04-25", "Princess Day", "", false, "Day game"],
    ["2026-05-02", "Barbie Day", "Pinecrest Auto"],
    ["2026-05-09", "Harry Potter Night"],
    ["2026-05-15", "Military Appreciation Night", "Magnolia Mutual"],
    ["2026-05-16", "Dinosaur Day", "Sunrise Dental Group", false, "Day game"],
    ["2026-05-23", "Marvel Super Heroes Night", "Pinecrest Auto"],
    ["2026-05-30", "Beatles Night"],
    ["2026-06-06", "Dinosaurs & Superheroes", "Harbor Credit Union"],
    ["2026-06-13", "Super Mario Day"],
    ["2026-06-19", "Country Music Night", "Bayou Bright Energy", true, "Post-game concert booked"],
    ["2026-06-20", "Dollar Dog Night"],
    ["2026-06-27", "Ghostbusters Day", "Sunrise Dental Group", false, "Day game"],
    ["2026-07-03", "Bad Bunny Night"],
    ["2026-07-11", "Stranger Things Night", "Pinecrest Auto"],
    ["2026-07-18", "Hot Sauce Showdown", "Bayou Bright Energy"],
    ["2026-07-25", "Star Trek Day", "Harbor Credit Union", true, "Sponsor contract signed"],
    ["2026-08-01", "Kenny Chesney Night"],
    ["2026-08-08", "Barbie Night", "Harbor Credit Union"],
    ["2026-08-15", "Grateful Dead Night"],
    ["2026-08-29", "Bobblehead Giveaway", "Magnolia Mutual"],
    ["2026-09-05", "Dolly Parton Night", "Pinecrest Auto", true, "Sponsor contract signed"],
  ],
  albuquerque: [
    ["2026-04-11", "Taylor Swift Night", "Red Mesa Tires"],
    ["2026-04-18", "Bluey Day", "Copper Canyon Bank", false, "Day game"],
    ["2026-04-25", "Hispanic Heritage Night", "Desert Sky Brewing"],
    ["2026-05-02", "Bad Bunny Night"],
    ["2026-05-09", "Princess Day", "", false, "Day game"],
    ["2026-05-16", "Marvel Night", "Red Mesa Tires"],
    ["2026-05-22", "Fireworks Friday", "Desert Sky Brewing"],
    ["2026-05-30", "Stranger Things Night"],
    ["2026-06-06", "Dinosaur Day", "Copper Canyon Bank", false, "Day game"],
    ["2026-06-13", "Country Night", "Desert Sky Brewing", true, "Sponsor contract signed"],
    ["2026-06-20", "Star Wars and Star Trek Night", "Mesa Verde Dental"],
    ["2026-06-27", "Margaritaville Night"],
    ["2026-07-03", "Grateful Dead Night", "Mesa Verde Dental"],
    ["2026-07-11", "Ghostbusters Day", "Red Mesa Tires", false, "Day game"],
    ["2026-07-18", "Chile Roasting Fiesta", "Desert Sky Brewing"],
    ["2026-07-25", "Super Mario Day", "", false, "Day game"],
    ["2026-08-01", "Faith and Family Night", "Copper Canyon Bank"],
    ["2026-08-08", "Wrestling Night"],
    ["2026-08-15", "Garth Brooks Night", "Red Mesa Tires", true, "Sponsor contract signed"],
    ["2026-08-22", "Harry Potter Day", "Mesa Verde Dental", false, "Day game"],
    ["2026-09-05", "Barbie Night"],
    ["2026-09-12", "Jersey Giveaway", "Copper Canyon Bank"],
  ],
  akron: [
    ["2026-04-11", "Bluey Day", "Lakeshore Orthodontics", false, "Day game"],
    ["2026-04-17", "Star Trek Night", "Tallmadge Hardware"],
    ["2026-04-25", "Marvel Super Heroes Day", "Summit Savings", true, "Sponsor contract signed"],
    ["2026-05-02", "Harry Potter Night", "Lakeshore Orthodontics"],
    ["2026-05-08", "Fireworks Friday", "Summit Savings"],
    ["2026-05-16", "Dolly Parton Night"],
    ["2026-05-23", "Veterans Salute Night", "Tallmadge Hardware"],
    ["2026-05-30", "Princess Day", "", false, "Day game"],
    ["2026-06-06", "Star Wars Night", "Summit Savings"],
    ["2026-06-13", "Super Mario Day", "Lakeshore Orthodontics", false, "Day game"],
    ["2026-06-19", "Country Music Night", "Tallmadge Hardware", true, "Post-game concert booked"],
    ["2026-06-27", "Elvis and the Beatles Night", "Summit Savings"],
    ["2026-07-03", "Bad Bunny Night"],
    ["2026-07-11", "Dinosaur Day", "", false, "Day game"],
    ["2026-07-18", "Taylor Swift Night", "Tallmadge Hardware"],
    ["2026-07-25", "Spider-Man Night", "Summit Savings"],
    ["2026-08-01", "Garth Brooks Night"],
    ["2026-08-08", "Harry Potter Day", "Lakeshore Orthodontics", false, "Day game"],
    ["2026-08-15", "Rubber Duck Regatta", "Summit Savings"],
    ["2026-08-22", "Marvel Night", "Tallmadge Hardware"],
    ["2026-08-29", "Bark in the Park"],
    ["2026-09-05", "Star Trek Day", "", false, "Day game"],
    ["2026-09-12", "Hocus Pocus Night", "Lakeshore Orthodontics", true, "Sponsor contract signed"],
    ["2026-09-18", "Kenny Chesney Night"],
  ],
  "portland-me": [
    ["2026-04-18", "Bluey Day", "Pine Tree Pediatrics", false, "Day game"],
    ["2026-04-24", "Star Wars Night", "Casco Bay Seafood Co"],
    ["2026-05-02", "Barbie Day", "", false, "Day game"],
    ["2026-05-09", "Harry Potter Night", "Lighthouse Savings"],
    ["2026-05-16", "Princess Day", "Pine Tree Pediatrics", false, "Day game"],
    ["2026-05-22", "Fireworks Friday", "Lighthouse Savings"],
    ["2026-05-30", "Super Mario Day", "", false, "Day game"],
    ["2026-06-06", "Dinosaur Day", "Pine Tree Pediatrics", false, "Day game"],
    ["2026-06-13", "Taylor Swift Night"],
    ["2026-06-20", "Princess & Dinosaur Day", "Casco Bay Seafood Co"],
    ["2026-06-27", "Margaritaville Night", "Lighthouse Savings", true, "Sponsor contract signed"],
    ["2026-07-03", "Grateful Dead Night"],
    ["2026-07-11", "Elvis Night", "Casco Bay Seafood Co"],
    ["2026-07-18", "Lobster Boat Parade Night", "Lighthouse Savings"],
    ["2026-07-25", "Ghostbusters Day", "", false, "Day game"],
    ["2026-08-01", "Garth Brooks Night", "Casco Bay Seafood Co"],
    ["2026-08-08", "Star Trek Day", "Pine Tree Pediatrics", false, "Day game"],
    ["2026-08-15", "Wrestling Night"],
    ["2026-08-22", "Irish Heritage Night", "Lighthouse Savings"],
    ["2026-09-05", "Yellowstone Night", "Casco Bay Seafood Co", true, "Sponsor contract signed"],
    ["2026-09-12", "Harry Potter Day", "", false, "Day game"],
    ["2026-09-19", "Giveaway Saturday", "Lighthouse Savings"],
  ],
};

export function sampleCsv(marketId: string): string {
  const rows = CALENDARS[marketId];
  if (!rows) throw new Error(`No sample calendar for ${marketId}`);
  const lines = rows.map(([d, t, s = "", l = false, n = ""]) => [d, t, s, l ? "yes" : "no", n].map(csvField).join(","));
  return `${CSV_HEADER}\n${lines.join("\n")}\n`;
}

export const SAMPLE_CALENDAR_IDS = Object.keys(CALENDARS);

// "Load an example" on the own-calendar page: 20 nights across kids, family, music, film and sports themes, one classic
// night and one locked, sponsored night, so most US and Canadian cities get at least one swap to look at.
const EXAMPLE: N[] = [
  ["2027-04-09", "Fireworks Friday", "Prairie Bank"],
  ["2027-04-10", "Bluey Day", "Sunrise Dental Group", false, "Day game"],
  ["2027-04-17", "Marvel Super Heroes Night", "Harbor Credit Union"],
  ["2027-04-24", "PAW Patrol Day", "", false, "Day game"],
  ["2027-05-01", "Taylor Swift Night"],
  ["2027-05-08", "Barbie Day", "Pinecrest Auto", false, "Day game"],
  ["2027-05-14", "Country Music Night", "Prairie Bank", true, "Post-game concert booked"],
  ["2027-05-15", "Dinosaur Day", "", false, "Day game"],
  ["2027-05-22", "Peanuts Day", "Pinecrest Auto"],
  ["2027-05-29", "Princess Day", "Sunrise Dental Group", false, "Day game"],
  ["2027-06-04", "Beatles Night"],
  ["2027-06-05", "Pokemon Day", "", false, "Day game"],
  ["2027-06-12", "Batman Night", "Harbor Credit Union"],
  ["2027-06-19", "Stranger Things Night"],
  ["2027-06-26", "Bad Bunny Night", "Sunrise Dental Group"],
  ["2027-07-03", "Elvis Night", "Prairie Bank"],
  ["2027-07-10", "Margaritaville Night", "Pinecrest Auto"],
  ["2027-07-17", "The Office Night"],
  ["2027-07-24", "Yellowstone Night", "Harbor Credit Union"],
  ["2027-08-07", "Lord of the Rings Night"],
];

export function exampleCsv(): string {
  const lines = EXAMPLE.map(([d, t, s = "", l = false, n = ""]) => [d, t, s, l ? "yes" : "no", n].map(csvField).join(","));
  return `${CSV_HEADER}\n${lines.join("\n")}\n`;
}
