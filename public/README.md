# Static assets

Everything in this folder is served as-is by Vite (dev) and the game server (production).

The current build generates **all** visual and audio assets procedurally at runtime
(`apps/client/src/game/rendering/textures.ts`, `game/player/CharacterModel.ts`,
`game/weapons/WeaponModel.ts`, `game/audio/AudioEngine.ts`), so no binary files are required.

To replace a placeholder with an authored asset:

- `models/` — drop GLB files here (e.g. `models/weapons/corsair.glb`) and load them with
  `GLTFLoader` in `WeaponModel.ts` / `CharacterModel.ts`. Keep the same pivot conventions
  (weapon: barrel along -Z, grip at origin; character: feet at origin, facing -Z).
- `textures/` — PBR texture sets per surface material (`concrete_albedo.jpg`, …). Swap them in
  `textures.ts` → `makeSurfaceMaterial`.
- `audio/` — OGG/MP3 files. `AudioEngine.play()` checks a sample registry before falling back
  to synthesis, so dropping in `audio/<sound-name>.ogg` and registering it is enough.
- `fonts/` — optional webfonts referenced from `styles/global.css`.
