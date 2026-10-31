import type { Point } from "./types";
// Equirectangular distance; accurate to well under 1% at city scale.
export const meters = (a: Point, b: Point) => {
  const r = Math.PI / 180,
    x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r),
    y = (b.lat - a.lat) * r;
  return Math.round(Math.hypot(x, y) * 6371000);
};
