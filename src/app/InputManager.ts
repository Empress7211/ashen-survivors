import { ListenerBag } from './dom.ts';

export interface MovementVector {
  x: number;
  y: number;
}

export interface JoystickState {
  active: boolean;
  originX: number;
  originY: number;
  offsetX: number;
  offsetY: number;
}

const JOYSTICK_MAX_RADIUS = 46;
const GAMEPAD_STICK_UI_THRESHOLD = 0.55;
const GAMEPAD_UI_REPEAT_MS = 180;

export type GamepadNavDirection = 'up' | 'down' | 'left' | 'right';

export interface GamepadUiPollResult {
  direction: GamepadNavDirection | null;
  confirmPressed: boolean;
  cancelPressed: boolean;
  xPressed: boolean;
  yPressed: boolean;
  startPressed: boolean;
}

function readStandardGamepadSnapshot(): {
  dir: GamepadNavDirection | null;
  a: boolean;
  b: boolean;
  x: boolean;
  y: boolean;
  start: boolean;
} {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return { dir: null, a: false, b: false, x: false, y: false, start: false };
  }

  let dir: GamepadNavDirection | null = null;
  let a = false;
  let b = false;
  let x = false;
  let y = false;
  let start = false;

  const pads = navigator.getGamepads();
  for (const pad of pads) {
    if (!pad || pad.connected === false) continue;

    if (pad.buttons[0]?.pressed) a = true;
    if (pad.buttons[1]?.pressed) b = true;
    if (pad.buttons[2]?.pressed) x = true;
    if (pad.buttons[3]?.pressed) y = true;
    if (pad.buttons[9]?.pressed) start = true;

    if (!dir) {
      if (pad.buttons[12]?.pressed) dir = 'up';
      else if (pad.buttons[13]?.pressed) dir = 'down';
      else if (pad.buttons[14]?.pressed) dir = 'left';
      else if (pad.buttons[15]?.pressed) dir = 'right';
      else {
        const ax = pad.axes[0] ?? 0;
        const ay = pad.axes[1] ?? 0;
        if (Math.abs(ax) > GAMEPAD_STICK_UI_THRESHOLD || Math.abs(ay) > GAMEPAD_STICK_UI_THRESHOLD) {
          if (Math.abs(ax) >= Math.abs(ay)) {
            dir = ax < 0 ? 'left' : 'right';
          } else {
            dir = ay < 0 ? 'up' : 'down';
          }
        }
      }
    }
  }

  return { dir, a, b, x, y, start };
}

