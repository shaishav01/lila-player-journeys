import { useEffect, useMemo, useRef, useState } from "react";
import type { HeatData, HeatMode, Index, MapId, MatchDetail, MatchSummary } from "./lib/types";
import { loadHeat, loadIndex, loadMatch } from "./lib/data";
import { EV, EVENT_STYLES, MARKER_GROUPS, type MarkerGroup } from "./lib/events";
import { buildHeatmap, type HeatResult } from "./lib/heatmap";
import { IMAGE_SIZE, imageToWorld } from "./lib/coords";
import { MapCanvas, humanColor } from "./components/MapCanvas";
import { Timeline } from "./components/Timeline";
import { Legend } from "./components/Legend";
import { fmtClock, fmtDay, fmtTime, MAP_LABELS, shortId } from "./lib/format";

type SortKey = "players" | "duration" | "kills" | "time";
const MAP_IDS: MapId[] = ["AmbroseValley", "Lockdown", "GrandRift"];

const HEAT_OPTIONS: { id: HeatMode; label: string; hint: string }[] = [
  { id: "none", label: "Off", hint: "" },
  { id: "traffic", label: "Traffic", hint: "Where players spend time (position samples every ~5 s)" },
  { id: "kills", label: "Kill zones", hint: "Where kills happen (PvP + bot kills)" },
  { id: "deaths", label: "Death zones", hint: "Where players die (to players, bots or storm)" },
  { id: "loot", label: "Loot", hint: "Where items are picked up" },
];

function readURL() {
  const q = new URLSearchParams(location.search);
  return {
    map: (q.get("map") as MapId) || "AmbroseValley",
    match: q.get("match"),
    heat: (q.get("heat") as HeatMode) || "none",
    days: q.get("days")?.split(",").filter(Boolean) ?? null,
    t: q.get("t") ? Number(q.get("t")) : null,
  };
}

const kills = (m: MatchSummary) => (m.counts.Kill ?? 0) + (m.counts.BotKill ?? 0);
const deaths = (m: MatchSummary) => (m.counts.Killed ?? 0) + (m.counts.BotKilled ?? 0) + (m.counts.KilledByStorm ?? 0);

