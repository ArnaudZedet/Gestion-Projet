import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { reportError } from './errorReporting.js';
import { supabase } from './supabaseClient.js';
import './index.css';

// Le rafraîchissement automatique de la session Supabase se met en pause
// quand l'onglet passe en arrière-plan (économie de batterie du
// navigateur) — sur un onglet resté ouvert toute la journée ou après la
// mise en veille de l'ordinateur, ça laissait la session expirer sans se
// renouveler, d'où le message "problème de connexion" au moment
// d'enregistrer. Pattern recommandé par Supabase : relancer/mettre en
// pause explicitement selon la visibilité de l'onglet.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

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