function isInteractiveVisibleElement(el: HTMLElement): boolean {
  if ((el as HTMLButtonElement | HTMLInputElement).disabled) return false;
  if (el.getAttribute('aria-disabled') === 'true') return false;
  if (el.closest('[hidden]')) return false;

  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;

  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function resolveGamepadNavScope(container: HTMLElement | null): HTMLElement | null {
  if (!container) return null;
  if (container.matches('.modal-backdrop')) {
    return container.querySelector<HTMLElement>('.modal-dialog') ?? container;
  }
  const backdrops = container.querySelectorAll<HTMLElement>('.modal-backdrop');
  if (backdrops.length > 0) {
    const topBackdrop = backdrops[backdrops.length - 1]!;
    return topBackdrop.querySelector<HTMLElement>('.modal-dialog') ?? topBackdrop;
  }
  return container;
}

export function getNavigableControls(scope: HTMLElement): HTMLElement[] {
  const nodes = scope.querySelectorAll<HTMLElement>(
    'button, input, select, textarea, [tabindex]',
  );
  const out: HTMLElement[] = [];
  for (const node of nodes) {
    if (node.tagName !== 'BUTTON' && node.tagName !== 'INPUT' && node.tagName !== 'SELECT' && node.tagName !== 'TEXTAREA') {
      if (node.tabIndex < 0) continue;
    }
    if (isInteractiveVisibleElement(node)) {
      out.push(node);
    }
  }
  return out;
}

/**
 * Discrete 60Hz gamepad UI navigation & 2D spatial focus ring controller.
 */
export class GamepadMenuNavigator {
  private prevA = false;
  private prevB = false;
  private prevX = false;
  private prevY = false;
  private prevStart = false;
  private heldDir: GamepadNavDirection | null = null;
  private lastDirFiredAt = 0;

  private active = false;
  private focusedEl: HTMLElement | null = null;
  private lastFocusedTestId: string | null = null;

  isActive(): boolean {
    return this.active;
  }

  getFocusedElement(): HTMLElement | null {
    return this.focusedEl;
  }

  /**
   * Captures current hardware button state without emitting rising edges,
   * preventing button bounce when transitioning between gameplay and modals.
   */
  syncFromHardware(): void {
    const snap = readStandardGamepadSnapshot();
    this.prevA = snap.a;
    this.prevB = snap.b;
    this.prevX = snap.x;
    this.prevY = snap.y;
    this.prevStart = snap.start;
    this.heldDir = snap.dir;
    this.lastDirFiredAt = performance.now();
  }

  poll(now: number = performance.now()): GamepadUiPollResult {
    const snap = readStandardGamepadSnapshot();

    const confirmPressed = snap.a && !this.prevA;
    const cancelPressed = snap.b && !this.prevB;
    const xPressed = snap.x && !this.prevX;
    const yPressed = snap.y && !this.prevY;
    const startPressed = snap.start && !this.prevStart;

    this.prevA = snap.a;
    this.prevB = snap.b;
    this.prevX = snap.x;
    this.prevY = snap.y;
    this.prevStart = snap.start;

    let direction: GamepadNavDirection | null = null;
    if (snap.dir === null) {
      this.heldDir = null;
    } else if (snap.dir !== this.heldDir) {
      this.heldDir = snap.dir;
      this.lastDirFiredAt = now;
      direction = snap.dir;
    } else if (now - this.lastDirFiredAt >= GAMEPAD_UI_REPEAT_MS) {
      this.lastDirFiredAt = now;
      direction = snap.dir;
    }

    if (direction || confirmPressed || cancelPressed || xPressed || yPressed || startPressed) {
      this.active = true;
    }

    return {
      direction,
      confirmPressed,
      cancelPressed,
      xPressed,
      yPressed,
      startPressed,
    };
  }

  clearFocus(deactivate = false): void {
    if (this.focusedEl) {
      this.focusedEl.classList.remove('gamepad-focus');
      this.focusedEl = null;
    }
    const stale = document.querySelectorAll('.gamepad-focus');
    for (const el of stale) {
      el.classList.remove('gamepad-focus');
    }
    if (deactivate) {
      this.active = false;
      this.lastFocusedTestId = null;
    }
  }

  syncFocus(container: HTMLElement | null): HTMLElement | null {
    const scope = resolveGamepadNavScope(container);
    if (!scope || !this.active) {
      return null;
    }

    if (
      this.focusedEl &&
      this.focusedEl.isConnected &&
      scope.contains(this.focusedEl) &&
      isInteractiveVisibleElement(this.focusedEl)
    ) {
      this.focusedEl.classList.add('gamepad-focus');
      return this.focusedEl;
    }

    const candidates = getNavigableControls(scope);
    if (candidates.length === 0) {
      this.clearFocus(false);
      return null;
    }

    let next: HTMLElement | undefined;
    if (this.lastFocusedTestId) {
      next = candidates.find((c) => c.dataset.testid === this.lastFocusedTestId);
    }
    if (!next) {
      next =
        candidates.find((c) => c.classList.contains('selected')) ??
        candidates.find((c) => c.classList.contains('gothic-btn-primary')) ??
        candidates.find((c) => c.classList.contains('gothic-btn-gold')) ??
        candidates[0];
    }

    if (next) {
      this.setFocusedElement(next);
    }
    return this.focusedEl;
  }

  moveFocus(container: HTMLElement | null, dir: GamepadNavDirection): HTMLElement | null {
    this.active = true;
    const scope = resolveGamepadNavScope(container);
    if (!scope) return null;

    const candidates = getNavigableControls(scope);
    if (candidates.length === 0) {
      this.clearFocus(false);
      return null;
    }

    if (
      !this.focusedEl ||
      !this.focusedEl.isConnected ||
      !scope.contains(this.focusedEl) ||
      !isInteractiveVisibleElement(this.focusedEl)
    ) {
      return this.syncFocus(container);
    }

    const r0 = this.focusedEl.getBoundingClientRect();
    const cx0 = r0.left + r0.width / 2;
    const cy0 = r0.top + r0.height / 2;

    let best: HTMLElement | null = null;
    let bestScore = Infinity;

    for (const cand of candidates) {
      if (cand === this.focusedEl) continue;
      const r = cand.getBoundingClientRect();
      const dx = r.left + r.width / 2 - cx0;
      const dy = r.top + r.height / 2 - cy0;

      const inHalfPlane =
        (dir === 'up' && dy < -4) ||
        (dir === 'down' && dy > 4) ||
        (dir === 'left' && dx < -4) ||
        (dir === 'right' && dx > 4);
      if (!inHalfPlane) continue;

      const score =
        dir === 'up' || dir === 'down'
          ? Math.abs(dy) + Math.abs(dx) * 2.2
          : Math.abs(dx) + Math.abs(dy) * 2.2;

      if (score < bestScore) {
        bestScore = score;
        best = cand;
      }
    }

    if (!best) {
      const idx = candidates.indexOf(this.focusedEl);
      const step = dir === 'right' || dir === 'down' ? 1 : -1;
      const baseIdx = idx >= 0 ? idx : 0;
      best = candidates[(baseIdx + step + candidates.length) % candidates.length]!;
    }

    this.setFocusedElement(best);
    return best;
  }

  activateFocused(container: HTMLElement | null): boolean {
    this.active = true;
    const scope = resolveGamepadNavScope(container);
    if (!scope) return false;

    const target =
      this.focusedEl &&
      this.focusedEl.isConnected &&
      scope.contains(this.focusedEl) &&
      isInteractiveVisibleElement(this.focusedEl)
        ? this.focusedEl
        : this.syncFocus(container);

    if (!target || !isInteractiveVisibleElement(target)) {
      return false;
    }

    target.click();
    return true;
  }

  private setFocusedElement(el: HTMLElement): void {
    if (this.focusedEl && this.focusedEl !== el) {
      this.focusedEl.classList.remove('gamepad-focus');
    }
    const stray = document.querySelectorAll('.gamepad-focus');
    for (const node of stray) {
      if (node !== el) node.classList.remove('gamepad-focus');
    }
    this.focusedEl = el;
    this.lastFocusedTestId = el.dataset.testid ?? null;
    el.classList.add('gamepad-focus');
    el.focus({ preventScroll: true });
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
}

/**
 * Unified input aggregator for Keyboard (WASD + Arrows), Gamepad, and Pointer/Touch Virtual Joystick.
 */
export class InputManager {
  private readonly keysDown = new Set<string>();
  private readonly listeners = new ListenerBag();
  private activePointerId: number | null = null;
  private joystick: JoystickState = {
    active: false,
    originX: 0,
    originY: 0,
    offsetX: 0,
    offsetY: 0,
  };
  private joyX = 0;
  private joyY = 0;
  private prevGamepadPause = false;
  private onJoystickChange?: (state: JoystickState) => void;
  private onGamepadPause?: () => void;

  attach(
    surface: HTMLElement,
    callbacks: {
      onJoystickChange?: (state: JoystickState) => void;
      onGamepadPause?: () => void;
      isPlaying: () => boolean;
    },
  ): void {
    this.detach();
    this.onJoystickChange = callbacks.onJoystickChange;
    this.onGamepadPause = callbacks.onGamepadPause;

    this.listeners.on(window, 'keydown', (ev) => {
      this.keysDown.add(ev.code);
    });

    this.listeners.on(window, 'keyup', (ev) => {
      this.keysDown.delete(ev.code);
    });

    this.listeners.on(window, 'blur', () => {
      this.keysDown.clear();
      this.resetJoystick();
    });

    this.listeners.on(surface, 'pointerdown', (ev) => {
      if (!callbacks.isPlaying()) return;
      const target = ev.target as HTMLElement | null;
      if (target && target.closest('button, input, textarea, select, .modal-backdrop')) {
        return;
      }
      if (ev.button !== 0 && ev.pointerType === 'mouse') return;
      this.activePointerId = ev.pointerId;
      this.joystick = {
        active: true,
        originX: ev.clientX,
        originY: ev.clientY,
        offsetX: 0,
        offsetY: 0,
      };
      this.joyX = 0;
      this.joyY = 0;
      this.onJoystickChange?.({ ...this.joystick });
    });

    this.listeners.on(window, 'pointermove', (ev) => {
      if (this.activePointerId !== ev.pointerId || !this.joystick.active) return;
      const dx = ev.clientX - this.joystick.originX;
      const dy = ev.clientY - this.joystick.originY;
      const dist = Math.hypot(dx, dy);
      if (dist > 4) {
        const clamped = Math.min(JOYSTICK_MAX_RADIUS, dist);
        const nx = dx / dist;
        const ny = dy / dist;
        this.joystick.offsetX = nx * clamped;
        this.joystick.offsetY = ny * clamped;
        const strength = clamped / JOYSTICK_MAX_RADIUS;
        this.joyX = nx * strength;
        this.joyY = ny * strength;
      } else {
        this.joystick.offsetX = dx;
        this.joystick.offsetY = dy;
        this.joyX = 0;
        this.joyY = 0;
      }
      this.onJoystickChange?.({ ...this.joystick });
    });

    const endPointer = (ev: PointerEvent): void => {
      if (this.activePointerId !== ev.pointerId) return;
      this.resetJoystick();
    };
    this.listeners.on(window, 'pointerup', endPointer);
    this.listeners.on(window, 'pointercancel', endPointer);
  }

  resetJoystick(): void {
    this.activePointerId = null;
    this.joyX = 0;
    this.joyY = 0;
    if (this.joystick.active) {
      this.joystick = {
        active: false,
        originX: 0,
        originY: 0,
        offsetX: 0,
        offsetY: 0,
      };
      this.onJoystickChange?.({ ...this.joystick });
    }
  }

  clearKeys(): void {
    this.keysDown.clear();
  }

  syncGamepadPauseButton(): void {
    this.prevGamepadPause = readStandardGamepadSnapshot().start;
  }

  pollMovement(): MovementVector {
    let x = 0;
    let y = 0;

    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) x -= 1;
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) x += 1;
    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) y -= 1;
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) y += 1;

    if (x === 0 && y === 0 && (this.joyX !== 0 || this.joyY !== 0)) {
      x = this.joyX;
      y = this.joyY;
    }

    // Gamepad polling
    if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
      const pads = navigator.getGamepads();
      for (const pad of pads) {
        if (!pad || pad.connected === false) continue;
        const pausePressed = Boolean(pad.buttons[9]?.pressed);
        if (pausePressed && !this.prevGamepadPause) {
          this.onGamepadPause?.();
        }
        this.prevGamepadPause = pausePressed;

        if (x === 0 && y === 0) {
          const ax = pad.axes[0] ?? 0;
          const ay = pad.axes[1] ?? 0;
          if (Math.hypot(ax, ay) > 0.18) {
            x = ax;
            y = ay;
          } else {
            if (pad.buttons[14]?.pressed) x -= 1;
            if (pad.buttons[15]?.pressed) x += 1;
            if (pad.buttons[12]?.pressed) y -= 1;
            if (pad.buttons[13]?.pressed) y += 1;
          }
        }
        break;
      }
    }

    const mag = Math.hypot(x, y);
    if (mag > 1) {
      return { x: x / mag, y: y / mag };
    }
    return { x, y };
  }

  detach(): void {
    this.listeners.clear();
    this.keysDown.clear();
    this.resetJoystick();
  }
}
