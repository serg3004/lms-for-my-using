import { describe, expect, it } from 'vitest';

import { fitView, metersPerPixel, pan, project, toScreen, unproject, visibleTiles, zoomBy } from './SheetAnalyticsMapGeometry.js';

describe('map geometry (PR 521)', () => {
  it('puts 0,0 in the middle of the world picture and projects back', () => {
    expect(project(0, 0, 1)).toEqual({ x: 256, y: 256 });
    const at = project(43.238, 76.945, 12);
    const back = unproject(at.x, at.y, 12);
    expect(back.lat).toBeCloseTo(43.238, 5);
    expect(back.lon).toBeCloseTo(76.945, 5);
  });

  it('fits every point and gives a single point a street-level zoom', () => {
    expect(fitView([{ latitude: 43.2, longitude: 76.9 }], 600, 320).zoom).toBe(16);
    const view = fitView([{ latitude: 43.2, longitude: 76.9 }, { latitude: 51.1, longitude: 71.4 }], 600, 320);
    expect(view.zoom).toBeLessThan(8);
    const a = toScreen({ latitude: 43.2, longitude: 76.9 }, view, 600, 320);
    const b = toScreen({ latitude: 51.1, longitude: 71.4 }, view, 600, 320);
    for (const point of [a, b]) {
      expect(point.x).toBeGreaterThan(0); expect(point.x).toBeLessThan(600);
      expect(point.y).toBeGreaterThan(0); expect(point.y).toBeLessThan(320);
    }
    expect(fitView([], 600, 320).zoom).toBeGreaterThan(0);
  });

  it('covers the box with tiles and wraps the world sideways', () => {
    const tiles = visibleTiles({ lat: 0, lon: 179.9, zoom: 2 }, 600, 320);
    expect(tiles.length).toBeGreaterThan(2);
    expect(tiles.every((tile) => tile.x >= 0 && tile.x < 4 && tile.y >= 0 && tile.y < 4)).toBe(true);
    expect(new Set(tiles.map((tile) => tile.key)).size).toBe(tiles.length);
  });

  it('moves with a drag, limits the zoom and shrinks meters per pixel with it', () => {
    const view = { lat: 43.2, lon: 76.9, zoom: 10 };
    const moved = pan(view, 100, 0);
    expect(moved.lon).toBeLessThan(view.lon);
    expect(zoomBy({ ...view, zoom: 18 }, 1).zoom).toBe(18);
    expect(zoomBy({ ...view, zoom: 2 }, -1).zoom).toBe(2);
    expect(metersPerPixel(43.2, 11)).toBeLessThan(metersPerPixel(43.2, 10));
  });
});
