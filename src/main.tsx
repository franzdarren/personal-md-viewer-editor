import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource-variable/source-serif-4/opsz.css';
import '@fontsource-variable/source-serif-4/opsz-italic.css';

import './styles/markdown.css';
import './styles/app.css';

import { App } from './App';
import { bootstrap } from './bootstrap';

const boot = bootstrap();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App boot={boot} />
  </StrictMode>,
);
