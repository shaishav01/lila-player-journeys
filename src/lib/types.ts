export type MapId = "AmbroseValley" | "GrandRift" | "Lockdown";

export interface MapConfig {
  scale: number;
  originX: number;
  originZ: number;
  image: string;
}

export interface MatchSummary {
  id: string;
  map: MapId;
  day: string; // "2026-02-10" (folder date of the match's earliest file)
  start: number; // unix seconds
  dur: number; // seconds
  humans: number;
  bots: number;
  counts: Partial<Record<string, number>>;
}

export interface Index {
  events: string[];
  days: string[];
  maps: Record<MapId, MapConfig>;
  matches: MatchSummary[];
}

/** [t (s since match start), worldX, worldZ, elevationY] */
export type PathRow = [number, number, number, number];
/** [t, eventCode, worldX, worldZ] */
export type EventRow = [number, number, number, number];

export interface Journey {
  id: string;
  bot: boolean;
  path: PathRow[];
  events: EventRow[];
}

export interface MatchDetail extends MatchSummary {
  players: Journey[];
}

/** Columnar, quantised event points for one map (see scripts/preprocess.py). */
export interface HeatData {
  q: number;
  u: number[];
  v: number[]; // already flipped to image space (0 = top)
  e: number[];
  d: number[];
  b: number[];
  m: number[];
  matches: string[];
}

export type HeatMode = "none" | "traffic" | "kills" | "deaths" | "loot";
