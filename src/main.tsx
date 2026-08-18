import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { PasswordGate } from './components/PasswordGate.tsx';
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx';
import { LanguageProvider } from './i18n/LanguageContext.tsx';
import './index.css';

// The boundary sits outside the language provider and the gate so a crash in
// either is still reported rather than rendering as a blank page.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <LanguageProvider>
        <PasswordGate>
          <App />
        </PasswordGate>
      </LanguageProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
