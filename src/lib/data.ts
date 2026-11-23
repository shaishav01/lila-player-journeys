import type { HeatData, Index, MapId, MatchDetail } from "./types";

const cache = new Map<string, Promise<unknown>>();

function getJSON<T>(url: string): Promise<T> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${r.status} loading ${url}`);
      return r.json();
    });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p as Promise<T>;
}

export const loadIndex = () => getJSON<Index>("/data/index.json");
export const loadMatch = (id: string) => getJSON<MatchDetail>(`/data/matches/${id}.json`);
export const loadHeat = (map: MapId) => getJSON<HeatData>(`/data/heat/${map}.json`);
