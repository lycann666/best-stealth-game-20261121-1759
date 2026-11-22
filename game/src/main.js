// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between six screens: title, play, paused,
// level done, game over and victory.
//
// ?seed=N fixes the level decoration. ?shot=start|play|hide|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, LIVES, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_CAUGHT,
  EVENT_EXIT_OPEN,
  EVENT_LEVEL_DONE,
  EVENT_OVER,
  EVENT_SHARD,
  EVENT_SPOTTED,
  EVENT_WIN,
  createWorld,
} from './world.js';
import {
  ACTION_CONFIRM,
  ACTION_LEVEL_1,
  ACTION_LEVEL_2,
  ACTION_LEVEL_3,
  ACTION_MUTE,
  ACTION_PAUSE,
  ACTION_RESTART,
  createInput,
} from './input.js';
import { createSound } from './sound.js';
import {
  SCREEN_LEVEL_DONE,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WIN,
  createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const sound = createSound();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, null);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let lastStepSoundAt = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function saveBestIfBeaten() {
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
  }

  function startRun(levelIndex) {
    world.resetRun();
    if (levelIndex > 0) {
      world.startLevel(levelIndex);
      world.state.status = 'play';
    }
    screen = SCREEN_PLAY;
    announce(`Playing ${world.state.level.name}. Gather every moonpetal, then reach the window unseen.`);
  }

  function handleEvents(events) {
    if (events & EVENT_SHARD) sound.pickup();
    if (events & EVENT_EXIT_OPEN) {
      sound.exitOpen();
      announce('The window is open — go!');
    }
    if (events & EVENT_SPOTTED) {
      sound.spotted();
      announce('A warden is suspicious!');
    }
    if (events & EVENT_CAUGHT) {
      sound.caught();
      if (world.state.lives <= 0) {
        screen = SCREEN_OVER;
        saveBestIfBeaten();
        announce(`Caught. Game over. Score ${world.state.score}. Best ${best}.`);
      } else {
        announce(`Spotted! ${world.state.lives} ${world.state.lives === 1 ? 'life' : 'lives'} left.`);
      }
    }
    if (events & EVENT_LEVEL_DONE) {
      screen = SCREEN_LEVEL_DONE;
      sound.levelDone();
      announce(`${world.state.level.name} cleared. Score ${world.state.score}.`);
    }
    if (events & EVENT_WIN) {
      screen = SCREEN_WIN;
      sound.levelDone();
      saveBestIfBeaten();
      announce(`You escaped the archive. Total score ${world.state.score}. Best ${best}.`);
    }
    if (events & EVENT_OVER) {
      screen = SCREEN_OVER;
      saveBestIfBeaten();
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.state.status = 'play';
      world.step(STEP, 0, 0, false, true, null);
      world.state.status = 'title';
      return;
    }
    const dir = input.direction();
    const target = dir.x === 0 && dir.y === 0 ? input.moveTarget() : null;
    const events = world.step(STEP, dir.x, dir.y, input.sprinting(), false, target);
    if (world.state.player.moving && world.state.distanceMoved - lastStepSoundAt > 30) {
      lastStepSoundAt = world.state.distanceMoved;
      sound.step(input.sprinting());
    }
    handleEvents(events);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = sound.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_RESTART && screen === SCREEN_PLAY) {
      world.startLevel(world.state.levelIndex);
      world.state.status = 'play';
      input.clearMoveTarget();
      announce('Level restarted.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_LEVEL_1) startRun(0);
      else if (actions & ACTION_LEVEL_2) startRun(1);
      else if (actions & ACTION_LEVEL_3) startRun(2);
      else if (actions & ACTION_CONFIRM) startRun(0);
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (screen === SCREEN_LEVEL_DONE) {
      if (actions & ACTION_CONFIRM) {
        world.nextLevel();
        screen = SCREEN_PLAY;
        announce(`Playing ${world.state.level.name}.`);
      }
    } else if (screen === SCREEN_OVER || screen === SCREEN_WIN) {
      if (actions & ACTION_CONFIRM) {
        world.toTitle();
        screen = SCREEN_TITLE;
        announce('Shadowmoth. Press Space or click to start.');
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, screen === SCREEN_PLAY ? input.moveTarget() : null);
  }

  // Leaving the tab pauses a running game rather than letting wardens patrol unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  canvas.addEventListener('pointerdown', () => sound.unlock());

  // A tiny hook for play-testing: the live state, read-only.
  window.__shadowmoth = {
    get screen() {
      return screen;
    },
    get state() {
      const s = world.state;
      return {
        status: s.status,
        level: s.levelIndex + 1,
        score: s.score,
        lives: s.lives,
        shardsTaken: s.shards.filter((shard) => shard.taken).length,
        exitOpen: s.exit.open,
        maxAlert: s.maxAlert,
        player: { x: Math.round(s.player.x), y: Math.round(s.player.y) },
        guards: s.guards.map((g) => ({ x: Math.round(g.x), y: Math.round(g.y), alert: +g.alert.toFixed(2), mode: g.mode })),
      };
    },
  };

  announce('Shadowmoth. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
