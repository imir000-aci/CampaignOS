// Background service worker: owns storage, orchestrates matching (local fuzzy + Claude
// fallback), and tracks per-tab autofill history for the Suggestions view.

import {
  type FieldDescriptor,
  type FieldValue,
  type FillInstruction,
  type KBEntry,
  type RuntimeMessage,
  type Settings,
  type StoredValue,
} from '@shared/types';
import {
  clearAll,
  deleteEntry,
  deleteValue,
  getEntries,
  getSettings,
  saveSettings,
  upsertAnswer,
} from '@shared/storage';
import { scoreCandidates } from '@shared/matching';
import { callClaudeMatch, type AiMatchField } from '@shared/anthropic';

// Open the side panel when the toolbar icon is clicked.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
chrome.runtime.onStartup?.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

// ---- Domain gating ------------------------------------------------------

function isDomainAllowed(domain: string, settings: Settings): boolean {
  if (!domain) return true;
  const listed = settings.domainList.some(
    (d) => domain === d || domain.endsWith(`.${d}`),
  );
  switch (settings.domainMode) {
    case 'allowlist':
      return listed;
    case 'denylist':
      return !listed;
    default:
      return true;
  }
}

// ---- Choice-field value resolution --------------------------------------

/** Resolve a stored value onto one of a field's available options (for select/radio). */
function resolveChoiceValue(
  stored: StoredValue,
  options?: { value: string; label: string }[],
): { value: FieldValue; label?: string } | null {
  if (!options || options.length === 0) {
    return { value: stored.value, label: stored.label };
  }
  const targets = [
    typeof stored.value === 'string' ? stored.value : '',
    stored.label ?? '',
  ]
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const match = options.find(
    (o) =>
      targets.includes(o.value.trim().toLowerCase()) ||
      targets.includes(o.label.trim().toLowerCase()),
  );
  if (!match) return null;
  return { value: match.value, label: match.label };
}

function buildInstruction(
  field: FieldDescriptor,
  entry: KBEntry,
  source: FillInstruction['source'],
  confidence: number,
): FillInstruction | null {
  const best = entry.values[0];
  if (!best) return null;

  if (field.fieldType === 'select' || field.fieldType === 'radio') {
    const resolved = resolveChoiceValue(best, field.options);
    if (!resolved) return null;
    return {
      fieldId: field.fieldId,
      value: resolved.value,
      label: resolved.label,
      entryId: entry.id,
      source,
      confidence,
      questionRaw: field.questionRaw,
    };
  }

  return {
    fieldId: field.fieldId,
    value: best.value,
    label: best.label,
    entryId: entry.id,
    source,
    confidence,
    questionRaw: field.questionRaw,
  };
}

// ---- Matching engine ----------------------------------------------------

async function runMatch(
  domain: string,
  fields: FieldDescriptor[],
): Promise<FillInstruction[]> {
  const settings = await getSettings();
  if (!settings.autofillEnabled || !isDomainAllowed(domain, settings)) return [];

  const entries = await getEntries();
  if (entries.length === 0) return [];
  const byId = new Map(entries.map((e) => [e.id, e]));
  const lite = entries.map((e) => ({
    id: e.id,
    questionNorm: e.questionNorm,
    fieldType: e.fieldType,
  }));

  const instructions: FillInstruction[] = [];
  const uncertain: { field: FieldDescriptor; batch: AiMatchField }[] = [];

  for (const field of fields) {
    const candidates = scoreCandidates(field.questionNorm, field.fieldType, lite);
    const best = candidates[0];
    if (!best) continue;

    if (best.exact || best.score >= settings.highThreshold) {
      const entry = byId.get(best.entryId);
      if (entry) {
        const instr = buildInstruction(
          field,
          entry,
          best.exact ? 'exact' : 'fuzzy',
          best.score,
        );
        if (instr) instructions.push(instr);
      }
      continue;
    }

    // Moderate confidence → queue for the Claude fallback (if a key is set).
    if (settings.apiKey && best.score >= settings.floorThreshold) {
      const topCandidates = candidates
        .filter((c) => c.score >= settings.floorThreshold)
        .slice(0, 5)
        .map((c) => {
          const e = byId.get(c.entryId)!;
          return { entryId: e.id, question: e.questionRaw };
        });
      uncertain.push({
        field,
        batch: { fieldId: field.fieldId, question: field.questionRaw, candidates: topCandidates },
      });
    }
  }

  if (uncertain.length > 0) {
    const results = await callClaudeMatch(
      settings.apiKey,
      settings.model,
      uncertain.map((u) => u.batch),
    );
    const resultByField = new Map(results.map((r) => [r.fieldId, r]));
    for (const { field } of uncertain) {
      const r = resultByField.get(field.fieldId);
      if (!r || !r.matchedEntryId || r.confidence < 0.6) continue;
      const entry = byId.get(r.matchedEntryId);
      if (!entry) continue;
      const instr = buildInstruction(field, entry, 'ai', r.confidence);
      if (instr) instructions.push(instr);
    }
  }

  return instructions;
}

// ---- Per-tab filled history (survives SW restarts via session storage) --

async function recordFilled(
  tabId: number | undefined,
  domain: string,
  instructions: FillInstruction[],
): Promise<void> {
  if (tabId === undefined) return;
  const key = `filled:${tabId}`;
  const now = Date.now();
  const records = instructions.map((i) => ({
    ...i,
    filledAt: now,
    domain,
    applied: true,
  }));
  await chrome.storage.session.set({ [key]: records });
}

async function getTabFilled(tabId: number | undefined) {
  if (tabId === undefined) return [];
  const key = `filled:${tabId}`;
  const raw = await chrome.storage.session.get(key);
  return raw[key] ?? [];
}

// Clean up per-tab history when a tab closes.
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`filled:${tabId}`).catch(() => {});
});

// ---- Message routing ----------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: RuntimeMessage, sender, sendResponse) => {
    (async () => {
      switch (message.type) {
        case 'capture': {
          const settings = await getSettings();
          const { domain } = message.payload;
          if (settings.captureEnabled && isDomainAllowed(domain, settings)) {
            await upsertAnswer(message.payload);
          }
          sendResponse({ ok: true });
          break;
        }
        case 'matchRequest': {
          const instructions = await runMatch(
            message.payload.domain,
            message.payload.fields,
          );
          sendResponse({ type: 'matchResponse', payload: { instructions } });
          break;
        }
        case 'recordFilled': {
          await recordFilled(
            sender.tab?.id,
            message.payload.domain,
            message.payload.instructions,
          );
          sendResponse({ ok: true });
          break;
        }
        case 'getSettings':
          sendResponse(await getSettings());
          break;
        case 'saveSettings':
          sendResponse(await saveSettings(message.payload));
          break;
        case 'getEntries':
          sendResponse(await getEntries());
          break;
        case 'deleteEntry':
          sendResponse(await deleteEntry(message.payload.id));
          break;
        case 'deleteValue':
          sendResponse(await deleteValue(message.payload.id, message.payload.valueIndex));
          break;
        case 'upsertEntry':
          sendResponse(await upsertAnswer(message.payload));
          break;
        case 'clearAll':
          await clearAll();
          sendResponse({ ok: true });
          break;
        case 'getTabFilled':
          sendResponse(await getTabFilled(message.payload.tabId));
          break;
        default:
          sendResponse({ ok: false, error: 'unknown message' });
      }
    })();
    return true; // keep the message channel open for the async response
  },
);
