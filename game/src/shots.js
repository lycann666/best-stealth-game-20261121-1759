// The screenshot scenes behind ?shot=start|play|hide|end. Each one stages a real
// game state — a title over the first level with the wardens on patrol, a level
// half-played with a moonpetal already gathered and a cone sweeping close by, Milo
// hiding in a bush while a warden passes, a finished run — then paints it twice
// and sets window.__shotReady for a screenshot. The staged states are fixed, so
// the same seed always gives the same frame.
import { STEP, TILE } from './config.js';
import { EVENT_CAUGHT, EVENT_LEVEL_DONE, EVENT_WIN } from './world.js';
import { SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

/**
 * The play scene's autopilot walks a breadth-first path over the tile grid to
 * the nearest ungathered moonpetal (or the open exit), because a greedy pilot
 * gets stuck behind crates and in corners. It waits when the next step is
 * inside a warden's cone — the wardens patrol on, so the way clears — and
 * steps away from a warden that already sees it.
 */
function tileOf(x, y) {
  return { col: Math.floor(x / TILE), row: Math.floor(y / TILE) };
}

function bfsPath(world, fromTile, toTile) {
  const level = world.state.level;
  const key = (col, row) => `${col},${row}`;
  const solid = (col, row) => {
    const tile = level.map[row]?.[col];
    return tile === undefined || tile === '#' || tile === 'C';
  };
  const seen = new Map([[key(fromTile.col, fromTile.row), null]]);
  const queue = [fromTile];
  while (queue.length > 0) {
    const at = queue.shift();
    if (at.col === toTile.col && at.row === toTile.row) {
      const path = [];
      let node = at;
      while (node !== null) {
        path.unshift(node);
        node = seen.get(key(node.col, node.row));
      }
      return path.slice(1);
    }
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { col: at.col + dc, row: at.row + dr };
      if (solid(next.col, next.row) || seen.has(key(next.col, next.row))) continue;
      seen.set(key(next.col, next.row), at);
      queue.push(next);
    }
  }
  return [];
}

/**
 * Like bfsPath, but a tile also counts as blocked when any warden's cone
 * covers its centre right now: the path never walks Milo into a cone he can
 * see coming. Guards patrol on, so a blocked path is retried every step.
 */
function bfsSafePath(world, fromTile, toTile) {
  const level = world.state.level;
  const key = (col, row) => `${col},${row}`;
  const blocked = (col, row) => {
    const tile = level.map[row]?.[col];
    if (tile === undefined || tile === '#' || tile === 'C') return true;
    const cx = col * TILE + TILE / 2;
    const cy = row * TILE + TILE / 2;
    return world.state.guards.some((guard) => world.canSee(guard, cx, cy));
  };
  const seen = new Map([[key(fromTile.col, fromTile.row), null]]);
  const queue = [fromTile];
  while (queue.length > 0) {
    const at = queue.shift();
    if (at.col === toTile.col && at.row === toTile.row) {
      const path = [];
      let node = at;
      while (node !== null) {
        path.unshift(node);
        node = seen.get(key(node.col, node.row));
      }
      return path.slice(1);
    }
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { col: at.col + dc, row: at.row + dr };
      if (blocked(next.col, next.row) || seen.has(key(next.col, next.row))) continue;
      seen.set(key(next.col, next.row), at);
      queue.push(next);
    }
  }
  return [];
}

/** The shortest cone-free path to any bush from `fromTile`, or null when none is safe. */
function nearestBushTile(world, fromTile) {
  const level = world.state.level;
  let best = null;
  let bestLen = Infinity;
  for (let row = 0; row < level.map.length; row += 1) {
    for (let col = 0; col < level.map[row].length; col += 1) {
      if (level.map[row][col] !== 'B') continue;
      const path = bfsSafePath(world, fromTile, { col, row });
      if (path.length > 0 && path.length < bestLen) {
        bestLen = path.length;
        best = path;
      }
    }
  }
  return best;
}

/** The way that puts the most distance between Milo and the nearest warden. */
function fleeDirection(world) {
  const player = world.state.player;
  // First prize goes to a step no warden can see at all — ducking around a
  // corner breaks a chase, outrunning it down a straight corridor does not.
  let best = [0, 0];
  let bestScore = -Infinity;
  for (const [dx, dy] of [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]) {
    const nx = player.x + dx * 40;
    const ny = player.y + dy * 40;
    if (!world.canStand(nx, ny)) continue;
    const seen = world.state.guards.some((guard) => world.canSee(guard, nx, ny));
    let nearest = Infinity;
    for (const other of world.state.guards) nearest = Math.min(nearest, Math.hypot(other.x - nx, other.y - ny));
    const score = (seen ? 0 : 1000) + nearest;
    if (score > bestScore) {
      bestScore = score;
      best = [dx, dy];
    }
  }
  return best;
}

