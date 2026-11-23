import { useEffect, useRef } from "react";
import { BOT_COLOR, EV, EVENT_STYLES, HUMAN_COLOR } from "../lib/events";
import { drawMarker } from "./MapCanvas";

function Glyph({ code }: { code: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = 22 * dpr;
    c.height = 22 * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const st = EVENT_STYLES[code];
    drawMarker(ctx, st.shape, 11, 11, st.color, st.shape === "diamond" ? 5 : 6);
  }, [code]);
  return <canvas ref={ref} style={{ width: 22, height: 22 }} />;
}

function Line({ bot }: { bot: boolean }) {
  return (
    <svg width="22" height="22">
      <line
        x1="2" y1="16" x2="20" y2="6"
        stroke={bot ? BOT_COLOR : HUMAN_COLOR}
        strokeWidth={bot ? 1.6 : 2.6}
        strokeDasharray={bot ? "4 3" : undefined}
        strokeLinecap="round"
      />
      {bot ? (
        <rect x="16" y="3" width="7" height="7" fill={BOT_COLOR} stroke="#000" />
      ) : (
        <circle cx="19" cy="6" r="3.5" fill={HUMAN_COLOR} stroke="#fff" strokeWidth="1.2" />
      )}
    </svg>
  );
}

export function Legend() {
  const codes = [EV.Kill, EV.BotKill, EV.Killed, EV.BotKilled, EV.KilledByStorm, EV.Loot];
  return (
    <section className="legend">
      <label className="section-label">Legend</label>
      <div className="legend-grid">
        <div><Line bot={false} /> Human path</div>
        <div><Line bot /> Bot path</div>
        {codes.map((c) => (
          <div key={c}>
            <Glyph code={c} /> {EVENT_STYLES[c].short}
          </div>
        ))}
      </div>
      <p className="hint">Red = vs players, orange = vs bots. Faint line = route still to come during playback.</p>
    </section>
  );
}
