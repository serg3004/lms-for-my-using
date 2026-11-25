/** PR 521: the arithmetic of the map card (Web Mercator, 256 px tiles). Pure functions, so the card only draws. */
export const TILE = 256;
export const MIN_ZOOM = 2;
export const MAX_ZOOM = 18;
const MAX_LAT = 85.0511;

export type View = { lat: number; lon: number; zoom: number };

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The place in the world picture of the given zoom, in pixels from its top-left corner. */
export function project(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const scale = TILE * 2 ** zoom;
  const sin = Math.sin((clamp(lat, -MAX_LAT, MAX_LAT) * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * scale, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale };
}

export function unproject(x: number, y: number, zoom: number): { lat: number; lon: number } {
  const scale = TILE * 2 ** zoom;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  return { lat: clamp((180 / Math.PI) * Math.atan(Math.sinh(n)), -MAX_LAT, MAX_LAT), lon: ((((x / scale) * 360 - 180) + 540) % 360) - 180 };
}

/** The centre and zoom that show every point in a box of the given size (with a margin); one point gets a street-level zoom. */
export function fitView(points: ReadonlyArray<{ latitude: number; longitude: number }>, width: number, height: number): View {
  if (points.length === 0) return { lat: 48, lon: 68, zoom: MIN_ZOOM + 2 };
  const lats = points.map((point) => point.latitude);
  const lons = points.map((point) => point.longitude);
  const south = Math.min(...lats), north = Math.max(...lats), west = Math.min(...lons), east = Math.max(...lons);
  const lat = (south + north) / 2, lon = (west + east) / 2;
  const usableWidth = Math.max(40, width - 64), usableHeight = Math.max(40, height - 64);
  for (let zoom = 16; zoom >= MIN_ZOOM; zoom -= 1) {
    const a = project(north, west, zoom), b = project(south, east, zoom);
    if (Math.abs(b.x - a.x) <= usableWidth && Math.abs(b.y - a.y) <= usableHeight) return { lat, lon, zoom };
  }
  return { lat, lon, zoom: MIN_ZOOM };
}

export type Tile = { key: string; z: number; x: number; y: number; left: number; top: number };

/** The tiles that cover a box of the given size around the view; x wraps around the world, tiles above or below it are left out. */
export function visibleTiles(view: View, width: number, height: number): Tile[] {
  const centre = project(view.lat, view.lon, view.zoom);
  const originX = centre.x - width / 2, originY = centre.y - height / 2;
  const count = 2 ** view.zoom;
  const tiles: Tile[] = [];
  for (let ty = Math.floor(originY / TILE); ty <= Math.floor((originY + height) / TILE); ty += 1) {
    if (ty < 0 || ty >= count) continue;
    for (let tx = Math.floor(originX / TILE); tx <= Math.floor((originX + width) / TILE); tx += 1) {
      const x = ((tx % count) + count) % count;
      tiles.push({ key: `${view.zoom}/${tx}/${ty}`, z: view.zoom, x, y: ty, left: Math.round(tx * TILE - originX), top: Math.round(ty * TILE - originY) });
    }
  }
  return tiles;
}

/** Where a point lies in the box, in pixels from its top-left corner. */
export function toScreen(point: { latitude: number; longitude: number }, view: View, width: number, height: number): { x: number; y: number } {
  const centre = project(view.lat, view.lon, view.zoom);
  const at = project(point.latitude, point.longitude, view.zoom);
  return { x: Math.round(at.x - centre.x + width / 2), y: Math.round(at.y - centre.y + height / 2) };
}

/** The view moved by a drag of the given pixels. */
export function pan(view: View, dx: number, dy: number): View {
  const centre = project(view.lat, view.lon, view.zoom);
  return { ...view, ...unproject(centre.x - dx, centre.y - dy, view.zoom) };
}

export const zoomBy = (view: View, step: number): View => ({ ...view, zoom: clamp(view.zoom + step, MIN_ZOOM, MAX_ZOOM) });

export function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((clamp(lat, -MAX_LAT, MAX_LAT) * Math.PI) / 180)) / 2 ** zoom;
}

/** Accuracy from which a point is drawn with a circle of the error around it. */
export const COARSE_ACCURACY_METERS = 100;
