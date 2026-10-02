import { describe, expect, it } from 'vitest';
import { geoNaturalEarth1 } from 'd3-geo';
import { project } from './project';
import { PROJ, SHAPES } from './world';

describe('the browser projection places a point where the generator drew the country', () => {
  const d3 = geoNaturalEarth1().scale(PROJ.k).translate([PROJ.tx, PROJ.ty]);
  it('agrees with d3 to a tenth of a pixel for capitals around the world', () => {
    for (const [name, lon, lat] of [['Brussels', 4.352, 50.847], ['Pretoria', 28.188, -25.747], ['Port Louis', 57.502, -20.162], ['Victoria', 55.455, -4.62],
      ['London', -0.128, 51.507], ['Reykjavik', -21.9, 64.1], ['Wellington', 174.78, -41.29], ['Null Island', 0, 0]] as [string, number, number][]) {
      const [x, y] = project(lon, lat), [ex, ey] = d3([lon, lat])!;
      expect(Math.abs(x - ex), `${name} x`).toBeLessThan(0.1);
      expect(Math.abs(y - ey), `${name} y`).toBeLessThan(0.1);
    }
  });
  it('Brussels lands inside the Belgium drawn by gen-world', () => {
    const be = SHAPES.find((s) => s.iso2 === 'BE')!;
    const [x, y] = project(4.352, 50.847);
    expect(x).toBeGreaterThan(be.bbox[0]); expect(x).toBeLessThan(be.bbox[2]);
    expect(y).toBeGreaterThan(be.bbox[1]); expect(y).toBeLessThan(be.bbox[3]);
  });
  it('Port Louis and Victoria land on their islands', () => {
    for (const [iso, lon, lat] of [['MU', 57.502, -20.162], ['SC', 55.455, -4.62]] as [string, number, number][]) {
      const s = SHAPES.find((x) => x.iso2 === iso)!, [x, y] = project(lon, lat);
      expect(x).toBeGreaterThan(s.bbox[0] - 3); expect(x).toBeLessThan(s.bbox[2] + 3);
      expect(y).toBeGreaterThan(s.bbox[1] - 3); expect(y).toBeLessThan(s.bbox[3] + 3);
    }
  });
});

describe('region outlines (generated from Eurostat NUTS) sit where the country is', async () => {
  const { REGIONS } = await import('./regions/BE');
  it('Belgium: three regions, each inside the country, Brussels inside Flanders\' box', () => {
    const be = SHAPES.find((s) => s.iso2 === 'BE')!;
    expect(Object.keys(REGIONS).sort()).toEqual(['BE-BRU', 'BE-VLG', 'BE-WAL']);
    for (const r of Object.values(REGIONS)) {
      expect(r.bbox[0]).toBeGreaterThanOrEqual(be.bbox[0] - 0.6); expect(r.bbox[2]).toBeLessThanOrEqual(be.bbox[2] + 0.6);
      expect(r.bbox[1]).toBeGreaterThanOrEqual(be.bbox[1] - 0.6); expect(r.bbox[3]).toBeLessThanOrEqual(be.bbox[3] + 0.6);
    }
    const [bx, by] = project(4.352, 50.847);                       // Brussels
    const bru = REGIONS['BE-BRU'].bbox, vlg = REGIONS['BE-VLG'].bbox;
    expect(bx).toBeGreaterThan(bru[0]); expect(bx).toBeLessThan(bru[2]); expect(by).toBeGreaterThan(bru[1]); expect(by).toBeLessThan(bru[3]);
    expect(bx).toBeGreaterThan(vlg[0]); expect(bx).toBeLessThan(vlg[2]);    // Flanders surrounds Brussels
  });
});
