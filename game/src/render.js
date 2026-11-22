// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred, the margin filled
// with the backdrop colour. Everything is drawn with canvas shapes and text —
// no images, no network. Guards get amber vision cones that redden as their
// suspicion grows; bushes are drawn over a hiding Milo so he looks nestled in.
import { COLS, FIELD, FONT, GUARD, LEVEL_CLEAR_POINTS, LIVES, PALETTE, ROWS, SHARD_POINTS, TILE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LEVEL_DONE = 'leveldone';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const PANEL = { width: 680, top: 150, line: 32, bottom: 76 };

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('Score ');
  const bestLabel = cachedLabel('Best ');
  const timeLabel = cachedLabel('');
  const shardLabel = cachedLabel('');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function tileAt(state, col, row) {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return '#';
    return state.level.map[row][col];
  }

  function drawFloor(state) {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        context.fillStyle = (col + row) % 2 === 0 ? PALETTE.floorA : PALETTE.floorB;
        context.fillRect(col * TILE, row * TILE, TILE, TILE);
      }
    }
    for (const speck of state.decor) {
      context.fillStyle = speck.shade > 0.5 ? PALETTE.floorSpeck : PALETTE.floorB;
      context.beginPath();
      context.arc(speck.x, speck.y, speck.r, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawWallsAndCrates(state) {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const tile = tileAt(state, col, row);
        const x = col * TILE;
        const y = row * TILE;
        if (tile === '#') {
          context.fillStyle = PALETTE.wall;
          context.fillRect(x, y, TILE, TILE);
          context.fillStyle = PALETTE.wallTop;
          context.fillRect(x, y, TILE, 8);
          context.fillStyle = PALETTE.wallEdge;
          context.fillRect(x, y + TILE - 4, TILE, 4);
        } else if (tile === 'C') {
          context.fillStyle = PALETTE.crate;
          context.fillRect(x + 5, y + 5, TILE - 10, TILE - 10);
          context.fillStyle = PALETTE.crateTop;
          context.fillRect(x + 5, y + 5, TILE - 10, 8);
          context.strokeStyle = PALETTE.crateEdge;
          context.lineWidth = 3;
          context.strokeRect(x + 5, y + 5, TILE - 10, TILE - 10);
          context.beginPath();
          context.moveTo(x + 5, y + 5);
          context.lineTo(x + TILE - 5, y + TILE - 5);
          context.moveTo(x + TILE - 5, y + 5);
          context.lineTo(x + 5, y + TILE - 5);
          context.stroke();
        }
      }
    }
  }

  function drawBushBase(state) {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if (tileAt(state, col, row) !== 'B') continue;
        const cx = col * TILE + TILE / 2;
        const cy = row * TILE + TILE / 2;
        context.fillStyle = PALETTE.bushDark;
        context.beginPath();
        context.arc(cx, cy, 30, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = PALETTE.bush;
        context.beginPath();
        context.arc(cx - 12, cy + 6, 16, 0, Math.PI * 2);
        context.arc(cx + 12, cy + 4, 17, 0, Math.PI * 2);
        context.arc(cx, cy - 10, 16, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawBushFronds(state) {
    const player = state.player;
    const col = Math.floor(player.x / TILE);
    const row = Math.floor(player.y / TILE);
    if (tileAt(state, col, row) !== 'B') return;
    const cx = col * TILE + TILE / 2;
    const cy = row * TILE + TILE / 2;
    context.fillStyle = PALETTE.bushLight;
    context.globalAlpha = 0.9;
    context.beginPath();
    context.arc(cx - 14, cy - 12, 12, 0, Math.PI * 2);
    context.arc(cx + 14, cy - 10, 12, 0, Math.PI * 2);
    context.arc(cx, cy + 14, 11, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
  }

  function drawShards(state) {
    for (const shard of state.shards) {
      if (shard.taken) continue;
      const bob = Math.sin(shard.bob) * 3;
      const x = shard.x;
      const y = shard.y + bob;
      const glow = context.createRadialGradient(x, y, 2, x, y, 30);
      glow.addColorStop(0, PALETTE.shardGlow);
      glow.addColorStop(1, 'rgba(255, 217, 77, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(x, y, 30, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.shard;
      for (let petal = 0; petal < 4; petal += 1) {
        const a = (petal * Math.PI) / 2 + Math.PI / 4;
        context.beginPath();
        context.ellipse(x + Math.cos(a) * 9, y + Math.sin(a) * 9, 7, 4.5, a, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = PALETTE.shardGlow;
      context.beginPath();
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawExit(state) {
    const exit = state.exit;
    const cx = exit.x + TILE / 2;
    const cy = exit.y + TILE / 2;
    const open = exit.open;
    const pulse = 0.55 + 0.25 * Math.sin((state.time * 1000) / 350);
    const glowColor = open ? PALETTE.exitOpen : PALETTE.exitLocked;
    const glow = context.createRadialGradient(cx, cy, 4, cx, cy, 62);
    glow.addColorStop(0, open ? `rgba(125, 255, 176, ${pulse})` : 'rgba(74, 84, 104, 0.5)');
    glow.addColorStop(1, 'rgba(125, 255, 176, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(cx, cy, 62, 0, Math.PI * 2);
    context.fill();
    // An arched window in the wall.
    context.fillStyle = open ? '#0d2b1a' : '#141824';
    context.beginPath();
    context.moveTo(cx - 20, cy + 22);
    context.lineTo(cx - 20, cy - 4);
    context.arc(cx, cy - 4, 20, Math.PI, 0);
    context.lineTo(cx + 20, cy + 22);
    context.closePath();
    context.fill();
    if (open) {
      context.fillStyle = PALETTE.exitGlow;
      context.beginPath();
      context.arc(cx - 6, cy - 8, 5, 0, Math.PI * 2);
      context.arc(cx + 8, cy + 2, 3.5, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = PALETTE.exitOpen;
      context.lineWidth = 2.5;
      context.beginPath();
      context.moveTo(cx - 20, cy + 22);
      context.lineTo(cx - 20, cy - 4);
      context.arc(cx, cy - 4, 20, Math.PI, 0);
      context.lineTo(cx + 20, cy + 22);
      context.stroke();
    } else {
      context.strokeStyle = PALETTE.exitLocked;
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(cx - 20, cy + 2);
      context.lineTo(cx + 20, cy + 2);
      context.moveTo(cx, cy - 22);
      context.lineTo(cx, cy + 22);
      context.stroke();
    }
  }

  function drawCone(guard) {
    const color = guard.alert > GUARD.chaseAlert ? PALETTE.coneAlert : PALETTE.cone;
    const alpha = 0.1 + 0.16 * Math.min(1, guard.alert + 0.25);
    const gradient = context.createRadialGradient(guard.x, guard.y, 8, guard.x, guard.y, GUARD.viewRange);
    gradient.addColorStop(0, color + '59');
    gradient.addColorStop(1, color + '00');
    context.fillStyle = gradient;
    context.globalAlpha = Math.min(1, alpha / 0.2);
    context.beginPath();
    context.moveTo(guard.x, guard.y);
    context.arc(guard.x, guard.y, GUARD.viewRange, guard.dir - GUARD.halfAngle, guard.dir + GUARD.halfAngle);
    context.closePath();
    context.fill();
    context.globalAlpha = 1;
    context.strokeStyle = color;
    context.globalAlpha = 0.28;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(guard.x, guard.y);
    context.lineTo(guard.x + Math.cos(guard.dir - GUARD.halfAngle) * GUARD.viewRange, guard.y + Math.sin(guard.dir - GUARD.halfAngle) * GUARD.viewRange);
    context.moveTo(guard.x, guard.y);
    context.lineTo(guard.x + Math.cos(guard.dir + GUARD.halfAngle) * GUARD.viewRange, guard.y + Math.sin(guard.dir + GUARD.halfAngle) * GUARD.viewRange);
    context.stroke();
    context.globalAlpha = 1;
  }

  function drawGuard(guard) {
    drawCone(guard);
    // Lantern glow at the warden's side.
    const lx = guard.x + Math.cos(guard.dir + 1.2) * 16;
    const ly = guard.y + Math.sin(guard.dir + 1.2) * 16;
    const glow = context.createRadialGradient(lx, ly, 2, lx, ly, 26);
    glow.addColorStop(0, 'rgba(255, 196, 77, 0.5)');
    glow.addColorStop(1, 'rgba(255, 196, 77, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(lx, ly, 26, 0, Math.PI * 2);
    context.fill();
    // Hooded robe, turned toward the facing direction.
    context.save();
    context.translate(guard.x, guard.y);
    context.rotate(guard.dir);
    context.fillStyle = PALETTE.guardRobe;
    context.beginPath();
    context.moveTo(14, 0);
    context.lineTo(-10, -13);
    context.lineTo(-14, 0);
    context.lineTo(-10, 13);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.guardHood;
    context.beginPath();
    context.arc(2, 0, 10, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.cone;
    context.beginPath();
    context.arc(7, 0, 3.5, 0, Math.PI * 2);
    context.fill();
    context.restore();
    // The lantern itself.
    context.fillStyle = '#3a2c12';
    context.fillRect(lx - 3, ly - 6, 6, 12);
    context.fillStyle = PALETTE.cone;
    context.beginPath();
    context.arc(lx, ly, 3.5, 0, Math.PI * 2);
    context.fill();
    // Suspicion marks.
    if (guard.alert > GUARD.chaseAlert) {
      text('!', guard.x, guard.y - 26, 30, PALETTE.danger, 'center');
    } else if (guard.alert > 0.2) {
      text('?', guard.x, guard.y - 26, 26, PALETTE.gold, 'center');
    }
  }

  function drawPlayer(state) {
    const player = state.player;
    const hidden = tileAt(state, Math.floor(player.x / TILE), Math.floor(player.y / TILE)) === 'B';
    const flap = player.moving ? Math.sin(player.flap) * 0.55 : Math.sin(state.time * 2) * 0.12;
    // Soft glow, brighter when the exit is open and Milo carries the light home.
    const glow = context.createRadialGradient(player.x, player.y, 2, player.x, player.y, 34);
    glow.addColorStop(0, 'rgba(143, 127, 240, 0.35)');
    glow.addColorStop(1, 'rgba(143, 127, 240, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(player.x, player.y, 34, 0, Math.PI * 2);
    context.fill();
    context.save();
    context.translate(player.x, player.y);
    context.globalAlpha = hidden ? 0.75 : 1;
    // Wings, flapping around the body's axis.
    context.fillStyle = PALETTE.playerWing;
    for (const side of [-1, 1]) {
      context.save();
      context.rotate(player.face + side * (0.7 + flap * 0.5));
      context.beginPath();
      context.ellipse(13, 0, 13, 7, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    // Body.
    context.rotate(player.face);
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.ellipse(0, 0, 12, 6.5, 0, 0, Math.PI * 2);
    context.fill();
    // Antennae.
    context.strokeStyle = PALETTE.player;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(10, -3);
    context.quadraticCurveTo(18, -8, 20, -13);
    context.moveTo(10, 3);
    context.quadraticCurveTo(18, 8, 20, 13);
    context.stroke();
    context.restore();
  }

  function drawNoise(state) {
    const noise = state.noise;
    if (!noise) return;
    const radius = noise.r * (0.5 + noise.t);
    context.strokeStyle = `rgba(255, 196, 77, ${Math.max(0, 0.55 - noise.t)})`;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(noise.x, noise.y, radius, 0, Math.PI * 2);
    context.stroke();
  }

  function drawMoveTarget(state, moveTarget) {
    if (!moveTarget) return;
    const pulse = 0.5 + 0.3 * Math.sin(state.time * 5);
    context.strokeStyle = `rgba(238, 241, 245, ${pulse})`;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(moveTarget.x, moveTarget.y, 10, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.arc(moveTarget.x, moveTarget.y, 3, 0, Math.PI * 2);
    context.fillStyle = PALETTE.text;
    context.fill();
  }

  function formatTime(seconds) {
    const whole = Math.max(0, Math.floor(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  }

  function drawHud(state) {
    context.textBaseline = 'top';
    // A translucent strip so the HUD reads over any tile.
    context.fillStyle = 'rgba(11, 14, 26, 0.72)';
    context.fillRect(0, 0, FIELD.width, 52);
    const taken = state.shards.filter((s) => s.taken).length;
    text(state.level.name, 20, 12, 24, PALETTE.text, 'left');
    text(shardLabel(`✦ ${taken} / ${state.shards.length}`), 330, 14, 22, PALETTE.gold, 'left');
    text(timeLabel(formatTime(state.elapsed)), FIELD.width / 2, 14, 22, PALETTE.muted, 'center');
    text(scoreLabel(state.score), FIELD.width - 170, 12, 24, PALETTE.text, 'right');
    for (let life = 0; life < LIVES; life += 1) {
      context.fillStyle = life < state.lives ? PALETTE.player : PALETTE.wall;
      context.beginPath();
      context.arc(FIELD.width - 140 + life * 26, 26, 7, 0, Math.PI * 2);
      context.fill();
    }
    // The suspicion bar: the loudest warden's alert.
    if (state.maxAlert > 0.03) {
      const w = 240;
      const x = (FIELD.width - w) / 2;
      const y = 60;
      context.fillStyle = 'rgba(11, 14, 26, 0.72)';
      roundRect(context, x - 10, y - 6, w + 20, 30, 8);
      context.fill();
      text(state.maxAlert > GUARD.chaseAlert ? 'SEEN — RUN!' : 'SUSPICIOUS', x - 4, y, 16, state.maxAlert > GUARD.chaseAlert ? PALETTE.danger : PALETTE.gold, 'right');
      context.fillStyle = '#232840';
      context.fillRect(x + 8, y + 4, w - 90, 10);
      context.fillStyle = state.maxAlert > GUARD.chaseAlert ? PALETTE.danger : PALETTE.gold;
      context.fillRect(x + 8, y + 4, (w - 90) * Math.min(1, state.maxAlert), 10);
    }
    // Controls, bottom left.
    context.textBaseline = 'alphabetic';
    text('WASD / arrows move · click to walk · Shift sprint (loud!) · P pause · M sound', 20, FIELD.height - 12, 16, PALETTE.muted, 'left');
    if (state.exit.open) {
      text('THE WINDOW IS OPEN — GO!', FIELD.width - 20, FIELD.height - 12, 16, PALETTE.exitOpen, 'right');
    } else {
      text('Gather every moonpetal to open the window', FIELD.width - 20, FIELD.height - 12, 16, PALETTE.muted, 'right');
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(11, 14, 26, 0.6)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    roundRect(context, x, y, PANEL.width, height, 16);
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    roundRect(context, x, y, PANEL.width, height, 16);
    context.stroke();
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 74, 46, accent ?? PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 20, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 36, 22, PALETTE.gold, 'center');
  }

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, moveTarget) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawFloor(state);
    drawWallsAndCrates(state);
    drawBushBase(state);
    drawExit(state);
    drawShards(state);
    for (const guard of state.guards) drawGuard(guard);
    drawPlayer(state);
    drawBushFronds(state);
    drawNoise(state);
    drawMoveTarget(state, moveTarget);
    if (screen === SCREEN_TITLE) {
      const lines = [
        'You are Milo, a little moth courier. Three moonpetals sleep',
        'in the Lantern Archive — gather them all, then slip out',
        'through the glowing window, unseen.',
        '',
        'Move with WASD / arrows, or click the floor to walk there.',
        'Hold Shift to sprint — fast, but loud. Hide in the bushes:',
        'a warden\'s cone cannot see you inside one, unless it is close.',
        '',
        bestLabel(best),
      ];
      drawPanel('SHADOWMOTH', lines, 'Press Space or click to start · 1–3 choose a level');
      return;
    }
    drawHud(state);
    if (state.caughtFlash > 0) {
      context.fillStyle = `rgba(255, 60, 50, ${state.caughtFlash * 0.3})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
      if (state.caughtFlash > 0.5) {
        text('SPOTTED!', FIELD.width / 2, FIELD.height / 2 - 40, 64, PALETTE.danger, 'center');
      }
    }
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The wardens wait for you.'], 'Press P to keep sneaking');
    } else if (screen === SCREEN_LEVEL_DONE) {
      const lines = [
        `${state.level.name} — cleared!`,
        `Moonpetals ${SHARD_POINTS * state.shards.length}  ·  Clear ${LEVEL_CLEAR_POINTS}  ·  Time bonus ${state.levelBonus - LEVEL_CLEAR_POINTS - (state.ghost ? 150 : 0)}`,
        state.ghost ? 'Ghost bonus +150 — nobody ever grew suspicious.' : 'The wardens grew suspicious — no ghost bonus this time.',
        `Level score ${state.levelScore}  ·  Total ${state.score}`,
      ];
      drawPanel('Level clear!', lines, 'Press Space for the next level', PALETTE.exitOpen);
    } else if (screen === SCREEN_OVER) {
      const lines = [
        'The lanterns found you one time too many.',
        `Score ${state.score}`,
        bestLabel(best),
      ];
      drawPanel('Caught!', lines, 'Press Space to try again', PALETTE.danger);
    } else if (screen === SCREEN_WIN) {
      const minutes = Math.floor(state.totalElapsed / 60);
      const seconds = Math.floor(state.totalElapsed % 60);
      const lines = [
        'Every moonpetal home. Every warden none the wiser.',
        `Total score ${state.score}  ·  Time ${minutes}:${String(seconds).padStart(2, '0')}`,
        `Levels ${state.levelScores.join(' · ')}`,
        bestLabel(best),
      ];
      drawPanel('The Archive is Quiet', lines, 'Press Space to play again', PALETTE.exitOpen);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, formatTime };
}
