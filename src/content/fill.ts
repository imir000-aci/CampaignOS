// Framework-safe value setters. React/Vue track input state internally, so simply
// assigning `.value` and dispatching an event isn't enough — the value must be set
// through the element prototype's native setter so the framework sees the change.

function nativeSet(el: HTMLElement, prop: 'value' | 'checked', value: unknown): void {
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, prop);
  if (desc?.set) {
    desc.set.call(el, value);
  } else {
    (el as unknown as Record<string, unknown>)[prop] = value;
  }
}

function fire(el: HTMLElement, types: string[]): void {
  for (const t of types) {
    el.dispatchEvent(new Event(t, { bubbles: true }));
  }
}

export function setTextValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  nativeSet(el, 'value', value);
  fire(el, ['input', 'change']);
}

export function setSelectValue(el: HTMLSelectElement, value: string): void {
  nativeSet(el, 'value', value);
  fire(el, ['input', 'change']);
}

export function setCheckbox(el: HTMLInputElement, checked: boolean): void {
  if (el.checked !== checked) {
    nativeSet(el, 'checked', checked);
    fire(el, ['click', 'input', 'change']);
  }
}

export function setRadio(el: HTMLInputElement): void {
  if (!el.checked) {
    nativeSet(el, 'checked', true);
    fire(el, ['click', 'input', 'change']);
  }
}

export function setContentEditable(el: HTMLElement, text: string): void {
  el.textContent = text;
  fire(el, ['input']);
}

/** Read the current value of an element in the same serialization used for capture. */
export function readTextValue(el: HTMLInputElement | HTMLTextAreaElement): string {
  return el.value;
}
