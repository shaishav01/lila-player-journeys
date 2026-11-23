#!/usr/bin/env python3
"""Reproduce the numbers quoted in INSIGHTS.md from the preprocessed JSON.

    python scripts/insights.py            (run scripts/preprocess.py first)
"""
import collections
import glob
import json

import numpy as np

KILLED, BOT_KILLED, STORM, LOOT = 3, 5, 6, 7
ix = json.load(open("public/data/index.json"))
MAPS = ix["maps"]


def uv(mp, x, z):
    c = MAPS[mp]
    return (x - c["originX"]) / c["scale"], (z - c["originZ"]) / c["scale"]


runs = []
for f in glob.glob("public/data/matches/*.json"):
    m = json.load(open(f))
    for p in m["players"]:
        last = max([r[0] for r in p["path"]] + [e[0] for e in p["events"]] + [0])
        death = next((e for e in p["events"] if e[1] in (KILLED, BOT_KILLED, STORM)), None)
        runs.append(dict(map=m["map"], bot=p["bot"], last=last, death=death, path=p["path"], events=p["events"]))
H = [r for r in runs if not r["bot"]]

print("== 1. Storm")
for mp in MAPS:
    h = [r for r in H if r["map"] == mp]
    storm = [r for r in h if r["death"] and r["death"][1] == STORM]
    alive = [r for r in h if r["last"] >= 650 and (r["death"] is None or r["death"][0] >= 650)]
    st_alive = sum(1 for r in alive if r["death"] and r["death"][1] == STORM)
    left = [r["last"] for r in h if r["death"] is None]
    print(f"{mp:14s} runs={len(h)} storm={len(storm)} ({100*len(storm)/len(h):.1f}%) "
          f"alive@650s={len(alive)} storm-of-alive={100*st_alive/max(1,len(alive)):.0f}% "
          f"storm t=[{min(r['death'][0] for r in storm)}..{max(r['death'][0] for r in storm)}] "
          f"left-alive p75={np.percentile(left, 75):.0f}s")

print("\n== 2. Lethality (20x20 grid, >=5 human deaths, storm excluded)")
bk = [r["death"][0] for r in H if r["death"] and r["death"][1] == BOT_KILLED]
print(f"bot-caused human deaths p25 = {np.percentile(bk, 25):.0f}s")
G = 20
for mp in MAPS:
    h = [r for r in H if r["map"] == mp]
    tg, dg = collections.Counter(), collections.Counter()
    for r in h:
        for p in r["path"]:
            u, v = uv(mp, p[1], p[2])
            tg[(int(u * G), int(v * G))] += 1
        for e in r["events"]:
            if e[1] in (KILLED, BOT_KILLED):
                u, v = uv(mp, e[2], e[3])
                dg[(int(u * G), int(v * G))] += 1
    T, D = sum(tg.values()), sum(dg.values())
    print(f"{mp}: map avg {100*D/T:.2f} deaths / 100 samples")
    cells = sorted((((dg[k] / D) / (tg[k] / T)), k) for k in dg if dg[k] >= 5 and tg[k])[::-1][:3]
    for li, k in cells:
        c = MAPS[mp]
        cx = (k[0] + .5) / G * c["scale"] + c["originX"]
        cz = (k[1] + .5) / G * c["scale"] + c["originZ"]
        print(f"   ({cx:.0f},{cz:.0f}) lethality {li:.1f}x deaths={dg[k]} samples={tg[k]}")

print("\n== 3. Concentration (40x40 grid over every walked cell)")
G = 40
for mp in MAPS:
    walked, tg, lg = set(), collections.Counter(), collections.Counter()
    for r in runs:
        if r["map"] != mp:
            continue
        for p in r["path"]:
            u, v = uv(mp, p[1], p[2])
            k = (int(u * G), int(v * G))
            walked.add(k)
            if not r["bot"]:
                tg[k] += 1
        if not r["bot"]:
            for e in r["events"]:
                if e[1] == LOOT:
                    u, v = uv(mp, e[2], e[3])
                    lg[(int(u * G), int(v * G))] += 1
    n = len(walked)
    ct = np.cumsum(sorted((tg[k] for k in walked), reverse=True))
    cl = np.cumsum(sorted((lg[k] for k in walked), reverse=True))
    pct = lambda c, q: 100 * (np.searchsorted(c, q * c[-1]) + 1) / n  # noqa: E731
    print(f"{mp:14s} 50% time in {pct(ct, .5):.0f}% | 50% loot in {pct(cl, .5):.0f}% | 80% loot in {pct(cl, .8):.0f}% "
          f"| cells with no loot {100*sum(1 for k in walked if not lg[k])/n:.0f}%")
