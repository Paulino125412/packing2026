import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App.tsx';
import { ToastProvider } from './context/ToastContext.tsx';
import './index.css';

const sentryDsn = import.meta.env.VITE_SENTRY_DSN || 'https://da0301551a812032c76704b5e10c7090@o4511997556097024.ingest.us.sentry.io/4512040508588032';

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    tunnel: '/api/sentry-tunnel',
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
      handled={false}
      beforeCapture={(scope) => {
        scope.setLevel('fatal');
      }}
      fallback={({ error, eventId }) => (
        <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6 text-slate-800">
          <div className="max-w-md w-full bg-white p-6 rounded-xl shadow-lg border border-rose-200">
            <h2 className="text-lg font-bold text-rose-600 mb-2">Ocurrió un error en la aplicación</h2>
            <p className="text-sm text-slate-600 mb-2">El fallo ha sido registrado y reportado automáticamente en Sentry.</p>
            {eventId && (
              <p className="text-[11px] font-mono text-slate-500 bg-slate-50 p-2 rounded border border-slate-200 mb-4">
                ID de Incidencia: {eventId}
              </p>
            )}
            {error && (
              <pre className="text-xs text-rose-700 bg-rose-50/70 p-2.5 rounded border border-rose-100 mb-4 overflow-x-auto">
                {error.toString()}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold text-sm transition cursor-pointer"
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

