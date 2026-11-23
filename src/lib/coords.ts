import type { MapConfig } from "./types";

/**
 * All drawing happens in a square "image space" of IMAGE_SIZE x IMAGE_SIZE units.
 * The minimap is drawn to fill exactly that square, whatever its source resolution
 * (4320², 2160×2158, 9000² → all served as 2048² WebP), so mapping goes through UV
 * and never assumes a pixel size.
 */
export const IMAGE_SIZE = 2048;

/** World (x, z) → UV in [0, 1]. y is elevation and is ignored for the top-down view. */
export function worldToUV(x: number, z: number, map: MapConfig): [number, number] {
  return [(x - map.originX) / map.scale, (z - map.originZ) / map.scale];
}

/** World (x, z) → image-space point. V is flipped because image rows grow downward. */
export function worldToImage(x: number, z: number, map: MapConfig, size = IMAGE_SIZE): [number, number] {
  const [u, v] = worldToUV(x, z, map);
  return [u * size, (1 - v) * size];
}

/** Inverse, used to show world coordinates under the cursor. */
export function imageToWorld(px: number, py: number, map: MapConfig, size = IMAGE_SIZE): [number, number] {
  const u = px / size;
  const v = 1 - py / size;
  return [u * map.scale + map.originX, v * map.scale + map.originZ];
}
