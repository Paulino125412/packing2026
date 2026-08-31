import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { 
  CheckCircle2, 
  ShieldAlert, 
  AlertCircle, 
  Info, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Copy, 
  Check, 
  Sparkles, 
  HelpCircle,
  Wrench,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeSystemError, DiagnosticResult } from '../lib/diagnostics';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  id?: string;
  title?: string;
  rootCause?: string;
  solution?: string;
  technicalDetails?: string;
  duration?: number; // ms, 0 = infinite until closed
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface ToastItem extends ToastOptions {
  id: string;
  type: ToastType;
  message: string;
  createdAt: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  showToast: (type: ToastType, message: string, options?: ToastOptions) => string;
  success: (message: string, options?: ToastOptions) => string;
  error: (message: string, options?: ToastOptions) => string;
  warning: (message: string, options?: ToastOptions) => string;
  info: (message: string, options?: ToastOptions) => string;
  diagnose: (rawError: unknown, context?: { action?: string; entity?: string; additionalInfo?: string }) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idCounter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const showToast = useCallback((type: ToastType, message: string, options?: ToastOptions): string => {
    const id = options?.id || `toast-${Date.now()}-${++idCounter.current}`;
    
    // Determine auto-dismiss duration based on importance
    let duration = options?.duration;
    if (duration === undefined) {
      if (type === 'error' || options?.rootCause || options?.solution) {
        duration = 9000; // 9 seconds for diagnostic errors so user has time to read
      } else if (type === 'warning') {
        duration = 6000;
      } else {
        duration = 4000;
      }
    }

    const newToast: ToastItem = {
      id,
      type,
      message,
      title: options?.title,
      rootCause: options?.rootCause,
      solution: options?.solution,
      technicalDetails: options?.technicalDetails,
      duration,
      action: options?.action,
      createdAt: Date.now()
    };

    setToasts(prev => [newToast, ...prev.slice(0, 4)]); // Keep maximum 5 active toasts

    if (duration > 0) {
      setTimeout(() => {
        dismiss(id);
      }, duration);
    }

    return id;
  }, [dismiss]);

  const success = useCallback((message: string, options?: ToastOptions) => {
    return showToast('success', message, options);
  }, [showToast]);

  const error = useCallback((message: string, options?: ToastOptions) => {
    return showToast('error', message, options);
  }, [showToast]);

  const warning = useCallback((message: string, options?: ToastOptions) => {
    return showToast('warning', message, options);
  }, [showToast]);

  const info = useCallback((message: string, options?: ToastOptions) => {
    return showToast('info', message, options);
  }, [showToast]);

  const diagnose = useCallback((rawError: unknown, context?: { action?: string; entity?: string; additionalInfo?: string }) => {
    const diag = analyzeSystemError(rawError, context);
    return showToast(diag.severity, diag.message, {
      title: diag.title,
      rootCause: diag.rootCause,
      solution: diag.solution,
      technicalDetails: diag.technicalDetails
    });
  }, [showToast]);

  return (
    <ToastContext.Provider
      value={{
        toasts,
        showToast,
        success,
        error,
        warning,
        info,
        diagnose,
        dismiss,
        dismissAll
      }}
    >
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// Toast Container & Cards
const ToastContainer: React.FC<{ toasts: ToastItem[]; onDismiss: (id: string) => void }> = ({
  toasts,
  onDismiss
}) => {
  return (
    <div 
      className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2.5 max-w-md w-full px-4 sm:px-0 pointer-events-none no-print"
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map(toast => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
};

const ToastCard: React.FC<{ toast: ToastItem; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyDiagnostic = (e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy = `[DIAGNÓSTICO TEXFLOW WMS]
Tipo: ${toast.type.toUpperCase()}
Título: ${toast.title || toast.message}
Mensaje: ${toast.message}
Causa Raíz: ${toast.rootCause || 'N/A'}
Solución Sugerida: ${toast.solution || 'N/A'}
Detalles Técnicos: ${toast.technicalDetails || 'N/A'}
Fecha: ${new Date(toast.createdAt).toLocaleString('es-PE')}`;

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const styleConfig = {
    success: {
      border: 'border-emerald-500/30 dark:border-emerald-500/40',
      bg: 'bg-emerald-50/95 dark:bg-emerald-950/90',
      accent: 'bg-emerald-500 text-white',
      title: 'text-emerald-900 dark:text-emerald-200',
      icon: <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
    },
    error: {
      border: 'border-red-500/40 dark:border-red-500/50',
      bg: 'bg-red-50/95 dark:bg-zinc-900/95',
      accent: 'bg-red-600 text-white',
      title: 'text-red-900 dark:text-red-200',
      icon: <ShieldAlert size={18} className="text-red-600 dark:text-red-400 shrink-0" />
    },
    warning: {
      border: 'border-amber-500/40 dark:border-amber-500/50',
      bg: 'bg-amber-50/95 dark:bg-zinc-900/95',
      accent: 'bg-amber-500 text-white',
      title: 'text-amber-900 dark:text-amber-200',
      icon: <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 shrink-0" />
    },
    info: {
      border: 'border-blue-500/30 dark:border-blue-500/40',
      bg: 'bg-blue-50/95 dark:bg-zinc-900/95',
      accent: 'bg-blue-500 text-white',
      title: 'text-blue-900 dark:text-blue-200',
      icon: <Info size={18} className="text-blue-600 dark:text-blue-400 shrink-0" />
    }
  };

  const cfg = styleConfig[toast.type] || styleConfig.info;
  const hasDiagnosticInfo = !!(toast.rootCause || toast.solution);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
      layout
      className={`pointer-events-auto w-full rounded-xl border ${cfg.border} ${cfg.bg} backdrop-blur-md shadow-xl overflow-hidden text-app-text text-xs`}
    >
      {/* Header bar */}
      <div className="p-3.5 sm:p-4 flex items-start gap-3">
        <div className="mt-0.5">{cfg.icon}</div>

        <div className="flex-1 min-w-0 pr-1">
          {toast.title && (
            <h5 className={`font-bold text-xs sm:text-sm tracking-tight mb-0.5 ${cfg.title}`}>
              {toast.title}
            </h5>
          )}
          <p className="text-app-text/90 leading-relaxed font-medium text-xs">
            {toast.message}
          </p>

          {/* Action button if specified */}
          {toast.action && (
            <div className="mt-2.5">
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  onDismiss();
                }}
                className="px-3 py-1 bg-app-primary text-white rounded-md text-[11px] font-bold shadow-2xs hover:bg-app-primary/90 transition cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw size={12} />
                {toast.action.label}
              </button>
            </div>
          )}
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 text-app-text/50 hover:text-app-text hover:bg-black/5 dark:hover:bg-white/10 rounded-md transition cursor-pointer shrink-0"
          title="Cerrar notificación"
        >
          <X size={15} />
        </button>
      </div>

      {/* Causa Raíz y Solución Box */}
      {hasDiagnosticInfo && (
        <div className="px-3.5 pb-3.5 sm:px-4 sm:pb-4 space-y-2 border-t border-app-border/40 pt-2.5 bg-black/[0.02] dark:bg-white/[0.02]">
          {/* Causa Raíz */}
          {toast.rootCause && (
            <div className="bg-red-500/10 dark:bg-red-500/15 border border-red-500/20 rounded-lg p-2.5 flex items-start gap-2 text-[11px]">
              <HelpCircle size={14} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold text-red-700 dark:text-red-300 uppercase tracking-wider text-[10px] block mb-0.5">
                  Causa Raíz
                </span>
                <span className="text-app-text/85 leading-snug">{toast.rootCause}</span>
              </div>
            </div>
          )}

          {/* Solución Sugerida */}
          {toast.solution && (
            <div className="bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/20 rounded-lg p-2.5 flex items-start gap-2 text-[11px]">
              <Wrench size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider text-[10px] block mb-0.5">
                  Solución Sugerida
                </span>
                <span className="text-app-text/85 leading-snug">{toast.solution}</span>
              </div>
            </div>
          )}

          {/* Technical Details Collapsible & Copy Button */}
          {toast.technicalDetails && (
            <div className="pt-1">
              <div className="flex items-center justify-between text-[10px] text-app-text/60">
                <button
                  type="button"
                  onClick={() => setShowDetails(!showDetails)}
                  className="flex items-center gap-1 hover:text-app-text font-medium cursor-pointer"
                >
                  {showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  <span>{showDetails ? 'Ocultar diagnóstico técnico' : 'Ver diagnóstico técnico'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyDiagnostic}
                  className="flex items-center gap-1 hover:text-app-primary font-medium cursor-pointer"
                  title="Copiar diagnóstico para soporte"
                >
                  {copied ? (
                    <>
                      <Check size={11} className="text-emerald-500" />
                      <span className="text-emerald-500 font-bold">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy size={11} />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>

              {showDetails && (
                <div className="mt-1.5 p-2 bg-app-bg/90 rounded border border-app-border text-[10px] font-mono text-app-text/75 break-all max-h-28 overflow-y-auto">
                  {toast.technicalDetails}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};
