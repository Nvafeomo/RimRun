/**
 * Approximate geographic centers of US states + DC (WGS84).
 * Used when the user searches by state alone so the map anchors on the state,
 * not an arbitrary city the platform geocoder picks first.
 */
type StateRow = { abbr: string; name: string; lat: number; lng: number };

const US_STATES: StateRow[] = [
  { abbr: "AL", name: "Alabama", lat: 32.806671, lng: -86.79113 },
  { abbr: "AK", name: "Alaska", lat: 61.370716, lng: -152.404419 },
  { abbr: "AZ", name: "Arizona", lat: 33.729759, lng: -111.431221 },
  { abbr: "AR", name: "Arkansas", lat: 34.893799, lng: -92.442597 },
  { abbr: "CA", name: "California", lat: 36.116203, lng: -119.681564 },
  { abbr: "CO", name: "Colorado", lat: 39.059811, lng: -105.311104 },
  { abbr: "CT", name: "Connecticut", lat: 41.597782, lng: -72.755371 },
  { abbr: "DE", name: "Delaware", lat: 39.318523, lng: -75.507141 },
  { abbr: "DC", name: "District of Columbia", lat: 38.897438, lng: -77.026817 },
  { abbr: "FL", name: "Florida", lat: 27.766279, lng: -81.686783 },
  { abbr: "GA", name: "Georgia", lat: 33.040619, lng: -83.643074 },
  { abbr: "HI", name: "Hawaii", lat: 21.094318, lng: -157.498337 },
  { abbr: "ID", name: "Idaho", lat: 44.240459, lng: -114.478828 },
  { abbr: "IL", name: "Illinois", lat: 40.349457, lng: -88.986137 },
  { abbr: "IN", name: "Indiana", lat: 39.849426, lng: -86.258278 },
  { abbr: "IA", name: "Iowa", lat: 42.011539, lng: -93.210526 },
  { abbr: "KS", name: "Kansas", lat: 38.5266, lng: -96.726486 },
  { abbr: "KY", name: "Kentucky", lat: 37.66814, lng: -84.670067 },
  { abbr: "LA", name: "Louisiana", lat: 31.169546, lng: -91.867805 },
  { abbr: "ME", name: "Maine", lat: 44.693947, lng: -69.381927 },
  { abbr: "MD", name: "Maryland", lat: 39.063946, lng: -76.802101 },
  { abbr: "MA", name: "Massachusetts", lat: 42.230171, lng: -71.530106 },
  { abbr: "MI", name: "Michigan", lat: 43.326618, lng: -84.536095 },
  { abbr: "MN", name: "Minnesota", lat: 45.694454, lng: -93.900192 },
  { abbr: "MS", name: "Mississippi", lat: 32.741646, lng: -89.678696 },
  { abbr: "MO", name: "Missouri", lat: 38.456085, lng: -92.288368 },
  { abbr: "MT", name: "Montana", lat: 46.921925, lng: -110.454353 },
  { abbr: "NE", name: "Nebraska", lat: 41.12537, lng: -98.268082 },
  { abbr: "NV", name: "Nevada", lat: 38.313515, lng: -117.055374 },
  { abbr: "NH", name: "New Hampshire", lat: 43.452492, lng: -71.563896 },
  { abbr: "NJ", name: "New Jersey", lat: 40.298904, lng: -74.521011 },
  { abbr: "NM", name: "New Mexico", lat: 34.840515, lng: -106.248482 },
  { abbr: "NY", name: "New York", lat: 42.165726, lng: -74.948051 },
  { abbr: "NC", name: "North Carolina", lat: 35.630066, lng: -79.806419 },
  { abbr: "ND", name: "North Dakota", lat: 47.528912, lng: -99.784012 },
  { abbr: "OH", name: "Ohio", lat: 40.388783, lng: -82.764915 },
  { abbr: "OK", name: "Oklahoma", lat: 35.565342, lng: -96.928917 },
  { abbr: "OR", name: "Oregon", lat: 44.572021, lng: -122.070938 },
  { abbr: "PA", name: "Pennsylvania", lat: 40.590752, lng: -77.209755 },
  { abbr: "RI", name: "Rhode Island", lat: 41.680893, lng: -71.51178 },
  { abbr: "SC", name: "South Carolina", lat: 33.856892, lng: -80.945007 },
  { abbr: "SD", name: "South Dakota", lat: 44.299782, lng: -99.438828 },
  { abbr: "TN", name: "Tennessee", lat: 35.747845, lng: -86.692345 },
  { abbr: "TX", name: "Texas", lat: 31.054487, lng: -97.563461 },
  { abbr: "UT", name: "Utah", lat: 40.150032, lng: -111.862434 },
  { abbr: "VT", name: "Vermont", lat: 44.045876, lng: -72.710686 },
  { abbr: "VA", name: "Virginia", lat: 37.769337, lng: -78.169968 },
  { abbr: "WA", name: "Washington", lat: 47.400902, lng: -121.490494 },
  { abbr: "WV", name: "West Virginia", lat: 38.491226, lng: -80.954453 },
  { abbr: "WI", name: "Wisconsin", lat: 44.268543, lng: -89.616508 },
  { abbr: "WY", name: "Wyoming", lat: 42.755966, lng: -107.30249 },
];

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * If the query is exactly a US state name or 2-letter code, returns its geographic center.
 * Multi-word names must match in full (e.g. "new york", "north carolina").
 * "Washington" maps to the state of Washington; use "DC" or "District of Columbia" for D.C.
 */
export function resolveUsStateCenter(query: string): {
  latitude: number;
  longitude: number;
  label: string;
} | null {
  const q = normalizeQuery(query);
  if (!q) {
    return null;
  }

  for (const s of US_STATES) {
    if (q === s.abbr.toLowerCase() || q === s.name.toLowerCase()) {
      return {
        latitude: s.lat,
        longitude: s.lng,
        label: `${s.name} (center)`,
      };
    }
  }

  return null;
}
