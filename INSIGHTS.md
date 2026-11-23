# Insights

I found these with the tool's heatmaps, playback and hotspot list. I then counted them exactly with the same preprocessed data (human journeys only unless stated, Feb 10–14). Each insight has a link that opens the view it came from. `python scripts/insights.py` reproduces every number below.

---

## 1. On Lockdown and Grand Rift, the storm kills half of the players who are still in the match late

**What caught my eye.** With the *Storm deaths* markers on, Lockdown looked crowded with purple triangles for a map with a third of Ambrose Valley's matches. Scrubbing those matches showed every storm death in the last minutes, scattered across the map instead of along one edge.

**Numbers**

| Map | Human runs | Storm deaths | Share of all runs | Still alive at 10:50 | …of whom the storm killed |
|---|---|---|---|---|---|
| Ambrose Valley | 554 | 17 | 3.1 % | 93 | **18 %** |
| Lockdown | 170 | 17 | 10.0 % | 35 | **49 %** |
| Grand Rift | 57 | 5 | 8.8 % | 9 | **56 %** |

- All 39 storm deaths happen between 10:55 and 14:47 into the match. None happens earlier.
- Players who leave without dying (extract or disconnect) mostly do so before the storm. On Lockdown 75 % have left by 10:23, against 11:08 on Ambrose Valley.
- Lockdown is the smallest map, yet it has three times Ambrose Valley's storm-death rate. So distance alone does not explain it. The likely causes are extraction access or storm pacing.

**What to do**
- Lockdown and Grand Rift: add or move an extraction point toward the middle of the map, or add one late-game extraction that opens as the storm arrives.
- Make the storm's direction and timing readable earlier, with an audio or HUD warning about 60 s before the storm reaches the player.
- Then re-check this table per map.

**Metrics affected:** extraction rate, storm-death rate (target close to Ambrose Valley's ~3 %), late-game frustration and quit rate, and the "died with loot" rate, which drives perceived unfairness.

**Why a level designer should care.** The storm is a map-level pacing tool. If half of the players who stay late die to it on two of the three maps, it stops being pressure and becomes a trap. That is a geometry and extraction-placement problem the level owns.

*View:* `?map=Lockdown` → tick only *Storm deaths*, sort matches by *Longest*.

---

## 2. A few small spots are 4–9× deadlier than the rest of the map

**What caught my eye.** The *Death zones* heatmap with Bots unticked lights up the busy POIs, as you would expect. Comparing it with *Traffic* showed a few spots that are bright for deaths but dim for traffic. Players don't spend long there, but they die there.

**Numbers.** I used grid cells of about 45–50 m, cells with at least 5 human deaths to players or bots, and storm deaths excluded. *Lethality* is a cell's share of deaths divided by its share of time spent (position samples, about 5 s each).

| Map | Spot (world x, z) | What's there | Deaths | Lethality | Time per death |
|---|---|---|---|---|---|
| Lockdown | (−75, 75) | Rocky pass north-east of the central dome | 7 | **9.2×** | ~76 s (map: ~11.6 min) |
| Lockdown | (125, −25) | Walled compound, east-centre | 12 | 3.5× | ~3.3 min |
| Ambrose Valley | (−77, 44) | South-east corner of the walled barracks compound | 12 | 4.3× | ~2.3 min |
| Ambrose Valley | (−77, −90) | West river crossing | 11 | 4.0× | ~2.5 min |
| Ambrose Valley | (57, 0) | Road east of the river, north of the twin warehouses | 10 | 3.6× | ~2.8 min |

Map-wide, a human dies about once per 10–12 min of time spent. In these cells it is once every 1–3 minutes. Almost all of these deaths are to bots, because PvP is nearly absent in this dataset. The counts per cell are small (7–12), so treat these as places to look at, not proven problems.

**What to do**
- Replay the matches that died there (sort by *Most kills*, open a match, and click the timeline ticks). Check whether players are funnelled into bot sightlines with no cover. The river crossing and the rocky pass are both natural chokepoints.
- Add cover or a second route through the chokepoints. Check where bots spawn or patrol near these cells.
- Re-measure the lethality of these cells after the change.

**Metrics affected:** early-death rate (25 % of bot-caused human deaths happen in the first 2:40), average survival time, extraction rate, and new-player retention, since a run that ends at a single choke feels unfair.

**Why a level designer should care.** Deaths in a busy POI are the intended risk/reward. Deaths at a pass or crossing that players must go through are a layout problem, and that is the level designer's direct lever.

*View:* `?map=Lockdown&heat=deaths` (untick *Bots*), then compare with `?map=Lockdown&heat=traffic`.

---

## 3. Ambrose Valley's east side is an exit corridor, not a destination

**What caught my eye.** The *Loot* heatmap on Ambrose Valley is a handful of hot dots, while *Traffic* is spread wider. The eastern ring road looks lit only along the path to the extraction area.

**Numbers.** I used a 40×40 grid (about 22 m cells) over every cell anyone ever walked through.

- Half of all human time is spent in **12 %** of the walked area. Half of all loot pickups happen in **4 %** of it, and 80 % in 13 %.
- 49 % of walked cells never produced a single human loot pickup.
- Split into 8×8 regions, the central regions are each entered by 31–35 % of human runs. The eastern band (x ≈ 190–305) is entered by only 4–23 %, and the south-east corner by ≤ 5 %.
- About 46 of the 239 runs that ended without dying ended near (200, −75), in that same eastern band. So players go east to leave, not to play.

**What to do**
- Put a mid-value loot POI or an objective in the east and south-east, so the route to extraction holds content and not just distance.
- Alternatively, thin out loot in the top-5 hotspots (the hotspot list shows the coordinates) to push players outward.
- Track region reach per map as a standing metric.

**Metrics affected:** map coverage (share of regions visited per run), loot per minute, how evenly players are spread, time-to-first-encounter, and match-to-match variety, which feeds long-term retention.

**Why a level designer should care.** Space that nobody uses still costs art, QA and performance budget. Concentrated loot also makes every run follow the same path. Spreading value is the cheapest way to make a large map feel bigger and less predictable.

*View:* `?map=AmbroseValley&heat=loot`, then switch to *Traffic*, with *Label top 5 hotspots* on.
