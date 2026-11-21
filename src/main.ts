import './styles/tokens.css';
import './styles/base.css';
import './styles/screens.css';
import './styles/battle.css';

import { validateCatalog } from './data/index.ts';
import { AppShell } from './app/AppShell.ts';

validateCatalog();

const root = document.getElementById('app');
if (!root) {
  throw new Error('Root mount element #app not found');
}

const app = new AppShell(root);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    app.dispose();
  });
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
