export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
}

export function fmtDay(day: string): string {
  const d = new Date(day + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function fmtClock(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(11, 16) + " UTC";
}

export const shortId = (id: string) => (id.length > 12 ? id.slice(0, 8) : id);

export const MAP_LABELS: Record<string, string> = {
  AmbroseValley: "Ambrose Valley",
  GrandRift: "Grand Rift",
  Lockdown: "Lockdown",
};
