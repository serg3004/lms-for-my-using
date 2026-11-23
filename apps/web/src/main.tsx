import '@fontsource-variable/manrope/wght.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './app/App.js';
import './i18n/index.js';
import { listenForInstallOffer, registerServiceWorker } from './shared/pwa.js';
import { SelectPopup } from './shared/SelectPopup.js';
import { applyThemeSettings, getStoredThemeSettings } from './shared/theme.js';
import { initThemeMode } from './shared/themeMode.js';
import './styles/index.css';

applyThemeSettings(getStoredThemeSettings());
initThemeMode();
listenForInstallOffer();
registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <SelectPopup />
    </BrowserRouter>
  </React.StrictMode>,
);
