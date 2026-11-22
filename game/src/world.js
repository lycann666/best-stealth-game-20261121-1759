// The game's rules and state, with no drawing and no browser in it: Milo the moth,
// the patrolling wardens and their vision cones, moonpetals, the exit, alert and
// chase, sprint noise, bushes to hide in, score, lives and levels. step() advances
// one fixed step and returns what happened as bit flags, so the caller can react
// without the world knowing about screens or sound. Nothing here allocates after
// createWorld returns, except the small arrays a level build makes once.
import {
  CAUGHT_PENALTY,
  COLS,
  FIELD,
  GHOST_BONUS,
  GUARD,
  LEVEL_CLEAR_POINTS,
  LIVES,
  PLAYER,
  ROWS,
  SHARD_POINTS,
  TILE,
} from './config.js';
import { LEVELS as LEVEL_DEFS } from './levels.js';

export const EVENT_SHARD = 1;
export const EVENT_CAUGHT = 2;
export const EVENT_LEVEL_DONE = 4;
export const EVENT_OVER = 8;
export const EVENT_WIN = 16;
export const EVENT_SPOTTED = 32;
export const EVENT_EXIT_OPEN = 64;

const SOLID = new Set(['#', 'C']);
const TWO_PI = Math.PI * 2;

function tileAt(level, col, row) {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return '#';
  return level.map[row][col];
}

function isSolidTile(level, col, row) {
  return SOLID.has(tileAt(level, col, row));
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TWO_PI;
  while (d < -Math.PI) d += TWO_PI;
  return d;
}

function turnToward(angle, target, maxTurn) {
  const d = angleDiff(target, angle);
  if (Math.abs(d) <= maxTurn) return target;
  return angle + Math.sign(d) * maxTurn;
}

