import type { HeatData, HeatMode } from "./types";
import { HEAT_CODES } from "./events";

export const GRID = 256; // 2048 / 256 = 8 image px per cell (≈3.5 m on AmbroseValley)

export interface HeatFilter {
  mode: Exclude<HeatMode, "none">;
  days: Set<number>;
  humans: boolean;
  bots: boolean;
  /** restrict to one match (index into heat.matches), or null for all */
  match: number | null;
}

export interface HeatResult {
  canvas: HTMLCanvasElement;
  points: number;
  /** top cells, in image-space units, for "hotspot" call-outs */
  hotspots: { x: number; y: number; count: number }[];
}

// Colour ramps: [stop, r, g, b, a]
const RAMPS: Record<HeatFilter["mode"], number[][]> = {
  traffic: [[0, 20, 80, 255, 0], [0.15, 30, 140, 255, 110], [0.45, 60, 230, 200, 170], [0.75, 250, 240, 80, 210], [1, 255, 255, 255, 235]],
  kills: [[0, 255, 120, 0, 0], [0.2, 255, 140, 0, 120], [0.6, 255, 60, 30, 200], [1, 255, 240, 200, 240]],
  deaths: [[0, 120, 0, 160, 0], [0.2, 160, 40, 220, 120], [0.6, 255, 40, 120, 200], [1, 255, 220, 240, 240]],
  loot: [[0, 120, 100, 0, 0], [0.2, 200, 170, 0, 110], [0.6, 255, 214, 10, 190], [1, 255, 255, 220, 235]],
};

function ramp(stops: number[][], t: number): [number, number, number, number] {
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (t <= b[0]) {
      const k = (t - a[0]) / (b[0] - a[0] || 1);
      return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k, a[4] + (b[4] - a[4]) * k];
    }
  }
  const l = stops[stops.length - 1];
  return [l[1], l[2], l[3], l[4]];
}

function blur(src: Float32Array, n: number, sigma: number): Float32Array {
  const r = Math.ceil(sigma * 3);
  const k: number[] = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    k.push(w);
    sum += w;
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(n * n);
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) {
        const xx = x + i;
        if (xx >= 0 && xx < n) s += src[y * n + xx] * k[i + r];
      }
      tmp[y * n + x] = s;
    }
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) {
        const yy = y + i;
        if (yy >= 0 && yy < n) s += tmp[yy * n + x] * k[i + r];
      }
      out[y * n + x] = s;
    }
  return out;
}

export function buildHeatmap(heat: HeatData, f: HeatFilter, imageSize: number): HeatResult {
  const codes = new Set(HEAT_CODES[f.mode]);
  const raw = new Float32Array(GRID * GRID);
  let points = 0;
  const scale = GRID / (heat.q + 1);
  for (let i = 0; i < heat.u.length; i++) {
    if (!codes.has(heat.e[i])) continue;
    if (!f.days.has(heat.d[i])) continue;
    if (heat.b[i] ? !f.bots : !f.humans) continue;
    if (f.match !== null && heat.m[i] !== f.match) continue;
    const gx = Math.floor(heat.u[i] * scale);
    const gy = Math.floor(heat.v[i] * scale);
    raw[gy * GRID + gx] += 1;
    points++;
  }

  // Sparse layers (kills, deaths) need a wider kernel to read as zones.
  const sigma = f.mode === "traffic" ? 1.6 : points < 300 ? 3.2 : 2.4;
  const g = blur(raw, GRID, sigma);

  // Normalise to the 99th percentile of non-empty cells so one hot cell doesn't wash out the rest.
  const nz: number[] = [];
  for (let i = 0; i < g.length; i++) if (g[i] > 1e-4) nz.push(g[i]);
  nz.sort((a, b) => a - b);
  const ref = nz.length ? nz[Math.min(nz.length - 1, Math.floor(nz.length * 0.99))] : 1;

  const canvas = document.createElement("canvas");
  canvas.width = GRID;
  canvas.height = GRID;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(GRID, GRID);
  const stops = RAMPS[f.mode];
  // Traffic is dense everywhere players walk; a higher gamma keeps the main routes distinct.
  const gamma = f.mode === "traffic" ? 0.8 : 0.5;
  for (let i = 0; i < g.length; i++) {
    if (g[i] <= 1e-4) continue;
    const t = Math.min(1, Math.pow(g[i] / ref, gamma));
    const [r, gg, b, a] = ramp(stops, t);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = gg;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = a;
  }
  ctx.putImageData(img, 0, 0);

  // Hotspots: top raw-count 3x3 neighbourhoods, non-overlapping.
  const cell = imageSize / GRID;
  const cand: { i: number; s: number }[] = [];
  for (let y = 1; y < GRID - 1; y++)
    for (let x = 1; x < GRID - 1; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += raw[(y + dy) * GRID + x + dx];
      if (s > 0) cand.push({ i: y * GRID + x, s });
    }
  cand.sort((a, b) => b.s - a.s);
  const hotspots: HeatResult["hotspots"] = [];
  for (const c of cand) {
    const x = c.i % GRID;
    const y = Math.floor(c.i / GRID);
    if (hotspots.some((h) => Math.hypot(h.x / cell - x, h.y / cell - y) < 12)) continue;
    hotspots.push({ x: (x + 0.5) * cell, y: (y + 0.5) * cell, count: c.s });
    if (hotspots.length >= 5) break;
  }
  return { canvas, points, hotspots };
}
