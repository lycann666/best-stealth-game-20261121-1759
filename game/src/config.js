// Every tuning number and colour in one place. The playfield is a fixed 1280x720
// logical area; the renderer scales it to the window, so no rule below depends on
// the screen size. One tile is 64 px: the maps are 20 columns by 11 rows.

export const FIELD = { width: 1280, height: 720 };
export const TILE = 64;
export const COLS = 20;
export const ROWS = 11;

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 14,
  walkSpeed: 178,
  sprintSpeed: 292,
  /** Sprinting is loud: guards inside this radius come to investigate. */
  noiseRadius: 150,
};

export const GUARD = {
  patrolSpeed: 76,
  chaseSpeed: 188,
  investigateSpeed: 132,
  /** How far a guard can see, in pixels. */
  viewRange: 245,
  /** Half of the vision cone's angle, in radians (about 34 degrees each side). */
  halfAngle: 0.6,
  /** Seconds a guard waits at a waypoint, scanning the room. */
  waitAtWaypoint: 1.5,
  /** Seconds a guard looks around after losing the trail. */
  lookAround: 1.8,
  /** Alert at or above this means the guard chases the player. */
  chaseAlert: 0.55,
  /** How close a guard must be to spot a player hiding in a bush. */
  bushSpotRange: 72,
};

export const LIVES = 3;
export const SHARD_POINTS = 100;
export const LEVEL_CLEAR_POINTS = 150;
export const GHOST_BONUS = 150;
export const CAUGHT_PENALTY = 100;

export const PALETTE = {
  backdrop: '#0b0e1a',
  floorA: '#1a2036',
  floorB: '#171c30',
  floorSpeck: '#232a47',
  wall: '#3a4266',
  wallTop: '#565f8f',
  wallEdge: '#232840',
  crate: '#7a5230',
  crateTop: '#a0714a',
  crateEdge: '#4a3018',
  bush: '#1e4d2e',
  bushLight: '#2f6b41',
  bushDark: '#143522',
  shard: '#ffd94d',
  shardGlow: '#ffedb0',
  exitLocked: '#4a5468',
  exitOpen: '#7dffb0',
  exitGlow: '#baffce',
  player: '#e8e4ff',
  playerWing: '#b9aef2',
  playerGlow: '#8f7ff0',
  guard: '#2c2438',
  guardRobe: '#3d3350',
  guardHood: '#241d31',
  cone: '#ffc44d',
  coneAlert: '#ff5a4d',
  text: '#eef1f5',
  muted: '#9aa3bd',
  gold: '#f2c94c',
  panel: '#171c30',
  panelEdge: '#3a4266',
  danger: '#ff5a4d',
  quiet: '#7dffb0',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'shadowmoth.best';
