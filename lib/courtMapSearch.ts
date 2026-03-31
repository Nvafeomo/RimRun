import * as Location from "expo-location";
import { haversineMiles } from "./geo";

export type LocationPickOption = {
  latitude: number;
  longitude: number;
  label: string;
};

/** Max matches to show when several places share a name (keeps the sheet usable). */
const MAX_PICK_OPTIONS = 12;

function dedupeGeocodeResults(
  results: Location.LocationGeocodedLocation[]
): Location.LocationGeocodedLocation[] {
  const seen = new Set<string>();
  const out: Location.LocationGeocodedLocation[] = [];
  for (const r of results) {
    const key = `${r.latitude.toFixed(3)},${r.longitude.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Build a short human label from reverse geocode (city / region / country),
 * similar to what users see in map apps when picking a place.
 */
export async function reverseGeocodeLabel(
  latitude: number,
  longitude: number
): Promise<string> {
  try {
    const [addr] = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (!addr) {
      return `${latitude.toFixed(3)}°, ${longitude.toFixed(3)}°`;
    }
    const parts: string[] = [];
    if (addr.name && addr.city && addr.name !== addr.city) {
      parts.push(addr.name);
    }
    if (addr.city) parts.push(addr.city);
    if (addr.region) parts.push(addr.region);
    if (addr.country) parts.push(addr.country);
    const uniq = [...new Set(parts.map((p) => p.trim()).filter(Boolean))];
    if (uniq.length) {
      return uniq.join(", ");
    }
    if (addr.formattedAddress) {
      return addr.formattedAddress;
    }
    return `${latitude.toFixed(3)}°, ${longitude.toFixed(3)}°`;
  } catch {
    return `${latitude.toFixed(3)}°, ${longitude.toFixed(3)}°`;
  }
}

/**
 * If the platform returns nothing for a short query (e.g. "Calgary"), try again
 * with the user's region/country from GPS — same idea as biasing autocomplete by location.
 */
async function geocodeWithRegionalBias(
  query: string,
  userCoords: { latitude: number; longitude: number }
): Promise<Location.LocationGeocodedLocation[]> {
  try {
    const [rev] = await Location.reverseGeocodeAsync(userCoords);
    if (!rev) return [];

    const candidates: string[] = [];
    if (rev.region && rev.country) {
      candidates.push(`${query}, ${rev.region}, ${rev.country}`);
    }
    if (rev.region) {
      candidates.push(`${query}, ${rev.region}`);
    }
    if (rev.isoCountryCode) {
      candidates.push(`${query}, ${rev.isoCountryCode}`);
    }
    if (rev.country) {
      candidates.push(`${query}, ${rev.country}`);
    }

    const tried = new Set<string>();
    for (const c of candidates) {
      if (tried.has(c)) continue;
      tried.add(c);
      const r = await Location.geocodeAsync(c).catch(() => []);
      if (r.length) {
        return r;
      }
    }
  } catch {
    // ignore
  }
  return [];
}

/**
 * Forward geocode with optional regional bias when the bare query fails.
 */
export async function geocodeSearchQuery(
  query: string,
  userCoords: { latitude: number; longitude: number } | null
): Promise<Location.LocationGeocodedLocation[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  let results: Location.LocationGeocodedLocation[] = [];
  try {
    results = await Location.geocodeAsync(trimmed);
  } catch {
    results = [];
  }

  if (results.length === 0 && userCoords) {
    results = await geocodeWithRegionalBias(trimmed, userCoords);
  }

  return dedupeGeocodeResults(results);
}

/**
 * Attach labels and sort by distance to user (nearest first) so the right "Springfield"
 * is often first without opening the sheet.
 */
export async function enrichPickOptions(
  results: Location.LocationGeocodedLocation[],
  userCoords: { latitude: number; longitude: number } | null
): Promise<LocationPickOption[]> {
  const limited = results.slice(0, MAX_PICK_OPTIONS);
  const labels = await Promise.all(
    limited.map((r) => reverseGeocodeLabel(r.latitude, r.longitude))
  );
  const options: LocationPickOption[] = limited.map((r, i) => ({
    latitude: r.latitude,
    longitude: r.longitude,
    label: labels[i],
  }));

  if (userCoords) {
    options.sort(
      (a, b) =>
        haversineMiles(
          userCoords.latitude,
          userCoords.longitude,
          a.latitude,
          a.longitude
        ) -
        haversineMiles(
          userCoords.latitude,
          userCoords.longitude,
          b.latitude,
          b.longitude
        )
    );
  }

  return options;
}
