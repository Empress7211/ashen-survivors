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
        if (!pad) continue;
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