export function createWorld(random) {
  const state = {
    levelIndex: 0,
    level: LEVEL_DEFS[0],
    player: { x: 0, y: 0, radius: PLAYER.radius, moving: false, sprinting: false, face: 0, flap: 0 },
    guards: [],
    shards: [],
    exit: { x: 0, y: 0, size: TILE, open: false },
    decor: [],
    score: 0,
    levelScore: 0,
    levelScores: [],
    lives: LIVES,
    elapsed: 0,
    totalElapsed: 0,
    /** Animation clock, in seconds: advanced by step() only, so a staged scene
        always paints the same frame for the same seed. */
    time: 0,
    spotted: false,
    maxAlert: 0,
    caughtFlash: 0,
    noise: null,
    levelBonus: 0,
    ghost: false,
    status: 'title',
    distanceMoved: 0,
  };

  function tileCentre(col, row) {
    return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
  }

  /** Floor speckles for the renderer, fixed per level and seed. */
  function buildDecor() {
    state.decor.length = 0;
    for (let i = 0; i < 90; i += 1) {
      state.decor.push({
        x: random() * FIELD.width,
        y: random() * FIELD.height,
        r: 1 + random() * 2.2,
        shade: random(),
      });
    }
  }

  function startLevel(index) {
    const level = LEVEL_DEFS[index];
    state.levelIndex = index;
    state.level = level;
    state.elapsed = 0;
    state.levelScore = 0;
    state.spotted = false;
    state.maxAlert = 0;
    state.caughtFlash = 0;
    state.noise = null;
    state.levelBonus = 0;
    state.ghost = false;
    state.exit.open = false;
    state.shards.length = 0;
    state.guards.length = 0;
    buildDecor();
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const tile = level.map[row][col];
        const at = tileCentre(col, row);
        if (tile === 'S') {
          state.player.x = at.x;
          state.player.y = at.y;
          state.player.face = 0;
        } else if (tile === 'E') {
          state.exit.x = col * TILE;
          state.exit.y = row * TILE;
        } else if (tile === '*') {
          state.shards.push({ x: at.x, y: at.y, taken: false, bob: random() * TWO_PI });
        }
      }
    }
    for (const patrol of level.patrols) {
      const start = tileCentre(patrol[0][0], patrol[0][1]);
      const points = patrol.map(([c, r]) => tileCentre(c, r));
      state.guards.push({
        x: start.x,
        y: start.y,
        dir: 0,
        waypoints: points,
        wpIndex: 1,
        wait: 0,
        mode: 'patrol',
        target: null,
        lookTimer: 0,
        scanPhase: random() * TWO_PI,
        alert: 0,
        lastSeen: { x: start.x, y: start.y },
        speed: GUARD.patrolSpeed,
      });
    }
    // Face the first guard down its patrol line so its cone reads at once.
    for (const guard of state.guards) {
      const next = guard.waypoints[guard.wpIndex % guard.waypoints.length];
      guard.dir = Math.atan2(next.y - guard.y, next.x - guard.x);
    }
  }

  function resetRun() {
    state.score = 0;
    state.levelScores = [];
    state.lives = LIVES;
    state.totalElapsed = 0;
    startLevel(0);
    state.status = 'play';
  }

  function toTitle() {
    startLevel(0);
    state.status = 'title';
  }

  /** Is the point inside a solid tile (wall or crate)? */
  function solidAt(x, y) {
    return isSolidTile(state.level, Math.floor(x / TILE), Math.floor(y / TILE));
  }

  /** Can a circle of the player's radius stand at (x, y)? */
  function canStand(x, y) {
    const r = PLAYER.radius - 1;
    return (
      !solidAt(x - r, y - r) &&
      !solidAt(x + r, y - r) &&
      !solidAt(x - r, y + r) &&
      !solidAt(x + r, y + r)
    );
  }

  function isBush(x, y) {
    return tileAt(state.level, Math.floor(x / TILE), Math.floor(y / TILE)) === 'B';
  }

  /** Line of sight: true when no wall or crate stands between the two points. */
  function hasLineOfSight(x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / 6));
    for (let i = 1; i < steps; i += 1) {
      if (solidAt(x0 + (dx * i) / steps, y0 + (dy * i) / steps)) return false;
    }
    return true;
  }

  /**
   * Whether `guard` can see the point (x, y): inside the cone's range and angle,
   * with a clear line of sight — unless the point is inside a bush and the guard
   * is not right on top of it. A guard that is actively chasing (it knows roughly
   * where you went) only spots a hidden player it nearly steps on: diving into a
   * bush breaks a chase, as a bush should.
   */
  function canSee(guard, x, y) {
    const dx = x - guard.x;
    const dy = y - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist > GUARD.viewRange) return false;
    if (dist > 4 && Math.abs(angleDiff(Math.atan2(dy, dx), guard.dir)) > GUARD.halfAngle) return false;
    const spotRange = guard.alert >= GUARD.chaseAlert ? 30 : GUARD.bushSpotRange;
    if (isBush(x, y) && dist > spotRange) return false;
    return hasLineOfSight(guard.x, guard.y, x, y);
  }

  function moveCircle(body, dx, dy) {
    const nx = body.x + dx;
    if (canStand(nx, body.y)) body.x = nx;
    const ny = body.y + dy;
    if (canStand(body.x, ny)) body.y = ny;
  }

  function guardStep(guard, dt, harmless) {
    if (guard.wait > 0) {
      guard.wait -= dt;
      // Scan the room while waiting: slow sweep left and right.
      guard.dir += Math.sin((guard.scanPhase += dt * 1.4)) * 0.35 * dt;
      return;
    }
    // Looking around after losing the trail: stand at the search spot and
    // sweep the lantern, rather than wandering off mid-search.
    if (guard.mode === 'look') {
      guard.lookTimer -= dt;
      guard.dir += dt * 2.2;
      if (guard.lookTimer <= 0) {
        guard.mode = 'patrol';
        guard.alert = Math.min(guard.alert, 0.2);
      }
      return;
    }
    let speed = GUARD.patrolSpeed;
    let dest = null;
    if (guard.mode === 'chase' || guard.mode === 'investigate') {
      speed = guard.mode === 'chase' ? GUARD.chaseSpeed : GUARD.investigateSpeed;
      dest = guard.target;
    } else {
      dest = guard.waypoints[guard.wpIndex % guard.waypoints.length];
    }
    const dx = dest.x - guard.x;
    const dy = dest.y - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) {
      if (guard.mode === 'patrol') {
        guard.wpIndex = (guard.wpIndex + 1) % guard.waypoints.length;
        guard.wait = GUARD.waitAtWaypoint;
      } else {
        guard.mode = 'look';
        guard.lookTimer = GUARD.lookAround;
      }
      return;
    }
    const want = Math.atan2(dy, dx);
    guard.dir = turnToward(guard.dir, want, 5 * dt);
    const step = Math.min(dist, speed * dt);
    // Wardens walk the same solid world Milo does: walls and crates stop them,
    // so breaking line of sight around a corner really loses them.
    moveCircle(guard, Math.cos(guard.dir) * step, Math.sin(guard.dir) * step);
    void harmless;
  }

  /**
   * One fixed step. `mx, my` is the wanted move direction (-1..1 each, already
   * normalised by the caller when diagonal). With `harmless` set (the title
   * screen's backdrop) the wardens patrol but nobody is ever seen or caught.
   * `moveTarget` is a click-to-move point, used only when no keys are held.
   */
  function step(dt, mx, my, sprint, harmless, moveTarget) {
    let events = 0;
    if (state.status !== 'play') return events;
    state.elapsed += dt;
    state.totalElapsed += dt;
    state.time += dt;
    if (state.caughtFlash > 0) state.caughtFlash = Math.max(0, state.caughtFlash - dt * 2);

    const player = state.player;
    let dirX = mx;
    let dirY = my;
    if (dirX === 0 && dirY === 0 && moveTarget) {
      const dx = moveTarget.x - player.x;
      const dy = moveTarget.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 10) {
        dirX = dx / dist;
        dirY = dy / dist;
      }
    }
    const len = Math.hypot(dirX, dirY);
    if (len > 1) {
      dirX /= len;
      dirY /= len;
    }
    const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    const ox = player.x;
    const oy = player.y;
    moveCircle(player, dirX * speed * dt, dirY * speed * dt);
    const moved = Math.hypot(player.x - ox, player.y - oy);
    state.distanceMoved += moved;
    player.moving = moved > 0.01;
    player.sprinting = sprint && player.moving;
    if (player.moving) {
      player.face = Math.atan2(player.y - oy || dirY, player.x - ox || dirX);
      player.flap += dt * (sprint ? 16 : 10);
    }

    // Sprinting is loud: a fresh noise ring, and every warden inside it comes over.
    if (player.sprinting) {
      state.noise = { x: player.x, y: player.y, r: PLAYER.noiseRadius, t: 0 };
      for (const guard of state.guards) {
        if (Math.hypot(guard.x - player.x, guard.y - player.y) < PLAYER.noiseRadius) {
          if (guard.mode !== 'chase') {
            guard.mode = 'investigate';
            guard.target = { x: player.x, y: player.y };
            guard.alert = Math.max(guard.alert, 0.35);
          }
        }
      }
    }
    if (state.noise) {
      state.noise.t += dt;
      if (state.noise.t > 0.6) state.noise = null;
    }

    // Moonpetals.
    for (const shard of state.shards) {
      shard.bob += dt * 2;
      if (!shard.taken && Math.hypot(shard.x - player.x, shard.y - player.y) < 32) {
        shard.taken = true;
        state.score += SHARD_POINTS;
        state.levelScore += SHARD_POINTS;
        events |= EVENT_SHARD;
      }
    }
    if (!state.exit.open && state.shards.every((s) => s.taken)) {
      state.exit.open = true;
      events |= EVENT_EXIT_OPEN;
    }

    // The wardens see, chase, and catch.
    let maxAlert = 0;
    for (const guard of state.guards) {
      const seen = !harmless && canSee(guard, player.x, player.y);
      if (seen) {
        const near = Math.hypot(guard.x - player.x, guard.y - player.y) < 130;
        const before = guard.alert;
        guard.alert = Math.min(1, guard.alert + dt * (near ? 1.2 : 0.75));
        guard.lastSeen.x = player.x;
        guard.lastSeen.y = player.y;
        if (before < GUARD.chaseAlert && guard.alert >= GUARD.chaseAlert) {
          state.spotted = true;
          events |= EVENT_SPOTTED;
        }
        if (guard.alert >= GUARD.chaseAlert && guard.mode !== 'chase') {
          guard.mode = 'chase';
          guard.target = guard.lastSeen;
        }
        if (guard.mode === 'chase') guard.target = guard.lastSeen;
      } else {
        guard.alert = Math.max(0, guard.alert - dt * 0.6);
        if (guard.mode === 'chase') {
          if (guard.alert < 0.25) guard.mode = 'patrol';
          else guard.target = guard.lastSeen;
        }
      }
      if (guard.alert >= 1) {
        events |= EVENT_CAUGHT;
      }
      if (guard.alert > maxAlert) maxAlert = guard.alert;
      guardStep(guard, dt, harmless);
    }
    state.maxAlert = maxAlert;

    if (events & EVENT_CAUGHT) {
      state.lives -= 1;
      state.score = Math.max(0, state.score - CAUGHT_PENALTY);
      state.caughtFlash = 1;
      if (state.lives <= 0) {
        state.status = 'over';
        events |= EVENT_OVER;
      } else {
        startLevel(state.levelIndex);
      }
      return events;
    }

    // The exit, once open.
    if (
      state.exit.open &&
      player.x > state.exit.x &&
      player.x < state.exit.x + TILE &&
      player.y > state.exit.y &&
      player.y < state.exit.y + TILE
    ) {
      const par = state.level.par;
      const timeBonus = Math.max(0, Math.round(par - state.elapsed)) * 5;
      state.ghost = !state.spotted;
      state.levelBonus = LEVEL_CLEAR_POINTS + timeBonus + (state.ghost ? GHOST_BONUS : 0);
      state.score += state.levelBonus;
      state.levelScore += state.levelBonus;
      state.levelScores[state.levelIndex] = state.levelScore;
      if (state.levelIndex + 1 >= LEVEL_DEFS.length) {
        state.status = 'win';
        events |= EVENT_WIN;
      } else {
        state.status = 'leveldone';
        events |= EVENT_LEVEL_DONE;
      }
      return events;
    }
    return events;
  }

  /** Next level after a cleared one. */
  function nextLevel() {
    startLevel(state.levelIndex + 1);
    state.status = 'play';
  }

  /** Stage a finished run for the victory screenshot: real state, real screen. */
  function stageVictory() {
    startLevel(2);
    for (const shard of state.shards) shard.taken = true;
    state.exit.open = true;
    state.score = 1870;
    state.levelScores = [620, 590, 660];
    state.levelScore = 660;
    state.levelBonus = 410;
    state.ghost = true;
    state.lives = 3;
    state.elapsed = 62;
    state.totalElapsed = 214;
    state.status = 'win';
  }

  startLevel(0);
  return {
    state,
    startLevel,
    resetRun,
    toTitle,
    nextLevel,
    stageVictory,
    step,
    canSee,
    canStand,
    isBush,
    solidAt,
  };
}
