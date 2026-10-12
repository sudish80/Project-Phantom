# Project Phantom

A browser-based 3D tactical multiplayer FPS. You play rounds of attack and defend: plant or defuse a device, manage an economy, and use agent abilities. Players connect over your local Wi-Fi. There's nothing to install for players: everyone opens the host computer's address in a browser.

- **Three modes:** Tactical (rounds, buy phase, plant/defuse, side switch), Team Deathmatch (respawns, free loadouts, kill limit) and **Royale** (open world, loot, shrinking zone, last squad standing).
- **Three maps:** *Iron District* (industrial foundry), *Neon Harbor* (night-time port) and ***Frontier***, a 1.2 km open world. There's also a practice range, and Frontier can be explored offline.
- **Living environment on every map:** time of day (dawn, midday, golden hour, night, or a full day/night cycle), dynamic weather (clear, overcast, rain, storm with lightning, fog), wet reflective surfaces, window lights and streetlights at night, and bloom. The server syncs time and weather so everyone sees the same thing.
- **Realistic weapon presentation:**
  - **Finishes:** physically based phosphate steel, anodised aluminium, stippled polymer, varnished walnut and blued barrels. Finishes are procedural with no texture files, and edge wear appears where real guns get handled.
  - **Shapes:** parts have chamfered edges, and magazines are one continuous curved, ribbed piece.
  - **Hands:** gloved hands with wrapped fingers.
  - **Firing:** ejected brass and shotgun hulls, a star-shaped muzzle flash that lights the gun, and barrel smoke during sustained fire. Pistol slides lock back on empty.
  - **Sound:** gunshots are layered — supersonic crack, muzzle blast, low-frequency thump, action click, wall reflections and an outdoor tail. Distant shots arrive late at the speed of sound and sound duller.
- **Energy weapon skins:** animated emissive patterns, colour cycling, travelling energy pulses, floating sparks, glow trails, light cast on nearby surfaces, and glow that reacts to firing and reloading. Other players see your skin.
- **Four agents:** Vanguard, Specter, Bastion and Medic, each with server-validated abilities.
- **Nine weapons:** sidearms, SMG, two rifles, sniper, shotgun, heavy machine gun and a melee blade. Each has its own recoil pattern, spread, falloff and economy price.
- **Server-authoritative netcode:** clients send inputs only. The server simulates movement, firing, damage, economy, abilities and objectives. Clients use prediction, reconciliation, interpolation and lag compensation.

All models, textures, animations and sounds are generated procedurally at runtime and are original. The one exception is the announcer callouts (First Blood, Double/Triple/Quadra Kill, Ace, Headshot): short clips in `public/voice/`, rendered offline with the free espeak-ng speech engine by `python3 tools/gen-announcer.py` (needs `libespeak-ng1` and `ffmpeg`; set `VOICE=` to try another espeak voice). No external assets, accounts, API keys or internet access are needed once dependencies are installed.

---

## 1. Prerequisites

- **Node.js 20 or newer** (tested on Node 24) and npm.
- A desktop **Chrome, Edge or Firefox** with hardware acceleration enabled (WebGL).
- To play over Wi-Fi: all computers on the **same network**.

## 2. Install

```bash
npm install
```

