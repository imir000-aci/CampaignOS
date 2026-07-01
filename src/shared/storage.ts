// Single owner of chrome.storage.local. The knowledge base and settings are read and
// written only through here (the service worker calls these; UI/content go via messaging).

import {
  DEFAULT_SETTINGS,
  type FieldType,
  type FieldValue,
  type KBEntry,
  type Settings,
  type StoredValue,
} from './types';
import { normalizeQuestion } from './normalize';

const KB_KEY = 'kb';
const SETTINGS_KEY = 'settings';

/** Stable id for an entry from its normalized question + field type. */
export function entryId(questionNorm: string, fieldType: FieldType): string {
  const input = `${fieldType}::${questionNorm}`;
  // Small, dependency-free 32-bit FNV-1a hash rendered as hex.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export async function getSettings(): Promise<Settings> {
  const raw = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(raw[SETTINGS_KEY] ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function getEntries(): Promise<KBEntry[]> {
  const raw = await chrome.storage.local.get(KB_KEY);
  return (raw[KB_KEY] as KBEntry[] | undefined) ?? [];
}

async function setEntries(entries: KBEntry[]): Promise<void> {
  await chrome.storage.local.set({ [KB_KEY]: entries });
}

function valuesEqual(a: FieldValue, b: FieldValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

/**
 * Upsert a captured (or manually added) answer. Merges into an existing entry when the
 * question+type already exist, tracking per-value frequency and recency.
 */
export async function upsertAnswer(input: {
  questionRaw: string;
  fieldType: FieldType;
  value: FieldValue;
  label?: string;
  domain?: string;
}): Promise<KBEntry[]> {
  const questionNorm = normalizeQuestion(input.questionRaw);
  if (!questionNorm) return getEntries();

  // Ignore effectively-empty values.
  if (typeof input.value === 'string' && input.value.trim() === '') return getEntries();
  if (Array.isArray(input.value) && input.value.length === 0) return getEntries();

  const entries = await getEntries();
  const id = entryId(questionNorm, input.fieldType);
  const now = Date.now();
  const domain = input.domain ?? '';

  let entry = entries.find((e) => e.id === id);
  if (!entry) {
    entry = {
      id,
      questionRaw: input.questionRaw,
      questionNorm,
      fieldType: input.fieldType,
      values: [],
      createdAt: now,
      updatedAt: now,
    };
    entries.push(entry);
  }

  const existing = entry.values.find((v) => valuesEqual(v.value, input.value));
  if (existing) {
    existing.count += 1;
    existing.lastUsed = now;
    if (input.label) existing.label = input.label;
    if (domain && !existing.domains.includes(domain)) existing.domains.push(domain);
  } else {
    const sv: StoredValue = {
      value: input.value,
      label: input.label,
      count: 1,
      lastUsed: now,
      domains: domain ? [domain] : [],
    };
    entry.values.push(sv);
  }
  entry.updatedAt = now;
  // Keep the most useful value first: highest count, then most recent.
  entry.values.sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed);

  await setEntries(entries);
  return entries;
}

export async function deleteEntry(id: string): Promise<KBEntry[]> {
  const entries = (await getEntries()).filter((e) => e.id !== id);
  await setEntries(entries);
  return entries;
}

export async function deleteValue(id: string, valueIndex: number): Promise<KBEntry[]> {
  const entries = await getEntries();
  const entry = entries.find((e) => e.id === id);
  if (entry) {
    entry.values.splice(valueIndex, 1);
    entry.updatedAt = Date.now();
  }
  // Drop entries that have no values left.
  const pruned = entries.filter((e) => e.values.length > 0);
  await setEntries(pruned);
  return pruned;
}

export async function clearAll(): Promise<void> {
  await chrome.storage.local.remove(KB_KEY);
}
