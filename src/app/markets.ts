export interface Market {
  label: string;
  lon: number;
  lat: number;
}

export interface SampleMarket extends Market {
  id: string;
  city: string;
  region: string;
}

// Coordinates are city-centre points from the Open-Meteo geocoding API (https://geocoding-api.open-meteo.com/v1/search,
// public, no key), checked 2026-10-15. They name places, never teams: "sample club" only.
export const SAMPLE_MARKETS: readonly SampleMarket[] = [
  { id: "biloxi", city: "Biloxi, MS", region: "Gulf Coast", label: "Biloxi, MS sample club", lon: -88.88531, lat: 30.39603 },
  { id: "albuquerque", city: "Albuquerque, NM", region: "Southwest", label: "Albuquerque, NM sample club", lon: -106.65114, lat: 35.08449 },
  { id: "akron", city: "Akron, OH", region: "Great Lakes", label: "Akron, OH sample club", lon: -81.51901, lat: 41.08144 },
  { id: "portland-me", city: "Portland, ME", region: "New England", label: "Portland, ME sample club", lon: -70.2589, lat: 43.65737 },
];

export const sampleById = (id: string): SampleMarket | undefined => SAMPLE_MARKETS.find((m) => m.id === id);

/** Coordinates are rounded to 3 decimals (about 100 m) for cache keys, so the same place always shares a cache entry. */
export const marketKey = (m: { lon: number; lat: number }): string => `${m.lon.toFixed(3)},${m.lat.toFixed(3)}`;
