# Architecture

## Stack and why

| Layer | Choice | Why |
|---|---|---|
| Preprocess | Python 3 + pyarrow/pandas + Pillow (`scripts/preprocess.py`) | The parquet tooling is best in Python. The dataset is small (≈12 MB, 89k rows), so a one-off build step beats shipping a parquet reader to the browser. |
| Frontend | Vite + React 18 + TypeScript | Fast to build, typed data contracts, no server. |
| Rendering | One HTML `<canvas>` (2D), no map library | Minimaps are plain images with a custom world transform. A canvas redraws 16 paths and hundreds of markers at 60 fps during playback, and keeps markers a constant size while zooming. |
| Hosting | Vercel, static | The output is static files, so there is no backend to run or pay for. Vercel gzips JSON and serves it from a CDN. |

## Data flow

```
player_data/February_*/<user>_<match>.nakama-0   (1,242 parquet files)
        │  scripts/preprocess.py
        │   • decode event bytes → string → code 0..7
        │   • ts: typed timestamp[ms] but holds Unix seconds → int seconds
        │   • bot = user_id is not a UUID
        │   • group by match_id (not by folder), t = seconds since match start
        ▼
public/data/index.json            796 match summaries + map config (148 KB)
public/data/matches/<id>.json     per match: each journey's path [t,x,z,y] + events [t,code,x,z]
public/data/heat/<map>.json       every event on a map, columnar, UV quantised to 12 bits
public/minimaps/<map>.webp        2048² WebP (from 4320², 2160×2158 and 9000² sources)
        │  fetch (lazy, cached)
        ▼
React state (map, dates, match, time, layers) ──► canvas: minimap → heatmap → paths → markers
```

The browser fetches the index first (one request), a match file only when it is opened (≈5 KB each), and a map's heat file only when a heatmap is switched on. Heatmaps are binned in the browser (256² grid, Gaussian blur, 99th-percentile normalisation), so the date, human/bot and match filters apply to them instantly.

## Coordinate mapping

The README defines each map by `scale`, `originX` and `originZ`. The mapping lives in one place, `src/lib/coords.ts`, which has unit tests, including the README's worked example.

1. **Pick the axes.** The game's ground plane is (x, z), and `y` is elevation. `y` is kept in the path data but not drawn.
2. **World → UV.** `u = (x − originX) / scale` and `v = (z − originZ) / scale`. UV spans 0..1 across the whole minimap image. For example, Ambrose Valley spans 900 world units from (−370, −473).
3. **UV → image.** `px = u · S` and `py = (1 − v) · S`. The flip is needed because world z grows "north" (up), while image rows grow down.
4. **Resolution independence.** The README says the images are 1024², but they are actually 4320², 2160×2158 and 9000². Because the mapping goes through UV, the image size does not matter. Every minimap is resized to a 2048² square and drawn into a fixed 2048-unit "image space", with `S = 2048`. Grand Rift's 2-pixel non-squareness is absorbed by that resize.
5. **Image → screen.** `sx = tx + px · zoom` and `sy = ty + py · zoom`, where pan/zoom is (tx, ty, zoom). Lines and markers are drawn in screen space after the transform, so they stay crisp at every zoom. `imageToWorld` inverts the whole chain to show world coordinates under the cursor.

**Validation:** all 89,104 points land inside [0, 1]² on their map (the preprocessor prints the ranges). Overlaying every point on each minimap traces roads, bridges and building interiors, and no point falls in water or off the map edge.

## Assumptions

- **Bots:** a bot is any non-UUID `user_id`. Three numeric IDs (1379, 1402, 1429) log human-style `Position`/`Loot` events. I keep them as bots, following the README rule, and flag this rather than guess.
- **Bot events are from the bot's own point of view.** In a bot's file, `BotKill` means the bot got a kill and `BotKilled` means it died. The tooltips label them that way.
- **Match date:** the folder date of the match's earliest file. One match crosses midnight, and folder days are offset about 1 h from UTC.
- **Ending without a death event:** I read a journey that ends with no death event as an extraction or a disconnect. The data has no explicit extraction event.
- **Coverage:** 779 of 796 matches contain exactly one human journey. Only 52 matches include bot journeys, and 16 have no human at all. The "Only matches with bot journeys recorded" filter surfaces the 52 that are worth replaying. PvP is nearly absent: 3 `Kill` events against 2,232 `BotKill` events. This looks like how the data was sampled, so I don't treat it as a design finding.
- **Time:** positions are sampled every ~5 s (the median gap). Gaps over 30 s are drawn as breaks, not straight lines. Playback interpolates between samples.

## Tradeoffs

| Decision | Chose | Gave up | Why |
|---|---|---|---|
| Where parquet is parsed | Build-time Python | Uploading new parquet in the browser (DuckDB-WASM) | 10× smaller payload and an instant first load. New data means re-running one script. |
| Renderer | Canvas 2D | WebGL (deck.gl), SVG | The largest view is about 60k heat points, binned once. Canvas is plenty, and it avoids a heavy dependency. SVG would choke during playback. |
| Heatmap binning | Client-side from raw points | Pre-rendered heatmap PNGs | Filters (date, human/bot, single match) apply live. Costs a one-time fetch per map of at most 1.1 MB (245 KB gzipped, Ambrose). |
| Minimap size | 2048² WebP (~170 KB) | Full resolution | Sharp at 4× zoom on Ambrose, and loads in well under a second. Deep zoom on Lockdown is softer than the 9000² source. |
| State | React `useState` + URL query string | Redux or a router | A small app. The URL makes every view shareable (`?map=&match=&t=&heat=&days=`). |
| Bot classification | Filename rule | Inferring from event types | Predictable and documented. The anomalies are listed above. |
