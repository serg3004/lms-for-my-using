import '@fontsource-variable/manrope/wght.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './app/App.js';
import { ProtectedRoute } from './app/ProtectedRoute.js';
import './i18n/index.js';
import { applyThemeSettings, getStoredThemeSettings } from './shared/theme.js';
import './styles/global.css';
import './styles/ui.css';

applyThemeSettings(getStoredThemeSettings());

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <ProtectedRoute protectedPathPrefixes={['/admin', '/learn']}>
        <App />
      </ProtectedRoute>
    </BrowserRouter>
  </React.StrictMode>,
);
