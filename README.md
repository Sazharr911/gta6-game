# PALMSHADE HEAT — an original open-world crime game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Sazharr911/gta6-game/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Sazharr911/gta6-game/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Entry for the make.fun bounty [Make GTA 6](https://make.fun/bounty/gta6-01).

**PALMSHADE HEAT** is a complete top-down open-world crime game in the
GTA 1/2 lineage, written from scratch for this bounty — its own city, people,
cars, story and sound. Nothing is taken from any existing game: every name,
place and line of dialogue in Port Palmshade was invented here.

You are **Rio Calloway**, a wheelman fresh off the bus with $250 and a
borrowed roof. Fixer **Marisol "Sol" Vega** runs the jobs; the **Palmshade PD
(PSPD)** runs the sirens. Work six story chapters — from stealing a rusty
Brisa roadster to the Palmshade Job itself — then keep the city simmering
with taxi fares and marina street races.

## The city

**Port Palmshade** is a sun-soaked coastal grid of 99 blocks across 8
districts (Palmline Beach, The Flats, Old Palmera, Neon Mile, Mercado
District, Azure Heights, Coral Docks, Palmshade Marina), generated
deterministically from a seed: hotels, diners, pawn shops and clubs with
striped awnings, rooftop clutter and glowing signs, parks with flowerbeds,
a marina plaza with a fountain, working docks with piers and cranes, a beach
with umbrellas and lifeguard stands, and a lighthouse on the northern point.
A full day/night cycle washes the city from morning glare to golden hour to
lamp-lit neon night, with lit windows after dark.

## Systems (all live, all playable)

- **Open world on foot and by car** — seamless walking and driving, building
  collision, sand that slows you, water you cannot drive into, a working
  minimap with a route line and flashing police blips.
- **Traffic & pedestrians** — lane-following traffic with intersection
  turns that brakes for anyone in the road, parked cars lining the kerbs,
  and a crowd with somewhere to be: locals cross at the zebra crossings,
  gather at café tables, beach umbrellas, park benches and the marina, dress
  for the beach or the boulevard (builds, caps, sunhats, beanies, bags),
  and flee violence — while witnesses feed the crime ledger.
- **Stealable, drivable cars** — 7 original models (Solano, Brisa Roadster,
  Tiburón GT, Flete van, taxis, Ranchero pickups, PSPD interceptors), each
  with its own speed, grip and durability, with damage, smoke and wrecks.
- **Wanted level & police response** — a witness-aware crime ledger feeds
  0–5 stars: crimes only count when somebody sees them. Interceptors
  pathfind with A* over the street grid toward an interception point, brake
  to arrest instead of running you down, foot officers arrive at 3+ stars
  and open fire at 4+, and heat bleeds away while you stay unseen —
  BUSTED and WASTED included, with fines and a clinic release.
- **Missions & story** — a 6-chapter campaign (FIRST WHEELS → COLD CHAIN →
  NEON DEBT → HARBOR RUN → THE PALMSHADE JOB → SUNSET RECKONING) built from
  goto / steal / deliver / kill / holdout / escape steps, plus repeatable
  taxi fares with tips and checkpoint street races, cash and respect
  progression, and a garage economy (repairs, supplies, the Hornet SMG).
- **Combat** — fists, the Palm-9 pistol and the Hornet SMG; hostile muscle
  with scrap pistols and thugs, tracers, hit feedback, and pickups (cash,
  health, armour, ammo).
- **HUD** — district plate with a clock, mission banner, cash, wanted stars
  with a SEARCHING/IN PURSUIT readout, health and armour, respect, weapon
  and ammo, a circular minimap, an analogue speedometer, a radio ticker,
  dialogue lines, context prompts, toasts, a bust meter and a pause menu.
- **Start screen & save system** — title with NEW GAME / CONTINUE / HOW TO
  PLAY, and a full localStorage save (story progress, cash, weapons, car,
  wanted, time of day) written at the safehouse, from the pause menu and
  after every job.
- **Sound** — everything synthesized in WebAudio: four radio stations with
  pad-chord progressions, an engine hum that follows the speedometer, a
  two-tone siren that fades with distance, gunfire, impacts, pickups and UI.
  No audio files, no network.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Walk / drive |
| Mouse | Aim |
| Left mouse | Punch / shoot |
| E | Enter or steal a car · take a job · repair ($100 at the garage) · supplies ($200) · patch up ($60 at the clinic) |
| F | Buy the Hornet SMG ($600 at the garage) · start a marina street race |
| Shift | Sprint / handbrake |
| 1 / 2 / 3 | Fists / Palm-9 / Hornet SMG |
| R | Next radio station (in a car) |
| M | Save at the Palmline Safehouse |
| P / Esc | Pause (S saves, Q quits to title) |

## Run it

Static files, no build step, no network at runtime:

```sh
node serve.ts          # or any static server over game/
# open http://localhost:8080
```

Opening `game/index.html` directly from disk in a browser works too.

## Layout

- `game/index.html` — canvas + DOM HUD + title/pause/splash overlays
- `game/src/` — one ES module per system: `config`, `random`, `city`,
  `nav` (A*), `entities`, `combat`, `wanted`, `missions`, `render`, `hud`,
  `audio`, `input`, `save`, `shots`, `main`
- `screenshots/` — four real renders (cover, on-foot, chase, docks), staged
  by `game/src/shots.js` and captured by `tools/shots.mjs`
- `tools/` — a CDP driver plus the screenshot runner and the full-loop
  playtest (`tools/playtest.mjs`)
- `main.ts` — the make.fun handoff: copies `game/` + `screenshots/` to the
  output directory and writes `dossier.json`

See `TESTS.md` for the automated playtest evidence.
