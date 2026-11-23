import { useMemo } from "react";
import type { MatchDetail } from "../lib/types";
import { EVENT_STYLES } from "../lib/events";
import { fmtTime } from "../lib/format";

interface Props {
  match: MatchDetail;
  time: number;
  playing: boolean;
  speed: number;
  markerCodes: Set<number>;
  onTime: (t: number) => void;
  onPlay: (p: boolean) => void;
  onSpeed: (s: number) => void;
}

const SPEEDS = [1, 5, 10, 20, 50];

export function Timeline({ match, time, playing, speed, markerCodes, onTime, onPlay, onSpeed }: Props) {
  const dur = Math.max(1, match.dur);
  const ticks = useMemo(() => {
    const out: { t: number; code: number; who: string }[] = [];
    for (const p of match.players) for (const e of p.events) if (EVENT_STYLES[e[1]]) out.push({ t: e[0], code: e[1], who: p.id });
    return out;
  }, [match]);

  return (
    <div className="timeline">
      <button className="play" onClick={() => onPlay(!playing)} title="Play / pause (space)">
        {playing ? "❚❚" : time >= dur ? "↺" : "▶"}
      </button>
      <div className="time-label">
        {fmtTime(time)} <span>/ {fmtTime(dur)}</span>
      </div>
      <div className="track">
        <div className="ticks">
          {ticks
            .filter((k) => markerCodes.has(k.code))
            .map((k, i) => {
              const st = EVENT_STYLES[k.code];
              return (
                <span
                  key={i}
                  className={`tick tick-${st.group}`}
                  style={{ left: `${(k.t / dur) * 100}%`, background: st.color }}
                  title={`${fmtTime(k.t)} · ${st.short}`}
                  onClick={() => onTime(k.t)}
                />
              );
            })}
        </div>
        <input
          type="range"
          min={0}
          max={dur}
          step={0.1}
          value={time}
          onChange={(e) => onTime(Number(e.target.value))}
          style={{ ["--pct" as string]: `${(time / dur) * 100}%` }}
        />
      </div>
      <div className="speeds">
        {SPEEDS.map((s) => (
          <button key={s} className={s === speed ? "on" : ""} onClick={() => onSpeed(s)}>
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