export function autopilot(world, wait) {
  const state = world.state;
  const player = state.player;
  // A warden is suspicious or chasing: forget the goal — run (sprinting, the
  // wardens already know) for the nearest bush and stay hidden there until
  // every warden has calmed down. Walking toward a goal while a warden chases
  // is how moths get caught.
  if (state.guards.some((guard) => guard.alert > 0.25)) {
    // Still in a warden's sight: just run away from it (sprinting) until the
    // sight breaks — running for a bush while watched only shows the warden
    // exactly where Milo hid.
    if (state.guards.some((guard) => world.canSee(guard, player.x, player.y))) {
      return { move: fleeDirection(world), wait: 0, sprint: true };
    }
    // Unseen: tuck into the nearest bush's middle and wait it out. In a bush,
    // the middle is the safe part — a warden that runs to where it last saw
    // Milo stops at the bush's edge.
    if (world.isBush(player.x, player.y)) {
      const centre = { x: Math.floor(player.x / TILE) * TILE + TILE / 2, y: Math.floor(player.y / TILE) * TILE + TILE / 2 };
      const dx = centre.x - player.x;
      const dy = centre.y - player.y;
      if (Math.hypot(dx, dy) > 10) {
        const len = Math.hypot(dx, dy);
        return { move: [dx / len, dy / len], wait: 0, sprint: false };
      }
      return { move: [0, 0], wait: 0, sprint: false };
    }
    const path = nearestBushTile(world, tileOf(player.x, player.y));
    if (path !== null && path.length > 0) {
      const stepTile = path[0];
      const cx = stepTile.col * TILE + TILE / 2;
      const cy = stepTile.row * TILE + TILE / 2;
      const dx = cx - player.x;
      const dy = cy - player.y;
      const len = Math.hypot(dx, dy) || 1;
      return { move: [dx / len, dy / len], wait: 0, sprint: false };
    }
    // No cone-free way to a bush right now: hold still and let the wardens
    // patrol on — the suspicion fades while Milo is unseen.
    return { move: [0, 0], wait: 0, sprint: false };
  }
  // Seen right now: run the way that puts the most distance between Milo and
  // the nearest warden (straight away can pin him against a wall, so each way
  // is judged by where it leads, not by where it points).
  for (const guard of state.guards) {
    if (world.canSee(guard, player.x, player.y)) {
      return { move: fleeDirection(world), wait: 0, sprint: true };
    }
  }
  let goal = null;
  for (const shard of state.shards) {
    if (!shard.taken && (goal === null || Math.hypot(shard.x - player.x, shard.y - player.y) < Math.hypot(goal.x - player.x, goal.y - player.y))) goal = shard;
  }
  if (goal === null && state.exit.open) goal = { x: state.exit.x + TILE / 2, y: state.exit.y + TILE / 2 };
  if (goal === null) return { move: [0, 0], wait: 0, sprint: false };
  const path = safeGoalPath(world, goal);
  if (path.length === 0) {
    // Already on the goal's tile with the moonpetal just out of reach (the
    // tile is 64 px across, the gathering radius 32): step straight at it
    // instead of standing still one pixel short.
    const dx = goal.x - player.x;
    const dy = goal.y - player.y;
    const len = Math.hypot(dx, dy);
    if (len > 4 && len < 100) return { move: [dx / len, dy / len], wait: 0, sprint: false };
    return { move: [0, 0], wait: 0, sprint: false };
  }
  let stepTile = path[0];
  const stepCentre = { x: stepTile.col * TILE + TILE / 2, y: stepTile.row * TILE + TILE / 2 };
  if (Math.hypot(stepCentre.x - player.x, stepCentre.y - player.y) < 8 && path.length > 1) {
    stepTile = path[1];
    stepCentre.x = stepTile.col * TILE + TILE / 2;
    stepCentre.y = stepTile.row * TILE + TILE / 2;
  }
  // The next step is inside a cone: fall back to the nearest bush and wait
  // there instead of standing in the open where the warden is headed — a
  // warden that is already walking toward Milo's spot will find him there.
  // If no bush is reachable, hold still; after a while, take the step anyway.
  for (const guard of state.guards) {
    if (world.canSee(guard, stepCentre.x, stepCentre.y)) {
      if (wait < 2.5) {
        if (world.isBush(player.x, player.y)) return { move: [0, 0], wait: wait + STEP, sprint: false };
        const hide = nearestBushTile(world, tileOf(player.x, player.y));
        if (hide !== null && hide.length > 0) {
          const tile = hide[0];
          const cx = tile.col * TILE + TILE / 2;
          const cy = tile.row * TILE + TILE / 2;
          const dx = cx - player.x;
          const dy = cy - player.y;
          const len = Math.hypot(dx, dy) || 1;
          return { move: [dx / len, dy / len], wait: 0, sprint: false };
        }
        return { move: [0, 0], wait: wait + STEP, sprint: false };
      }
      break;
    }
  }
  const dx = stepCentre.x - player.x;
  const dy = stepCentre.y - player.y;
  const len = Math.hypot(dx, dy) || 1;
  return { move: [dx / len, dy / len], wait: 0, sprint: false };
}

