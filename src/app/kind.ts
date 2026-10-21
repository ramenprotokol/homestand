/**
 * Two kinds of run share one engine. A club run checks a Minor League club's theme nights; a venue run checks a concert venue's
 * summer calendar of touring acts. Club wording is the default and never changes; venue wording is chosen here.
 */
export type Kind = "club" | "venue";

export const kindOf = (v: unknown): Kind => (v === "venue" ? "venue" : "club");

/**
 * The sport a club run is about. The engine is the same for all of them; only the words differ (copyFor). Baseball is the default and its
 * wording is the original wording. No NFL: a season of eight or so home games is too few to plan theme nights around.
 */
export type Sport = "baseball" | "basketball" | "hockey" | "soccer";

export const SPORTS: readonly Sport[] = ["baseball", "basketball", "hockey", "soccer"];

export const isSport = (v: unknown): v is Sport => typeof v === "string" && (SPORTS as readonly string[]).includes(v);

/** A sport from anything (storage, a link): an unknown value is baseball. */
export const sportOf = (v: unknown): Sport => (isSport(v) ? v : "baseball");

export interface Copy {
  /** "town" / "city": the place the ratings are about. */
  place: string;
  /** What the 40 comparison places are called ("towns", "cities"). They are the same 40 places for both kinds. */
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
  /** "club" / "team": what the organization is called. */
  team: string;
  /** "ballpark" / "arena" / "stadium". */
  venueWord: string;
  /** The sport in lower case, or "" for a venue run. */
  sport: string;
  /** The usual months of the season, in words. */
  months: string;
  /** Examples of proven promos, for the sentence that says they are not graded. */
  provenExamples: string;
  /** The ceremonial moment a sponsor can have ("the first pitch"). */
  firstMoment: string;
  /** Small touches a sponsor can add to a locked night. */
  touches: string;
}

/** The words that change with the sport. Baseball is the original wording. */
export interface SportWords {
  name: string;
  team: string;
  venue: string;
  months: string;
  /** The first and last month of the season (1 to 12). The season wraps over New Year when the first is after the last. */
  seasonMonths: readonly [first: number, last: number];
  /** The stand-in promo the template and the example use where baseball has fireworks. */
  promo: string;
  /** What the kids do after the game, for the template row. */
  kidsNote: string;
  /** The note for a daytime game. */
  dayNote: string;
  provenExamples: string;
  firstMoment: string;
  touches: string;
}

export const SPORT_WORDS: Record<Sport, SportWords> = {
  baseball: { name: "baseball", team: "club", venue: "ballpark", months: "April to September", seasonMonths: [4, 9], promo: "Fireworks Friday", kidsNote: "Kids run the bases after the game", dayNote: "Day game", provenExamples: "fireworks, giveaways, heritage nights", firstMoment: "the first pitch", touches: "walk-up songs, PA clips or a photo spot" },
  basketball: { name: "basketball", team: "team", venue: "arena", months: "November to April", seasonMonths: [11, 4], promo: "T-Shirt Night", kidsNote: "Kids shoot hoops at halftime", dayNote: "Matinee", provenExamples: "T-shirt nights, towel giveaways, heritage nights", firstMoment: "the ceremonial tip-off", touches: "PA clips, video-board moments or a photo spot" },
  hockey: { name: "hockey", team: "team", venue: "arena", months: "October to April", seasonMonths: [10, 4], promo: "Teddy Bear Toss", kidsNote: "Kids skate with the mascot after the game", dayNote: "Matinee", provenExamples: "teddy bear toss, jersey giveaways, heritage nights", firstMoment: "the ceremonial puck drop", touches: "PA clips, video-board moments or a photo spot" },
  soccer: { name: "soccer", team: "team", venue: "stadium", months: "March to October", seasonMonths: [3, 10], promo: "Scarf Giveaway Night", kidsNote: "Kids kick on the pitch after the match", dayNote: "Afternoon kickoff", provenExamples: "scarf giveaways, kit nights, heritage nights", firstMoment: "the ceremonial kickoff", touches: "PA clips, video-board moments or a photo spot" },
};

export const COPY: Record<Kind, Copy> = {
  club: { place: "town", markets: "towns", season: "season", night: "night", nights: "nights", themeNight: "theme night", themeNights: "theme nights", sample: "sample club", memoTitle: "Theme-night rationale", slab: "THEME NIGHT",
    team: SPORT_WORDS.baseball.team, venueWord: SPORT_WORDS.baseball.venue, sport: "baseball", months: SPORT_WORDS.baseball.months, provenExamples: SPORT_WORDS.baseball.provenExamples, firstMoment: SPORT_WORDS.baseball.firstMoment, touches: SPORT_WORDS.baseball.touches },
  venue: { place: "city", markets: "cities", season: "summer series", night: "date", nights: "dates", themeNight: "date", themeNights: "dates", sample: "sample venue", memoTitle: "Summer-series rationale", slab: "",
    team: "venue", venueWord: "amphitheatre", sport: "", months: "May to September", provenExamples: "fireworks, symphony nights, local showcases", firstMoment: "a pre-show video", touches: "a stage-side read, a pre-show video or a giveaway" },
};

/** Club copy for each sport. Baseball is COPY.club itself, so a baseball run reads exactly as it always did. */
const CLUB_BY_SPORT: Record<Sport, Copy> = {
  baseball: COPY.club,
  basketball: sportCopy("basketball"),
  hockey: sportCopy("hockey"),
  soccer: sportCopy("soccer"),
};

function sportCopy(s: Sport): Copy {
  const w = SPORT_WORDS[s];
  return { ...COPY.club, sample: `sample ${w.team}`, team: w.team, venueWord: w.venue, sport: w.name, months: w.months, provenExamples: w.provenExamples, firstMoment: w.firstMoment, touches: w.touches };
}

/** The wording for a run. A venue run ignores the sport. */
export const copyFor = (k: Kind | undefined, sport?: Sport): Copy => (k === "venue" ? COPY.venue : CLUB_BY_SPORT[sport ?? "baseball"]);

/** "Raleigh" from "Raleigh, NC sample amphitheatre" or "Biloxi, MS sample club" (the city alone). */
export const cityOfLabel = (label: string): string => label.split(",")[0]!.replace(/ (sample )?(club|team|amphitheatre)$/, "");

/** "Biloxi, MS" from "Biloxi, MS sample club": the label without the sample tag. */
export const shortLabel = (label: string): string => label.replace(/ (sample )?(club|team|amphitheatre)$/, "");
