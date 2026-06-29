---
name: testing-m1-combat
description: Test the gecao (明朝割草) Phaser combat build end-to-end in the browser. Use when verifying M1+ combat UI/gameplay changes (sprites, auto-attack, contact damage, camera, game-over/restart).
---

# Testing gecao combat (M1+)

A Phaser 3 + TypeScript + Vite top-down survivor game. Combat logic lives in the headless
`Simulation` (`src/game/simulation.ts`); only `src/scenes/GameScene.ts` couples to Phaser.

## Build & run the preview locally

```bash
cd ~/repos/gecao
corepack prepare pnpm@9.15.1 --activate   # see Gotchas if corepack errors
pnpm install
pnpm build                                 # outputs dist/
pnpm preview                               # serves dist at http://localhost:4173
# dev server (HMR) is http://localhost:5180 via `pnpm dev`
```

Always test the **preview build** (`dist` at :4173) when verifying asset/sprite fixes, since
that's what gets deployed. Hard-reload (Ctrl+Shift+R) after a rebuild.

## Core test flow (T1–T5)

1. **Transparent sprites** — zoom into the player; expect a clean character on the watertown
   tiles with NO white/grey box around it. White haze = the old premultiplied-alpha bug.
2. **Auto-attack + kills** — the 戚家刀 fan-sweep auto-targets nearest 倭寇; HUD "击杀" climbs
   from 0. Standing still is enough; enemies spawn in a ring and close in.
3. **Contact damage + game-over** — let 倭寇 touch you; the red HP bar (top-left) drains to 0
   and the "阵亡 / 按 R 重新开始" overlay appears. (Camera shake on hit is only visible in video.)
4. **Camera follow** — hold a direction; ground scrolls, player stays in the centered deadzone.
5. **Restart on R** — with the overlay up, click the canvas then press R: HP refills, 击杀→0,
   timer resets, overlay clears.

## Gotchas / lessons learned

- **Canvas keyboard focus**: click on the game canvas before sending keys. WASD movement and the
  R restart only work when the canvas has focus.
- **Restart key implementation matters**: `Phaser.Input.Keyboard.JustDown(addKey('R'))` polling
  proved unreliable for restart and may silently fail; prefer `keyboard.on('keydown-R', ...)`.
  If physical R doesn't restart, check this first rather than assuming a focus issue.
- **You will die fast (~15–60s)** when standing among enemies — convenient for testing T3/T5.
- **corepack signature error** (`Cannot find matching keyid`) can appear after an env restart with
  an old corepack. Fix: `npm install -g corepack@latest` then
  `corepack prepare pnpm@9.15.1 --activate`. (Version may already be fine in future snapshots.)
- **Deploy**: `dist/` is a static build; deploy via the frontend deploy tool. Public URL example:
  https://dist-srtzbzru.devinapps.com

## Devin Secrets Needed

None — fully local build + browser testing; deploy uses built-in tooling.
