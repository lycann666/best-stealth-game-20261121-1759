// Keyboard and pointer input. Held keys give a steering direction; one-shot
// presses (start or restart, pause, mute) are queued as bit flags and taken once
// by the loop, so a press between two frames is never lost and never counted
// twice. A click on the floor sets a move target: Milo walks there on his own.
import { FIELD } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_RESTART = 8;
export const ACTION_LEVEL_1 = 16;
export const ACTION_LEVEL_2 = 32;
export const ACTION_LEVEL_3 = 64;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const SPRINT = new Set(['ShiftLeft', 'ShiftRight']);

export function createInput(canvas) {
  let left = false;
  let right = false;
  let up = false;
  let down = false;
  let sprint = false;
  let actions = 0;
  let moveTarget = null;

  /** Convert a pointer event to playfield coordinates, or null when off-field. */
  function fieldPoint(event) {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / FIELD.width, rect.height / FIELD.height);
    const ox = (rect.width - FIELD.width * scale) / 2;
    const oy = (rect.height - FIELD.height * scale) / 2;
    const x = (event.clientX - rect.left - ox) / scale;
    const y = (event.clientY - rect.top - oy) / scale;
    if (x < 0 || y < 0 || x > FIELD.width || y > FIELD.height) return null;
    return { x, y };
  }

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (SPRINT.has(event.code)) sprint = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (event.code === 'KeyM') {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (event.code === 'KeyR') {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (event.code === 'Digit1') {
      if (!event.repeat) actions |= ACTION_LEVEL_1;
    } else if (event.code === 'Digit2') {
      if (!event.repeat) actions |= ACTION_LEVEL_2;
    } else if (event.code === 'Digit3') {
      if (!event.repeat) actions |= ACTION_LEVEL_3;
    } else return;
    if (LEFT.has(event.code) || RIGHT.has(event.code) || UP.has(event.code) || DOWN.has(event.code)) {
      moveTarget = null;
    }
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (SPRINT.has(event.code)) sprint = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    left = false;
    right = false;
    up = false;
    down = false;
    sprint = false;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const point = fieldPoint(event);
    if (point) moveTarget = point;
    actions |= ACTION_CONFIRM;
  });

  return {
    /** The held steering direction, each component -1, 0 or 1. */
    direction() {
      return { x: (right ? 1 : 0) - (left ? 1 : 0), y: (down ? 1 : 0) - (up ? 1 : 0) };
    },
    sprinting() {
      return sprint;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The click-to-move point, or null. */
    moveTarget() {
      return moveTarget;
    },
    clearMoveTarget() {
      moveTarget = null;
    },
  };
}
