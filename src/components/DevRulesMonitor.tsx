import React, { useState, useMemo, useEffect } from 'react';
import * as Sentry from '@sentry/react';
import { 
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  X, 
  ChevronRight,
  Terminal,
  Activity,
  Check,
  Radio
} from 'lucide-react';
import { runInternalRulesVerification, RuleCheckResult, SystemDataPayload } from '../utils/rulesChecker';

interface DevRulesMonitorProps {
  data?: SystemDataPayload;
}

export default function DevRulesMonitor({ data = {} }: DevRulesMonitorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'fail' | 'warn' | 'pass'>('all');
  const [auditTimestamp, setAuditTimestamp] = useState<number>(Date.now());
  const [isAuditing, setIsAuditing] = useState(false);
  const [sentryTestSent, setSentryTestSent] = useState(false);

  // Compute live verification results whenever data changes or when manual re-audit is triggered
  const results: RuleCheckResult[] = useMemo(() => {
    return runInternalRulesVerification(data);
  }, [data, auditTimestamp]);

  const failedRules = results.filter(r => r.status === 'fail');
  const warnedRules = results.filter(r => r.status === 'warn');
  const passedRules = results.filter(r => r.status === 'pass');

  const hasIssues = failedRules.length > 0 || warnedRules.length > 0;
  const hasCriticalFailures = failedRules.length > 0;

  const filteredResults = results.filter(r => {
    if (filter === 'fail') return r.status === 'fail';
    if (filter === 'warn') return r.status === 'warn';
    if (filter === 'pass') return r.status === 'pass';
    return true;
  });

  const handleManualReAudit = () => {
    setIsAuditing(true);
    setTimeout(() => {
      setAuditTimestamp(Date.now());
      setIsAuditing(false);
    }, 250);
  };

  return (
    <>
      {/* 
        HEADER TRIGGER:
        - Si hay fallos o advertencias: Muestra un botón de advertencia visible y parpadeante.
        - Si todo está correcto (0 fallos): Muestra un botón discreto de inspector de desarrollador.
      */}
      {hasIssues ? (
        <button
          onClick={() => setIsOpen(true)}
          className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border shadow-xs animate-pulse ${
            hasCriticalFailures 
              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/25' 
              : 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/25'
          }`}
          title="Haz clic para ver las alertas de reglas de negocio"
          id="dev-rules-alert-btn"
        >
          {hasCriticalFailures ? <ShieldAlert size={14} /> : <AlertTriangle size={14} />}
          <span className="font-mono uppercase tracking-wider text-[10px]">
            {failedRules.length > 0 ? `${failedRules.length} Regla${failedRules.length > 1 ? 's' : ''} Rota${failedRules.length > 1 ? 's' : ''}` : `${warnedRules.length} Advertencia${warnedRules.length > 1 ? 's' : ''}`}
          </span>
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="p-1.5 hover:bg-app-bg text-app-text/60 hover:text-app-text border border-app-border rounded transition flex items-center justify-center cursor-pointer min-h-[34px]"
          title="Monitor de Reglas de Negocio (Todo en orden)"
          id="dev-rules-healthy-btn"
        >
          <ShieldCheck size={14} className="text-emerald-600 dark:text-emerald-400" />
        </button>
      )}

      {/* DIAGNOSTIC MODAL / SLIDE PANEL */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn no-print">
          <div className="bg-app-surface text-app-text border border-app-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-scaleUp">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-app-border flex items-center justify-between bg-app-bg/50">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${hasCriticalFailures ? 'bg-rose-500/10 text-rose-600' : hasIssues ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
                  {hasCriticalFailures ? <ShieldAlert size={22} /> : hasIssues ? <AlertTriangle size={22} /> : <ShieldCheck size={22} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-bold text-app-text tracking-tight">
                      Monitor de Reglas del Sistema (Dev)
                    </h3>
                    <span className="text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-app-surface border border-app-border text-app-text/70">
                      En Vivo
                    </span>
                  </div>
                  <p className="text-xs text-app-text/60 mt-0.5">
                    Auditoría matemática de cortes, balances de packing lists e integridad de stock.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleManualReAudit}
                  disabled={isAuditing}
                  className="p-2 text-app-text/60 hover:text-app-text hover:bg-app-bg rounded-lg transition border border-transparent hover:border-app-border cursor-pointer disabled:opacity-50"
                  title="Re-ejecutar diagnóstico"
                >
                  <RefreshCw size={15} className={isAuditing ? 'animate-spin text-app-primary' : ''} />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-app-text/60 hover:text-app-text hover:bg-app-bg rounded-lg transition border border-transparent hover:border-app-border cursor-pointer"
                  title="Cerrar monitor"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Status Summary Banner */}
            <div className="px-5 py-3 border-b border-app-border bg-app-surface flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                  <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                  <span className="text-app-text/70">Aprobados:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{passedRules.length}</span>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                  <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                  <span className="text-app-text/70">Advertencias:</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">{warnedRules.length}</span>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                  <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                  <span className="text-app-text/70">Fallos:</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">{failedRules.length}</span>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 bg-app-bg p-1 rounded-lg border border-app-border text-[11px]">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-2.5 py-1 rounded font-medium transition cursor-pointer ${filter === 'all' ? 'bg-app-surface text-app-text shadow-xs font-bold' : 'text-app-text/60 hover:text-app-text'}`}
                >
                  Todos ({results.length})
                </button>
                {failedRules.length > 0 && (
                  <button
                    onClick={() => setFilter('fail')}
                    className={`px-2.5 py-1 rounded font-medium transition cursor-pointer ${filter === 'fail' ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold' : 'text-rose-600/70 hover:text-rose-600'}`}
                  >
                    Fallos ({failedRules.length})
                  </button>
                )}
                {warnedRules.length > 0 && (
                  <button
                    onClick={() => setFilter('warn')}
                    className={`px-2.5 py-1 rounded font-medium transition cursor-pointer ${filter === 'warn' ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold' : 'text-amber-600/70 hover:text-amber-600'}`}
                  >
                    Advertencias ({warnedRules.length})
                  </button>
                )}
                <button
                  onClick={() => setFilter('pass')}
                  className={`px-2.5 py-1 rounded font-medium transition cursor-pointer ${filter === 'pass' ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold' : 'text-emerald-600/70 hover:text-emerald-600'}`}
                >
                  Correctos ({passedRules.length})
                </button>
              </div>
            </div>

            {/* List of Verified Rules */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              {filteredResults.length === 0 ? (
                <div className="text-center py-8 text-app-text/50 font-mono text-xs">
                  No hay reglas en esta categoría de filtro.
                </div>
              ) : (
                filteredResults.map(rule => (
                  <div
                    key={rule.id}
                    className={`p-3.5 sm:p-4 rounded-lg border transition ${
                      rule.status === 'fail'
                        ? 'bg-rose-500/5 border-rose-500/30'
                        : rule.status === 'warn'
                        ? 'bg-amber-500/5 border-amber-500/30'
                        : 'bg-app-bg/50 border-app-border/70 hover:border-app-border'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="mt-0.5 shrink-0">
                          {rule.status === 'fail' && <XCircle size={16} className="text-rose-600 dark:text-rose-400" />}
                          {rule.status === 'warn' && <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />}
                          {rule.status === 'pass' && <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-app-text">
                              {rule.name}
                            </span>
                            <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-app-surface border border-app-border text-app-text/60">
                              {rule.category}
                            </span>
                          </div>
                          <p className="text-[11px] text-app-text/60 mt-0.5 leading-relaxed">
                            {rule.description}
                          </p>
                        </div>
                      </div>

                      <span className="text-[9px] font-mono text-app-text/40 shrink-0">
                        {rule.timestamp}
                      </span>
                    </div>

                    {/* Result message & details */}
                    <div className={`mt-2.5 p-2.5 rounded text-xs font-mono ${
                      rule.status === 'fail'
                        ? 'bg-rose-500/10 text-rose-800 dark:text-rose-300 border border-rose-500/20'
                        : rule.status === 'warn'
                        ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20'
                        : 'bg-app-surface text-app-text/80 border border-app-border/50'
                    }`}>
                      <p className="font-sans text-[11px]">{rule.message}</p>
                      {rule.details && (
                        <p className="mt-1 text-[10px] text-app-text/60 border-t border-current/10 pt-1">
                          <strong>Detalle técnico:</strong> {rule.details}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 border-t border-app-border bg-app-bg/50 flex items-center justify-between text-xs text-app-text/60 gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 font-mono text-[10px]">
                  <Terminal size={12} />
                  <span>Auditoría en memoria</span>
                </div>

                <button
                  onClick={() => {
                    try {
                      Sentry.captureMessage('Prueba manual de Sentry desde Juditex WMS', 'info');
                      Sentry.captureException(new Error('¡Prueba de error en Sentry - Juditex WMS!'));
                      setSentryTestSent(true);
                      setTimeout(() => setSentryTestSent(false), 4000);
                    } catch (err) {
                      console.error('Error enviando evento a Sentry:', err);
                    }
                  }}
                  className="px-2.5 py-1 bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/30 text-purple-700 dark:text-purple-300 rounded font-semibold text-[11px] flex items-center gap-1.5 transition cursor-pointer"
                  title="Envía una excepción y un mensaje de prueba al panel de Sentry"
                  id="btn-test-sentry"
                >
                  <Radio size={12} className={sentryTestSent ? "text-emerald-500 animate-pulse" : "text-purple-600 dark:text-purple-400"} />
                  {sentryTestSent ? '¡Error enviado a Sentry!' : 'Probar Alerta Sentry'}
                </button>
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-1.5 bg-app-primary hover:bg-app-primary/90 text-white font-medium rounded-md text-xs transition cursor-pointer"
              >
                Cerrar Panel
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
