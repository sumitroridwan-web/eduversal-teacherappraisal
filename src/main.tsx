import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { PasswordGate } from './components/PasswordGate.tsx';
import { LanguageProvider } from './i18n/LanguageContext.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <PasswordGate>
        <App />
      </PasswordGate>
    </LanguageProvider>
  </StrictMode>,
);
