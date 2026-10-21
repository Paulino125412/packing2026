import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  ArrowRight, 
  AlertCircle,
  HelpCircle,
  X,
  Clock
} from 'lucide-react';

const FAILED_ATTEMPTS_KEY = 'texflow_login_failed_attempts';
const LOCKOUT_UNTIL_KEY = 'texflow_login_lockout_until';
const REMEMBER_EMAIL_KEY = 'texflow_remember_email';
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_SEC = 120; // 2 minutos

export default function LoginScreen() {
  const { login } = useAuth();
  
  // 1. Casilla "Recordar mi correo"
  const [email, setEmail] = useState<string>(() => {
    return localStorage.getItem(REMEMBER_EMAIL_KEY) || '';
  });
  const [rememberEmail, setRememberEmail] = useState<boolean>(() => {
    return Boolean(localStorage.getItem(REMEMBER_EMAIL_KEY));
  });

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 2. Modal "¿Olvidaste tu contraseña?"
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);

  // 3. Protección contra intentos fallidos (Anti-Fuerza Bruta)
  const [failedAttempts, setFailedAttempts] = useState<number>(() => {
    const saved = localStorage.getItem(FAILED_ATTEMPTS_KEY);
    return saved ? parseInt(saved, 10) || 0 : 0;
  });

  const [lockoutRemaining, setLockoutRemaining] = useState<number>(() => {
    const until = localStorage.getItem(LOCKOUT_UNTIL_KEY);
    if (!until) return 0;
    const diffSec = Math.ceil((parseInt(until, 10) - Date.now()) / 1000);
    return diffSec > 0 ? diffSec : 0;
  });

  // Temporizador en cuenta regresiva para el bloqueo
  useEffect(() => {
    if (lockoutRemaining <= 0) return;

    const timer = setInterval(() => {
      setLockoutRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          localStorage.removeItem(LOCKOUT_UNTIL_KEY);
          localStorage.setItem(FAILED_ATTEMPTS_KEY, '0');
          setFailedAttempts(0);
          setErrorMessage(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [lockoutRemaining]);

  // Formato de tiempo restante (ej. 1:45 min)
  const formatCountdown = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isLockedOut = lockoutRemaining > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isLockedOut) {
      setErrorMessage(`Demasiados intentos fallidos. Podrás volver a intentar en ${formatCountdown(lockoutRemaining)} min`);
      return;
    }

    setErrorMessage(null);

    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setErrorMessage('Por favor ingresa tu correo y contraseña.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await login(cleanEmail, cleanPassword);
      if (res.success) {
        // Éxito: Resetear contador de fallos y desbloqueo
        setFailedAttempts(0);
        localStorage.removeItem(FAILED_ATTEMPTS_KEY);
        localStorage.removeItem(LOCKOUT_UNTIL_KEY);

        // Recordar correo si la casilla está marcada
        if (rememberEmail) {
          localStorage.setItem(REMEMBER_EMAIL_KEY, cleanEmail);
        } else {
          localStorage.removeItem(REMEMBER_EMAIL_KEY);
        }
      } else {
        // Fallo en credenciales
        const nextAttempts = failedAttempts + 1;
        setFailedAttempts(nextAttempts);
        localStorage.setItem(FAILED_ATTEMPTS_KEY, nextAttempts.toString());

        if (nextAttempts >= MAX_ATTEMPTS) {
          const lockoutUntil = Date.now() + LOCKOUT_DURATION_SEC * 1000;
          localStorage.setItem(LOCKOUT_UNTIL_KEY, lockoutUntil.toString());
          setLockoutRemaining(LOCKOUT_DURATION_SEC);
          setErrorMessage(`Demasiados intentos fallidos. Podrás volver a intentar en ${formatCountdown(LOCKOUT_DURATION_SEC)} min`);
        } else {
          setErrorMessage(res.message || 'Credenciales no autorizadas');
        }
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error de conexión con el servidor');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0F171A] text-[#F3EFE6] flex items-center justify-center p-4 sm:p-6 font-sans antialiased selection:bg-[#4A6C6F] selection:text-white">
      {/* Container Card - Solo formulario de acceso */}
      <div className="w-full max-w-md bg-[#142023] border border-[#22353A] rounded-2xl shadow-2xl p-6 sm:p-8 relative">
        
        {/* Form Title */}
        <div className="mb-7">
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Acceso al Sistema
          </h2>
          <p className="text-xs sm:text-sm text-[#8FA8A7] mt-1.5 leading-relaxed">
            Ingresa tus credenciales autorizadas para iniciar tu turno de operación.
          </p>
        </div>

        {/* Lockout Warning Banner */}
        {isLockedOut ? (
          <div className="mb-6 p-4 rounded-xl bg-[#2D1B1B] border border-[#7A2E2E] flex items-start gap-3.5 text-[#F87171] text-xs leading-relaxed animate-in fade-in duration-200">
            <Clock className="w-5 h-5 shrink-0 mt-0.5 text-[#F87171] animate-pulse" />
            <div>
              <div className="font-semibold text-sm text-[#FCA5A5] mb-1">
                Terminal Bloqueada Temporalmente
              </div>
              <p>
                Demasiados intentos fallidos. Podrás volver a intentar en{' '}
                <span className="font-mono font-bold text-white bg-[#421E1E] px-1.5 py-0.5 rounded">
                  {formatCountdown(lockoutRemaining)} min
                </span>
              </p>
            </div>
          </div>
        ) : errorMessage ? (
          <div className="mb-6 p-3.5 rounded-lg bg-[#2D1B1B] border border-[#5A2929] flex items-start gap-3 text-[#F28B82] text-xs leading-relaxed animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#F28B82]" />
            <div className="flex-1">
              <span>{errorMessage}</span>
              {failedAttempts > 0 && failedAttempts < MAX_ATTEMPTS && (
                <span className="block mt-1 text-[11px] text-[#E57373]/80 font-mono">
                  Intentos fallidos: {failedAttempts} de {MAX_ATTEMPTS}
                </span>
              )}
            </div>
          </div>
        ) : null}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          
          {/* Email Input */}
          <div>
            <label className="block text-xs font-semibold text-[#CBD8D7] uppercase tracking-wider mb-2 font-mono">
              CORREO ELECTRÓNICO
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#7A9392]">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operador@textil.com"
                autoComplete="email"
                disabled={isLockedOut}
                required
                className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-[#0F171A] border border-[#273D42] rounded-lg text-sm text-white placeholder-[#5A7372] focus:outline-none focus:border-[#4A6C6F] focus:ring-1 focus:ring-[#4A6C6F] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-xs font-semibold text-[#CBD8D7] uppercase tracking-wider mb-2 font-mono">
              CONTRASEÑA
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#7A9392]">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                disabled={isLockedOut}
                required
                className="w-full pl-10 pr-11 py-2.5 sm:py-3 bg-[#0F171A] border border-[#273D42] rounded-lg text-sm text-white placeholder-[#5A7372] focus:outline-none focus:border-[#4A6C6F] focus:ring-1 focus:ring-[#4A6C6F] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLockedOut}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#7A9392] hover:text-[#CBD8D7] transition-colors cursor-pointer disabled:opacity-40"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Fila ordenada: Recordar mi correo a la izquierda y ¿Olvidaste tu contraseña? a la derecha */}
          <div className="flex items-center justify-between pt-1">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={rememberEmail}
                onChange={(e) => setRememberEmail(e.target.checked)}
                disabled={isLockedOut}
                className="w-4 h-4 rounded bg-[#0F171A] border-[#273D42] text-[#4A6C6F] focus:ring-[#4A6C6F] focus:ring-offset-0 cursor-pointer accent-[#4A6C6F]"
              />
              <span className="text-xs text-[#8FA8A7] group-hover:text-[#CBD8D7] transition-colors">
                Recordar mi correo
              </span>
            </label>

            <button
              type="button"
              onClick={() => setIsForgotModalOpen(true)}
              className="text-xs text-[#8FA8A7] hover:text-[#C08552] transition-colors cursor-pointer underline-offset-4 hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading || isLockedOut}
              className="w-full py-3 px-4 rounded-lg font-semibold text-sm text-white bg-[#4A6C6F] hover:bg-[#3E5C5F] active:bg-[#344E51] border border-[#587F82] shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Validando credenciales...</span>
                </>
              ) : isLockedOut ? (
                <>
                  <Clock className="w-4 h-4" />
                  <span>Bloqueado ({formatCountdown(lockoutRemaining)})</span>
                </>
              ) : (
                <>
                  <span>Ingresar al Sistema</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Enterprise Security Notice */}
        <div className="mt-8 pt-6 border-t border-[#1F3135] flex items-center justify-between text-[11px] text-[#7A9392]">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#4A7A5C] shrink-0" />
            <span>Cifrado Criptográfico SHA-256 + Salt</span>
          </span>
          <span className="font-mono text-[10px]">Almacén Seguro</span>
        </div>

      </div>

      {/* Modal "¿Olvidaste tu contraseña?" */}
      {isForgotModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[#142023] border border-[#273D42] rounded-2xl max-w-md w-full p-6 sm:p-7 shadow-2xl relative text-[#F3EFE6]">
            
            {/* Close X Button */}
            <button
              type="button"
              onClick={() => setIsForgotModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-[#7A9392] hover:text-white hover:bg-[#1D2F33] transition-colors cursor-pointer"
              aria-label="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3.5 mb-5">
              <div className="w-11 h-11 rounded-xl bg-[#1D2F33] border border-[#2E4A50] flex items-center justify-center text-[#C08552] shrink-0 shadow-inner">
                <HelpCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  ¿Olvidaste tu contraseña?
                </h3>
                <span className="text-xs font-mono text-[#8FA8A7]">
                  Recuperación de acceso al sistema
                </span>
              </div>
            </div>

            {/* Modal Content */}
            <div className="text-xs sm:text-sm text-[#CBD8D7] leading-relaxed bg-[#0F171A] p-4 rounded-xl border border-[#1F3135]">
              <div className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C08552] mt-2 shrink-0" />
                <p>
                  Para restablecer tu contraseña, comunícate con el Administrador del sistema:{' '}
                  <a 
                    href="mailto:paulcalebfs123@gmail.com"
                    className="font-mono text-[#6E9C9A] hover:underline font-semibold"
                  >
                    paulcalebfs123@gmail.com
                  </a>
                </p>
              </div>
            </div>

            {/* Modal Action Footer */}
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setIsForgotModalOpen(false)}
                className="w-full sm:w-auto px-5 py-2.5 bg-[#4A6C6F] hover:bg-[#3E5C5F] text-white rounded-lg text-sm font-semibold transition-colors cursor-pointer shadow-sm"
              >
                Entendido
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
