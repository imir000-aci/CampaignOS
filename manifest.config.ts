import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'CampaignOS Form Autofill',
  description:
    'Captures answers you enter into web forms and intelligently autofills future forms with the same or similar questions.',
  version: '0.1.0',
  minimum_chrome_version: '114',
  permissions: ['storage', 'sidePanel', 'tabs', 'scripting'],
  host_permissions: ['<all_urls>'],
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/collector.ts'],
      run_at: 'document_idle',
      all_frames: true,
    },
  ],
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  action: {
    default_title: 'CampaignOS Form Autofill',
  },
  icons: {
    '16': 'icons/icon-16.png',
    '32': 'icons/icon-32.png',
    '48': 'icons/icon-48.png',
    '128': 'icons/icon-128.png',
  },
});
