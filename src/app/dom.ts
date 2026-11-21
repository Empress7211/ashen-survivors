/**
 * Minimal typed DOM creation & listener cleanup utilities.
 */

export type ChildNodeSpec = Node | string | number | null | undefined | false;

export interface ElementOptions {
  className?: string;
  text?: string;
  attrs?: Record<string, string | number | boolean | undefined>;
  dataset?: Record<string, string | number | undefined>;
  children?: readonly ChildNodeSpec[];
  onClick?: (event: MouseEvent) => void;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: ElementOptions = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.className) {
    node.className = opts.className;
  }
  if (opts.text !== undefined) {
    node.textContent = opts.text;
  }
  if (opts.attrs) {
    for (const [key, val] of Object.entries(opts.attrs)) {
      if (val === undefined || val === false) continue;
      if (val === true) {
        node.setAttribute(key, '');
      } else {
        node.setAttribute(key, String(val));
      }
    }
  }
  if (opts.dataset) {
    for (const [key, val] of Object.entries(opts.dataset)) {
      if (val !== undefined) {
        node.dataset[key] = String(val);
      }
    }
  }
  if (opts.children) {
    appendChildren(node, opts.children);
  }
  if (opts.onClick) {
    (node as HTMLElement).addEventListener('click', opts.onClick);
  }
  return node;
}

export function appendChildren(parent: Element, children: readonly ChildNodeSpec[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      parent.appendChild(document.createTextNode(String(child)));
    } else {
      parent.appendChild(child);
    }
  }
}

export function imgIcon(
  src: string,
  alt: string,
  className?: string,
): HTMLImageElement {
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  img.decoding = 'async';
  img.draggable = false;
  if (className) img.className = className;
  return img;
}

export class ListenerBag {
  private readonly cleanups: (() => void)[] = [];

  on<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    handler: (ev: WindowEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  on<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    handler: (ev: DocumentEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  on<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    handler: (ev: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  on(
    target: EventTarget,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    target.addEventListener(type, handler, options);
    this.cleanups.push(() => target.removeEventListener(type, handler, options));
  }

  addCleanup(fn: () => void): void {
    this.cleanups.push(fn);
  }

  clear(): void {
    while (this.cleanups.length > 0) {
      const fn = this.cleanups.pop();
      fn?.();
    }
  }
}
