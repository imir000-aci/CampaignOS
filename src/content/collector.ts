// Content script: discovers form fields, captures the answers a user enters, and
// applies autofill instructions from the service worker.

import {
  type FieldDescriptor,
  type FieldType,
  type FieldValue,
  type FillInstruction,
} from '@shared/types';
import { normalizeQuestion, humanizeIdentifier } from '@shared/normalize';
import { sendMessageSafe, domainOf } from '@shared/messaging';
import {
  setTextValue,
  setSelectValue,
  setCheckbox,
  setRadio,
  setContentEditable,
} from './fill';

const DOMAIN = domainOf(location.href);
const FID_ATTR = 'data-cos-fid';

type Registered =
  | { kind: 'input'; el: HTMLInputElement | HTMLTextAreaElement }
  | { kind: 'select'; el: HTMLSelectElement }
  | { kind: 'checkbox'; el: HTMLInputElement }
  | { kind: 'radio'; els: HTMLInputElement[] }
  | { kind: 'contenteditable'; el: HTMLElement };

const registry = new Map<string, Registered>();
const previousValues = new Map<string, () => void>(); // fieldId → revert fn
const filledFieldIds = new Set<string>();

let fidCounter = 0;
let suppressCapture = false;

// ---- Privacy exclusions -------------------------------------------------

const SENSITIVE_RE = /pass(word)?|\bcvv\b|\bcvc\b|card|creditcard|\bssn\b|\botp\b|onetime|one-time|securitycode/i;

function isSensitive(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement && el.type === 'password') return true;
  const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
  if (ac.startsWith('cc-') || ac === 'one-time-code') return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;
  const hint = `${el.getAttribute('name') || ''} ${el.id || ''} ${ac}`;
  return SENSITIVE_RE.test(hint);
}

// ---- Field type mapping -------------------------------------------------

function inputFieldType(el: HTMLInputElement): FieldType | null {
  switch (el.type) {
    case 'password':
    case 'hidden':
    case 'submit':
    case 'button':
    case 'reset':
    case 'file':
    case 'image':
    case 'range':
    case 'color':
      return null;
    case 'checkbox':
      return 'checkbox';
    case 'radio':
      return 'radio';
    case 'email':
      return 'email';
    case 'url':
      return 'url';
    case 'tel':
      return 'tel';
    case 'number':
      return 'number';
    case 'date':
    case 'month':
    case 'week':
    case 'time':
    case 'datetime-local':
      return 'date';
    default:
      return 'text';
  }
}

// ---- Label detection ----------------------------------------------------

function textOfIds(ids: string): string {
  return ids
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent?.trim() || '')
    .filter(Boolean)
    .join(' ');
}

function getLabel(el: HTMLElement): string {
  const id = el.id;
  if (id) {
    const explicit = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (explicit?.textContent?.trim()) return explicit.textContent.trim();
  }
  const wrapping = el.closest('label');
  if (wrapping?.textContent?.trim()) return wrapping.textContent.trim();

  const aria = el.getAttribute('aria-label');
  if (aria?.trim()) return aria.trim();

  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const t = textOfIds(labelledby);
    if (t) return t;
  }

  const fieldset = el.closest('fieldset');
  const legend = fieldset?.querySelector('legend');
  if (legend?.textContent?.trim()) return legend.textContent.trim();

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.placeholder?.trim()) return el.placeholder.trim();
  }

  // Nearest preceding text-bearing element within the same container.
  let node: Element | null = el.previousElementSibling;
  while (node) {
    const t = node.textContent?.trim();
    if (t && t.length <= 120) return t;
    node = node.previousElementSibling;
  }

  const name = el.getAttribute('name') || el.id;
  return name ? humanizeIdentifier(name) : '';
}

/** Label for one radio/checkbox option (its own text, not the group's). */
function getOptionLabel(el: HTMLInputElement): string {
  const id = el.id;
  if (id) {
    const explicit = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (explicit?.textContent?.trim()) return explicit.textContent.trim();
  }
  const wrapping = el.closest('label');
  if (wrapping?.textContent?.trim()) return wrapping.textContent.trim();
  const aria = el.getAttribute('aria-label');
  if (aria?.trim()) return aria.trim();
  return el.value;
}

