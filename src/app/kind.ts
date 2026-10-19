/**
 * Two kinds of run share one engine. A club run checks a Minor League club's theme nights; a venue run checks a concert venue's
 * summer calendar of touring acts. Club wording is the default and never changes; venue wording is chosen here.
 */
export type Kind = "club" | "venue";

export const kindOf = (v: unknown): Kind => (v === "venue" ? "venue" : "club");

export interface Copy {
  /** "ballpark" / "venue": the place the market is around. */
  place: string;
  /** What the 40 reference markets are called. They are the same 40 cities for both kinds, so a venue run says "reference markets". */
  markets: string;
  /** "the season" / "the summer series". */
  season: string;
  /** One date on the calendar. */
  night: string;
  nights: string;
  /** "theme night" / "date". */
  themeNight: string;
  themeNights: string;
  /** "sample club" / "sample venue". */
  sample: string;
  /** What a document about the run is called. */
  memoTitle: string;
  /** The word under a card's name when the name has no "Night" or "Day" ending. */
  slab: string;
}

export const COPY: Record<Kind, Copy> = {
  club: { place: "ballpark", markets: "ballpark markets", season: "season", night: "night", nights: "nights", themeNight: "theme night", themeNights: "theme nights", sample: "sample club", memoTitle: "Theme-night rationale", slab: "THEME NIGHT" },
  venue: { place: "venue", markets: "reference markets", season: "summer series", night: "date", nights: "dates", themeNight: "date", themeNights: "dates", sample: "sample venue", memoTitle: "Summer-series rationale", slab: "SHOW" },
};

export const copyFor = (k: Kind | undefined): Copy => COPY[k ?? "club"];

/** "Raleigh" from "Raleigh, NC sample amphitheatre" or "Biloxi, MS sample club" (the city alone). */
export const cityOfLabel = (label: string): string => label.split(",")[0]!.replace(/ (sample )?(club|amphitheatre)$/, "");

/** "Biloxi, MS" from "Biloxi, MS sample club": the label without the sample tag. */
export const shortLabel = (label: string): string => label.replace(/ (sample )?(club|amphitheatre)$/, "");
