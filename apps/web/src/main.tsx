import '@fontsource-variable/manrope/wght.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './app/App.js';
import './i18n/index.js';
import { applyThemeSettings, getStoredThemeSettings } from './shared/theme.js';
import './styles/global.css';
import './styles/ui.css';
import './styles/login-prototype-final-alignment.css';
import './styles/login-remember-checkbox-fix.css';
import './styles/public-home.css';

applyThemeSettings(getStoredThemeSettings());

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
