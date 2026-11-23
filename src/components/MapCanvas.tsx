import { useCallback, useEffect, useRef, useState } from "react";
import type { MapConfig, MatchDetail } from "../lib/types";
import { IMAGE_SIZE, imageToWorld, worldToImage } from "../lib/coords";
import { BOT_COLOR, EVENT_STYLES, eventLabel, type MarkerShape } from "../lib/events";
import type { HeatResult } from "../lib/heatmap";
import { fmtTime, shortId } from "../lib/format";

const HUMAN_PALETTE = ["#38d6ff", "#7cff6b", "#ff6bd6", "#ffffff"];
const GAP_SECONDS = 30; // don't join samples further apart than this

export interface MapCanvasProps {
  map: MapConfig;
  imageUrl: string;
  match: MatchDetail | null;
  time: number;
  hidden: Set<string>;
  showHumans: boolean;
  showBots: boolean;
  markerCodes: Set<number>;
  heat: HeatResult | null;
  showHotspots: boolean;
  highlight: string | null;
  onPickPlayer: (id: string | null) => void;
}

interface View {
  scale: number;
  tx: number;
  ty: number;
}

interface Hit {
  x: number;
  y: number;
  r: number;
  title: string;
  lines: string[];
  player?: string;
}

export function humanColor(match: MatchDetail | null, id: string): string {
  if (!match) return HUMAN_PALETTE[0];
  const humans = match.players.filter((p) => !p.bot);
  const i = humans.findIndex((p) => p.id === id);
  return HUMAN_PALETTE[Math.max(0, i) % HUMAN_PALETTE.length];
}

