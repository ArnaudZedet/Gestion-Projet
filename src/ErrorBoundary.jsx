import React from 'react';
import { reportError } from './errorReporting';

// Filet de sécurité pour les erreurs de rendu React : sans lui, une erreur
// dans un composant fait disparaître toute l'app (écran blanc), sans aucune
// indication pour l'utilisateur ni remontée vers les managers.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    reportError(error?.message || String(error), error?.stack, info?.componentStack || 'React render');
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 15, color: '#334155', maxWidth: 360 }}>
            Une erreur inattendue s'est produite. L'équipe technique a été prévenue automatiquement.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer' }}
          >
            Recharger la page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
