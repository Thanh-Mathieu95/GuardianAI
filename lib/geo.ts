import type { Point } from "./types";

const EARTH_RADIUS_METERS = 6_371_000;

// Equirectangular distance; accurate to well under 1% at city scale.
export const meters = (a: Point, b: Point) => {
  const radiansPerDegree = Math.PI / 180;
  const eastWestRadians = (b.lng - a.lng) * radiansPerDegree * Math.cos(((a.lat + b.lat) / 2) * radiansPerDegree);
  const northSouthRadians = (b.lat - a.lat) * radiansPerDegree;
  return Math.round(Math.hypot(eastWestRadians, northSouthRadians) * EARTH_RADIUS_METERS);
};