## 3. Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development: game server (port 3000) plus Vite dev server (port 5173), with hot reload. Open http://localhost:5173 |
| `npm run dev:lan` | Same as above, with Vite also reachable from other devices on your network |
| `npm run build` | Production build of the client and the server bundle |
| `npm start` | Start the built game on **localhost only** (http://localhost:3000) |
| `npm run start:lan` | **Build**, then start the game server bound to all interfaces for LAN play |
| `npm run serve:lan` | Start the LAN server without rebuilding |
| `npm test` | Unit and integration tests (simulation, rooms, two Socket.IO clients) |
| `npm run test:e2e:royale` | Browser end-to-end test of a two-player Royale match on Frontier (prefers a GPU browser) |
| `npm run tour` | Captures screenshots of Frontier at different times and in different weather |
| `npm run test:e2e` | Browser end-to-end test with two real Chromium clients (needs a build and a Playwright Chromium; see §11) |
| `npm run typecheck` | TypeScript checks for shared, server and client |
| `npm run lint` | ESLint |

Use another port with `PORT=4000 npm run serve:lan` or `--port 4000`.

## 4. LAN host setup (quick start)

1. Connect both computers to the **same Wi-Fi**.
2. On **Computer A** (the host), run `npm install`, then `npm run start:lan`.
3. The terminal prints something like:
   ```
   Local:    http://localhost:3000
   LAN:      http://192.168.1.10:3000   ← share this with players on your Wi-Fi
   ```
   That LAN line is Computer A's private IPv4 address. To find it manually: `ipconfig` (Windows), `ipconfig getifaddr en0` (macOS) or `hostname -I` (Linux).
4. **Allow the port through the firewall** on a trusted private network (§5).
5. On Computer A, open the **LAN URL** (`http://192.168.1.10:3000`).
6. On **Computer B**, open **the same LAN URL**.
7. On Computer A, choose **Create Room**, pick a mode and map, then **Create**. A code like `PH7K2` appears.
8. Share the code, or click **Copy invite link** in the lobby (`http://192.168.1.10:3000/?room=PH7K2`).
9. On Computer B, choose **Join Room** and enter the code. Pick a team and agent, then click **Ready up**.
10. The host clicks **Start match**.

> **Don't use `localhost` on the other computer.** `localhost` (`127.0.0.1`) always means *the device you are typing on*. On Computer B, `http://localhost:3000` looks for a server on Computer B, not the host. Always use the host's LAN IP.

The browser can't scan the network for games, so joining works through the host address plus a room code. Public rooms on that server are listed under **Play**.

## 5. Firewall configuration

Allow **inbound TCP** on the game port (default **3000**), on **private/trusted networks only**:

- **Windows:** when Windows asks about Node.js, tick **Private networks**. Or, in an admin terminal:
  `netsh advfirewall firewall add rule name="Project Phantom" dir=in action=allow protocol=TCP localport=3000 profile=private`
  Also make sure your Wi-Fi network profile is set to **Private**, not Public.
- **macOS:** System Settings → Network → Firewall → Options → allow incoming connections for `node`.
- **Linux (ufw):** `sudo ufw allow 3000/tcp`

Some public or guest Wi-Fi networks (hotels, campuses) block device-to-device traffic ("client isolation"). Use a home router or a phone hotspot instead.

## 6. Controls

| Action | Default |
| --- | --- |
| Move | W A S D |
| Jump / Crouch | Space / Left Ctrl |
| Walk (silent) | Left Shift (can be switched to *Sprint* in Settings) |
| Fire / Aim (ADS, scope) | Left mouse / Right mouse |
| Reload | R |
| Weapon slots | 1 primary, 2 sidearm, 3 melee; mouse wheel cycles |
| Buy menu | B |
| Plant / defuse (hold) | E |
| Drop the device | G |
| Abilities | Q, C, F; Ultimate X |
| Scoreboard (hold) | Tab |
| Inspect weapon | Y |
| World map (Frontier): place markers by clicking | M |
| Toggle minimap | N |
| Pause / release mouse | Esc |

Every key can be rebound under **Settings → Controls**. Crouch and aim can be set to hold or toggle. Settings are saved in the browser's localStorage.

Tip: in Chromium, use **Settings → Graphics → Toggle fullscreen**. This also locks the keyboard, so Ctrl+W (crouch + forward) can't close the tab. During an online match the page also asks for confirmation before closing.

## 7. Game rules

**Tactical:** attackers (Team Alpha in the first half) carry the *phase device*. A random attacker receives it each round.

- **Buy phase:** 25 s. You can only buy inside your spawn; energy barriers block the exits.
- **Rounds:** 100 s each.
- **Planting:** hold **E** for 4 s inside site A or B while standing still. Moving cancels it.
- **Defusing:** hold **E** within 2 m for 7 s. Progress is kept at the 3.5 s halfway checkpoint.
- **Detonation:** 40 s after planting.
- **How rounds are won:** elimination, time running out (defenders win), detonation (attackers win), or defusal (defenders win).
- **Economy:** start with 800 credits. +3000 per win, +1900 per loss (rising by 500 per consecutive loss, up to 2900), +200 per kill, +300 to every attacker on a plant.
- **Keeping gear:** survivors keep their weapons. Refunds are allowed only during the buy phase, and only for items bought that round.
- **Halftime:** teams switch sides, and credits and loadouts reset.
- **Winning:** first to (rounds ÷ 2 + 1). A tie at the round limit is a draw.

**Team Deathmatch:** after 8 s of warmup, the match runs until the kill limit or the time limit. You respawn after 3 s with 2 s of spawn protection, at the spawn point farthest from enemies. Loadouts are free during the first 10 s after each spawn. Ultimate points also build over time.

**Ultimates** charge with kills, rounds and objective actions.

Footsteps are only audible when running. Walking and crouching are silent.

## 7b. Frontier and Royale

**Frontier** is generated from a fixed seed in about 0.3 s, identically on the server and in every browser. No world geometry is sent over the network. It's divided into regions:

| Region | Location |
| --- | --- |
| North-west | Pinecrest Woods: dense pine forest, plus Mirror Lake with the Lakeview cabins, a pier and a waterfall |
| North | Frostpeak: snow-capped ridged mountains with a radio mast on the summit, and a viewpoint at the end of a mountain road |
| North-east | Northgate Works: factories with mezzanines, warehouses, storage tanks, smokestacks with smoke, container stacks, a crane, a conveyor, pipelines, a substation and pylons |
| West | Ashford: a farming village with white houses and terracotta roofs, a barn and silo, hay bales, fenced fields, a well, a water tower, laundry lines and utility poles |
| Centre | Meridian City: a 6×6 street grid with glass skyscrapers (including the 120 m Meridian Spire), enterable apartments, shops and offices with stairs to the roof, a hospital, police and fire stations, a school, a hotel, a parking garage, a construction site, an abandoned block and a central park. Streets have lights, traffic signals, bus stops, benches, parked cars, dumpsters and rooftop tanks, AC units and antennas |
| East | Kestrel Airfield: a marked runway, hangars, a terminal, an enterable control tower, a rotating radar, a parked plane and a wreck |
| South-east | Fort Talon (walled base with guard towers, barracks, a vehicle depot and a half-buried bunker), Saltmarsh Harbor (piers, fishing huts, boats, a warehouse, a crane and a lighthouse with a sweeping beam) and Copper Bay beach (palms, umbrellas, rocks, a lifeguard tower and a seaside cafe) |
| South-west | Millbrook (a brick village with a community hall), Reedmarsh lake and Hollow Pines forest |

A river runs from Mirror Lake to the sea, with bridges where roads cross it. Highways, asphalt roads and dirt tracks connect every region. Terrain is carved and flattened for roads, settlements, lakes and the riverbed. Slopes are walkable up to about 52°; steeper rock behaves as a cliff and blocks movement.

How it's rendered:

- **Terrain:** chunked heightfield with 3 LOD levels. It blends grass, dry soil, rock (triplanar on cliffs), sand, snow, asphalt, paving and mud, and darkens when wet.
- **Water:** ocean, lakes and river with fresnel reflection, sun glints, depth tint and shoreline foam. A tint is applied when the camera goes underwater.
- **Vegetation:** instanced pine, broadleaf, palm, dead trees and saplings that sway in the wind, with impostors at distance. A GPU grass and wildflower field follows the camera and bends away from the player.
- **Props and lights:** instanced props. A pooled set of real lights is assigned to the nearest of about 300 lamps and interior lights.
- **Ambient life:** bird flocks, fireflies at night, falling leaves in forests and dust in sunlight.

**Royale** is played on Frontier:

- Squads drop at two distant locations.
- About 190 pickups are scattered through buildings and points of interest: weapons, armor, ammo and med kits. Press **E** to pick one up; weapons you replace are dropped.
- After a 20 s warmup the zone shrinks in five stages, and damage outside it rises from 2 to 20 per second.
- Dead players drop their gear. The last squad standing wins.

The HUD adds a compass (with your marker's bearing and distance), a clock, the weather, the zone timer, a north-up minimap and a full-screen world map (**M**). Team Deathmatch can also be played on Frontier; spawns are in the city.

## 8. Agents

| Agent | Role | Q | C | F | X (Ultimate) |
| --- | --- | --- | --- | --- | --- |
| **Vanguard** | Entry | Surge: 4 m dash, 2 charges | Veil Canister: 14 s smoke at your aim point | — | Overdrive: 8 s of +15% fire rate, +30% reload speed, +10% move speed; kills heal 30 |
| **Specter** | Recon | Seeker Node: destructible scanner, 5 pulses, reveals in line of sight within 14 m | Echo Sense: 6 s, reveals *running* enemies within 20 m | Phantom Decoy: running hologram, can be shot | Overwatch: 3 pulses reveal enemies within 35 m |
| **Bastion** | Sentinel | Bulwark Barrier: 6 m wall with 800 HP that blocks movement and bullets | Caltrop Field: 15 dmg/s plus 30% slow | Reinforce: +30 shield to nearby allies | Bastion Point: 350 HP sentry turret for 25 s |
| **Medic** | Support | Mend: heal 60 over 3 s (ally under crosshair, or yourself) | Aid Station: 12 HP/s area heal, destructible | Aegis: 40 shield for 8 s | Renewal: full heal plus 25% damage reduction in 25 m |

Every ability has charges, a cooldown or an ultimate cost, all validated on the server. Reveals expire. Smokes block vision but not bullets. Deployables can be destroyed. Walking counters Echo Sense.

## 9. Multiplayer architecture

```
apps/
  shared/   pure TypeScript, used by BOTH server and client
    src/sim/match.ts      authoritative match simulation (rounds, combat, economy, objective, entities)
    src/sim/abilities.ts  ability implementations + validation
    src/player-core.ts    deterministic per-input player step (movement + weapon state)
    src/movement.ts       character controller (AABB sweep, step-up, ground snap)
    src/collision.ts      static/dynamic AABB world with grid-accelerated raycasts
    src/weapons.ts / characters.ts / game-rules.ts / maps/*  data
    src/protocol.ts       typed Socket.IO events
  server/   Express + Socket.IO
    src/rooms/            room codes, membership, host, kick, reconnect grace, ready/start
    src/matches/          MatchRunner: fixed 30 Hz tick loop
    src/networking/       LAN address detection, rate limiting
  client/   Vite + React + Zustand + Three.js
    src/game/engine/      Game (prediction, reconciliation, interpolation), Input, connections
    src/game/rendering/   procedural textures, map renderer, sky
    src/game/player/      procedural character model + animation controller
    src/game/weapons/     procedural weapon models, first-person viewmodel
    src/game/effects/     particles, tracers, decals, lights
    src/game/abilities/   ability entity rendering
    src/game/audio/       WebAudio synthesiser, spatial audio, ambience, music
    src/screens, components, stores
```

- **Inputs, not state:** each client samples input at a fixed 60 Hz (`InputCmd`: axes, buttons, aim, slot, view tick) and sends batches. The server replays commands with the same `stepPlayerCore` function the client uses for prediction.
- **Anti speed-hack:** a per-player time budget means a client can't simulate faster than real time.
- **Simulation:** fixed **30 Hz** server tick. A full snapshot is broadcast every tick. Rendering runs at the browser's frame rate, independently.
- **Prediction and reconciliation:** the client applies its inputs immediately. When a snapshot arrives, it resets to the server state at the last acknowledged input and replays the pending ones. Small corrections are smoothed visually.
- **Interpolation:** remote players are drawn 3 ticks (about 100 ms) in the past, interpolated between snapshots.
- **Lag compensation:** each shot carries the tick the shooter was viewing. The server rewinds other players' hitboxes to that tick (up to 10 ticks) before tracing.
- **Server-side validation:** fire rate, ammunition, reload and equip state, weapon ownership, shot origin (the server uses its own eye position), and spread/recoil (server RNG plus a shared deterministic recoil pattern). Also checked: movement and jump timing (the server runs the movement itself), ability charges, cooldowns and ultimate points, purchases (phase, zone, credits, duplicates, refunds), and objective interactions (zone, stillness, team, distance).
- **Hardening:** malformed or oversized packets are rejected. Each socket has rate limits. Handlers are wrapped in error handling, so one bad client can't crash the server.
- **Rooms:** 5-character codes. Capacity and team-size checks. Duplicate names get a numeric suffix.
- **Reconnection:** a per-tab session token lets a refresh or brief disconnect reclaim the same seat (60 s grace), including mid-match. When the host leaves, hosting transfers. Empty rooms close. Late joiners enter the match in progress (in Tactical they spectate until the next round).
- **Practice range:** runs the same `Match` class **inside the browser** (`LocalConnection`), so it uses identical weapon, movement and hit-detection code.
- **Capacity:** 2–10 players by default, configurable up to 16 (`MAX_PLAYERS_LIMIT` in `shared/src/constants.ts`).

## 10. Extending the game

**Add a weapon**
1. Add an entry to `WEAPONS` in `apps/shared/src/weapons.ts`. Include damage, falloff, fire rate, magazine, recoil, spread, ADS, price, a `look` (procedural model proportions) and a `sound` (synth parameters). Add its id to the `WeaponId` union.
2. It then appears in the buy menu, is validated by the server, and gets a procedural model and sound automatically. For a custom model, branch on `w.category` or `id` in `client/src/game/weapons/WeaponModel.ts`, or load a GLB from `public/models/`.

**Add an agent**
1. Add the id to `CharacterId` in `shared/src/types.ts` and a definition in `shared/src/characters.ts`.
2. Implement each new ability id in `IMPLS` in `shared/src/sim/abilities.ts`. Give it an entity type (in `types.ts` + `EntityRenderer.ts`) if it places something in the world.
3. Add icons in `client/src/components/icons.ts` and silhouette tweaks in `CharacterModel.ts`.

**Add a map**
1. Create `shared/src/maps/<name>.ts` using `MapBuilder` (`box`, `wallX/Z`, `container`, `crate`, `stairs`, `platform`, `barrier`, decor).
2. Define spawns, buy zones, sites, TDM spawns and environment lighting.
3. Register it in `maps/index.ts` (`getMap`, `MAP_INFO`) and the `MapId` / `PlayableMapId` types.
4. `apps/shared/test/maps.test.ts` automatically checks that spawns and site centers are collision-free.

## 11. Testing

- `npm test` runs **41** Vitest tests (including a smoke test that starts the backend and serves the built frontend): movement and collision; fire-rate, magazine and malformed-input validation; the speed-hack budget; damage and headshots; kills and economy; purchase and refund rules; ability charges, cooldowns and ultimates; barrier collision; plant, defuse and detonation; full match flow with side switch and completion; TDM respawn and kill limit; map validity; **Frontier** generation, terrain walking and cliffs, bullets hitting terrain; **Royale** drops, loot pickup, zone shrinking and damage, elimination win and death drops; time/weather sync and the day cycle. It also runs Socket.IO integration tests: room creation, codes, the public list, invalid and full rooms, name de-duplication, team assignment, kick, host transfer, reconnect by token, ready/start permissions, and **two clients in one match** with movement sync and rejected warmup damage.
- `npm run test:e2e` builds nothing itself; run `npm run build` first. It launches the production server and two headless Chromium clients that:
  1. create and join a room with a code;
  2. ready up and start a TDM match;
  3. render the 3D scene and capture the pointer;
  4. move, fire (ammo is consumed), and open the scoreboard;
  5. leave, enter the practice range, buy a weapon and fire at targets.

  Screenshots are saved to a temp directory. It looks for a Playwright Chromium in `~/.cache/ms-playwright`, or uses `CHROMIUM_PATH`.

## 12. Troubleshooting

| Problem | Fix |
| --- | --- |
| Other computer can't open the page | Use the **LAN URL**, not `localhost`. Make sure you started with `npm run start:lan`. Check the firewall (§5) and that both devices are on the same network, with no guest or isolated Wi-Fi. |
| "Port 3000 is already in use" | Another program uses the port: `PORT=3001 npm run serve:lan` (everyone then uses `:3001`). |
| Lobby says the server is bound to localhost | You ran `npm start`. Use `npm run start:lan`. |
| "Room was not found" | Codes only exist on the server that created them, and while at least one player is in the room. Check you are on the same host URL. |
| Mouse isn't captured / can't shoot | Click the game ("CLICK TO PLAY"). After pressing Esc, Chrome briefly refuses to re-capture; click again. |
| WebGL error screen | Enable hardware acceleration in browser settings and check `chrome://gpu`. Try another browser. |
| Low FPS | Settings → Graphics: quality **Low**, shadows **Off**, render scale 70–80%. Close other GPU-heavy tabs. |
| No sound | Browsers start audio only after a click. Check the volumes under Settings → Audio. |
| Laggy or rubber-banding | Use 5 GHz Wi-Fi or Ethernet for the host. Enable *Show FPS / ping* in Settings → Gameplay. |
| Disconnected mid-match | Reload the page in the same tab: you rejoin the same seat within 60 s. |
| Ctrl+W closed the tab | Use fullscreen (it locks the keyboard in Chromium) or rebind crouch to C. |

## 13. Performance recommendations

Measured on an **Intel UHD Graphics 620** (integrated laptop GPU) with a 960×540 render window, using Brave's hardware WebGL:

| Scene | Low | Medium | High |
| --- | --- | --- | --- |
| Frontier (open world) | 60 fps | ~37 fps | ~32 fps |
| Practice range / arena maps | 60 fps | ~50 fps | — |

- **Open-world shadows** are the largest cost. They use a 110–160 m window that follows the player and refreshes every 2–3 frames. Trees cast shadows only nearby, and instanced props cast shadows only on High.
- **Grass, bloom, trees and water** each cost roughly 1–3 fps on that GPU.
- **On weak GPUs:** use Low quality (no shadows, grass, bloom or dynamic lights), or Medium with *Shadows: Off* and a render scale of 70–80%.
- **Arena maps:** geometry is merged per material, and per 160 m chunk on Frontier so frustum culling works. Skyline buildings, trees, props, caltrops and loot beams are instanced, and terrain uses LOD. Particles, tracers, decals and lights are pooled.
- **The host** also runs the simulation, which takes a few ms per tick.

## 14. Known limitations

These are honest notes about the current build:

- **Physics:** a custom deterministic AABB collision system is shared by server and client, instead of Rapier. It made exact client prediction possible. It means there are no slopes (ramps are stair-stepped) and no rotated colliders.
- **Assets:** characters, weapons and maps are built procedurally from primitives, and animations are procedural (no skeletal rigs or GLB files yet). The asset pipeline is ready for GLB replacements (see `public/README.md`). Character "portraits" are renders of the same models.
- **Abilities:** activation isn't client-predicted (it waits one round-trip), except that dash movement is reconciled.
- **Bullets** don't penetrate walls. Smokes block vision but not hitscan, by design.
- **Cheating:** the game resists trivial client-side cheating but is **not cheat-proof**. Snapshots include all players' positions, so a modified client could build a wallhack. Fine for a private LAN, but not for public servers.
- **Platforms:** no voice chat. Phones and tablets are supported with on-screen touch controls (see *Mobile* below); they were tested in Chromium's mobile emulation, not on physical devices, and gyro aiming in particular is untested on hardware. iOS Safari has no element fullscreen, so the browser bars stay visible there. Firefox works, but Chromium browsers are the primary target.
- **Persistence:** profile stats are stored per browser only. There are no accounts or persistent servers.
- **Matchmaking:** there is no overtime in Tactical; a tied final score is a draw. Starting a match doesn't require full or balanced teams; the host can start alone to explore a map.
- **Frontier and Royale gaps:**
  - The terrain is a heightfield, so there are no caves or overhangs.
  - There's no swimming: water is shallow enough to wade, and deeper lake centres only apply the underwater tint.
  - There are no vehicles.
  - Doors are open doorways and don't animate.
  - Only "important" buildings have interiors. Skyscrapers and some towers are solid.
- **Rendering techniques not implemented:**
  - occlusion culling
  - texture streaming (all textures are small and procedural)
  - baked lighting
  - ambient occlusion
  - volumetric light shafts or volumetric clouds (clouds are an animated sky shader)
  - weather-reactive grass and puddle ripples
- **Squads:** Royale uses the same two-team structure as the other modes (two squads), not free-for-all.
- **Energy skins:** the reactive glow, sparks, trails and cast light are drawn for your own first-person weapon. Other players see the animated emissive pattern on your third-person weapon, but without the light and trail effects.
- **Headless test browsers:** CPU-only WebGL (SwiftShader) is far too slow for Frontier. Use a GPU browser for the Royale and tour scripts.

## Mobile (phones & tablets)

Open the LAN address shown by the server (e.g. `http://192.168.1.8:3000`) in the phone's browser. Touch devices are detected automatically (Settings → Touch & HUD → Control scheme to force touch or mouse & keyboard).

- **Tap to play** enters fullscreen and locks landscape where the browser allows it; portrait shows a rotate prompt.
- **Left thumb:** floating move stick anywhere in the lower-left; push it fully forward to sprint (or use the sprint-lock button).
- **Right thumb:** drag anywhere to look; dragging from the fire button aims while shooting. Aim and crouch are toggles; crouch while sprinting slides.
- **Buttons:** fire (plus a left-side fire), aim, jump, crouch/slide, reload, abilities with live cooldowns, switch weapon, interact, buy, scoreboard, map (open world), inspect, menu. Peek, walk and drop are available but hidden by default.
- **Custom HUD:** Menu → *Edit HUD layout* (also on desktop). Drag any HUD panel or touch button; select it to change size and opacity or hide it; global HUD size and button opacity sliders; *Reset all*. Layouts are saved per browser.
- **Settings:** touch look / aim sensitivity, auto-sprint, fire-drag aim, optional gyroscope aiming, fullscreen on play.
- **Performance:** the first launch on a phone switches to Low quality, no shadows/bloom and 85% render scale.
