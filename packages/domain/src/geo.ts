const EARTH_RADIUS_M = 6_371_008.8;

export interface LatLon {
  lat: number;
  lon: number;
}

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle (haversine) distance in metres.
 *
 * This is a straight-line distance between two points. It is NOT a walking
 * route, travel time, or a measure of how easy the venue is to reach. Anywhere
 * this number is displayed it must be labelled "straight-line".
 */
export function haversineMetres(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Formats a straight-line distance for display, keeping the unit honest. */
export function formatStraightLine(metres: number | null): string {
  if (metres === null || !Number.isFinite(metres)) return "distance unknown";
  if (metres < 1000) return `${Math.round(metres)} m straight-line`;
  return `${(metres / 1000).toFixed(1)} km straight-line`;
}