export default function App() {
  const init = useRef(readURL()).current;
  const [index, setIndex] = useState<Index | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapId, setMapId] = useState<MapId>(MAP_IDS.includes(init.map) ? init.map : "AmbroseValley");
  const [days, setDays] = useState<Set<string>>(new Set(init.days ?? []));
  const [matchId, setMatchId] = useState<string | null>(init.match);
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [sort, setSort] = useState<SortKey>("players");
  const [multiOnly, setMultiOnly] = useState(false);
  const [search, setSearch] = useState("");

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);

  const [showHumans, setShowHumans] = useState(true);
  const [showBots, setShowBots] = useState(true);
  const [groups, setGroups] = useState<Set<MarkerGroup>>(new Set(["kill", "death", "storm", "loot"]));
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [highlight, setHighlight] = useState<string | null>(null);

  const [heatMode, setHeatMode] = useState<HeatMode>(init.heat);
  const [heatScope, setHeatScope] = useState<"all" | "match">("all");
  const [showHotspots, setShowHotspots] = useState(true);
  const [heatData, setHeatData] = useState<HeatData | null>(null);

  // ---- data loading
  useEffect(() => {
    loadIndex()
      .then((ix) => {
        setIndex(ix);
        if (!init.days) setDays(new Set(ix.days));
      })
      .catch((e) => setError(String(e)));
  }, [init.days]);

  useEffect(() => {
    if (!matchId) {
      setMatch(null);
      return;
    }
    let live = true;
    loadMatch(matchId)
      .then((m) => {
        if (!live) return;
        setMatch(m);
        setMapId(m.map);
        setHidden(new Set());
        setHighlight(null);
        setPlaying(false);
        setTime(init.t !== null && init.match === matchId ? Math.min(init.t, m.dur) : m.dur);
      })
      .catch((e) => setError(String(e)));
    return () => {
      live = false;
    };
  }, [matchId, init.t, init.match]);

  useEffect(() => {
    if (heatMode === "none") return;
    let live = true;
    setHeatData(null);
    loadHeat(mapId).then((h) => live && setHeatData(h));
    return () => {
      live = false;
    };
  }, [mapId, heatMode]);

  // ---- URL sync (shareable links)
  useEffect(() => {
    if (!index) return;
    const q = new URLSearchParams();
    q.set("map", mapId);
    if (matchId) q.set("match", matchId);
    if (heatMode !== "none") q.set("heat", heatMode);
    if (days.size && days.size < index.days.length) q.set("days", [...days].sort().join(","));
    if (matchId && match && !playing && time < match.dur) q.set("t", String(Math.round(time)));
    history.replaceState(null, "", `?${q.toString()}`);
  }, [index, mapId, matchId, heatMode, days, time, playing, match]);

  // ---- playback loop
  useEffect(() => {
    if (!playing || !match) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime((t) => {
        const nt = t + dt * speed;
        if (nt >= match.dur) {
          setPlaying(false);
          return match.dur;
        }
        return nt;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, match]);

  const play = (p: boolean) => {
    if (p && match && time >= match.dur) setTime(0);
    setPlaying(p);
  };

  // keyboard: space = play/pause, arrows = ±5 s
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!match || (e.target as HTMLElement).tagName === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        play(!playing);
      } else if (e.code === "ArrowRight") setTime((t) => Math.min(match.dur, t + 5));
      else if (e.code === "ArrowLeft") setTime((t) => Math.max(0, t - 5));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- derived
  const filtered = useMemo(() => {
    if (!index) return [];
    const s = search.trim().toLowerCase();
    const list = index.matches.filter(
      (m) =>
        m.map === mapId &&
        days.has(m.day) &&
        (!multiOnly || m.bots > 0) &&
        (!s || m.id.toLowerCase().includes(s)),
    );
    const by: Record<SortKey, (a: MatchSummary, b: MatchSummary) => number> = {
      players: (a, b) => b.humans + b.bots - (a.humans + a.bots) || b.dur - a.dur,
      duration: (a, b) => b.dur - a.dur,
      kills: (a, b) => kills(b) - kills(a) || deaths(b) - deaths(a),
      time: (a, b) => a.start - b.start,
    };
    return [...list].sort(by[sort]);
  }, [index, mapId, days, multiOnly, search, sort]);

  const totals = useMemo(() => {
    const t = { matches: filtered.length, kills: 0, pvp: 0, deaths: 0, storm: 0, loot: 0 };
    for (const m of filtered) {
      t.kills += kills(m);
      t.pvp += m.counts.Kill ?? 0;
      t.deaths += (m.counts.Killed ?? 0) + (m.counts.BotKilled ?? 0);
      t.storm += m.counts.KilledByStorm ?? 0;
      t.loot += m.counts.Loot ?? 0;
    }
    return t;
  }, [filtered]);

  const markerCodes = useMemo(() => {
    const s = new Set<number>();
    for (const g of MARKER_GROUPS) if (groups.has(g.id)) g.codes.forEach((c) => s.add(c));
    return s;
  }, [groups]);

  const heat: HeatResult | null = useMemo(() => {
    if (heatMode === "none" || !heatData || !index) return null;
    const dayIdx = new Set(index.days.map((d, i) => (days.has(d) ? i : -1)).filter((i) => i >= 0));
    let mIdx: number | null = null;
    if (heatScope === "match" && matchId) {
      mIdx = heatData.matches.indexOf(matchId);
      if (mIdx < 0) return null;
    }
    return buildHeatmap(heatData, { mode: heatMode, days: dayIdx, humans: showHumans, bots: showBots, match: mIdx }, IMAGE_SIZE);
  }, [heatMode, heatData, index, days, showHumans, showBots, heatScope, matchId]);

  if (error) return <div className="fatal">Failed to load data: {error}</div>;
  if (!index) return <div className="fatal">Loading telemetry…</div>;

  const toggle = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };

  const playerStats = (pid: string) => {
    const p = match!.players.find((x) => x.id === pid)!;
    const c = (code: number) => p.events.filter((e) => e[1] === code).length;
    const death = p.events.find((e) => e[1] === EV.Killed || e[1] === EV.BotKilled || e[1] === EV.KilledByStorm);
    return { kills: c(EV.Kill) + c(EV.BotKill), loot: c(EV.Loot), death };
  };

  return (
    <div className={`app ${match ? "has-match" : ""}`}>
      {/* ---------------- left: filters + match list ---------------- */}
      <aside className="sidebar">
        <header className="brand">
          <div className="logo" />
          <div>
            <h1>Player Journeys</h1>
            <p>LILA BLACK · Feb 10–14 telemetry</p>
          </div>
        </header>

        <section>
          <label className="section-label">Map</label>
          <div className="seg">
            {MAP_IDS.map((m) => (
              <button
                key={m}
                className={m === mapId ? "on" : ""}
                onClick={() => {
                  setMapId(m);
                  if (match && match.map !== m) setMatchId(null);
                }}
              >
                {MAP_LABELS[m]}
                <small>{index.matches.filter((x) => x.map === m).length}</small>
              </button>
            ))}
          </div>
        </section>

        <section>
          <label className="section-label">
            Dates
            <button className="link" onClick={() => setDays(new Set(index.days))}>all</button>
          </label>
          <div className="chips">
            {index.days.map((d) => (
              <button key={d} className={days.has(d) ? "chip on" : "chip"} onClick={() => setDays(toggle(days, d))}>
                {fmtDay(d)}
              </button>
            ))}
          </div>
        </section>

        <section className="totals">
          <div><b>{totals.matches}</b><span>matches</span></div>
          <div><b>{totals.kills}</b><span>kills</span></div>
          <div><b>{totals.deaths}</b><span>deaths</span></div>
          <div><b>{totals.storm}</b><span>storm</span></div>
          <div><b>{totals.loot}</b><span>loot</span></div>
        </section>

        <section className="list-head">
          <label className="section-label">Matches</label>
          <div className="list-controls">
            <input placeholder="Search match id" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="players">Most players</option>
              <option value="kills">Most kills</option>
              <option value="duration">Longest</option>
              <option value="time">Chronological</option>
            </select>
          </div>
          <label className="check small">
            <input type="checkbox" checked={multiOnly} onChange={(e) => setMultiOnly(e.target.checked)} />
            Only matches with bot journeys recorded
          </label>
        </section>

        <ul className="match-list">
          {filtered.map((m) => (
            <li key={m.id} className={m.id === matchId ? "on" : ""} onClick={() => setMatchId(m.id === matchId ? null : m.id)}>
              <div className="row1">
                <span className="mid">{shortId(m.id)}</span>
                <span className="when">{fmtDay(m.day)} · {fmtClock(m.start)}</span>
              </div>
              <div className="row2">
                <span className="pill human" title="Human journeys">{m.humans} human</span>
                {m.bots > 0 && <span className="pill bot" title="Bot journeys recorded">{m.bots} bot</span>}
                <span title="Duration">{fmtTime(m.dur)}</span>
                {kills(m) > 0 && <span className="k" title="Kills">✕ {kills(m)}</span>}
                {(m.counts.KilledByStorm ?? 0) > 0 && <span className="s" title="Storm deaths">▲ storm</span>}
              </div>
            </li>
          ))}
          {!filtered.length && <li className="empty">No matches for this filter.</li>}
        </ul>
      </aside>

      {/* ---------------- centre: map + timeline ---------------- */}
      <main className="stage">
        <div className="stage-head">
          <div>
            <h2>{MAP_LABELS[mapId]}</h2>
            <p>
              {match
                ? `Match ${shortId(match.id)} · ${fmtDay(match.day)} ${fmtClock(match.start)} · ${match.humans} human, ${match.bots} bot journeys`
                : heatMode !== "none"
                  ? `${HEAT_OPTIONS.find((h) => h.id === heatMode)!.hint} · ${heat?.points.toLocaleString() ?? "…"} events across ${totals.matches} matches`
                  : "Pick a match on the left to replay it, or turn on a heatmap on the right."}
            </p>
          </div>
          {match && (
            <button className="ghost" onClick={() => setMatchId(null)}>
              Close match ✕
            </button>
          )}
        </div>
        <MapCanvas
          map={index.maps[mapId]}
          imageUrl={`/${index.maps[mapId].image}`}
          match={match && match.map === mapId ? match : null}
          time={time}
          hidden={hidden}
          showHumans={showHumans}
          showBots={showBots}
          markerCodes={markerCodes}
          heat={heat}
          showHotspots={showHotspots}
          highlight={highlight}
          onPickPlayer={(id) => setHighlight((h) => (h === id ? null : id))}
        />
        {match && (
          <Timeline
            match={match}
            time={time}
            playing={playing}
            speed={speed}
            markerCodes={markerCodes}
            onTime={(t) => {
              setTime(t);
            }}
            onPlay={play}
            onSpeed={setSpeed}
          />
        )}
      </main>

      {/* ---------------- right: layers + legend + players ---------------- */}
      <aside className="inspector">
        <section>
          <label className="section-label">Heatmap</label>
          <div className="seg vertical">
            {HEAT_OPTIONS.map((h) => (
              <button key={h.id} className={h.id === heatMode ? "on" : ""} onClick={() => setHeatMode(h.id)} title={h.hint}>
                {h.label}
              </button>
            ))}
          </div>
          {heatMode !== "none" && (
            <>
              {match && (
                <div className="seg small">
                  <button className={heatScope === "all" ? "on" : ""} onClick={() => setHeatScope("all")}>All filtered matches</button>
                  <button className={heatScope === "match" ? "on" : ""} onClick={() => setHeatScope("match")}>This match</button>
                </div>
              )}
              <label className="check small">
                <input type="checkbox" checked={showHotspots} onChange={(e) => setShowHotspots(e.target.checked)} />
                Label top 5 hotspots
              </label>
              {heat && <p className="hint">{heat.points.toLocaleString()} events in view. Brighter = more.</p>}
              {heat && showHotspots && heat.hotspots.length > 0 && (
                <ol className="hotspots">
                  {heat.hotspots.map((h, i) => {
                    const [wx, wz] = imageToWorld(h.x, h.y, index.maps[mapId]);
                    return (
                      <li key={i} title="Events within ~1.5 grid cells of this point">
                        <b>#{i + 1}</b> {h.count} events
                        <span>x {wx.toFixed(0)}, z {wz.toFixed(0)}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          )}
        </section>

        <section>
          <label className="section-label">Who</label>
          <label className="check">
            <input type="checkbox" checked={showHumans} onChange={(e) => setShowHumans(e.target.checked)} />
            <span className="swatch human" /> Humans
          </label>
          <label className="check">
            <input type="checkbox" checked={showBots} onChange={(e) => setShowBots(e.target.checked)} />
            <span className="swatch bot" /> Bots
          </label>
        </section>

        <section>
          <label className="section-label">Event markers</label>
          {MARKER_GROUPS.map((g) => (
            <label key={g.id} className="check">
              <input type="checkbox" checked={groups.has(g.id)} onChange={() => setGroups(toggle(groups, g.id))} />
              {g.label}
            </label>
          ))}
        </section>

        <Legend />

        {match && (
          <section className="players">
            <label className="section-label">
              Journeys in this match
              {hidden.size > 0 && (
                <button className="link" onClick={() => setHidden(new Set())}>show all</button>
              )}
            </label>
            <ul>
              {match.players.map((p) => {
                const st = playerStats(p.id);
                return (
                  <li
                    key={p.id}
                    className={`${hidden.has(p.id) ? "off" : ""} ${highlight === p.id ? "hl" : ""}`}
                    onMouseEnter={() => setHighlight(p.id)}
                    onMouseLeave={() => setHighlight(null)}
                  >
                    <input type="checkbox" checked={!hidden.has(p.id)} onChange={() => setHidden(toggle(hidden, p.id))} />
                    <span
                      className={`swatch ${p.bot ? "bot" : "human"}`}
                      style={p.bot ? undefined : { background: humanColor(match, p.id) }}
                    />
                    <span className="pid" title={p.id}>{p.bot ? `Bot ${p.id}` : shortId(p.id)}</span>
                    <span className="pstats">
                      {st.kills > 0 && <span title="Kills">✕{st.kills}</span>}
                      {st.loot > 0 && <span title="Loot">◆{st.loot}</span>}
                      {st.death && (
                        <span title={`${EVENT_STYLES[st.death[1]].label} at ${fmtTime(st.death[0])}`} style={{ color: EVENT_STYLES[st.death[1]].color }}>
                          ☠ {fmtTime(st.death[0])}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}
