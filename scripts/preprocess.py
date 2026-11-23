#!/usr/bin/env python3
"""
Preprocess LILA BLACK parquet telemetry into compact static JSON for the web viewer.

Usage:
    python scripts/preprocess.py --src "../player_data" --out public

Outputs (all under --out):
    data/index.json            maps config + one summary row per match
    data/matches/<id>.json     every journey (path + discrete events) for one match
    data/heat/<map>.json       every event on a map, columnar + quantised, for heatmaps
    minimaps/<map>.webp        minimaps downscaled to <= 2048 px

The source folder is only ever read, never written.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq
from PIL import Image

Image.MAX_IMAGE_PIXELS = None  # Lockdown minimap is 9000x9000

# Map configuration from the dataset README. World (x, z) -> UV in [0, 1].
MAPS = {
    "AmbroseValley": {"scale": 900, "originX": -370, "originZ": -473, "image": "AmbroseValley_Minimap.png"},
    "GrandRift": {"scale": 581, "originX": -290, "originZ": -290, "image": "GrandRift_Minimap.png"},
    "Lockdown": {"scale": 1000, "originX": -500, "originZ": -500, "image": "Lockdown_Minimap.jpg"},
}

# Event codes shared with the frontend (src/lib/events.ts). Order matters.
EVENTS = ["Position", "BotPosition", "Kill", "Killed", "BotKill", "BotKilled", "KilledByStorm", "Loot"]
EV = {name: i for i, name in enumerate(EVENTS)}
MOVEMENT = {EV["Position"], EV["BotPosition"]}

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
HEAT_Q = 4095  # UV quantisation for heatmap points (12-bit is ~0.5 px on a 2048 image)
MINIMAP_MAX = 2048


def world_to_uv(x: float, z: float, cfg: dict) -> tuple[float, float]:
    """README formula. v is NOT flipped here; the client flips when mapping to image pixels."""
    return (x - cfg["originX"]) / cfg["scale"], (z - cfg["originZ"]) / cfg["scale"]


def load(src: Path) -> pd.DataFrame:
    frames = []
    for day_dir in sorted(p for p in src.iterdir() if p.is_dir() and p.name.startswith("February_")):
        for f in sorted(day_dir.iterdir()):
            if f.name.startswith("."):
                continue
            try:
                t = pq.read_table(f).to_pandas()
            except Exception as e:  # noqa: BLE001
                print(f"  ! skipping unreadable {f.name}: {e}", file=sys.stderr)
                continue
            t["day"] = day_dir.name.replace("February_", "2026-02-")
            frames.append(t)
    df = pd.concat(frames, ignore_index=True)
    df["event"] = df["event"].map(lambda b: b.decode("utf-8") if isinstance(b, (bytes, bytearray)) else str(b))
    # `ts` is typed timestamp[ms] but the integer actually holds Unix *seconds*.
    df["t"] = df["ts"].astype("int64")
    df["is_bot"] = ~df["user_id"].str.match(UUID_RE)
    df["ev"] = df["event"].map(EV)
    unknown = df[df["ev"].isna()]["event"].unique()
    if len(unknown):
        print(f"  ! unknown events dropped: {unknown}", file=sys.stderr)
        df = df[df["ev"].notna()]
    df["ev"] = df["ev"].astype(int)
    return df


def build(df: pd.DataFrame, out: Path) -> None:
    data = out / "data"
    (data / "matches").mkdir(parents=True, exist_ok=True)
    (data / "heat").mkdir(parents=True, exist_ok=True)

    days = sorted(df["day"].unique())
    day_idx = {d: i for i, d in enumerate(days)}

    # Bounds check: every point should land on its minimap.
    for m, sub in df.groupby("map_id"):
        u, v = world_to_uv(sub["x"], sub["z"], MAPS[m])
        outside = ((u < 0) | (u > 1) | (v < 0) | (v > 1)).sum()
        print(f"  {m}: {len(sub):,} rows, u=[{u.min():.3f},{u.max():.3f}] v=[{v.min():.3f},{v.max():.3f}], outside={outside}")

    matches = []
    for mid, sub in df.sort_values("t").groupby("match_id", sort=False):
        map_id = sub["map_id"].iloc[0]
        t0 = int(sub["t"].min())
        short = mid.replace(".nakama-0", "")
        players = []
        for uid, p in sub.groupby("user_id", sort=False):
            mv = p[p["ev"].isin(MOVEMENT)]
            ev = p[~p["ev"].isin(MOVEMENT)]
            players.append({
                "id": uid,
                "bot": bool(p["is_bot"].iloc[0]),
                # path rows: [t, x, z, y]   (t = seconds since match start, y = elevation)
                "path": [[int(r.t - t0), round(float(r.x), 1), round(float(r.z), 1), round(float(r.y), 1)]
                         for r in mv.itertuples()],
                # event rows: [t, code, x, z]
                "events": [[int(r.t - t0), int(r.ev), round(float(r.x), 1), round(float(r.z), 1)]
                           for r in ev.itertuples()],
            })
        # humans first, then bots by id
        players.sort(key=lambda p: (p["bot"], p["id"]))
        counts = sub["event"].value_counts().to_dict()
        summary = {
            "id": short,
            "map": map_id,
            "day": min(sub["day"]),  # folder date of the earliest file (one match crosses midnight)
            "start": t0,
            "dur": int(sub["t"].max() - t0),
            "humans": int((~sub.drop_duplicates("user_id")["is_bot"]).sum()),
            "bots": int(sub.drop_duplicates("user_id")["is_bot"].sum()),
            "counts": {k: int(counts.get(k, 0)) for k in EVENTS if counts.get(k, 0)},
        }
        matches.append(summary)
        with open(data / "matches" / f"{short}.json", "w") as fh:
            json.dump({**summary, "players": players}, fh, separators=(",", ":"))

    # Heatmap points per map: columnar, UV quantised to 0..4095, v flipped to image space.
    for m, sub in df.groupby("map_id"):
        cfg = MAPS[m]
        u, v = world_to_uv(sub["x"].astype(float), sub["z"].astype(float), cfg)
        qu = (u.clip(0, 1) * HEAT_Q).round().astype(int)
        qv = ((1 - v).clip(0, 1) * HEAT_Q).round().astype(int)
        match_ids = sub["match_id"].str.replace(".nakama-0", "", regex=False)
        heat = {
            "q": HEAT_Q,
            "u": qu.tolist(),
            "v": qv.tolist(),
            "e": sub["ev"].astype(int).tolist(),
            "d": sub["day"].map(day_idx).astype(int).tolist(),
            "b": sub["is_bot"].astype(int).tolist(),
        }
        # match index per point, so heatmaps can follow the match filter
        midx = {mm: i for i, mm in enumerate(sorted(match_ids.unique()))}
        heat["matches"] = sorted(midx, key=midx.get)
        heat["m"] = match_ids.map(midx).astype(int).tolist()
        with open(data / "heat" / f"{m}.json", "w") as fh:
            json.dump(heat, fh, separators=(",", ":"))

    maps_out = {}
    mm_dir = out / "minimaps"
    mm_dir.mkdir(parents=True, exist_ok=True)
    for m, cfg in MAPS.items():
        maps_out[m] = {k: cfg[k] for k in ("scale", "originX", "originZ")}
        maps_out[m]["image"] = f"minimaps/{m}.webp"

    matches.sort(key=lambda s: (-(s["humans"] + s["bots"]), -s["dur"]))
    index = {"events": EVENTS, "days": days, "maps": maps_out, "matches": matches}
    with open(data / "index.json", "w") as fh:
        json.dump(index, fh, separators=(",", ":"))
    print(f"  wrote {len(matches)} matches, {len(days)} days")


def minimaps(src: Path, out: Path) -> None:
    mm_dir = out / "minimaps"
    mm_dir.mkdir(parents=True, exist_ok=True)
    for m, cfg in MAPS.items():
        dst = mm_dir / f"{m}.webp"
        if dst.exists():
            continue
        im = Image.open(src / "minimaps" / cfg["image"]).convert("RGB")
        print(f"  {m}: source {im.size}")
        # Resize to a square: the UV mapping covers the whole image, so a 2160x2158
        # source stretched to 2048x2048 keeps UV->pixel exact.
        im = im.resize((MINIMAP_MAX, MINIMAP_MAX), Image.LANCZOS)
        im.save(dst, "WEBP", quality=82, method=6)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, type=Path, help="player_data folder (read only)")
    ap.add_argument("--out", default=Path("public"), type=Path)
    a = ap.parse_args()
    print("Loading parquet…")
    df = load(a.src)
    print(f"  {len(df):,} rows from {df.groupby(['user_id', 'match_id']).ngroups:,} journeys")
    print("Building JSON…")
    build(df, a.out)
    print("Minimaps…")
    minimaps(a.src, a.out)


if __name__ == "__main__":
    main()
