import { useState } from 'react';
import { AnswersView } from './AnswersView';
import { SuggestionsView } from './SuggestionsView';
import { SettingsView } from './SettingsView';

type Tab = 'answers' | 'suggestions' | 'settings';

export function App() {
  const [tab, setTab] = useState<Tab>('answers');

  return (
    <div className="app">
      <header className="app-header">
        <h1>CampaignOS Form Autofill</h1>
        <nav className="tabs">
          <button
            className={`tab ${tab === 'answers' ? 'active' : ''}`}
            onClick={() => setTab('answers')}
          >
            Answers
          </button>
          <button
            className={`tab ${tab === 'suggestions' ? 'active' : ''}`}
            onClick={() => setTab('suggestions')}
          >
            Suggestions
          </button>
          <button
            className={`tab ${tab === 'settings' ? 'active' : ''}`}
            onClick={() => setTab('settings')}
          >
            Settings
          </button>
        </nav>
      </header>
      <main className="content">
        {tab === 'answers' && <AnswersView />}
        {tab === 'suggestions' && <SuggestionsView />}
        {tab === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}
