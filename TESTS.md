# TESTS — PALMSHADE HEAT

## Method

The game ships with its own test rig under `tools/`:

- `tools/cdp.mjs` — launches headless Chrome (`/opt/meta-chromium/chrome`)
  and drives it over the Chrome DevTools Protocol. This machine's Chrome
  refuses loopback HTTP pages (`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`)
  and its egress proxy rejects invented hosts, so the rig loads the game
  from disk (`file://` + `--allow-file-access-from-files`) — ES modules load
  fine that way, and the game needs no network either way.
- `tools/playtest.mjs` — plays the real game in that Chrome with real key
  and mouse input and asserts observable outcomes through the page's own
  `window.__game` debug handle. Console messages and page exceptions are
  collected for the entire run; **any console error fails the run**.
- `tools/shots.mjs` — renders the four `screenshots/*.jpg` via CDP
  `Page.captureScreenshot` from staged scenes (`game/src/shots.js`, chosen
  with `?shot=<name>&seed=1`), JPEG quality reduced until each file is under
  the 256 KiB cap.

## Playtest — 24 checks

1. Game boots to the title screen.
2. NEW GAME starts play.
3. The opening marker points at Sol's garage.
4. Rio walks on foot with WASD (real key events).
5. E steals the nearest parked car.
6. The stolen car actually drives.
7. E gets back out.
8. A* `findPath` between two intersections stays on street centrelines
   (every segment axis-aligned, 18 waypoints cross-town).
9. A pedestrian's zebra-crossing route stays inside the zebra band
   (max deviation 0 px from the crossing rectangle).
10. Crowd variety: at least 3 hat kinds and 8 build/hat/bag combinations
    (observed: 4 hats, 32 combos).
11. Pedestrians gather at hangout spots (observed: 59 gathered).
12. Mission 1 step 1: reach Sol at the garage.
13. Mission 1 step 2: the specified Brisa is the car that gets stolen.
14. Mission 1 completes and pays ($250 → $650).
15. Mission 3 reaches the collectors with the Palm-9 granted.
16. The Palm-9 fires and lands hits (ammo consumed, hostile health drops).
17. Marina street race completes through its checkpoints and pays (+$1,259).
18. Saving at the safehouse writes the story to localStorage.
19. CONTINUE after a reload restores cash and progress exactly.
20. Police respond at three stars (interceptors spawn).
21. An interceptor A* pathfinds to within 62 px of a stationary suspect
    across town (observed closest approach 28–54 px).
22. WASTED splash shows after lethal damage.
23. Rio respawns at Clínica Reyes and play resumes.
24. Zero console errors across the whole run.

## Results

- **24/24 PASS** on the final code, in repeated consecutive runs
  (nine green runs recorded during the session; the last six were
  consecutive, including two back-to-back after the final staging changes).
- During the fix cycle one intermediate run scored 23/24 on a
  timing-sensitive margin (the interceptor-approach window); it did not
  recur in the subsequent runs.
- Headless sanity in Node: every `game/src/*.js` passes `node --check`;
  the city generator builds 99 blocks / 161 buildings / 171 colliders /
  97 hangouts / 9 places; `findPath` crosses town in 19 points.

## Bugs the playtest caught (and the fixes)

- **Parked cars sat nose-in.** Parking spots were rotated 90° off the
  street, so a stolen car faced a building. Spots now park parallel.
- **Every car was capped at walking pace.** The scrape-slowdown factor in
  the player-car physics applied on every frame instead of only on
  wall contact; a stolen car managed 26 px in a second. The factor now
  applies only when a collision actually corrects the position.
- **The safehouse spawn overlapped the garage.** Rio spawned inside the
  garage building's footprint and walked out through a wall; the spawn and
  respawn points now sit on the doorstep, outside the collider.
- **The granted Palm-9 stayed holstered.** Chapter 3 hands over the pistol
  but left fists selected; it now auto-equips on grant.

## Screenshots

Four real renders of the running game at seed 1, each viewed after capture
and restaged where they read badly (the cover's police label now reads
IN PURSUIT; the docks shot puts Rio out on Pier 9; the camera clamp no
longer shows the unpainted void beyond the world's edge):

- `screenshots/1-cover.jpg` (187 KB) — Palmline Beach at golden hour: the
  stolen Brisa runs north up the shore road with two PSPD interceptors
  behind it, pedestrians mid-crossing, Sol's Garage, the HARBOR RUN banner,
  dialogue, minimap route and speedometer all on screen.
- `screenshots/2-onfoot.jpg` (183 KB) — Neon Mile at night: lit windows,
  glowing club signs, Rio facing the three NEON DEBT collectors outside
  Club Azahar, Palm-9 readied.
- `screenshots/3-chase.jpg` (195 KB) — Mercado District: the Tiburón GT at
  115 km/h with three interceptors converging, THE PALMSHADE JOB banner,
  4 stars, PSPD IN PURSUIT.
- `screenshots/4-docks.jpg` (194 KB) — Coral Docks in the morning: Rio on
  Pier 9 under the crane, the Brisa waiting at the pier head, the package
  marker on the docks office.

## Handoff proof

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

- `out/dossier.json`: **1,180,904 bytes** (cap 1,500,000).
- Two consecutive runs produce **byte-identical** output (same SHA-256).
