// Natural Earth projection (Šavrič et al.), the same as d3's geoNaturalEarth1 with the scale and translate that
// scripts/gen-world.mjs wrote to world.ts. The browser needs it to put a capital on the map without shipping d3.
import { PROJ } from './world';

const rad = Math.PI / 180;
/** [lon, lat] in degrees → [x, y] in the map's 960-wide coordinates. */
export function project(lon: number, lat: number): [number, number] {
  const l = lon * rad, p = lat * rad, p2 = p * p, p4 = p2 * p2;
  const X = l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
  const Y = p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
  return [PROJ.tx + PROJ.k * X, PROJ.ty - PROJ.k * Y];
}