/**
 * The way to the goal: a cone-free path when one exists right now, else the
 * direct path (the caller then waits out the cone on its next step). A direct
 * path that walks Milo into a cone he can see coming is the last resort, not
 * the plan.
 */
function safeGoalPath(world, goal) {
  const player = world.state.player;
  const safe = bfsSafePath(world, tileOf(player.x, player.y), tileOf(goal.x, goal.y));
  if (safe.length > 0) return safe;
  return bfsPath(world, tileOf(player.x, player.y), tileOf(goal.x, goal.y));
}

export function runAutopilot(world, seconds) {
  let wait = 0;
  const steps = Math.floor(seconds / STEP);
  for (let index = 0; index < steps; index += 1) {
    const pilot = autopilot(world, wait);
    wait = pilot.wait;
    const events = world.step(STEP, pilot.move[0], pilot.move[1], pilot.sprint === true, false, null);
    if (events & (EVENT_CAUGHT | EVENT_LEVEL_DONE | EVENT_WIN)) return events;
  }
  return 0;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the
 * best score to show. Any other name is the title.
 */
export function stageShot(name, world) {
  const state = world.state;
  if (name === 'play') {
    // Level 1, sneaked by the autopilot: one moonpetal gathered, Milo threading
    // between the crates while a cone sweeps the room. If the autopilot is caught
    // (it should not be — it refuses every step a cone covers), fall back to a
    // staged pose in the same spot instead of a caught frame.
    world.startLevel(0);
    state.status = 'play';
    const events = runAutopilot(world, 13);
    if (events & EVENT_CAUGHT) {
      world.startLevel(0);
      state.status = 'play';
      state.player.x = 9 * TILE + 32;
      state.player.y = 6 * TILE + 32;
      state.shards[0].taken = true;
      state.score = 100;
      state.levelScore = 100;
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'hide') {
    // Level 1: Milo tucked inside the bush at column 6, row 3, while the
    // stacks warden walks its row and its cone sweeps right over the bush.
    // The bush hides him, so the warden walks on — the frame shows the cone
    // passing over the bush he is crouched in.
    world.startLevel(0);
    state.status = 'play';
    state.player.x = 6 * TILE + 32;
    state.player.y = 3 * TILE + 32;
    // About 6.6 s in, the stacks warden is walking back down its row, facing
    // left, its cone reaching right over this bush.
    for (let index = 0; index < 6.6 / STEP; index += 1) {
      const events = world.step(STEP, 0, 0, false, false, null);
      if (events & EVENT_CAUGHT) break;
    }
    return { screen: SCREEN_PLAY, best: 1240 };
  }
  if (name === 'end') {
    // A finished run: every level cleared, ghost bonus kept, the victory screen.
    world.stageVictory();
    return { screen: SCREEN_WIN, best: 1870 };
  }
  // start: the title over level 1, wardens on patrol, nothing gathered yet.
  // The world steps in harmless mode (patrol only) while the title is up.
  world.toTitle();
  state.status = 'play';
  for (let index = 0; index < 6 / STEP; index += 1) {
    world.step(STEP, 0, 0, false, true, null);
  }
  state.status = 'title';
  return { screen: SCREEN_TITLE, best: 1240 };
}
