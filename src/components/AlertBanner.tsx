import React, { useState } from 'react';
import { 
  CheckCircle2, 
  ShieldAlert, 
  AlertCircle, 
  Info, 
  X, 
  HelpCircle, 
  Wrench, 
  ChevronDown, 
  ChevronUp, 
  Copy, 
  Check,
  RotateCcw
} from 'lucide-react';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

export interface AlertBannerProps {
  type: AlertType;
  message: string | React.ReactNode;
  title?: string;
  rootCause?: string;
  solution?: string;
  technicalDetails?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  onClose?: () => void;
  className?: string;
  id?: string;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  type,
  message,
  title,
  rootCause,
  solution,
  technicalDetails,
  action,
  onClose,
  className = '',
  id
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!message && !title && !rootCause) return null;

  const styles = {
    success: {
      container: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300',
      icon: <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />,
      titleColor: 'text-emerald-900 dark:text-emerald-200'
    },
    error: {
      container: 'bg-red-500/10 border-red-500/30 text-red-800 dark:text-red-300',
      icon: <ShieldAlert size={18} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />,
      titleColor: 'text-red-900 dark:text-red-200'
    },
    warning: {
      container: 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300',
      icon: <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />,
      titleColor: 'text-amber-900 dark:text-amber-200'
    },
    info: {
      container: 'bg-blue-500/10 border-blue-500/30 text-blue-800 dark:text-blue-300',
      icon: <Info size={18} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />,
      titleColor: 'text-blue-900 dark:text-blue-200'
    }
  };

  const currentStyle = styles[type] || styles.info;
  const hasDiagnostic = !!(rootCause || solution);

  const handleCopyDiagnostic = (e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy = `[DIAGNÓSTICO ALERTA]
Tipo: ${type.toUpperCase()}
Título: ${title || (typeof message === 'string' ? message : '')}
Mensaje: ${typeof message === 'string' ? message : ''}
Causa Raíz: ${rootCause || 'N/A'}
Solución Sugerida: ${solution || 'N/A'}
Detalles: ${technicalDetails || 'N/A'}`;

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      id={id}
      className={`p-3.5 sm:p-4 border rounded-xl text-xs font-medium shadow-xs transition-all duration-200 no-print flex flex-col gap-2.5 ${currentStyle.container} ${className}`}
    >
      {/* Primary Message Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          {currentStyle.icon}
          <div className="flex-1 min-w-0">
            {title && (
              <h6 className={`font-bold text-xs sm:text-sm tracking-tight mb-0.5 ${currentStyle.titleColor}`}>
                {title}
              </h6>
            )}
            <div className="leading-relaxed break-words text-app-text/90 font-medium">
              {message}
            </div>

            {action && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={action.onClick}
                  className="px-3 py-1 bg-app-primary text-white rounded-md text-[11px] font-bold shadow-2xs hover:bg-app-primary/90 transition cursor-pointer inline-flex items-center gap-1.5"
                >
                  <RotateCcw size={12} />
                  {action.label}
                </button>
              </div>
            )}
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-md transition cursor-pointer shrink-0 opacity-70 hover:opacity-100 -mr-1 -mt-1"
            title="Cerrar notificación"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Causa Raíz y Solución Box */}
      {hasDiagnostic && (
        <div className="pt-2 border-t border-app-border/40 space-y-2">
          {rootCause && (
            <div className="bg-red-500/10 dark:bg-red-500/15 border border-red-500/20 rounded-lg p-2.5 flex items-start gap-2 text-[11px]">
              <HelpCircle size={14} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold text-red-700 dark:text-red-300 uppercase tracking-wider text-[10px] block mb-0.5">
                  Causa Raíz
                </span>
                <span className="text-app-text/85 leading-snug">{rootCause}</span>
              </div>
            </div>
          )}

          {solution && (
            <div className="bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/20 rounded-lg p-2.5 flex items-start gap-2 text-[11px]">
              <Wrench size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider text-[10px] block mb-0.5">
                  Solución Sugerida
                </span>
                <span className="text-app-text/85 leading-snug">{solution}</span>
              </div>
            </div>
          )}

          {technicalDetails && (
            <div className="pt-0.5">
              <div className="flex items-center justify-between text-[10px] text-app-text/60">
                <button
                  type="button"
                  onClick={() => setShowDetails(!showDetails)}
                  className="flex items-center gap-1 hover:text-app-text font-medium cursor-pointer"
                >
                  {showDetails ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  <span>{showDetails ? 'Ocultar detalle técnico' : 'Ver detalle técnico'}</span>
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
                <div className="mt-1.5 p-2 bg-app-bg/90 rounded border border-app-border text-[10px] font-mono text-app-text/75 break-all max-h-24 overflow-y-auto">
                  {technicalDetails}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AlertBanner;
