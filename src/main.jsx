import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { reportError } from './errorReporting.js';
import './index.css';

// Erreurs JS non attrapées hors du rendu React (gestionnaires d'événements,
// code asynchrone) et promesses rejetées non gérées — l'ErrorBoundary ne
// couvre que les erreurs de rendu, donc ces deux écouteurs sont nécessaires
// pour que rien ne passe entre les mailles du filet.
window.addEventListener('error', (e) => {
  reportError(e.message, e.error?.stack, 'window.onerror');
});
window.addEventListener('unhandledrejection', (e) => {
  reportError(e.reason?.message || String(e.reason), e.reason?.stack, 'unhandledrejection');
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
