import type { QlooType } from "../../qloo/client";

/** kids: preschool and young children. family: fine for a kids' night too. teen: PG-13 and older fans (sci-fi, wrestling, superhero noir). adult: grown-up music and TV. */
export type Audience = "kids" | "family" | "teen" | "adult";

/** One Qloo entity of a bundle. `names` are the accepted exact names (pickEntity's rule), `year` the required release year. */
export interface EntitySpec {
  key: string;
  type: QlooType;
  query: string;
  names: string[];
  year?: number;
}

/** Month-day window, inclusive, "MM-DD". A window may wrap the new year (from > to). */
export interface DateWindow {
  from: string;
  to: string;
}

/** Music genre of a theme, for concert venues. Swaps for a music night stay in the same genre where they can. */
export type Genre = "country" | "rock" | "pop" | "hip-hop" | "latin" | "classic-rock" | "jam" | "indie" | "r&b" | "emo" | "yacht-rock";

export const GENRE_WORDS: Record<Genre, string> = {
  country: "country", rock: "rock", pop: "pop", "hip-hop": "hip-hop", latin: "Latin", "classic-rock": "classic rock", jam: "jam band", indie: "indie", "r&b": "R&B", emo: "emo", "yacht-rock": "yacht rock",
};

export interface Theme {
  id: string;
  label: string;
  /** Lower-case phrases that identify the theme in calendar text. */
  aliases: string[];
  category: "kids tv" | "film" | "tv" | "music" | "toys and games" | "sports entertainment" | "holiday";
  audience: Audience;
  /** Music themes only. Used by venue runs; club runs ignore it. */
  genre?: Genre;
  /** False for an act that no longer tours (venue runs never offer it as a swap or a support act). Left out means it tours. */
  touring?: boolean;
  /** A tribute or theme night (Yacht Rock, Emo Night): only a tribute date may be swapped to one. */
  tribute?: boolean;
  window?: DateWindow;
  entities: EntitySpec[];
}

const e = (key: string, type: QlooType, query: string, year?: number, ...alt: string[]): EntitySpec => ({
  key, type, query, names: [query, ...alt], ...(year === undefined ? {} : { year }),
});