// ---- Registration & descriptor building ---------------------------------

function assignFid(el: Element): string {
  const existing = el.getAttribute(FID_ATTR);
  if (existing) return existing;
  const fid = `cos-${fidCounter++}`;
  el.setAttribute(FID_ATTR, fid);
  return fid;
}

/** (Re)scan the document, register controls, and return their descriptors. */
function scanFields(): FieldDescriptor[] {
  const descriptors: FieldDescriptor[] = [];
  const seenRadioGroups = new Set<string>();

  const controls = document.querySelectorAll<HTMLElement>(
    'input, select, textarea, [contenteditable="true"], [contenteditable=""]',
  );

  for (const el of Array.from(controls)) {
    if (isSensitive(el)) continue;

    // contenteditable
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLSelectElement) && !(el instanceof HTMLTextAreaElement)) {
      const label = getLabel(el);
      if (!label) continue;
      const fid = assignFid(el);
      registry.set(fid, { kind: 'contenteditable', el });
      descriptors.push(descriptor(fid, label, 'contenteditable'));
      continue;
    }

    if (el instanceof HTMLSelectElement) {
      const label = getLabel(el);
      if (!label) continue;
      const fid = assignFid(el);
      const type: FieldType = el.multiple ? 'multiselect' : 'select';
      registry.set(fid, { kind: 'select', el });
      const options = Array.from(el.options)
        .filter((o) => o.value !== '')
        .map((o) => ({ value: o.value, label: o.textContent?.trim() || o.value }));
      descriptors.push(descriptor(fid, label, type, options));
      continue;
    }

    if (el instanceof HTMLTextAreaElement) {
      const label = getLabel(el);
      if (!label) continue;
      const fid = assignFid(el);
      registry.set(fid, { kind: 'input', el });
      descriptors.push(descriptor(fid, label, 'textarea'));
      continue;
    }

    // HTMLInputElement
    const type = inputFieldType(el);
    if (!type) continue;

    if (type === 'radio') {
      const name = el.name;
      if (!name || seenRadioGroups.has(name)) continue;
      seenRadioGroups.add(name);
      const els = Array.from(
        el.form
          ? el.form.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(name)}"]`)
          : document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(name)}"]`),
      );
      const label = getLabel(el) || humanizeIdentifier(name);
      const fid = assignFid(els[0]);
      registry.set(fid, { kind: 'radio', els });
      const options = els.map((r) => ({ value: r.value, label: getOptionLabel(r) }));
      descriptors.push(descriptor(fid, label, 'radio', options));
      continue;
    }

    if (type === 'checkbox') {
      const label = getOptionLabel(el) || getLabel(el);
      if (!label) continue;
      const fid = assignFid(el);
      registry.set(fid, { kind: 'checkbox', el });
      descriptors.push(descriptor(fid, label, 'checkbox'));
      continue;
    }

    const label = getLabel(el);
    if (!label) continue;
    const fid = assignFid(el);
    registry.set(fid, { kind: 'input', el });
    descriptors.push(descriptor(fid, label, type));
  }

  return descriptors;
}

function descriptor(
  fieldId: string,
  questionRaw: string,
  fieldType: FieldType,
  options?: { value: string; label: string }[],
): FieldDescriptor {
  return {
    fieldId,
    questionRaw,
    questionNorm: normalizeQuestion(questionRaw),
    fieldType,
    options,
  };
}

// ---- Value read (for capture) -------------------------------------------

