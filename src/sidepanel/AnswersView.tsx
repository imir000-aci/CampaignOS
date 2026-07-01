import { useEffect, useMemo, useState } from 'react';
import { sendMessage } from '@shared/messaging';
import type { FieldType, FieldValue, KBEntry } from '@shared/types';

function renderValue(value: FieldValue, label?: string): string {
  if (typeof value === 'boolean') return value ? 'checked' : 'unchecked';
  if (Array.isArray(value)) return label || value.join(', ');
  return label && label !== value ? `${value} (${label})` : value;
}

const MANUAL_TYPES: FieldType[] = [
  'text',
  'email',
  'url',
  'date',
  'number',
  'tel',
  'textarea',
  'select',
  'radio',
];

export function AnswersView() {
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ question: '', value: '', fieldType: 'text' as FieldType });

  async function refresh() {
    setEntries(await sendMessage<KBEntry[]>({ type: 'getEntries' }));
  }

  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? entries.filter((e) => e.questionRaw.toLowerCase().includes(q))
      : entries;
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [entries, query]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function removeEntry(id: string) {
    setEntries(await sendMessage<KBEntry[]>({ type: 'deleteEntry', payload: { id } }));
  }

  async function removeValue(id: string, valueIndex: number) {
    setEntries(
      await sendMessage<KBEntry[]>({
        type: 'deleteValue',
        payload: { id, valueIndex },
      }),
    );
  }

  async function saveDraft() {
    if (!draft.question.trim() || !draft.value.trim()) return;
    await sendMessage({
      type: 'upsertEntry',
      payload: {
        questionRaw: draft.question.trim(),
        fieldType: draft.fieldType,
        value: draft.value.trim(),
      },
    });
    setDraft({ question: '', value: '', fieldType: 'text' });
    setAdding(false);
    await refresh();
  }

  return (
    <div>
      <input
        className="search"
        placeholder="Search saved questions…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="value-meta">
          {entries.length} saved question{entries.length === 1 ? '' : 's'}
        </span>
        <button className="link" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Cancel' : '+ Add answer'}
        </button>
      </div>

      {adding && (
        <div className="entry">
          <div className="field">
            <label>Question / label</label>
            <input
              type="text"
              value={draft.question}
              onChange={(e) => setDraft({ ...draft, question: e.target.value })}
              placeholder="e.g. What is your email address?"
            />
          </div>
          <div className="field">
            <label>Answer</label>
            <input
              type="text"
              value={draft.value}
              onChange={(e) => setDraft({ ...draft, value: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Field type</label>
            <select
              value={draft.fieldType}
              onChange={(e) =>
                setDraft({ ...draft, fieldType: e.target.value as FieldType })
              }
            >
              {MANUAL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <button className="btn" onClick={saveDraft}>
            Save
          </button>
        </div>
      )}

      {filtered.length === 0 && !adding && (
        <div className="empty">
          No saved answers yet. Fill in a form on any page and your answers will appear
          here.
        </div>
      )}

      {filtered.map((e) => {
        const open = expanded.has(e.id);
        return (
          <div className="entry" key={e.id}>
            <div className="entry-head">
              <span className="entry-q" onClick={() => toggle(e.id)}>
                {e.questionRaw}
              </span>
              <span className="entry-type">{e.fieldType}</span>
            </div>
            {open ? (
              <>
                {e.values.map((v, i) => (
                  <div className="value-row" key={i}>
                    <div>
                      <div className="value-text">{renderValue(v.value, v.label)}</div>
                      <div className="value-meta">
                        used {v.count}×{v.domains.length > 0 ? ` · ${v.domains.join(', ')}` : ''}
                      </div>
                    </div>
                    <button className="link danger" onClick={() => removeValue(e.id, i)}>
                      Delete
                    </button>
                  </div>
                ))}
                <div style={{ marginTop: 6, textAlign: 'right' }}>
                  <button className="link danger" onClick={() => removeEntry(e.id)}>
                    Delete question
                  </button>
                </div>
              </>
            ) : (
              <div className="value-meta" style={{ marginTop: 4 }}>
                {renderValue(e.values[0]?.value ?? '', e.values[0]?.label)}
                {e.values.length > 1 && (
                  <span className="chip">+{e.values.length - 1} more</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
