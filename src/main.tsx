import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App.tsx';
import { ToastProvider } from './context/ToastContext.tsx';
import './index.css';

const sentryDsn = import.meta.env.VITE_SENTRY_DSN || 'https://da0381551a812832c76704b5e10c7898@o4511997556097024.ingest.us.sentry.io/4512840588588032';

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    // Tracing
    tracesSampleRate: 1.0,
    // Session Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={({ error }) => (
        <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6 text-slate-800">
          <div className="max-w-md w-full bg-white p-6 rounded-xl shadow-lg border border-rose-200">
            <h2 className="text-lg font-bold text-rose-600 mb-2">Ocurrió un error en la aplicación</h2>
            <p className="text-sm text-slate-600 mb-4">El fallo ha sido registrado y reportado automáticamente en Sentry.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold text-sm transition cursor-pointer"
            >
              Recargar aplicación
            </button>
          </div>
        </div>
      )}
    >
      <ToastProvider>
        <App />
      </ToastProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
);