function readValue(reg: Registered): { value: FieldValue; label?: string } | null {
  switch (reg.kind) {
    case 'input':
      return { value: reg.el.value };
    case 'contenteditable':
      return { value: reg.el.textContent?.trim() ?? '' };
    case 'checkbox':
      return { value: reg.el.checked };
    case 'radio': {
      const chosen = reg.els.find((r) => r.checked);
      if (!chosen) return null;
      return { value: chosen.value, label: getOptionLabel(chosen) };
    }
    case 'select': {
      if (reg.el.multiple) {
        const vals = Array.from(reg.el.selectedOptions).map((o) => o.value);
        const labels = Array.from(reg.el.selectedOptions)
          .map((o) => o.textContent?.trim() || o.value)
          .join(', ');
        return { value: vals, label: labels };
      }
      const opt = reg.el.selectedOptions[0];
      if (!opt || opt.value === '') return null;
      return { value: opt.value, label: opt.textContent?.trim() || opt.value };
    }
  }
}

function fieldTypeOf(reg: Registered): FieldType {
  switch (reg.kind) {
    case 'checkbox':
      return 'checkbox';
    case 'radio':
      return 'radio';
    case 'contenteditable':
      return 'contenteditable';
    case 'select':
      return reg.el.multiple ? 'multiselect' : 'select';
    case 'input':
      if (reg.el instanceof HTMLTextAreaElement) return 'textarea';
      return inputFieldType(reg.el as HTMLInputElement) ?? 'text';
  }
}

// ---- Capture ------------------------------------------------------------

const captureTimers = new Map<string, number>();

function fidForElement(el: EventTarget | null): string | null {
  if (!(el instanceof HTMLElement)) return null;
  const own = el.getAttribute(FID_ATTR);
  if (own) return own;
  // Radios are registered on the first radio of the group.
  if (el instanceof HTMLInputElement && el.type === 'radio' && el.name) {
    for (const [fid, reg] of registry) {
      if (reg.kind === 'radio' && reg.els.includes(el)) return fid;
    }
  }
  return null;
}

function captureFrom(fid: string): void {
  const reg = registry.get(fid);
  if (!reg) return;
  const read = readValue(reg);
  if (!read) return;
  const label = getRegLabel(reg);
  void sendMessageSafe({
    type: 'capture',
    payload: {
      questionRaw: label,
      questionNorm: normalizeQuestion(label),
      fieldType: fieldTypeOf(reg),
      value: read.value,
      label: read.label,
      domain: DOMAIN,
    },
  });
}

function getRegLabel(reg: Registered): string {
  switch (reg.kind) {
    case 'radio':
      return getLabel(reg.els[0]) || humanizeIdentifier(reg.els[0].name);
    case 'checkbox':
      return getOptionLabel(reg.el) || getLabel(reg.el);
    default:
      return getLabel(reg.el as HTMLElement);
  }
}

function onCaptureEvent(e: Event, debounce: boolean): void {
  if (suppressCapture) return;
  const fid = fidForElement(e.target);
  if (!fid) return;
  if (debounce) {
    const existing = captureTimers.get(fid);
    if (existing) clearTimeout(existing);
    captureTimers.set(fid, window.setTimeout(() => captureFrom(fid), 800));
  } else {
    captureFrom(fid);
  }
}

document.addEventListener('change', (e) => onCaptureEvent(e, false), true);
document.addEventListener('input', (e) => onCaptureEvent(e, true), true);
document.addEventListener(
  'blur',
  (e) => {
    const fid = fidForElement(e.target);
    if (fid && captureTimers.has(fid)) {
      clearTimeout(captureTimers.get(fid));
      captureTimers.delete(fid);
      onCaptureEvent(e, false);
    }
  },
  true,
);

// ---- Autofill -----------------------------------------------------------

