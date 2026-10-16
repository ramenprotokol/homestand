import type { QlooType } from "../qloo/client";
import type { StudyThemeId } from "./themes";

/** One search to try for a bundle entity; `names` are the accepted (normalised-equal) names, aliases included. */
export interface Attempt {
  query: string;
  type: QlooType;
  names: string[];
}

export interface BundleEntity {
  key: string;
  theme: StudyThemeId;
  /** Tried in order; the first attempt that resolves wins. */
  attempts: Attempt[];
  /** Required release year (films). */
  year?: number;
}

const a = (query: string, type: QlooType, ...aliases: string[]): Attempt => ({ query, type, names: [query, ...aliases] });

// Wording is fixed by the pre-registration (Predictors) and Amendment 1 (Dinosaur Train).
export const BUNDLE_ENTITIES: ReadonlyArray<BundleEntity> = [
  { key: "star-wars:film", theme: "star-wars", year: 1977, attempts: [a("Star Wars", "movie", "Star Wars: Episode IV - A New Hope")] },
  { key: "star-wars:tv", theme: "star-wars", attempts: [a("The Mandalorian", "tv_show")] },
  { key: "princess:frozen", theme: "princess", year: 2013, attempts: [a("Frozen", "movie")] },
  { key: "princess:moana", theme: "princess", year: 2016, attempts: [a("Moana", "movie")] },
  { key: "princess:cinderella", theme: "princess", year: 1950, attempts: [a("Cinderella", "movie")] },
  { key: "princess:tangled", theme: "princess", year: 2010, attempts: [a("Tangled", "movie")] },
  { key: "bluey:tv", theme: "bluey", attempts: [a("Bluey", "tv_show")] },
  {
    key: "harry-potter:film", theme: "harry-potter", year: 2001,
    attempts: [a("Harry Potter and the Sorcerer's Stone", "movie", "Harry Potter and the Philosopher's Stone")],
  },
  {
    // Qloo has no series entity; the first book is the "(Harry Potter, #1)" entity. The plain-titled
    // "Harry Potter and the Sorcerer's Stone" book entity has no popularity and returns no local data.
    key: "harry-potter:books", theme: "harry-potter",
    attempts: [{ query: "Harry Potter", type: "book", names: ["Harry Potter and the Sorcerer's Stone (Harry Potter, #1)"] }],
  },
  { key: "margaritaville:buffett", theme: "margaritaville", attempts: [a("Jimmy Buffett", "artist")] },
  { key: "dinosaur:jp", theme: "dinosaur", year: 1993, attempts: [a("Jurassic Park", "movie")] },
  { key: "dinosaur:jw", theme: "dinosaur", year: 2015, attempts: [a("Jurassic World", "movie")] },
  { key: "dinosaur:train", theme: "dinosaur", attempts: [a("Dinosaur Train", "tv_show")] },
  { key: "country:combs", theme: "country", attempts: [a("Luke Combs", "artist")] },
  { key: "country:wallen", theme: "country", attempts: [a("Morgan Wallen", "artist")] },
  { key: "country:underwood", theme: "country", attempts: [a("Carrie Underwood", "artist")] },
  { key: "marvel:avengers", theme: "marvel", year: 2012, attempts: [a("The Avengers", "movie")] },
  { key: "marvel:nwh", theme: "marvel", year: 2021, attempts: [a("Spider-Man: No Way Home", "movie")] },
  { key: "wrestling:wwe", theme: "wrestling", attempts: [a("WWE", "brand"), a("WWE", "tv_show")] },
];
