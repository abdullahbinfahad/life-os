import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './lib/themes.css';
import { initAuth } from './lib/auth';

class RootErrorBoundary extends React.Component<React.PropsWithChildren, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('The Life Circle app failed to render.', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main role="alert" aria-labelledby="startup-error-title" style={{ minHeight: '100svh', boxSizing: 'border-box', padding: 'max(2rem, env(safe-area-inset-top)) max(1.25rem, env(safe-area-inset-right)) max(2rem, env(safe-area-inset-bottom)) max(1.25rem, env(safe-area-inset-left))', display: 'grid', placeItems: 'center', background: '#0b0d12', color: '#f4f5f8', fontFamily: 'Inter, system-ui, sans-serif' }}>
          <section style={{ width: 'min(100%, 34rem)' }}>
            <h1 id="startup-error-title">Life Circle couldn’t start</h1>
            <p>Something went wrong while opening the app. Reload to try again.</p>
            <button type="button" onClick={() => window.location.reload()} style={{ minHeight: 44, padding: '0.7rem 1.1rem', border: 0, borderRadius: 10, background: '#7168ff', color: 'white', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}>
              Reload app
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

function RootCommitted() {
  useEffect(() => {
    document.getElementById('public-seo-fallback')?.setAttribute('hidden', '');
  }, []);
  return <RootErrorBoundary><App /></RootErrorBoundary>;
}

initAuth();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch((error) => {
      console.warn('Offline app-shell caching is unavailable in this browser.', error);
    });
  }, { once: true });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootCommitted />
  </React.StrictMode>,
);
