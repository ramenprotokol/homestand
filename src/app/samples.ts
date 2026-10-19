import { CSV_HEADER, csvField } from "./calendar/csv";

// Four calendars we wrote for the demo: fictional sponsors, no MLB data. April to September 2027 (each date moved forward 52 weeks, so every night keeps its weekday).
// Each has a few locked nights, 3 to 4 classic nights, one ambiguous theme (a name that fits two themes) and one unknown.
type N = [date: string, theme: string, sponsor?: string, locked?: boolean, notes?: string];

const CALENDARS: Record<string, N[]> = {
  biloxi: [
    ["2027-04-09", "Margaritaville Night", "Magnolia Mutual", true, "Sponsor contract signed"],
    ["2027-04-10", "Bluey Day", "Sunrise Dental Group", false, "Day game"],
    ["2027-04-17", "Star Wars Night", "Harbor Credit Union"],
    ["2027-04-23", "Fireworks Friday", "Bayou Bright Energy"],
    ["2027-04-24", "Princess Day", "", false, "Day game"],
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
    ["2027-06-26", "Ghostbusters Day", "Sunrise Dental Group", false, "Day game"],
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
