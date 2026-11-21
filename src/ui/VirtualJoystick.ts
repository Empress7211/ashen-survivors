import type { JoystickState } from '../app/InputManager.ts';
import { el } from '../app/dom.ts';

export class VirtualJoystickView {
  readonly element: HTMLElement;
  private readonly knob: HTMLElement;

  constructor() {
    this.knob = el('div', { className: 'virtual-joystick-knob' });
    this.element = el('div', {
      className: 'virtual-joystick',
      attrs: { 'aria-hidden': 'true' },
      children: [this.knob],
    });
  }

  update(state: JoystickState): void {
    if (!state.active) {
      this.element.classList.remove('visible');
      return;
    }
    this.element.classList.add('visible');
    this.element.style.left = `${state.originX}px`;
    this.element.style.top = `${state.originY}px`;
    this.knob.style.transform = `translate(calc(-50% + ${state.offsetX}px), calc(-50% + ${state.offsetY}px))`;
  }
}