// The first nine are the study themes: same entities as Amendment 4's kept bundles (their IDs are committed in
// data/entity-ids.json). The rest are typical Minor League pop-culture nights. An entity that has no local affinity
// at the four sample markets is dropped by `npm run qloo:coverage`; a theme left empty is removed.
export const THEME_LIBRARY: readonly Theme[] = [
  { id: "star-wars", label: "Star Wars", category: "film", audience: "family", aliases: ["star wars", "may the 4th", "may the fourth", "jedi", "mandalorian"],
    entities: [e("star-wars:film", "movie", "Star Wars", 1977, "Star Wars: Episode IV - A New Hope"), e("star-wars:tv", "tv_show", "The Mandalorian")] },
  { id: "princess", label: "Princess", category: "kids tv", audience: "kids", aliases: ["princess", "princesses"],
    entities: [e("princess:frozen", "movie", "Frozen", 2013), e("princess:moana", "movie", "Moana", 2016)] },
  { id: "bluey", label: "Bluey", category: "kids tv", audience: "kids", aliases: ["bluey"], entities: [e("bluey:tv", "tv_show", "Bluey")] },
  { id: "harry-potter", label: "Harry Potter", category: "film", audience: "family", aliases: ["harry potter", "hogwarts", "wizarding"],
    entities: [{ key: "harry-potter:books", type: "book", query: "Harry Potter", names: ["Harry Potter and the Sorcerer's Stone (Harry Potter, #1)"] }] },
  { id: "margaritaville", label: "Margaritaville", category: "music", audience: "adult", genre: "country", touring: false, aliases: ["margaritaville", "jimmy buffett", "parrot head", "parrotheads"],
    entities: [e("margaritaville:buffett", "artist", "Jimmy Buffett")] },
  { id: "dinosaur", label: "Dinosaur", category: "kids tv", audience: "kids", aliases: ["dinosaur", "dinosaurs", "dino", "dinos", "jurassic"],
    entities: [e("dinosaur:jp", "movie", "Jurassic Park", 1993), e("dinosaur:jw", "movie", "Jurassic World", 2015)] },
  { id: "country", label: "Country music", category: "music", audience: "adult", genre: "country", aliases: ["country music", "country night", "country western", "country weekend", "country hits"],
    entities: [e("country:combs", "artist", "Luke Combs"), e("country:wallen", "artist", "Morgan Wallen"), e("country:underwood", "artist", "Carrie Underwood")] },
  { id: "marvel", label: "Marvel", category: "film", audience: "family", aliases: ["marvel", "avengers", "spider-man", "spiderman", "superhero", "superheroes", "super heroes"],
    entities: [e("marvel:nwh", "movie", "Spider-Man: No Way Home", 2021)] },
  { id: "wrestling", label: "Pro wrestling", category: "sports entertainment", audience: "teen", aliases: ["wrestling", "wrestler", "wrestlers", "wwe"],
    entities: [e("wrestling:wwe", "brand", "WWE")] },

  { id: "paw-patrol", label: "PAW Patrol", category: "kids tv", audience: "kids", aliases: ["paw patrol"], entities: [e("paw-patrol:tv", "tv_show", "PAW Patrol")] },
  { id: "pokemon", label: "Pokemon", category: "toys and games", audience: "kids", aliases: ["pokemon", "pikachu"], entities: [e("pokemon:tv", "tv_show", "Pokémon")] },
  { id: "super-mario", label: "Super Mario", category: "toys and games", audience: "family", aliases: ["super mario", "mario", "nintendo"],
    entities: [e("super-mario:film", "movie", "The Super Mario Bros. Movie", 2023)] },
  { id: "taylor-swift", label: "Taylor Swift", category: "music", audience: "adult", genre: "pop", aliases: ["taylor swift", "swiftie", "swifties"], entities: [e("taylor-swift:artist", "artist", "Taylor Swift")] },
  { id: "elvis", label: "Elvis", category: "music", audience: "adult", genre: "classic-rock", touring: false, aliases: ["elvis"], entities: [e("elvis:artist", "artist", "Elvis Presley")] },
  { id: "grateful-dead", label: "Grateful Dead", category: "music", audience: "adult", genre: "jam", touring: false, aliases: ["grateful dead", "jerry garcia", "deadhead"], entities: [e("grateful-dead:artist", "artist", "Grateful Dead")] },
  { id: "beatles", label: "The Beatles", category: "music", audience: "adult", genre: "classic-rock", touring: false, aliases: ["beatles", "beatlemania"], entities: [e("beatles:artist", "artist", "The Beatles")] },
  { id: "lord-of-the-rings", label: "Lord of the Rings", category: "film", audience: "teen", aliases: ["lord of the rings", "lotr", "middle earth", "hobbit"],
    entities: [e("lord-of-the-rings:film", "movie", "The Lord of the Rings: The Fellowship of the Ring", 2001)] },
  { id: "stranger-things", label: "Stranger Things", category: "tv", audience: "adult", aliases: ["stranger things", "upside down"], entities: [e("stranger-things:tv", "tv_show", "Stranger Things")] },
  { id: "the-office", label: "The Office", category: "tv", audience: "adult", aliases: ["the office", "dunder mifflin", "dundies"], entities: [e("the-office:tv", "tv_show", "The Office")] },
  { id: "batman", label: "Batman", category: "film", audience: "teen", aliases: ["batman", "dark knight", "gotham"], entities: [e("batman:film", "movie", "The Dark Knight", 2008)] },
  { id: "ninja-turtles", label: "Ninja Turtles", category: "kids tv", audience: "kids", aliases: ["ninja turtles", "tmnt"], entities: [e("ninja-turtles:tv", "tv_show", "Teenage Mutant Ninja Turtles")] },
  { id: "scooby-doo", label: "Scooby-Doo", category: "kids tv", audience: "kids", aliases: ["scooby doo", "scooby-doo", "scooby"], entities: [e("scooby-doo:tv", "tv_show", "Scooby-Doo, Where Are You!", undefined, "Scooby-Doo")] },
  { id: "spongebob", label: "SpongeBob", category: "kids tv", audience: "kids", aliases: ["spongebob", "sponge bob", "bikini bottom"], entities: [e("spongebob:tv", "tv_show", "SpongeBob SquarePants")] },
  { id: "sesame-street", label: "Sesame Street", category: "kids tv", audience: "kids", aliases: ["sesame street", "elmo"], entities: [e("sesame-street:tv", "tv_show", "Sesame Street")] },
  { id: "toy-story", label: "Toy Story", category: "kids tv", audience: "kids", aliases: ["toy story", "buzz lightyear"], entities: [e("toy-story:film", "movie", "Toy Story", 1995)] },
  { id: "barbie", label: "Barbie", category: "toys and games", audience: "family", aliases: ["barbie"], entities: [e("barbie:film", "movie", "Barbie", 2023)] },
  { id: "minecraft", label: "Minecraft", category: "toys and games", audience: "kids", aliases: ["minecraft"], entities: [e("minecraft:film", "movie", "A Minecraft Movie", 2025)] },
  { id: "star-trek", label: "Star Trek", category: "film", audience: "teen", aliases: ["star trek", "trekkie", "trekkies"], entities: [e("star-trek:film", "movie", "Star Trek", 2009)] },
  { id: "ghostbusters", label: "Ghostbusters", category: "film", audience: "family", aliases: ["ghostbusters"], entities: [e("ghostbusters:film", "movie", "Ghostbusters", 1984)] },
  { id: "back-to-the-future", label: "Back to the Future", category: "film", audience: "family", aliases: ["back to the future", "delorean"], entities: [e("back-to-the-future:film", "movie", "Back to the Future", 1985)] },
  { id: "yellowstone", label: "Yellowstone", category: "tv", audience: "adult", aliases: ["yellowstone", "dutton"], entities: [e("yellowstone:tv", "tv_show", "Yellowstone")] },
  { id: "garth-brooks", label: "Garth Brooks", category: "music", audience: "adult", genre: "country", aliases: ["garth brooks", "garth"], entities: [e("garth-brooks:artist", "artist", "Garth Brooks")] },
  { id: "dolly-parton", label: "Dolly Parton", category: "music", audience: "adult", genre: "country", touring: false, aliases: ["dolly parton", "dolly"], entities: [e("dolly-parton:artist", "artist", "Dolly Parton")] },
  { id: "kenny-chesney", label: "Kenny Chesney", category: "music", audience: "adult", genre: "country", aliases: ["kenny chesney", "chesney"], entities: [e("kenny-chesney:artist", "artist", "Kenny Chesney")] },
  { id: "peanuts", label: "Peanuts", category: "kids tv", audience: "family", aliases: ["peanuts", "charlie brown", "snoopy"], entities: [e("peanuts:tv", "tv_show", "Peanuts")] },
  { id: "grinch", label: "The Grinch", category: "holiday", audience: "family", window: { from: "11-01", to: "12-31" }, aliases: ["grinch"],
    entities: [e("grinch:film", "movie", "The Grinch", 2018)] },
  { id: "hocus-pocus", label: "Hocus Pocus", category: "holiday", audience: "family", window: { from: "09-01", to: "10-31" }, aliases: ["hocus pocus", "sanderson sisters"],
    entities: [e("hocus-pocus:film", "movie", "Hocus Pocus", 1993)] },
  { id: "bad-bunny", label: "Bad Bunny", category: "music", audience: "adult", genre: "latin", aliases: ["bad bunny"], entities: [e("bad-bunny:artist", "artist", "Bad Bunny")] },
  { id: "hello-kitty", label: "Hello Kitty", category: "toys and games", audience: "kids", aliases: ["hello kitty", "sanrio"], entities: [e("hello-kitty:brand", "brand", "Hello Kitty")] },
  { id: "top-gun", label: "Top Gun", category: "film", audience: "teen", aliases: ["top gun", "maverick"], entities: [e("top-gun:film", "movie", "Top Gun", 1986)] },
  { id: "pirates", label: "Pirates", category: "film", audience: "family", aliases: ["pirate", "pirates", "jolly roger"],
    entities: [e("pirates:film", "movie", "Pirates of the Caribbean: The Curse of the Black Pearl", 2003)] },
];

export const STUDY_THEME_IDS: readonly string[] = THEME_LIBRARY.slice(0, 9).map((t) => t.id);
export const themeById = (id: string): Theme | undefined => THEME_LIBRARY.find((t) => t.id === id);
