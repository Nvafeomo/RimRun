/** Earth radius in miles (mean). */
const EARTH_RADIUS_MI = 3958.8;

/** ~miles per degree latitude (varies slightly by latitude). */
const MI_PER_DEG_LAT = 69;

/**
 * Great-circle distance in miles between two WGS84 points.
 */
export function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MI * c;
}

/**
 * Axis-aligned bounding box that fully contains a circle of `radiusMiles` around (lat, lng).
 * Used to narrow the Supabase query; filter again with haversineMiles on the client.
 */
export function boundingBoxForRadiusMiles(
  lat: number,
  lng: number,
  radiusMiles: number
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const latSpan = radiusMiles / MI_PER_DEG_LAT;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const lngSpan =
    cosLat > 1e-6 ? radiusMiles / (MI_PER_DEG_LAT * cosLat) : latSpan;
  return {
    minLat: lat - latSpan,
    maxLat: lat + latSpan,
    minLng: lng - lngSpan,
    maxLng: lng + lngSpan,
  };
}
