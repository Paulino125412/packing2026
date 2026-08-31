import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera, RefreshCw, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import type { Html5Qrcode } from 'html5-qrcode';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanResult: (result: {
    rollNumber: string;
    meters?: number;
    lot?: string;
    partida?: string;
    tono?: string;
    width?: string;
    weight?: string;
  }) => void;
}

export default function BarcodeScannerModal({
  isOpen,
  onClose,
  onScanResult
}: BarcodeScannerModalProps) {
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isContinuous, setIsContinuous] = useState<boolean>(true);
  const [manualCode, setManualCode] = useState<string>('');
  const [successBanner, setSuccessBanner] = useState<{ message: string; sub: string } | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const lastScannedCodeRef = useRef<string>('');
  const scannerId = 'pwa-camera-viewport';

  // Play a beautiful synthetic beep on successful scan (Web Audio API)
  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // 880Hz crisp beep
      gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.12); // 120ms beep
    } catch (err) {
      console.warn("Failed to synthesize beep:", err);
    }
  };

  // Advanced QR/Barcode Parser
  const parseScannedCode = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    // 1. Try parsing JSON
    try {
      const data = JSON.parse(trimmed);
      if (data && typeof data === 'object') {
        const result: any = {};
        const rollNum = data.rollNumber || data.rollNo || data.numero || data.code || data.id;
        if (rollNum) result.rollNumber = String(rollNum).toUpperCase();

        const metersVal = data.meters || data.metraje || data.metros || data.qty || data.amount;
        if (metersVal !== undefined && !isNaN(Number(metersVal))) {
          result.meters = Number(metersVal);
        }

        if (data.lot || data.lote) result.lot = String(data.lot || data.lote).toUpperCase();
        if (data.partida) result.partida = String(data.partida).toUpperCase();
        if (data.tono || data.color) result.tono = String(data.tono || data.color).toUpperCase();
        if (data.width || data.ancho) result.width = String(data.width || data.ancho);
        if (data.weight || data.peso) result.weight = String(data.weight || data.peso);

        return result;
      }
    } catch (e) {
      // Continue parsing as raw text
    }

    // 2. Try Key-Value parsing (e.g. "ROLLO: R-101; METROS: 45.5; LOTE: ABC")
    const kvRegex = /(rollNumber|rollNo|roll_number|rollo|nº|lote|lot|partida|tono|color|metraje|metros|meters|ancho|width|peso|weight)\s*[:=]\s*([^;,\n]+)/gi;
    let match;
    let hasKV = false;
    const kvResult: any = {};

    while ((match = kvRegex.exec(trimmed)) !== null) {
      hasKV = true;
      const key = (match[1] || '').toLowerCase();
      const val = match[2].trim();
      if (key.includes('roll') || key.includes('rollo') || key.includes('nº')) {
        kvResult.rollNumber = val.toUpperCase();
      } else if (key.includes('met') || key.includes('qty')) {
        const num = Number(val.replace(/[^\d.]/g, ''));
        if (!isNaN(num)) kvResult.meters = num;
      } else if (key.includes('lot')) {
        kvResult.lot = val.toUpperCase();
      } else if (key.includes('partida')) {
        kvResult.partida = val.toUpperCase();
      } else if (key.includes('tono') || key.includes('color')) {
        kvResult.tono = val.toUpperCase();
      } else if (key.includes('width') || key.includes('ancho')) {
        kvResult.width = val;
      } else if (key.includes('weight') || key.includes('peso')) {
        kvResult.weight = val;
      }
    }

    if (hasKV) {
      return kvResult;
    }

    // 3. Try comma/semicolon/hyphen separated structured format (e.g. 1024, 45.5, LOTE-01 or R-101, 100, LOTE-01)
    const parts = trimmed.split(/[\t,;|\n]+/).map(p => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      const sepResult: any = {};
      let rollNumCandidate = '';
      let metersCandidate: number | null = null;
      let lotCandidate = '';
      let partidaCandidate = '';
      let tonoCandidate = '';

      parts.forEach((p) => {
        const isDecimalNum = !isNaN(Number(p)) && p.includes('.');
        const isPlainNum = !isNaN(Number(p));

        if (isDecimalNum && metersCandidate === null) {
          // If it has decimal point (e.g. 45.5), it is definitely meters
          metersCandidate = Number(p);
        } else if (!rollNumCandidate) {
          // First non-decimal item (or plain integer like 1024) is the roll number
          rollNumCandidate = p;
        } else if (isPlainNum && metersCandidate === null) {
          // If roll number is already assigned and we encounter another number (e.g. 100), it's meters
          metersCandidate = Number(p);
        } else if (!lotCandidate) {
          lotCandidate = p;
        } else if (!partidaCandidate) {
          partidaCandidate = p;
        } else if (!tonoCandidate) {
          tonoCandidate = p;
        }
      });

      if (rollNumCandidate) sepResult.rollNumber = rollNumCandidate.toUpperCase();
      if (metersCandidate !== null) sepResult.meters = metersCandidate;
      if (lotCandidate) sepResult.lot = lotCandidate.toUpperCase();
      if (partidaCandidate) sepResult.partida = partidaCandidate.toUpperCase();
      if (tonoCandidate) sepResult.tono = tonoCandidate.toUpperCase();

      return sepResult;
    }

    // 4. Default: Raw code string represents Roll Number
    return { rollNumber: trimmed.toUpperCase() };
  };

  const processScanResult = (decodedText: string) => {
    const trimmedCode = decodedText.trim();
    if (!trimmedCode) return;

    const now = Date.now();
    // Debounce scanning the exact same code repeatedly (1.8 seconds timeout)
    if (trimmedCode === lastScannedCodeRef.current && now - lastScannedTimeRef.current < 1800) {
      return;
    }
    lastScannedTimeRef.current = now;
    lastScannedCodeRef.current = trimmedCode;

    playBeep();
    const result = parseScannedCode(decodedText);
    
    if (result && result.rollNumber) {
      onScanResult(result);
      
      const mainText = `Rollo: ${result.rollNumber}`;
      const metersText = result.meters ? ` | ${result.meters.toFixed(2)}m` : '';
      setSuccessBanner({
        message: `¡Leído con éxito!`,
        sub: `${mainText}${metersText}`
      });

      // Clear success banner after 1.5 seconds
      setTimeout(() => {
        setSuccessBanner(null);
      }, 1500);

      if (!isContinuous) {
        onClose();
      }
    } else {
      setErrorMsg(`Código leído no válido: "${decodedText.substring(0, 30)}..."`);
      setTimeout(() => setErrorMsg(''), 3000);
    }
  };

  const handleManualSubmit = () => {
    if (!manualCode.trim()) return;
    processScanResult(manualCode);
    setManualCode('');
  };

  // Initialize and list cameras
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    import('html5-qrcode')
      .then(({ Html5Qrcode }) => {
        if (!isMounted) return null;
        return Html5Qrcode.getCameras();
      })
      .then((devices) => {
        if (!isMounted || !devices) return;
        if (devices.length > 0) {
          setCameras(devices);
          // Prefer back camera (usually labeled environment or contains "back")
          const backCam = devices.find(d => {
            const label = (d.label || '').toLowerCase();
            return label.includes('back') || label.includes('entorno') || label.includes('rear');
          });
          setSelectedCameraId(backCam ? backCam.id : devices[0].id);
        } else {
          setErrorMsg('No se detectaron cámaras en este dispositivo.');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Error getting cameras:', err);
        setErrorMsg('Permiso de cámara denegado o inaccesible.');
      });

    return () => {
      isMounted = false;
      stopScanning();
    };
  }, [isOpen]);

  // Start scanning when camera is selected or modal opens
  useEffect(() => {
    if (!isOpen || !selectedCameraId) return;

    startScanning(selectedCameraId);

    return () => {
      stopScanning();
    };
  }, [isOpen, selectedCameraId]);

  const startScanning = async (cameraId: string) => {
    await stopScanning(); // Stop any active instances
    setErrorMsg('');
    setIsScanning(false);

    // Give hardware and DOM a short safety timeout to let the camera resource settle
    await new Promise((resolve) => setTimeout(resolve, 150));

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
      const html5Qrcode = new Html5Qrcode(scannerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39
        ],
        verbose: false
      });
      html5QrcodeRef.current = html5Qrcode;

      const runStart = async () => {
        return html5Qrcode.start(
          cameraId,
          {
            fps: 15,
            qrbox: (width, height) => {
              // Target a rectangular box that is wider than it is high (280x140)
              // adapting dynamically but respecting the target sizes and proportional limits
              const targetWidth = Math.max(180, Math.min(width * 0.85, 280));
              const targetHeight = Math.max(90, Math.min(height * 0.45, 140));
              return {
                width: Math.round(targetWidth),
                height: Math.round(targetHeight)
              };
            },
            aspectRatio: 1.0
          },
          (decodedText) => {
            processScanResult(decodedText);
          },
          () => {
            // Failure is silent for standard frame-by-frame scanner polling
          }
        );
      };

      try {
        await runStart();
      } catch (startErr: any) {
        const errStr = String(startErr);
        if (
          errStr.includes('NotReadableError') ||
          (startErr && startErr.name === 'NotReadableError') ||
          (errStr || '').toLowerCase().includes('could not start video source')
        ) {
          console.warn('Camera start failed with NotReadableError. Retrying in 500ms...', startErr);
          await new Promise((resolve) => setTimeout(resolve, 500));
          await runStart();
        } else {
          throw startErr;
        }
      }

      setIsScanning(true);
    } catch (err: any) {
      console.error('Failed to start camera scan:', err);
      setErrorMsg(`Error de inicio de cámara: ${err.message || err}`);
    }
  };

  const stopScanning = async () => {
    if (html5QrcodeRef.current) {
      try {
        if (html5QrcodeRef.current.isScanning) {
          await html5QrcodeRef.current.stop();
        }
      } catch (err) {
        console.warn('Failed to stop scanner gracefully:', err);
      }
      html5QrcodeRef.current = null;
    }
    setIsScanning(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/65 backdrop-blur-xs"
          />

          {/* Modal Box */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="relative w-full max-w-md bg-app-surface border border-app-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="px-4 py-3.5 bg-app-bg border-b border-app-border flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-app-secondary animate-pulse" />
                <h3 className="font-bold text-xs uppercase tracking-wider text-app-text">
                  Escanear Código / QR
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-app-text/50 hover:text-app-text p-2 md:p-1 min-h-[40px] min-w-[40px] flex items-center justify-center hover:bg-app-bg rounded transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Error Message banner */}
            {errorMsg && (
              <div className="bg-red-50 border-b border-red-200 p-2.5 text-xs text-red-600 font-bold flex items-center gap-2 shrink-0 animate-fade-in font-sans">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Content Body */}
            <div className="p-4 space-y-4 overflow-y-auto flex-1 flex flex-col justify-between">
              {/* Camera view screen */}
              <div className="relative w-full aspect-square max-w-[280px] mx-auto bg-black rounded-lg border-2 border-app-primary overflow-hidden shadow-inner shrink-0">
                <div id={scannerId} className="w-full h-full object-cover" />

                {/* Framing guides */}
                {isScanning && (
                  <>
                    {/* Pulsing targeting line */}
                    <div className="absolute left-4 right-4 top-1/2 h-0.5 bg-app-secondary shadow-[0_0_8px_var(--app-secondary)] animate-pulse z-10" />

                    {/* Target scan area box visualizer overlay */}
                    <div className="absolute inset-0 border-x-0 border-y-[70px] border-black/35 pointer-events-none flex items-center justify-center">
                      <div className="w-full h-full border border-app-secondary/50 relative">
                        {/* L-shaped corners for focus guidance */}
                        <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-app-secondary" />
                        <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-app-secondary" />
                        <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-app-secondary" />
                        <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-app-secondary" />
                      </div>
                    </div>
                  </>
                )}

                {!isScanning && !errorMsg && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 bg-app-bg/90 text-app-text/70 z-10">
                    <RefreshCw size={24} className="animate-spin text-app-primary mb-2" />
                    <p className="text-[10px] font-bold uppercase tracking-wider">Iniciando Cámara...</p>
                  </div>
                )}

                {/* Scanned alert overlay banner */}
                <AnimatePresence>
                  {successBanner && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute top-3 left-3 right-3 bg-app-secondary border border-app-secondary/80 text-white p-2 rounded shadow-lg flex items-center gap-2 z-20"
                    >
                      <CheckCircle size={14} className="shrink-0" />
                      <div className="text-[10px] leading-tight text-left">
                        <p className="font-black uppercase">{successBanner.message}</p>
                        <p className="font-semibold font-mono">{successBanner.sub}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Camera Switcher Dropdown */}
              {cameras.length > 1 && (
                <div className="flex items-center gap-2 justify-center text-xs shrink-0 bg-app-bg border border-app-border px-3.5 py-2.5 md:py-1.5 rounded-lg min-h-[44px] md:min-h-0">
                  <Camera size={16} className="text-app-primary shrink-0" />
                  <span className="font-bold text-[10px] md:text-[9px] uppercase tracking-wider text-app-text/60 shrink-0">Cámara:</span>
                  <select
                    value={selectedCameraId}
                    onChange={(e) => setSelectedCameraId(e.target.value)}
                    className="bg-transparent font-bold text-app-text border-none focus:ring-0 cursor-pointer pr-4 font-sans py-1 md:py-0 text-xs min-h-[38px] md:min-h-0 flex-1"
                  >
                    {cameras.map((device, idx) => (
                      <option key={device.deviceId} value={device.deviceId} className="bg-app-surface text-app-text">
                        {device.label || `Cámara ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Controls and settings */}
              <div className="space-y-3 shrink-0 border-t border-app-border/60 pt-3">
                {/* Continuous Scan Toggle */}
                <div className="flex items-center justify-between bg-app-bg px-3.5 py-2.5 md:py-2 rounded-lg border border-app-border min-h-[44px] md:min-h-0">
                  <div className="flex flex-col text-left">
                    <span className="text-xs md:text-[10px] font-black uppercase tracking-wider text-app-text">
                      Modo Escaneo Continuo
                    </span>
                    <span className="text-[9px] md:text-[8px] text-app-text/50">
                      Sigue escaneando sin cerrar la ventana
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none p-1">
                    <input
                      type="checkbox"
                      checked={isContinuous}
                      onChange={(e) => setIsContinuous(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 md:w-8 md:h-4 bg-app-border rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-1 md:after:top-0.5 after:left-[6px] md:after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 md:after:h-3 md:after:w-3.5 after:transition-all peer-checked:bg-app-primary"></div>
                  </label>
                </div>

                {/* Manual text backup entry */}
                <div className="flex gap-2 items-stretch">
                  <input
                    type="text"
                    placeholder="Ingreso manual de código o metraje..."
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleManualSubmit();
                      }
                    }}
                    className="flex-1 px-3 py-2.5 md:py-1.5 border border-app-border rounded-lg text-xs font-mono bg-app-surface text-app-text focus:ring-1 focus:ring-app-primary placeholder:font-sans placeholder:text-xs md:placeholder:text-[10px] min-h-[44px] md:min-h-0"
                  />
                  <button
                    type="button"
                    onClick={handleManualSubmit}
                    className="px-4 py-2.5 md:py-1.5 bg-app-surface hover:bg-app-bg border border-app-border text-app-text font-black uppercase tracking-wider text-xs md:text-[10px] rounded-lg transition min-h-[44px] md:min-h-0 flex items-center justify-center cursor-pointer active:scale-95 shrink-0"
                  >
                    Ingresar
                  </button>
                </div>

                {/* Helpful Tip description */}
                <div className="bg-app-primary/5 text-app-primary rounded-lg p-2 flex items-start gap-2 text-[10px] leading-relaxed text-left">
                  <Info size={12} className="shrink-0 mt-0.5" />
                  <p>
                    <strong>Soporta formatos:</strong> Código QR con JSON, listados separados por comas o saltos de línea, y códigos de barra simples de etiquetas de fábrica.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
