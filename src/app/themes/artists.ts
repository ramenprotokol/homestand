import type { QlooType } from "../../qloo/client";
import { THEME_LIBRARY, type EntitySpec, type Genre, type Theme } from "./library";

// The artist library for concert venues. These themes are used only by venue runs: club runs never see them, so a Minor League
// calendar scores, swaps and averages exactly as it did before. Each is one touring artist (or a small declared bundle for a
// tribute night), resolved to a Qloo ID offline by exact name (`npm run qloo:resolve`); a fuzzy match is never forced.
const a = (key: string, query: string, ...alt: string[]): EntitySpec => ({ key, type: "artist" satisfies QlooType, query, names: [query, ...alt] });
const act = (id: string, label: string, genre: Genre, aliases: string[], ...entities: EntitySpec[]): Theme => ({ id, label, category: "music", audience: "adult", genre, aliases, entities });
const solo = (id: string, label: string, genre: Genre, aliases: string[] = [label.toLowerCase()], ...alt: string[]): Theme => act(id, label, genre, aliases, a(`${id}:artist`, label, ...alt));

/** Acts that no longer tour: scored, but never offered as a swap or a support act. */
const NOT_TOURING = new Set(["fleetwood-mac"]);

const ACTS: readonly Theme[] = [
  solo("zach-bryan", "Zach Bryan", "country"),
  solo("chris-stapleton", "Chris Stapleton", "country"),
  solo("luke-bryan", "Luke Bryan", "country"),
  solo("jason-aldean", "Jason Aldean", "country"),
  solo("foo-fighters", "Foo Fighters", "rock"),
  solo("imagine-dragons", "Imagine Dragons", "rock"),
  solo("green-day", "Green Day", "rock"),
  solo("red-hot-chili-peppers", "Red Hot Chili Peppers", "rock", ["red hot chili peppers", "chili peppers"]),
  solo("ed-sheeran", "Ed Sheeran", "pop"),
  solo("dua-lipa", "Dua Lipa", "pop"),
  solo("bruno-mars", "Bruno Mars", "pop"),
  solo("kendrick-lamar", "Kendrick Lamar", "hip-hop", ["kendrick lamar", "kendrick"]),
  solo("post-malone", "Post Malone", "hip-hop"),
  solo("travis-scott", "Travis Scott", "hip-hop"),
  solo("karol-g", "Karol G", "latin"),
  solo("peso-pluma", "Peso Pluma", "latin"),
  solo("fleetwood-mac", "Fleetwood Mac", "classic-rock"),
  solo("stevie-nicks", "Stevie Nicks", "classic-rock"),
  solo("eagles", "Eagles", "classic-rock", ["eagles", "the eagles"]),
  solo("journey", "Journey", "classic-rock"),
  solo("dave-matthews-band", "Dave Matthews Band", "jam", ["dave matthews band", "dave matthews", "dmb"]),
  solo("phish", "Phish", "jam"),
  solo("widespread-panic", "Widespread Panic", "jam"),
  solo("the-lumineers", "The Lumineers", "indie", ["the lumineers", "lumineers"]),
  solo("sza", "SZA", "r&b"),
  solo("the-weeknd", "The Weeknd", "r&b", ["the weeknd", "weeknd"]),
  // Two tribute / theme nights, each a small declared bundle of artists.
  act("yacht-rock", "Yacht Rock", "yacht-rock", ["yacht rock"], a("yacht-rock:hall-oates", "Hall & Oates", "Daryl Hall & John Oates"), a("yacht-rock:steely-dan", "Steely Dan"), a("yacht-rock:loggins", "Kenny Loggins")),
  act("emo-night", "Emo Night", "emo", ["emo night", "emo"], a("emo-night:mcr", "My Chemical Romance"), a("emo-night:fob", "Fall Out Boy"), a("emo-night:paramore", "Paramore")),
];

export const ARTIST_LIBRARY: readonly Theme[] = ACTS.map((t) => ({ ...t, ...(NOT_TOURING.has(t.id) ? { touring: false } : {}), ...(t.id === "yacht-rock" || t.id === "emo-night" ? { tribute: true } : {}) }));

/** Classic venue nights that are not an act: matched on whole words in addition to the baseball list (venue runs only). */
export const VENUE_CLASSIC_PHRASES: readonly string[] = ["battle of the bands", "symphony", "pops concert", "community concert", "benefit concert", "local showcase", "open mic"];

/** The themes a venue run knows: the music themes the club library already has, plus the artist library. Order is stable (the cache key depends on it). */
export const VENUE_LIBRARY: readonly Theme[] = [...THEME_LIBRARY.filter((t) => t.category === "music"), ...ARTIST_LIBRARY];

/** Every theme the app can name: used for labels, never for scoring a club. */
export const ALL_THEMES: readonly Theme[] = [...THEME_LIBRARY, ...ARTIST_LIBRARY];

export const themeById = (id: string): Theme | undefined => ALL_THEMES.find((t) => t.id === id);
