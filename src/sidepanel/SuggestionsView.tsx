import { useEffect, useState } from 'react';
import { sendMessage } from '@shared/messaging';
import type { FieldValue, FilledRecord } from '@shared/types';

function renderValue(value: FieldValue, label?: string): string {
  if (typeof value === 'boolean') return value ? 'checked' : 'unchecked';
  if (Array.isArray(value)) return label || value.join(', ');
  return label && label !== value ? `${value} (${label})` : value;
}

export function SuggestionsView() {
  const [tabId, setTabId] = useState<number | undefined>();
  const [records, setRecords] = useState<FilledRecord[]>([]);
  const [undone, setUndone] = useState<Set<string>>(new Set());

  async function refresh() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    setTabId(tab?.id);
    const filled = await sendMessage<FilledRecord[]>({
      type: 'getTabFilled',
      payload: { tabId: tab?.id },
    });
    setRecords(filled);
    setUndone(new Set());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function undo(fieldId: string) {
    if (tabId === undefined) return;
    await chrome.tabs.sendMessage(tabId, { type: 'undoFill', fieldId }).catch(() => {});
    setUndone((prev) => new Set(prev).add(fieldId));
  }

  async function undoAll() {
    if (tabId === undefined) return;
    await chrome.tabs.sendMessage(tabId, { type: 'undoAll' }).catch(() => {});
    setUndone(new Set(records.map((r) => r.fieldId)));
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="value-meta">
          {records.length} field{records.length === 1 ? '' : 's'} auto-filled on this tab
        </span>
        <div className="row">
          <button className="link" onClick={refresh}>
            Refresh
          </button>
          {records.length > 0 && (
            <button className="link danger" onClick={undoAll}>
              Undo all
            </button>
          )}
        </div>
      </div>

      {records.length === 0 && (
        <div className="empty">
          Nothing auto-filled on the current tab yet. Open a form with questions you've
          answered before, and matches will appear here.
        </div>
      )}

      {records.map((r) => {
        const isUndone = undone.has(r.fieldId);
        return (
          <div className="entry" key={r.fieldId} style={{ opacity: isUndone ? 0.5 : 1 }}>
            <div className="entry-head">
              <span className="entry-q">{r.questionRaw}</span>
              <span className="src-tag">{r.source}</span>
            </div>
            <div className="value-meta" style={{ marginTop: 4 }}>
              {renderValue(r.value, r.label)}
              <span className="chip">{Math.round(r.confidence * 100)}%</span>
            </div>
            <div style={{ textAlign: 'right', marginTop: 4 }}>
              {isUndone ? (
                <span className="value-meta">undone</span>
              ) : (
                <button className="link danger" onClick={() => undo(r.fieldId)}>
                  Undo
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
