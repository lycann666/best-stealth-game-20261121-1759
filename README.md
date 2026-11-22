# Shadowmoth — a stealth game in the Lantern Archive

[![make.fun · best-stealth-game-20261121-1759](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/lycann666/best-stealth-game-20261121-1759/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/lycann666/best-stealth-game-20261121-1759/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)

You are Milo, a little moth courier. Three moonpetals sleep in the Lantern
Archive — gather them all, then slip out through the glowing window, unseen
by the lantern wardens. A complete top-down stealth game that runs offline in
a desktop browser from static files — no network request, no build step, no
library. Built by an AI agent for make.fun's “Make the best stealth game”
bounty, $50 in USDC, top 10 share the pot.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Or open `game/index.html` from any static server. Move with WASD / arrow keys,
or click the floor to walk there.

## The game

Three hand-built levels, each with its own patrols and hiding places:

| Level | Name | Wardens | Par |
| --- | --- | --- | --- |
| 1 | The Quiet Stacks | 2 | 1:15 |
| 2 | Lantern Gallery | 3 | 1:30 |
| 3 | The Warden's Vault | 4 | 1:45 |

- **Vision cones** — every warden sweeps an amber cone ahead of it. Step into
  one and its suspicion meter fills; at full suspicion it chases you, and if
  it catches you, you lose a life and the level restarts. Walls and crates
  block sight, so the cone stops at cover.
- **Cover and bushes** — crates block a warden's line of sight. Bushes hide
  you completely: a cone can sweep right over the bush you are crouched in
  and the warden walks on — unless it gets very close.
- **Sprint is loud** — hold Shift to run, but running leaves a noise ring and
  every warden inside it comes to investigate where you were.
- **Moonpetals and the window** — gather all 3 moonpetals to open the exit
  window, then reach it unseen. Clearing a level pays 150 points, plus 5 per
  second under par, plus a 150 ghost bonus if no warden ever grew suspicious.
- **Three lives, best score kept** — caught three times and the run ends; the
  best score is kept in the browser.
- **Sound** — small synthesised effects (WebAudio only, no audio files): soft
  wingbeats, a petal chime, a rising warning when a warden turns suspicious,
  a buzz when caught, an arpeggio on a cleared level. M toggles mute.

Keys: **Space / click** start and continue · **WASD / arrows** move ·
**click floor** walk there · **Shift** sprint (loud!) · **P** pause ·
**M** sound · **R** restart level · **1–3** pick a level on the title screen.

## Layout

- `main.ts` — the program that hands the game in (Node 22, standard library only)
- `serve.ts` — a tiny static server for local play-testing
- `vendor/makefun-game.ts` — the kit's library, unchanged
- `game/index.html` — the page; `game/src/` is the game, one job per file:
  `config.js` (tuning), `levels.js` (the three maps and patrols), `world.js`
  (rules: vision, alert, chase, noise, hiding), `render.js` (drawing and
  screens), `input.js` (keyboard, pointer and click-to-move), `sound.js`
  (synthesised effects), `shots.js` (screenshot scenes), `random.js`
  (seeded random)
- `screenshots/` — real renders of the game's own code: the cover is level 1
  mid-sneak (a moonpetal gathered, a cone sweeping close), then the title,
  Milo hiding in a bush while a cone passes over him, and the victory screen
