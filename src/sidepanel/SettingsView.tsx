import { useEffect, useState } from 'react';
import { sendMessage } from '@shared/messaging';
import { DEFAULT_SETTINGS, type KBEntry, type Settings } from '@shared/types';

const MODELS = [
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 (most capable)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (fastest / cheapest)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (balanced)' },
];

export function SettingsView() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      setSettings(await sendMessage<Settings>({ type: 'getSettings' }));
    })();
  }, []);

  async function patch(update: Partial<Settings>) {
    const next = await sendMessage<Settings>({
      type: 'saveSettings',
      payload: update,
    });
    setSettings(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  }

  async function exportData() {
    const entries = await sendMessage<KBEntry[]>({ type: 'getEntries' });
    const blob = new Blob([JSON.stringify(entries, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'campaignos-answers.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function clearAll() {
    if (!confirm('Delete all saved answers? This cannot be undone.')) return;
    await sendMessage({ type: 'clearAll' });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  }

  return (
    <div>
      <div className="field">
        <label>
          <input
            type="checkbox"
            checked={settings.captureEnabled}
            onChange={(e) => patch({ captureEnabled: e.target.checked })}
          />{' '}
          Capture answers as I fill forms
        </label>
      </div>
      <div className="field">
        <label>
          <input
            type="checkbox"
            checked={settings.autofillEnabled}
            onChange={(e) => patch({ autofillEnabled: e.target.checked })}
          />{' '}
          Auto-fill matching fields on page load
        </label>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '14px 0' }} />

      <div className="field">
        <label>Claude API key (optional)</label>
        <input
          type="password"
          placeholder="sk-ant-…"
          value={settings.apiKey}
          onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
          onBlur={(e) => patch({ apiKey: e.target.value.trim() })}
        />
        <div className="hint">
          Enables semantic matching for reworded questions. Without a key, matching runs
          fully offline. Only field labels are ever sent — never your answers.
        </div>
      </div>

      <div className="field">
        <label>Model (semantic fallback)</label>
        <select
          value={settings.model}
          onChange={(e) => patch({ model: e.target.value })}
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Confident-match threshold: {settings.highThreshold.toFixed(2)}</label>
        <input
          type="range"
          min={0.6}
          max={0.98}
          step={0.02}
          value={settings.highThreshold}
          onChange={(e) => patch({ highThreshold: Number(e.target.value) })}
        />
        <div className="hint">
          Fields scoring at or above this are auto-filled directly (no API call).
        </div>
      </div>

      <div className="field">
        <label>AI-fallback floor: {settings.floorThreshold.toFixed(2)}</label>
        <input
          type="range"
          min={0.2}
          max={0.8}
          step={0.02}
          value={settings.floorThreshold}
          onChange={(e) => patch({ floorThreshold: Number(e.target.value) })}
        />
        <div className="hint">
          Fields between the floor and the confident threshold are sent to Claude (if a
          key is set).
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '14px 0' }} />

      <div className="field">
        <label>Domain scope</label>
        <select
          value={settings.domainMode}
          onChange={(e) =>
            patch({ domainMode: e.target.value as Settings['domainMode'] })
          }
        >
          <option value="all">Run on all sites</option>
          <option value="allowlist">Only listed sites</option>
          <option value="denylist">All sites except listed</option>
        </select>
      </div>

      {settings.domainMode !== 'all' && (
        <div className="field">
          <label>Domains (one per line)</label>
          <textarea
            rows={4}
            value={settings.domainList.join('\n')}
            onChange={(e) =>
              setSettings({
                ...settings,
                domainList: e.target.value.split('\n').map((s) => s.trim()),
              })
            }
            onBlur={(e) =>
              patch({
                domainList: e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="example.com"
          />
        </div>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '14px 0' }} />

      <div className="row" style={{ gap: 8 }}>
        <button className="btn secondary" onClick={exportData}>
          Export data
        </button>
        <button className="btn secondary" onClick={clearAll}>
          Clear all data
        </button>
      </div>

      {saved && (
        <div className="value-meta" style={{ marginTop: 10 }}>
          Saved ✓
        </div>
      )}
    </div>
  );
}
