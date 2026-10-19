/** City search covers the US and Canada. Labels read the way a director writes them: "Tulsa, OK". */
const US: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE", "District of Columbia": "DC", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
};
const CA: Record<string, string> = {
  Alberta: "AB", "British Columbia": "BC", Manitoba: "MB", "New Brunswick": "NB", "Newfoundland and Labrador": "NL", "Nova Scotia": "NS", Ontario: "ON", "Prince Edward Island": "PE", Quebec: "QC", Québec: "QC", Saskatchewan: "SK", "Northwest Territories": "NT", Nunavut: "NU", Yukon: "YT",
};

export const SEARCH_COUNTRIES = ["US", "CA"] as const;

/** "Tulsa, OK" or "Calgary, AB". Null for a place outside the US and Canada. */
export function placeLabel(name: string, admin1: string | undefined, countryCode: string | undefined): string | null {
  const cc = (countryCode ?? "").toUpperCase();
  if (cc !== "US" && cc !== "CA") return null;
  const abbr = admin1 ? (cc === "US" ? US : CA)[admin1] ?? admin1 : "";
  return abbr ? `${name}, ${abbr}` : `${name}, ${cc}`;
}