function applyInstruction(instr: FillInstruction): boolean {
  const reg = registry.get(instr.fieldId);
  if (!reg) return false;

  switch (reg.kind) {
    case 'input': {
      const el = reg.el;
      const prev = el.value;
      if (typeof instr.value !== 'string') return false;
      setTextValue(el, instr.value);
      previousValues.set(instr.fieldId, () => setTextValue(el, prev));
      return true;
    }
    case 'contenteditable': {
      const el = reg.el;
      const prev = el.textContent ?? '';
      if (typeof instr.value !== 'string') return false;
      setContentEditable(el, instr.value);
      previousValues.set(instr.fieldId, () => setContentEditable(el, prev));
      return true;
    }
    case 'checkbox': {
      const el = reg.el;
      const prev = el.checked;
      if (typeof instr.value !== 'boolean') return false;
      setCheckbox(el, instr.value);
      previousValues.set(instr.fieldId, () => setCheckbox(el, prev));
      return true;
    }
    case 'select': {
      const el = reg.el;
      if (typeof instr.value !== 'string') return false;
      const prev = el.value;
      if (!Array.from(el.options).some((o) => o.value === instr.value)) return false;
      setSelectValue(el, instr.value);
      previousValues.set(instr.fieldId, () => setSelectValue(el, prev));
      return true;
    }
    case 'radio': {
      const target = reg.els.find((r) => r.value === instr.value);
      if (!target) return false;
      const prevChecked = reg.els.find((r) => r.checked);
      setRadio(target);
      previousValues.set(instr.fieldId, () => {
        target.checked = false;
        if (prevChecked) setRadio(prevChecked);
      });
      return true;
    }
  }
}

async function runAutofill(): Promise<void> {
  const descriptors = scanFields().filter((d) => !filledFieldIds.has(d.fieldId));
  if (descriptors.length === 0) return;

  const res = await sendMessageSafe<{ payload: { instructions: FillInstruction[] } }>({
    type: 'matchRequest',
    payload: { domain: DOMAIN, fields: descriptors },
  });
  const instructions = res?.payload?.instructions ?? [];
  if (instructions.length === 0) return;

  suppressCapture = true;
  const applied: FillInstruction[] = [];
  for (const instr of instructions) {
    // Don't overwrite a field the user has already filled in themselves.
    if (fieldHasUserValue(instr.fieldId)) continue;
    if (applyInstruction(instr)) {
      filledFieldIds.add(instr.fieldId);
      applied.push(instr);
    }
  }
  // Release capture suppression after events settle.
  window.setTimeout(() => {
    suppressCapture = false;
  }, 50);

  if (applied.length > 0) {
    void sendMessageSafe({
      type: 'recordFilled',
      payload: { domain: DOMAIN, instructions: applied },
    });
  }
}

function fieldHasUserValue(fid: string): boolean {
  const reg = registry.get(fid);
  if (!reg) return false;
  const read = readValue(reg);
  if (!read) return false;
  if (typeof read.value === 'string') return read.value.trim() !== '';
  if (typeof read.value === 'boolean') return read.value;
  if (Array.isArray(read.value)) return read.value.length > 0;
  return false;
}

// ---- Undo (messaged from the side panel) --------------------------------

chrome.runtime.onMessage.addListener((msg: { type?: string; fieldId?: string }) => {
  if (msg?.type === 'undoFill' && msg.fieldId) {
    const revert = previousValues.get(msg.fieldId);
    if (revert) {
      suppressCapture = true;
      revert();
      filledFieldIds.delete(msg.fieldId);
      window.setTimeout(() => (suppressCapture = false), 50);
    }
  } else if (msg?.type === 'undoAll') {
    suppressCapture = true;
    for (const revert of previousValues.values()) revert();
    previousValues.clear();
    filledFieldIds.clear();
    window.setTimeout(() => (suppressCapture = false), 50);
  }
});

// ---- Bootstrap + SPA observation ----------------------------------------

let scanTimer: number | undefined;
function scheduleAutofill(delay: number): void {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => void runAutofill(), delay);
}

// Initial pass once the page settles.
scheduleAutofill(400);

// Re-scan when the DOM changes (SPA navigations, lazily rendered forms).
const observer = new MutationObserver((mutations) => {
  if (suppressCapture) return;
  const structural = mutations.some(
    (m) => m.addedNodes.length > 0 || m.removedNodes.length > 0,
  );
  if (structural) scheduleAutofill(600);
});
observer.observe(document.documentElement, { childList: true, subtree: true });