function drawMarker(ctx: CanvasRenderingContext2D, shape: MarkerShape, x: number, y: number, color: string, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.fillStyle = color;
  switch (shape) {
    case "cross": {
      // crosshair-style X: kill
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-s, -s); ctx.lineTo(s, s); ctx.moveTo(s, -s); ctx.lineTo(-s, s);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      break;
    }
    case "skull": {
      // filled disc with dark X: death
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 1.8;
      const k = s * 0.5;
      ctx.beginPath();
      ctx.moveTo(-k, -k); ctx.lineTo(k, k); ctx.moveTo(k, -k); ctx.lineTo(-k, k);
      ctx.stroke();
      break;
    }
    case "storm": {
      // lightning bolt in a triangle: storm death
      const r = s * 1.35;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -r); ctx.lineTo(r * 0.95, r * 0.7); ctx.lineTo(-r * 0.95, r * 0.7); ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.moveTo(1.5, -r * 0.45); ctx.lineTo(-2.5, 1.5); ctx.lineTo(0.5, 1.5); ctx.lineTo(-1.5, r * 0.55);
      ctx.lineTo(2.8, -0.5); ctx.lineTo(-0.2, -0.5); ctx.closePath();
      ctx.fill();
      break;
    }
    case "diamond": {
      const r = s * 0.85;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

export function MapCanvas(p: MapCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ scale: 0.3, tx: 0, ty: 0 });
  const [hover, setHover] = useState<{ x: number; y: number; hit: Hit | null; world: [number, number] | null }>({
    x: 0, y: 0, hit: null, world: null,
  });
  const hits = useRef<Hit[]>([]);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);

  const fit = useCallback(() => {
    const s = (Math.min(size.w, size.h) / IMAGE_SIZE) * 0.98;
    setView({ scale: s, tx: (size.w - IMAGE_SIZE * s) / 2, ty: (size.h - IMAGE_SIZE * s) / 2 });
  }, [size]);

  // Load minimap
  useEffect(() => {
    setImg(null);
    const im = new Image();
    im.src = p.imageUrl;
    im.onload = () => setImg(im);
  }, [p.imageUrl]);

  // Track container size
  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-fit when the map or the viewport changes
  useEffect(fit, [fit, p.imageUrl]);

  // Draw
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const { scale, tx, ty } = view;
    const toScreen = (x: number, z: number): [number, number] => {
      const [px, py] = worldToImage(x, z, p.map);
      return [tx + px * scale, ty + py * scale];
    };

    // 1. minimap
    if (img) {
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, tx, ty, IMAGE_SIZE * scale, IMAGE_SIZE * scale);
    }
    // dim slightly so overlays pop
    ctx.fillStyle = p.heat ? "rgba(5,8,14,0.45)" : "rgba(5,8,14,0.15)";
    ctx.fillRect(tx, ty, IMAGE_SIZE * scale, IMAGE_SIZE * scale);

    // 2. heatmap
    if (p.heat) {
      ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = p.match ? 0.55 : 0.9;
      ctx.drawImage(p.heat.canvas, tx, ty, IMAGE_SIZE * scale, IMAGE_SIZE * scale);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      if (p.showHotspots) {
        p.heat.hotspots.forEach((h, i) => {
          const sx = tx + h.x * scale;
          const sy = ty + h.y * scale;
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.setLineDash([4, 3]);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(14, 28 * scale * 4), 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = "600 12px Inter, system-ui, sans-serif";
          ctx.fillStyle = "#fff";
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 3;
          ctx.strokeText(`#${i + 1}`, sx + 10, sy - 12);
          ctx.fillText(`#${i + 1}`, sx + 10, sy - 12);
        });
      }
    }

    const newHits: Hit[] = [];
    const m = p.match;
    if (m) {
      const t = p.time;
      const players = m.players.filter((pl) => !p.hidden.has(pl.id) && (pl.bot ? p.showBots : p.showHumans));
      // bots underneath humans
      players.sort((a, b) => Number(b.bot) - Number(a.bot));
      for (const pl of players) {
        const color = pl.bot ? BOT_COLOR : humanColor(m, pl.id);
        const hl = p.highlight === pl.id;
        const dim = p.highlight !== null && !hl;
        const pts = pl.path.map((r) => [r[0], ...toScreen(r[1], r[2])] as [number, number, number]);

        const stroke = (upto: number, alpha: number, width: number) => {
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.setLineDash(pl.bot ? [5, 4] : []);
          ctx.beginPath();
          let prevT = -Infinity;
          for (let i = 0; i < pts.length; i++) {
            const [pt, x, y] = pts[i];
            if (pt > upto) break;
            if (pt - prevT > GAP_SECONDS) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            prevT = pt;
          }
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        };
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        // ghost of the full route, then the travelled part on top
        stroke(Infinity, dim ? 0.06 : pl.bot ? 0.16 : 0.22, pl.bot ? 1.2 : 2);
        stroke(t, dim ? 0.15 : pl.bot ? 0.75 : 1, (pl.bot ? 1.4 : 2.6) + (hl ? 1.5 : 0));

        // current position (interpolated)
        if (pts.length && pts[0][0] <= t) {
          let cx = pts[0][1];
          let cy = pts[0][2];
          for (let i = 1; i < pts.length; i++) {
            if (pts[i][0] >= t) {
              const a = pts[i - 1];
              const b = pts[i];
              const k = b[0] === a[0] || b[0] - a[0] > GAP_SECONDS ? 0 : (t - a[0]) / (b[0] - a[0]);
              cx = a[1] + (b[1] - a[1]) * k;
              cy = a[2] + (b[2] - a[2]) * k;
              break;
            }
            cx = pts[i][1];
            cy = pts[i][2];
          }
          const lastT = pts[pts.length - 1][0];
          const died = pl.events.some((e) => e[0] <= t && (e[1] === 3 || e[1] === 5 || e[1] === 6));
          const ended = t > lastT + 1;
          ctx.globalAlpha = dim ? 0.3 : ended ? 0.45 : 1;
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#000";
          ctx.fillStyle = color;
          ctx.beginPath();
          if (pl.bot) ctx.rect(cx - 4, cy - 4, 8, 8);
          else ctx.arc(cx, cy, hl ? 8 : 6.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          if (!pl.bot) {
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cx, cy, (hl ? 8 : 6.5) + 2.5, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          newHits.push({
            x: cx, y: cy, r: 9, player: pl.id,
            title: pl.bot ? `Bot ${pl.id}` : `Human ${shortId(pl.id)}`,
            lines: [died ? "Dead" : ended ? "Left the match / extracted" : "Alive", `${pl.path.length} position samples`],
          });
        }

        // event markers
        for (const e of pl.events) {
          if (e[0] > t || !p.markerCodes.has(e[1])) continue;
          const st = EVENT_STYLES[e[1]];
          if (!st) continue;
          const [sx, sy] = toScreen(e[2], e[3]);
          ctx.globalAlpha = dim ? 0.25 : 1;
          drawMarker(ctx, st.shape, sx, sy, st.color, st.shape === "diamond" ? 5 : 6);
          ctx.globalAlpha = 1;
          newHits.push({
            x: sx, y: sy, r: 9, player: pl.id,
            title: eventLabel(e[1], pl.bot),
            lines: [
              `${pl.bot ? "Bot " + pl.id : "Human " + shortId(pl.id)} at ${fmtTime(e[0])}`,
              `world x ${e[2].toFixed(1)}, z ${e[3].toFixed(1)}`,
            ],
          });
        }
      }
    }
    hits.current = newHits;
  }, [img, size, view, p.map, p.match, p.time, p.hidden, p.showHumans, p.showBots, p.markerCodes, p.heat, p.showHotspots, p.highlight]);

  // Interaction
  const onWheel = (e: React.WheelEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const k = Math.exp(-e.deltaY * 0.0015);
    setView((v) => {
      const min = (Math.min(size.w, size.h) / IMAGE_SIZE) * 0.5;
      const s = Math.min(6, Math.max(min, v.scale * k));
      const f = s / v.scale;
      return { scale: s, tx: mx - (mx - v.tx) * f, ty: my - (my - v.ty) * f };
    });
  };
  const zoomBy = (k: number) =>
    setView((v) => {
      const s = Math.min(6, Math.max(0.05, v.scale * k));
      const f = s / v.scale;
      return { scale: s, tx: size.w / 2 - (size.w / 2 - v.tx) * f, ty: size.h / 2 - (size.h / 2 - v.ty) * f };
    });

  const onMouseDown = (e: React.MouseEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      setView((v) => ({ ...v, tx: d.tx + dx, ty: d.ty + dy }));
    }
    let best: Hit | null = null;
    let bd = Infinity;
    for (const h of hits.current) {
      const dd = Math.hypot(h.x - mx, h.y - my);
      if (dd < h.r && dd < bd) {
        bd = dd;
        best = h;
      }
    }
    const px = (mx - view.tx) / view.scale;
    const py = (my - view.ty) / view.scale;
    const inside = px >= 0 && py >= 0 && px <= IMAGE_SIZE && py <= IMAGE_SIZE;
    setHover({ x: mx, y: my, hit: best, world: inside ? imageToWorld(px, py, p.map) : null });
  };
  const onMouseUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) p.onPickPlayer(hover.hit?.player ?? null);
  };

  return (
    <div className="map-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h, cursor: hover.hit ? "pointer" : drag.current ? "grabbing" : "grab" }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          drag.current = null;
          setHover((h) => ({ ...h, hit: null, world: null }));
        }}
        onDoubleClick={fit}
      />
      {!img && <div className="map-loading">Loading minimap…</div>}
      <div className="zoom-controls">
        <button onClick={() => zoomBy(1.4)} title="Zoom in">+</button>
        <button onClick={() => zoomBy(1 / 1.4)} title="Zoom out">−</button>
        <button onClick={fit} title="Fit map (double-click)">⤢</button>
      </div>
      {hover.world && (
        <div className="coord-hud">
          world x {hover.world[0].toFixed(1)} · z {hover.world[1].toFixed(1)}
        </div>
      )}
      {hover.hit && (
        <div className="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <strong>{hover.hit.title}</strong>
          {hover.hit.lines.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export { drawMarker };
