// Shared type contracts used across the content script, service worker, and side panel.

export type FieldType =
  | 'text'
  | 'email'
  | 'url'
  | 'date'
  | 'number'
  | 'tel'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'radio'
  | 'contenteditable';

/** A serialized answer value. Booleans for checkboxes, arrays for multi-select. */
export type FieldValue = string | boolean | string[];

/** One field discovered on a page, sent from the content script for matching. */
export interface FieldDescriptor {
  /** Stable-per-page id the content script uses to locate the element again. */
  fieldId: string;
  questionRaw: string;
  questionNorm: string;
  fieldType: FieldType;
  /** For select/radio: the option labels/values available, so a match can map onto one. */
  options?: { value: string; label: string }[];
}

/** A single captured value observed for a question. */
export interface StoredValue {
  value: FieldValue;
  /** Human-readable label for select/radio values. */
  label?: string;
  count: number;
  lastUsed: number;
  domains: string[];
}

/** One question → answers record in the knowledge base. */
export interface KBEntry {
  id: string; // hash(questionNorm + fieldType)
  questionRaw: string;
  questionNorm: string;
  fieldType: FieldType;
  values: StoredValue[];
  createdAt: number;
  updatedAt: number;
}

export type DomainMode = 'all' | 'allowlist' | 'denylist';

export interface Settings {
  apiKey: string;
  model: string;
  autofillEnabled: boolean;
  captureEnabled: boolean;
  /** Score >= highThreshold → confident local match, autofilled directly. */
  highThreshold: number;
  /** Score in [floorThreshold, highThreshold) → escalate to Claude if a key is set. */
  floorThreshold: number;
  domainMode: DomainMode;
  domainList: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  model: 'claude-opus-4-8',
  autofillEnabled: true,
  captureEnabled: true,
  highThreshold: 0.82,
  floorThreshold: 0.5,
  domainMode: 'all',
  domainList: [],
};

export type MatchSource = 'exact' | 'fuzzy' | 'ai';

/** Instruction returned to the content script telling it how to fill one field. */
export interface FillInstruction {
  fieldId: string;
  value: FieldValue;
  label?: string;
  entryId: string;
  source: MatchSource;
  confidence: number;
  questionRaw: string;
}

/** A single auto-filled field recorded for the current tab (for the Suggestions view). */
export interface FilledRecord extends FillInstruction {
  filledAt: number;
  domain: string;
  applied: boolean;
}

// ---- Messaging contracts ------------------------------------------------

export interface CaptureMessage {
  type: 'capture';
  payload: {
    questionRaw: string;
    questionNorm: string;
    fieldType: FieldType;
    value: FieldValue;
    label?: string;
    domain: string;
  };
}

export interface MatchRequestMessage {
  type: 'matchRequest';
  payload: {
    domain: string;
    fields: FieldDescriptor[];
  };
}

export interface MatchResponseMessage {
  type: 'matchResponse';
  payload: {
    instructions: FillInstruction[];
  };
}

export interface RecordFilledMessage {
  type: 'recordFilled';
  payload: {
    domain: string;
    instructions: FillInstruction[];
  };
}

export interface GetSettingsMessage {
  type: 'getSettings';
}
export interface SaveSettingsMessage {
  type: 'saveSettings';
  payload: Partial<Settings>;
}
export interface GetEntriesMessage {
  type: 'getEntries';
}
export interface DeleteEntryMessage {
  type: 'deleteEntry';
  payload: { id: string };
}
export interface DeleteValueMessage {
  type: 'deleteValue';
  payload: { id: string; valueIndex: number };
}
export interface UpsertEntryMessage {
  type: 'upsertEntry';
  payload: {
    questionRaw: string;
    fieldType: FieldType;
    value: FieldValue;
    label?: string;
  };
}
export interface ClearAllMessage {
  type: 'clearAll';
}
export interface GetTabFilledMessage {
  type: 'getTabFilled';
  payload: { tabId?: number };
}

export type RuntimeMessage =
  | CaptureMessage
  | MatchRequestMessage
  | RecordFilledMessage
  | GetSettingsMessage
  | SaveSettingsMessage
  | GetEntriesMessage
  | DeleteEntryMessage
  | DeleteValueMessage
  | UpsertEntryMessage
  | ClearAllMessage
  | GetTabFilledMessage;
