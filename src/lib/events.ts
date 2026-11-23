// Event codes match EVENTS in scripts/preprocess.py.
export const EV = {
  Position: 0,
  BotPosition: 1,
  Kill: 2,
  Killed: 3,
  BotKill: 4,
  BotKilled: 5,
  KilledByStorm: 6,
  Loot: 7,
} as const;

export type MarkerShape = "cross" | "skull" | "storm" | "diamond";

export interface EventStyle {
  code: number;
  label: string;
  short: string;
  color: string;
  shape: MarkerShape;
  group: "kill" | "death" | "storm" | "loot";
}

export const EVENT_STYLES: Record<number, EventStyle> = {
  [EV.Kill]: { code: EV.Kill, label: "Killed a player", short: "PvP kill", color: "#ff4d4d", shape: "cross", group: "kill" },
  [EV.BotKill]: { code: EV.BotKill, label: "Killed a bot", short: "Bot kill", color: "#ff9f1c", shape: "cross", group: "kill" },
  [EV.Killed]: { code: EV.Killed, label: "Killed by a player", short: "Died to player", color: "#ff4d4d", shape: "skull", group: "death" },
  [EV.BotKilled]: { code: EV.BotKilled, label: "Killed by a bot", short: "Died to bot", color: "#ff9f1c", shape: "skull", group: "death" },
  [EV.KilledByStorm]: { code: EV.KilledByStorm, label: "Died to the storm", short: "Storm death", color: "#b678ff", shape: "storm", group: "storm" },
  [EV.Loot]: { code: EV.Loot, label: "Picked up loot", short: "Loot", color: "#ffd60a", shape: "diamond", group: "loot" },
};

export const MARKER_GROUPS = [
  { id: "kill", label: "Kills", codes: [EV.Kill, EV.BotKill] },
  { id: "death", label: "Deaths", codes: [EV.Killed, EV.BotKilled] },
  { id: "storm", label: "Storm deaths", codes: [EV.KilledByStorm] },
  { id: "loot", label: "Loot", codes: [EV.Loot] },
] as const;

export type MarkerGroup = (typeof MARKER_GROUPS)[number]["id"];

/** Which event codes feed each heatmap. */
export const HEAT_CODES: Record<string, number[]> = {
  traffic: [EV.Position, EV.BotPosition],
  kills: [EV.Kill, EV.BotKill],
  deaths: [EV.Killed, EV.BotKilled, EV.KilledByStorm],
  loot: [EV.Loot],
};

export const HUMAN_COLOR = "#38d6ff";
export const BOT_COLOR = "#d9d4c7";

/**
 * Bot journeys reuse the same event names from the bot's own point of view:
 * a bot's BotKill means the bot got a kill, BotKilled means it died.
 */
export function eventLabel(code: number, actorIsBot: boolean): string {
  if (actorIsBot) {
    if (code === EV.BotKill || code === EV.Kill) return "Bot got a kill";
    if (code === EV.BotKilled || code === EV.Killed) return "Bot was killed";
  }
  return EVENT_STYLES[code]?.label ?? "Event";
}
